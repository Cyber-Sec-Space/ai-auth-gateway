# Changelog

All notable changes to the **AI Auth Gateway (AAG)** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [1.1.0] - 2026-03-28
### Plugin Ecosystem & Connection Pooling (aag-core v2.1.0)
- **Changed**: Completely upgraded and adapted `ai_auth_gateway` to the newly released `@cyber-sec.space/aag-core` v2.1.0 SaaS Architecture.
- **Architecture**: Migrated legacy hardcoded Gateway Middlewares into the new dynamic `PluginLoader` ecosystem, while implementing strict conditional loading to prevent dangerous double-execution scenarios.
- **Added**: Enhanced connection pooling with configurable Scale-to-Zero heartbeat monitoring (`pingIntervalMs`, `pingTimeoutMs`, `reconnectTimeoutMs`) and idle suspension (`idleTimeoutMs`).
- **Added**: Upgraded `aagcli config set` command to natively support configuring the new 2.1.0 system heartbeat parameters without manual JSON edits.
- **Changed**: Renamed the background proxy management command namespace from `aagcli sse` to `aagcli server` to accurately reflect its broader proxy capabilities (SSE & HTTP multiplexing).
- **Security**: Mitigated a High-Severity ReDoS (CVE-2026-4923) in the underlying Express routing engine by overriding the bundled `path-to-regexp` dependency to `v8.4.0`.
- **Security**: Hardened the proxy endpoints by implementing `helmet` (API Security Defaults) and a Global IP Rate Limiter (`express-rate-limit`) to prevent DDoS and connection exhaustion before AI sessions are even validated.
- **Performance**: Introduced a robust 300ms Debounce mechanism to `FileConfigStore`. This resolves a severe I/O thrashing bug where editor text-saves (`chokidar`) would rapidly trigger overlapping configuration reloads and race conditions.
- **Performance**: Optimized the downstream Plugin Loader to natively cache the required built-in plugin dependencies upon configuration changes, completely removing the redundant `O(N)` fallback calculation bottleneck per-SSE connection.
- **Fixed**: Corrected broken SSE connection URL parameter authentication parsing (`?aiid=...&key=...`), restoring seamless integration for GUI-based MCP clients like Cursor.
- **Fixed**: Hardened `SessionManager` connection dropping logic to ensure all disconnected clients properly invoke their shutdown callback hooks (Memory Leak prevention).

## [1.0.10] - 2026-03-27
### Security Hardening & Bug Fixes
- **Security**: Hardened HTTP/SSE and STDIO connections by migrating from implicit global environment variables to strict runtime `ProxySessionOptions` mappings (`aiId`, `disableEnvFallback`). This ensures zero-contamination across scalable Multi-Tenant deployments.
- **Fixed**: `aagcli mcp tools <serverId>` discovery issue. Upgraded the underlying mechanism to utilize the new lazy `getClientJIT` (Just-In-Time) wakeup pattern instead of the legacy synchronous connector.
- **Added**: Greatly enhanced NPM package discoverability by injecting relevant `mcp`, `llm`, and `proxy` SEO keywords directly into `package.json`.

## [1.0.8] - 2026-03-26
### Security & Proxy Intelligence
- **Added**: Integrated **Zero-Latency In-Memory Rate Limiting** from `@cyber-sec.space/aag-core@1.0.3`. The Token Bucket governor now utilizes pure in-memory `getConfig()` lookups, resolving potential disk I/O bottlenecks.
- **Added**: Upgraded `aagcli ai ratelimit <aiid> <rate> [unit]` command. Administrators can now dynamically assign quotas using `rpm` (per minute), `rph` (per hour), or `default` to reset restrictions.
- **Added**: Integrated **Data Masking Middleware**, automatically sanitizing PII and API keys from downstream MCP responses.
- **Changed**: Enhanced `aagcli ai list` to display active Rate Limit status per AI client.
- **Fixed**: Hardened the proxy's `X-Powered-By` header to mitigate Information Exposure (CWE-200).
- **Security**: Upgraded the core engine to support **Auto-Reconnect** (Exponential Backoff) and **Fail-Fast Defense** for dropped downstream connections.
- **Documentation**: Updated Architecture flowcharts (Mermaid) and embedded a new premium **v1.0.8 Architecture Visualization** summarizing the Middleware Pipeline.

## [1.0.7] - 2026-03-26
### Architecture & Modularization
- **Changed**: Refactored the codebase into an NPM Workspace monorepo. Extracted the core proxy logic into a permissive, OS-agnostic library (`@cyber-sec.space/aag-core`) utilizing dependency injection (`ISecretStore`, `IConfigStore`, `IAuditLogger`).
- **Changed**: Finalized the `AAG-Core` extraction by removing local workspace coupling and transitioning the CLI to depend on the officially published `@cyber-sec.space/aag-core` NPM package.
- **Changed**: The CLI application now serves as the primary consumer of the core library, supplying OS-specific integrations (Keychain, File System) to the core.
- **Documentation**: Updated Architecture flowcharts and sequence diagrams (English and Chinese) to visually distinguish between the newly separated `AAG-Core` library and the `CLI` host application.
- **Fixed**: Corrected the `aagcli stdio-path` runtime path resolution after structural realignment.

## [1.0.6] - 2026-03-25
### Security & Access Control
- **Changed**: Enforced strict `AND` logic for RBAC execution. AI clients must now actively have access to the parent server in order to use an allowed tool from that server.
- **Fixed**: Added strict cross-validation to the CLI `aagcli ai permit` command, preventing administrators from permitting a tool if the target AI lacks server-level permission for it.

## [1.0.5] - 2026-03-25
### Added
- **CLI**: Introduced the `aagcli stdio-path` helper command, which outputs the absolute file path to the compiled `stdio.js` script to simplify local AI client configuration.

## [1.0.4] - 2026-03-25
### Fixed
- **Documentation**: Corrected the Method 1 (STDIO) JSON examples in `README.md` and `README_ZH.md` to point directly to `build/stdio.js`, reflecting the true independent proxy lifecycle architectural design.

## [1.0.3] - 2026-03-25
### Added
- **CLI / Daemon**: Introduced `aagcli sse start`, `aagcli sse stop`, and `aagcli sse status` commands to manage a lightweight, zero-dependency background proxy daemon for HTTP SSE connections.

## [1.0.2] - 2026-03-25
### Security & Maintenance
- **Fixed**: Resolved a security/maintenance alert regarding the deprecated `prebuild-install` dependency.
- **Changed**: Replaced the archived `keytar` package with `@hackolade/keytar` for OS Keychain integration. This modern fork bundles pre-built binaries, completely removing the reliance on `prebuild-install` without altering the native keychain API.

## [1.0.1] - 2026-03-25
### Changed
- **Documentation**: Added NPM registry installation instructions globally (`npm install -g @cyber-sec.space/ai-auth-gateway`) to `README.md` and `README_ZH.md`.
- **Documentation**: Appended GitHub Issues & Contributing sections and updated document cross-references to use absolute GitHub URLs.

## [1.0.0] - 2026-03-25
### Added
- Initial core release of AI Auth Gateway.
- Multiplexing proxy for multiple downstream MCP servers (`stdio`, `sse`, `http`).
- Built-in **Role-Based Access Control (RBAC)** per AI client identity (`AI_ID`).
- Dual-encryption OS Keychain integration (`keytar` + AES-256-GCM) for API keys.
- Comprehensive `aagcli` for live hot-reloading configuration management.
- Dynamic credential injection (`env`, `payload`, `header`, `none`).
- Secure masked logging system (`logs/proxy.log`).
- Complete English and Traditional Chinese Architecture documentation and README guides.
