# Changelog

All notable changes to the **AI Auth Gateway (AAG)** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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
