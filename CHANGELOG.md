# Changelog

All notable changes to the **AI Auth Gateway (AAG)** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2026-03-25
### Added
- **CLI**: Added the `aagcli stdio-path` command to easily resolve the absolute path of `stdio.js` for local AI client (e.g., Cursor, Claude Desktop) configurations.
- **Documentation**: Added NPM system update instructions globally to `README.md` and `README_ZH.md`.

### Security
- **Config**: Disabled the Express `X-Powered-By` header in the proxy server to resolve CWE-200 Information Exposure vulnerability.

### Changed
- **Daemon**: Removed redundant verbose logging of the `stdio.js` absolute path during background server startup (`aagcli sse start`) to keep logs cleaner.

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
