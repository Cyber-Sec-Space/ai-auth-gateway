# AI Auth Gateway - System Architecture

This document describes the high-level architecture, core components, and data flow of the **AI Auth Gateway**.

## 1. High-Level Overview

The **AI Auth Gateway** acts as a secure intermediary (proxy) between upstream AI Clients (e.g., Claude Desktop, Cursor, Antigravity) and multiple downstream Model Context Protocol (MCP) servers.

The system enforces **Upstream Authentication**, requiring connecting clients to prove their identity via an `AI_ID` and `AI_KEY` before interacting with the proxy. It also handles **Downstream Authentication Injection**, seamlessly adding necessary secrets (JWTs, API Keys, PATs) to requests destined for external tools without exposing those secrets to the upstream AI clients.

```mermaid
flowchart TD
    subgraph client ["Upstream AI Clients"]
        cursor["Cursor"]
        claude["Claude Desktop"]
    end

    subgraph cli ["AAG-CLI (Host Config)"]
        vault[("OS Keychain Vault")]
        config[("File Config Store")]
    end

    subgraph gateway ["AAG-Core (Library)"]
        proxy["Proxy Engine & RBAC"]
    end

    subgraph downstream ["Downstream MCP Servers"]
        local_s["stdio Server"]
        github_s["SSE Server"]
        remote_s["HTTP Server"]
    end

    cursor --> proxy
    claude --> proxy

    proxy --> local_s
    proxy --> github_s
    proxy --> remote_s

    proxy -.-> config
    proxy -.-> vault
```

---

## 2. Core Components

The architecture is built as a **Monorepo** on top of the official `@modelcontextprotocol/sdk`. It separates the highly reusable, OS-agnostic `@cyber-sec.space/aag-core` (Core Library) from the `ai-auth-gateway` (CLI Application) via strict Dependency Injection (`ISecretStore`, `IConfigStore`, `IAuditLogger`).

### A. The Server Proxy (`ProxyServer` in `@cyber-sec.space/aag-core`)
- **Transport**: Listens for incoming connections from AI Clients via Server-Sent Events (SSE) or STDIO.
- **Authentication**: Validates incoming `AI_ID` and `AI_KEY` against authorized entities via the injected `IConfigStore`.
- **Protocol Emulation**: Intercepts standard MCP requests (`ListToolsRequestSchema`, `CallToolRequestSchema`) and multiplexes them across multiple downstream servers.

### B. The Client Manager (`ClientManager` in `@cyber-sec.space/aag-core`)
- **Multiplexing**: Manages a pool of downstream MCP clients, each connected to a different target server.
- **Transport Support**: Supports `stdio`, `sse`, and `http` downstream transports.
- **Lifecycle**: Handles connection, disconnection, and error recovery for downstream services.

### C. The Configuration Manager & Storage Interfaces
- **Core Interfaces (`IConfigStore`, `ISecretStore`)**: The core proxy is completely agnostic to how secrets and configs are stored, making it easy to swap implementations for enterprise databases or Hashicorp Vault.
- **CLI Implementations (Project Root)**: The main CLI application injects `FileConfigStore` (watching `mcp-proxy-config.json` via `chokidar`) and `KeychainSecretStore` (encrypting and storing via OS `keytar`) into the core.

### D. Role-Based Access Control (RBAC) Engine
- Integrated directly into the proxy, the RBAC engine filters which tools an AI is allowed to see and call based on granular whitelists and blacklists defined per `AIKey`.
- Tools from multiple downstream servers are aggregated and namespaced (e.g., `${serverId}___${toolName}`) to prevent collisions.

### E. Secure Logging System (`src/utils/logger.ts`)
- **Centralized Tracing**: Records all proxy activities, including successful authentications, specific tool calls, and permission denials.
- **Data Masking**: Automatically identifies and masks sensitive data (such as API Keys, AI Keys, or Authorization Headers) before logging to `logs/proxy.log` or the console, ensuring secrets never leak.

### F. The CLI (`aagcli`)
A complete command-line interface (`src/commands/`) requiring `sudo` privileges to manage the gateway:
- **`config`**: Manage system settings like port and log levels.
- **`mcp`**: Discover online downstream servers and live tool configurations.
- **`ai`**: Register AI clients, revoke keys, and manage granular RBAC permissions.
- **`keychain`**: Securely store downstream API keys directly in the host OS's secure storage.
- **`stdio-path`**: Resolves the absolute path of the compiled `stdio.js` script for local AI clients.

---

## 3. Data Flow

### 3.1. Authentication & Discovery Flow

```mermaid
sequenceDiagram
    participant AI as AI Client
    participant Core as AAG-Core (Proxy)
    participant CFG as AAG-CLI (IConfigStore)
    participant MCP as Downstream Servers

    AI->>Core: Connect to /sse
    Core->>Core: Extract AI_ID & AI_KEY from Headers/Env
    Core->>CFG: Validate Credentials via injected store
    alt Invalid Credentials
        CFG-->>Core: Unauthorized
        Core-->>AI: 401 Unauthorized / Reject SSE
    else Valid Credentials
        CFG-->>Core: Accepted (Returns AI permissions)
        Core->>MCP: Fetch all available tools
        MCP-->>Core: Combined Tool List
        Core->>Core: Filter tools via RBAC allowedTools & deniedTools
        Core->>Core: Prefix tool names (serverId___toolName)
        Core-->>AI: Respond with filtered, namespaced tools
    end
```

### 3.2. Tool Execution Flow (CallTool)

```mermaid
sequenceDiagram
    participant AI as AI Client
    participant Core as AAG-Core (Proxy)
    participant KV as AAG-CLI (ISecretStore)
    participant MCP as Target Downstream Server

    AI->>Core: CallTool(github_mcp___get_me)
    Core->>Core: Strip prefix -> github_mcp / get_me
    Core->>Core: Check RBAC strictly for this ID
    alt Permissions Denied
        Core-->>AI: Error: Tool access forbidden
    else Has Access
        Core->>KV: Request injected auth for github_mcp via interface
        KV-->>Core: ISecretStore Returns raw API Key (e.g., bearer token)
        Core->>MCP: Forward Request + Inject API Key secretly
        MCP-->>Core: Return Tool Execution Result
        Core-->>AI: Return Result
    end
```

### 3.3. Key Management & Encryption Flow
To ensure absolute security when storing downstream API keys on the host machine, the Gateway employs a dual-layer security model integrating the OS Keychain (`keytar`) and AES-256-GCM encryption (`CryptoService`).

**Writing a Secret (e.g., via `aagcli keychain set`)**:
1. The CLI reads the `masterKey` (a 64-char hex string automatically generated on first boot) from `mcp-proxy-config.json`.
2. The `CryptoService` encrypts the raw user plaintext (e.g., `sk-12345...`) using the `masterKey` via AES-256-GCM, generating an `iv:authTag:encryptedText` payload.
3. This already-encrypted payload is handed over to `keytar` (`libsecret`/Keychain/Credential Manager), which stores it safely within the operating system's native vault.

**Reading a Secret (During Tool Execution)**:
1. The `ConfigManager` encounters an injection string like `keytar://github/pat`.
2. It requests `keytar` to fetch the saved payload for `service: github`, `account: pat`.
3. `keytar` unlocks the OS vault and returns the encrypted payload.
4. The `CryptoService` uses the `masterKey` from `mcp-proxy-config.json` to decrypt the payload back into the raw API key.
5. The raw key exists *only in memory* strictly during the downstream request, and is immediately discarded.
