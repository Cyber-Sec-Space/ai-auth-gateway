# Changelog

All notable changes to the **AI Auth Gateway (AAG)** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
