# AI Auth Gateway - System Architecture

This document describes the high-level architecture, core components, and data flow of the **AI Auth Gateway**.

## 1. High-Level Overview

The **AI Auth Gateway** acts as a secure intermediary (proxy) between upstream AI Clients (e.g., Claude Desktop, Cursor, Antigravity) and multiple downstream Model Context Protocol (MCP) servers.

The system enforces **Upstream Authentication**, requiring connecting clients to prove their identity via an `AI_ID` and `AI_KEY` before interacting with the proxy. It also handles **Downstream Authentication Injection**, seamlessly adding necessary secrets (JWTs, API Keys, PATs) to requests destined for external tools without exposing those secrets to the upstream AI clients.

```mermaid
architecture-beta
    group client(cloud)[Upstream AI Clients]
    service cursor(desktop)[Cursor] in client
    service claude(desktop)[Claude Desktop] in client

    group gateway(server)[AI Auth Gateway]
    service proxy(server)[TCP/SSE Proxy] in gateway
    service rbac(database)[RBAC Engine] in gateway
    service vault(database)[Config & Keychain Vault] in gateway

    group downstream(cloud)[Downstream MCP Servers]
    service local(server)[Local stdio Server] in downstream
    service github(server)[GitHub SSE Server] in downstream
    service remote(server)[Remote HTTP Server] in downstream

    cursor:R --> L:proxy
    claude:R --> L:proxy

    proxy:R --> L:local
    proxy:R --> L:github
    proxy:R --> L:remote

    proxy:B --> T:rbac
    proxy:B --> T:vault
```

---

## 2. Core Components

The architecture is built on top of the official `@modelcontextprotocol/sdk` and consists of five core pillars:

### A. The Server Proxy (`src/proxy.ts` & `src/index.ts`)
- **Transport**: Listens for incoming connections from AI Clients via Server-Sent Events (SSE).
- **Authentication**: Validates incoming `AI_ID` and `AI_KEY` against authorized entities in the configuration.
- **Protocol Emulation**: Intercepts standard MCP requests (`ListToolsRequestSchema`, `CallToolRequestSchema`) and multiplexes them across multiple downstream servers.

### B. The Client Manager (`src/clientManager.ts`)
- **Multiplexing**: Manages a pool of downstream MCP clients, each connected to a different target server.
- **Transport Support**: Supports `stdio`, `sse`, and `http` downstream transports.
- **Lifecycle**: Handles connection, disconnection, and error recovery for downstream services.

### C. The Configuration Manager (`src/config.ts`)
- **Central Truth**: Reads and writes to `mcp-proxy-config.json` while watching for hot-reloads via `chokidar`.
- **Master Encryption**: Generates and manages a `masterKey` used to encrypt/decrypt sensitive data passed through the OS keychain (`keytar`).
- **Secret Resolution**: Dynamically resolves `authInjection` values, whether they are raw strings, environment variables (`$VAR`), or keychain references (`keytar://service/account`).

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
    participant GW as AI Auth Gateway
    participant CFG as Config Manager
    participant MCP as Downstream Servers

    AI->>GW: Connect to /sse
    GW->>GW: Extract AI_ID & AI_KEY from Headers/Env
    GW->>CFG: Validate Credentials
    alt Invalid Credentials
        CFG-->>GW: Unauthorized
        GW-->>AI: 401 Unauthorized / Reject SSE
    else Valid Credentials
        CFG-->>GW: Accepted (Returns AI permissions)
        GW->>MCP: Fetch all available tools
        MCP-->>GW: Combined Tool List
        GW->>GW: Filter tools via RBAC allowedTools & deniedTools
        GW->>GW: Prefix tool names (serverId___toolName)
        GW-->>AI: Respond with filtered, namespaced tools
    end
```

### 3.2. Tool Execution Flow (CallTool)

```mermaid
sequenceDiagram
    participant AI as AI Client
    participant GW as Gateway Proxy
    participant KV as Keytar / Vault
    participant MCP as Target Downstream Server

    AI->>GW: CallTool(github_mcp___get_me)
    GW->>GW: Strip prefix -> github_mcp / get_me
    GW->>GW: Check RBAC strictly for this ID
    alt Permissions Denied
        GW-->>AI: Error: Tool access forbidden
    else Has Access
        GW->>KV: Request injected auth for github_mcp
        KV-->>GW: Returns raw API Key (e.g., bearer token)
        GW->>MCP: Forward Request + Inject API Key secretly
        MCP-->>GW: Return Tool Execution Result
        GW-->>AI: Return Result
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
