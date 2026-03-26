# AI Auth Gateway (AAG)

The **AI Auth Gateway** is a Model Context Protocol (MCP) Proxy Server built with TypeScript. It aggregates multiple downstream MCP servers and dynamically, securely injects credentials into API requests. This allows AI clients (like Claude Desktop or Cursor) to securely access remote external tools without exposing sensitive API keys or JWTs in their local configuration files.

[![Version: 1.0.8](https://img.shields.io/badge/Version-1.0.8-success.svg)](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/CHANGELOG.md)
[![NPM Package](https://img.shields.io/npm/v/@cyber-sec.space/ai-auth-gateway.svg)](https://www.npmjs.com/package/@cyber-sec.space/ai-auth-gateway)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

[🇹🇼 繁體中文版 README (Traditional Chinese Version)](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/README_ZH.md) | [📜 Changelog / Version History](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/CHANGELOG.md)

> **Notice**: This is the **Community Edition (Open Source)** licensed under [AGPLv3](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/LICENSE). For enterprise deployment, white-labeling, or building commercial non-open-source services using this gateway, a **Commercial License** will be available soon. Please contact the author for commercial licensing inquiries.

## Features
- 🛡️ **Secure Secret Management**: Integrates with the OS Keychain (`keytar`) and AES-256-GCM to securely store and inject API Keys.
- ⏳ **Smart Rate Limiting**: Built-in Token Bucket algorithm to set dynamic RPM (Requests Per Minute) limits per AI client, protecting your downstream API quotas.
- 🎭 **Automatic Data Masking**: Automatically detects and masks API keys or sensitive information in downstream results, preventing leaks to the AI model.
- 🔀 **Protocol Multiplexing**: Connects seamlessly over `stdio`, `sse`, or `http` to downstream servers.
- 🔒 **Granular RBAC**: Control specifically which connected AI client can access which tools across which servers.
- 📦 **Modular Core**: Built on top of the `@cyber-sec.space/aag-core` library. Fully dependency-injected for easy enterprise adoption (e.g. replacing Keytar with Hashicorp Vault).
- 🕵️ **Auditing & Logging**: Masked and secured logs track AIID, connection times, and tool execution status (`logs/proxy.log`).


---

## 🚀 Installation

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- `npm` or `yarn`

### 2. Install via NPM (Recommended)
You can directly install the gateway globally from the official NPM registry:
```bash
npm install -g @cyber-sec.space/ai-auth-gateway
```
*NPM Page: [@cyber-sec.space/ai-auth-gateway](https://www.npmjs.com/package/@cyber-sec.space/ai-auth-gateway)*

### 3. Clone & Build from Source
If you are deploying from source or contributing:
```bash
git clone https://github.com/Cyber-Sec-Space/ai-auth-gateway.git
cd ai_auth_gateway
npm install
npm run build
```

### 4. Updating the Gateway
If you installed the gateway globally via NPM, you can update it to the latest version by running:
```bash
npm update -g @cyber-sec.space/ai-auth-gateway
```
If you cloned from GitHub, pull the latest changes and re-build:
```bash
git pull
npm install
npm run build
```

---

## ⚙️ Configuration & Usage

The gateway is driven by `mcp-proxy-config.json`. A sample file (`mcp-proxy-config.sample.json`) is included in the root directory.

### Quick Start: Running the Server
To start the proxy server locally on port 3000:
```bash
npm start
```
*The proxy will listen at: `http://localhost:3000/sse`*

### Connecting your AI Client
To connect your AI client (e.g., Claude Desktop, Cursor), configure it to talk to the gateway. Pass the `AI_ID` and `AI_KEY` environment variables to authenticate.

**Method 1: Direct STDIO Bridge (For Claude Desktop / Local Clients)**
If you want the AI client to directly boot the Gateway process internally without relying on the background daemon, simply point it to the compiled `stdio.js`:
*(💡 Tip: You can run `sudo npx aagcli stdio-path` anytime to get the exact absolute path to this file)*
```json
{
  "mcpServers": {
    "ai-auth-gateway": {
      "command": "node",
      "args": ["/absolute/path/to/ai_auth_gateway/build/stdio.js"],
      "env": {
        "AI_ID": "my-ai",
        "AI_KEY": "key_hash_generated_by_aagcli"
      }
    }
  }
}
```

**Method 2: Native SSE Connection (For Cursor / Clients supporting SSE natively)**
If your AI client supports native SSE URLs (like configuring via Cursor's GUI or native config files), you can point it directly to the Gateway and pass credentials via the URL query parameters or Headers:
```json
{
  "mcpServers": {
    "ai-auth-gateway-sse": {
      "transport": "sse",
      "url": "http://localhost:3000/sse?aiid=my-ai&key=your_secure_hash_here"
    }
  }
}
```
*(Note: Some clients support passing headers directly, where you can inject `Authorization: Bearer your_secure_hash_here` alongside `AI-ID: my-ai`)*

---

## 🛠️ The CLI (`aagcli`)

To manage your Gateway configurations, permissions, and secrets, use the built-in CLI. **All CLI commands require `sudo` privileges.**

### 1. Server Lifecycle Management (SSE Daemon)
You can seamlessly run the SSE Proxy Gateway in the background without keeping a terminal open. This is only necessary if you aren't using the local `stdio` node launcher.
```bash
# Start the SSE server in the background
sudo npx aagcli sse start

# Check if the server is running
sudo npx aagcli sse status

# Stop the background SSE server safely
sudo npx aagcli sse stop
```

### 2. System Configuration
Manage proxy port or log levels dynamically without touching the JSON file.
```bash
# View current settings
sudo npx aagcli config view

# Change the proxy port (requires restart to apply)
sudo npx aagcli config set port 8080
sudo npx aagcli config set logLevel DEBUG
```

### 2. Keychain (Secret Vault) Management
Store API keys in your host operating system's native secure enclave (e.g., macOS Keychain, Linux libsecret).
```bash
# Store a new Personal Access Token (PAT) for GitHub
sudo npx aagcli keychain set github pat my_secret_token_123

# The value can then be referenced in mcp-proxy-config.json as:
# "value": "keytar://github/pat"
```

### 3. AI Client Management & RBAC
Register new AI clients and manage their granular permissions over downstream servers and tools.
```bash
# Register a new AI key
sudo npx aagcli ai register my-new-agent "Agent for testing"

# Review connected AI keys
sudo npx aagcli ai list

# Allow 'my-new-agent' to use only a specific github tool
sudo npx aagcli ai permit my-new-agent --tool github_mcp___get_me

# Set rate limit for 'my-new-agent' to 100 RPM or 500 RPH
sudo npx aagcli ai ratelimit my-new-agent 100 rpm

# Instantly reset the rate limit to global defaults
sudo npx aagcli ai ratelimit my-new-agent default
```

### 4. MCP Discovery
Discover live tools currently available on your downstream servers.
```bash
# List all active downstream MCP servers connected to the proxy
sudo npx aagcli mcp list

# View all live tools (and their descriptions) available on 'github_mcp'
sudo npx aagcli mcp tools github_mcp
```

### 5. Utility Commands
When integrating a local AI client (like Cursor or Claude Desktop) via the `stdio` connection method, you can use this helper command to instantly retrieve the absolute path of the built `stdio.js` launcher.
```bash
# Get the absolute path to the local stdio proxy script
sudo npx aagcli stdio-path
```

---

## 📖 Architecture & Deep Dive
For an in-depth explanation of how data flows, how the dual-encryption model works, and more, please reference:
- [Architecture Document (English)](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/ARCHITECTURE.md)
- [Architecture Document (Traditional Chinese)](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/ARCHITECTURE_ZH.md)

---

## 🐞 Issues & Contributions
Found a bug, have a feature request, or need help? Please don't hesitate to **[open an issue on GitHub](https://github.com/Cyber-Sec-Space/ai-auth-gateway/issues)**.

Pull Requests are always welcome. Let's make enterprise-grade AI tool execution secure and accessible together!
