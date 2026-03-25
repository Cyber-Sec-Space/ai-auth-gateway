# AI Auth Gateway - 系統架構

本文件描述 **AI Auth Gateway** 的高層級架構、核心組件以及資料流程。

## 1. 高層級概述

**AI Auth Gateway** 旨在充當上游 AI 客戶端（例如 Claude Desktop, Cursor, Antigravity）與下游多個 Model Context Protocol (MCP) 伺服器之間的安全中介代理 (Proxy)。

系統強制實施 **上游身份驗證 (Upstream Authentication)**，要求連接的客戶端必須透過 `AI_ID` 與 `AI_KEY` 來證明其身份，方能與代理伺服器互動。同時，系統也處理 **下游驗證注入 (Downstream Authentication Injection)**，將必要的機密憑證（如 JWT、API 金鑰、PAT）無縫加入發往外部工具的請求中，而無需將這些機密暴露給上游 AI 客戶端。

```mermaid
architecture-beta
    group client(cloud)[上游 AI 客戶端]
    service cursor(desktop)[Cursor] in client
    service claude(desktop)[Claude Desktop] in client

    group gateway(server)[AI Auth Gateway]
    service proxy(server)[連線轉發 Proxy] in gateway
    service rbac(database)[RBAC 權限引擎] in gateway
    service vault(database)[設定與安全金庫] in gateway

    group downstream(cloud)[下游 MCP 伺服器]
    service local(server)[本機 stdio 伺服器] in downstream
    service github(server)[遠端 SSE 伺服器] in downstream
    service remote(server)[自訂 HTTP 伺服器] in downstream

    cursor:R --> L:proxy
    claude:R --> L:proxy

    proxy:R --> L:local
    proxy:R --> L:github
    proxy:R --> L:remote

    proxy:B --> T:rbac
    proxy:B --> T:vault
```

---

## 2. 核心組件

此架構建構於官方的 `@modelcontextprotocol/sdk` 之上，主要包含以下六個核心支柱：

### A. 代理伺服器核心 (`src/proxy.ts` & `src/index.ts`)
- **傳輸層**: 透過 Server-Sent Events (SSE) 監聽來自 AI 客戶端的連線。
- **身份驗證**: 將傳入的 `AI_ID` 和 `AI_KEY` 與設定檔中已授權的實體進行比對驗證。
- **協定模擬**: 攔截標準 MCP 請求（如 `ListToolsRequestSchema`、`CallToolRequestSchema`）並將其分發到多個下游伺服器。

### B. 客戶端管理器 (`src/clientManager.ts`)
- **多路復用 (Multiplexing)**: 管理一個下游 MCP 客戶端池，每個客戶端皆連接著不同的目標伺服器。
- **傳輸支援**: 支援使用 `stdio`、`sse` 以及 `http` 與下游進行通訊。
- **生命週期**: 處理下游服務的連線、斷線及錯誤復原。

### C. 設定管理器 (`src/config.ts`)
- **單一事實來源**: 讀取與寫入 `mcp-proxy-config.json`，並利用 `chokidar` 監控檔案變更以達到熱重載 (Hot-reload)。
- **主金鑰加密**: 生成並管理用來加解密透過作業系統憑證庫 (`keytar`) 傳遞敏感資料的 `masterKey`。
- **機密解析**: 動態解析 `authInjection` 的值，無論它們是原始字串、環境變數 (`$VAR`) 還是憑證庫參照 (`keytar://service/account`)。

### D. 基於角色的存取控制 (RBAC) 引擎
- 直接整合於代理層，RBAC 引擎可根據每個 `AIKey` 所定義的精細白名單與黑名單，過濾 AI 能看到及呼叫的工具。
- 來自多個下游伺服器的工具會被彙總並加上命名空間（例如 `${serverId}___${toolName}`）以防止名稱衝突。

### E. 安全日誌系統 (`src/utils/logger.ts`)
- **集中追蹤**: 記錄所有代理活動，包含驗證成功、特定的工具呼叫以及權限拒絕等行為。
- **資料遮罩**: 系統會自動辨識並遮罩敏感資料（如 API 金鑰、AI 金鑰或 Authorization 標頭），確保機密不會外洩到 `logs/proxy.log` 或是終端機console。

### F. 命令列介面 (`aagcli`)
這是實作於 `src/commands/` 的完整 CLI 工具，需要 `sudo` 權限執行以管理整個閘道：
- **`config`**: 管理系統設定（如啟動端口與日誌級別）。
- **`mcp`**: 探索在線的下游伺服器與可用的工具清單。
- **`ai`**: 註冊 AI 客戶端、撤銷金鑰並管理精細的 RBAC 權限。
- **`keychain`**: 將下游 API 金鑰安全地儲存在底層作業系統的加密憑證庫中。

---

## 3. 資料流程

### 3.1. 驗證與探索 (Discovery) 流水線

```mermaid
sequenceDiagram
    participant AI as AI 客戶端
    participant GW as AI Auth Gateway
    participant CFG as 設定管理器
    participant MCP as 下游伺服器群

    AI->>GW: 連接至 /sse (探索工具清單)
    GW->>GW: 攔截並擷取 AI_ID & AI_KEY
    GW->>CFG: 驗證連線憑證
    alt 憑證無效
        CFG-->>GW: 未授權
        GW-->>AI: 401 Unauthorized / 中斷連線
    else 憑證正確有效
        CFG-->>GW: 通過驗證 (回傳該 AI 權限)
        GW->>MCP: 取得所有在線伺服器的可用工具
        MCP-->>GW: 回傳未過濾的工具總表
        GW->>GW: 依據 RBAC (allowedTools) 刪除無權限的工具
        GW->>GW: 將工具名稱加上前綴 (例如 server___tool)
        GW-->>AI: 傳回篩選後、安全隔離的工具清單
    end
```

### 3.2. 工具執行流程 (CallTool)

```mermaid
sequenceDiagram
    participant AI as AI 客戶端
    participant GW as Gateway (代理伺服器)
    participant KV as 作業系統憑證庫 (Keytar)
    participant MCP as 目標下游伺服器

    AI->>GW: CallTool 請求 (github_mcp___get_me)
    GW->>GW: 移除前綴解析目標 -> 伺服器: github_mcp / 工具: get_me
    GW->>GW: 嚴格檢查該 AI 是否具備工具執行權限
    alt 遭到拒絕
        GW-->>AI: 錯誤：拒絕存取，權限不足
    else 允許存取
        GW->>KV: 請求讀取 github_mcp 指定的注入金鑰
        KV-->>GW: 解密並回傳原始的連線令牌 (API Key)
        GW->>MCP: 秘密地將金鑰注入 HTTP 標頭或環境變數並轉發請求
        MCP-->>GW: 回傳外部 API 的真實執行結果
        GW-->>AI: 將結果安全轉發回上游 AI
    end
```

### 3.3. 金鑰管理與加解密流程
為了確保儲存在主機系統上的下游 API 金鑰具備絕對的安全性，Gateway 採用了雙層安全模型：結合了作業系統憑證庫 (`keytar`) 以及 AES-256-GCM 加密技術 (`CryptoService`)。

**寫入機密 (例如：透過 `aagcli keychain set`)**:
1. CLI 會從 `mcp-proxy-config.json` 讀取 `masterKey`（這是在系統初次啟動時自動生成的 64 字元長度 Hex 字串）。
2. `CryptoService` 使用該 `masterKey` 透過 AES-256-GCM 演算法將使用者的原始密碼（例如 `sk-12345...`）加密，產生一組 `iv:authTag:加密內容` 的 Payload。
3. 程式將這組**已經加密過**的 Payload 交付給 `keytar` (`libsecret` / 鑰匙圈 / 憑證管理員)，安全地存入作業系統原生的保護庫中。

**讀取機密 (在代理執行階段)**:
1. `ConfigManager` 若遇到設定字串如 `keytar://github/pat`，會準備進行機密解析。
2. 它向 `keytar` 發出請求，抓取 `service: github`、`account: pat` 的儲存資料。
3. `keytar` 解鎖 OS 原生憑證庫並回傳上述那組加密過的 Payload。
4. `CryptoService` 隨即使用 `mcp-proxy-config.json` 中的 `masterKey` 將該 Payload 解密還原成原始的 API 金鑰。
5. 這把原始金鑰**只會短暫存在於記憶體中**以執行當下的代理請求，一旦傳輸結束便會立即回收，絕不落地。
