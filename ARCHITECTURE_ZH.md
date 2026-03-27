# AI Auth Gateway - 系統架構

本文件描述 **AI Auth Gateway** 的高層級架構、核心組件以及資料流程。

## 1. 高層級概述

**AI Auth Gateway** 旨在充當上游 AI 客戶端（例如 Claude Desktop, Cursor, Antigravity）與下游多個 Model Context Protocol (MCP) 伺服器之間的安全中介代理 (Proxy)。

系統強制實施 **上游身份驗證 (Upstream Authentication)**，要求連接的客戶端必須透過 `AI_ID` 與 `AI_KEY` 來證明其身份，方能與代理伺服器互動。同時，系統也處理 **下游驗證注入 (Downstream Authentication Injection)**，將必要的機密憑證（如 JWT、API 金鑰、PAT）無縫加入發往外部工具的請求中，而無需將這些機密暴露給上游 AI 客戶端。

```mermaid
flowchart TD
    subgraph client ["上遊 AI 客戶端"]
        cursor["Cursor"]
        claude["Claude Desktop"]
    end

    subgraph cli ["AAG-CLI 主程式端"]
        vault[("OS Keytar 作業系統金鑰庫")]
        config[("本地實體檔案設定庫")]
    end

    subgraph gateway ["AAG-Core (核心函數庫)"]
        subgraph proxy_p ["Proxy 處理管線"]
            mw["動態外掛 (限流、遮罩)"]
            rbac["RBAC 與 路由引擎"]
            mw --> rbac
        end
    end

    subgraph downstream ["下游 MCP 伺服器"]
        local_s["本機 stdio 伺服器"]
        github_s["遠端 SSE 伺服器"]
        remote_s["自訂 HTTP 伺服器"]
    end

    cursor --> mw
    claude --> mw

    rbac --> local_s
    rbac --> github_s
    rbac --> remote_s

    rbac -.-> config
    rbac -.-> vault
```

---

## 2. 核心組件

此架構採用 **NPM Workspace (Monorepo)** 建立於官方 `@modelcontextprotocol/sdk` 之上。透過嚴格的依賴注入 (`ISecretStore`、`IConfigStore`、`IAuditLogger`)，系統將高重用性、與作業系統無關的 `@cyber-sec.space/aag-core` (核心函式庫) 與 `ai-auth-gateway` (CLI 主程式) 完全分離。

### A. 代理伺服器核心 (`@cyber-sec.space/aag-core` 套件中的 `ProxyServer`)
- **傳輸層**: 接收來自 AI 客戶端的 Server-Sent Events (SSE) 或 STDIO 連線。
- **身份驗證**: 將傳入的 `AI_ID` 和 `AI_KEY` 透過注入的 `IConfigStore` 進行比對驗證。
- **協定模擬**: 攔截標準 MCP 請求（如 `ListToolsRequestSchema`、`CallToolRequestSchema`）並將其分發到多個下游伺服器。
- **外掛生態系 (Plugin Ecosystem)**: 採用動態 `PluginLoader` 架構，允許模組化外掛 (`RateLimitPlugin`, `DataMaskingPlugin`) 在請求發送前 (`onRequest`) 或結果回傳前 (`onResponse`) 攔截與處理流量。

### B. 客戶端管理器 (`@cyber-sec.space/aag-core` 套件中的 `ClientManager`)
- **LRU 快取池 (Multiplexing)**: 採用 Least-Recently-Used 機制管理下游 MCP 客戶端陣列，避免無限擴張的記憶體洩漏風險。
- **Scale-to-Zero JIT 與健康狀態監控**: 採用延遲連線策略，提供可設定的閒置超時與心跳監控 (`pingIntervalMs`, `pingTimeoutMs`)。下游伺服器平時僅保持設定檔狀態，只會在工具被主動呼叫時才真正喚醒並建立連線，閒置時會自動休眠以節省運算資源。
- **多重傳輸支援**: 原生支援 `stdio`、`sse` 以及 `http`，可輕易橋接本機二進位檔或遠端 SaaS 叢集。
- **生命週期**: 處理下游服務的連線、斷線及錯誤復原 (指數退避重試演算法)。

### C. 設定管理器與儲存介面
- **核心介面 (`IConfigStore`, `ISecretStore`)**: 核心 Proxy 完全不去預設立場資料該如何儲存，這使得企業端能輕易地將本機檔案庫抽換為關聯式資料庫或是 Hashicorp Vault。
- **CLI 實作端 (根目錄)**: CLI 主程式設計了特製的 `FileConfigStore` (透過 `chokidar` 監聽本地 `mcp-proxy-config.json`) 及 `KeychainSecretStore` (透過 `keytar` 操作 OS 原生鑰匙圈)，並在啟動時注入給上述核心使用。

### D. 基於角色的存取控制 (RBAC) 引擎
- 直接整合於代理層，RBAC 引擎可根據每個 `AIKey` 所定義的精細白名單與黑名單，過濾 AI 能看到及呼叫的工具。
- 來自多個下游伺服器的工具會被彙總並加上命名空間（例如 `${serverId}___${toolName}`）以防止名稱衝突。

### E. 安全日誌系統 (`src/utils/logger.ts`)
- **集中追蹤**: 記錄所有代理活動，包含驗證成功、特定的工具呼叫以及權限拒絕等行為。
- **資料遮罩**: 系統會自動辨識並遮罩敏感資料（如 API 金鑰、AI 金鑰或 Authorization 標頭），確保機密不會外洩到 `logs/proxy.log` 或是終端機console。

### F. 命令列介面 (`aagcli`)
這是實作於 `src/commands/` 的完整 CLI 工具，需要 `sudo` 權限執行以管理整個閘道：
- **`server`**: 管理常駐背景代理伺服器的生命週期 (`start`, `stop`, `status`)。
- **`config`**: 管理系統設定檔（如啟動端口、日誌級別、心跳頻率與連線超時等）。
- **`mcp`**: 探索在線的下游伺服器與可用的工具清單。
- **`ai`**: 註冊 AI 客戶端、撤銷金鑰並管理精細的 RBAC 權限。
- **`keychain`**: 將下游 API 金鑰安全地儲存在底層作業系統的加密憑證庫中。
- **`stdio-path`**: 取得給本機 AI 客戶端連接用的 `stdio` 執行檔絕對路徑。

### G. 內建生態外掛 (Built-in Plugins)
代理核心透過 `PluginLoader` 提供了開箱即用的模組化防護層：
- **RateLimitPlugin (限流)**: 透過「權杖桶演算法 (Token Bucket)」實施每分鐘 (RPM) 或每小時 (RPH) 的請求數限制。現已優化為零延遲的純記憶體快取讀取 (`getConfig()`)，根據 `mcp-proxy-config.json` 動態調整而不產生硬碟 I/O。
- **DataMaskingPlugin (資料遮罩)**: 基於正則表達式攔截器，自動過濾掉下游回傳結果中的 API Keys (如 `sk-...`)、密碼或 PII 敏感資訊。

---

## 3. 資料流程

### 3.1. 驗證與探索 (Discovery) 流水線

```mermaid
sequenceDiagram
    participant AI as AI 客戶端
    participant GW as AAG Gateway (HTTP/CLI)
    participant Core as AAG-Core (ProxySession)
    participant MCP as 下游伺服器群

    AI->>GW: 連接至 /sse (Headers: x-ai-id, x-ai-key)
    GW->>GW: 透過 Store 驗證連線憑證
    alt 憑證無效
        GW-->>AI: 401 Unauthorized / 中斷連線
    else 憑證正確有效
        GW->>Core: 綁定代理會話 ProxySession({ aiId: 'tenant', disableEnvFallback: true })
        Core->>MCP: 就時喚醒下游 (JIT) 並取得可用工具
        MCP-->>Core: 回傳未過濾的工具總表
        Core->>Core: 依據 RBAC 刪除無權限的工具
        Core->>Core: 將工具名稱加上前綴 (例如 server___tool)
        Core-->>AI: 傳回篩選後、安全隔離的工具清單
    end
```

### 3.2. 工具執行流程 (CallTool)

```mermaid
sequenceDiagram
    participant AI as AI 客戶端
    participant Core as AAG-Core (ProxySession)
    participant KV as AAG-CLI (ISecretStore 介面)
    participant MCP as 目標下游伺服器

    AI->>Core: CallTool 請求 (github_mcp___get_me)
    Core->>Core: 驗證多租戶身分綁定 (aiId Natively Bound)
    Core->>Core: 移除前綴解析目標 -> 伺服器: github_mcp / 工具: get_me
    Core->>Core: [Plugin] 載入 RateLimitPlugin (Memory Store) 檢查餘額
    alt 限流觸發
        Core-->>AI: 錯誤：超出請求頻率限制 (Rate limit exceeded)
    else 檢查通過
        Core->>Core: 嚴格檢查該 AI 是否具備工具執行權限
        alt 遭到拒絕
            Core-->>AI: 錯誤：拒絕存取，權限不足
        else 驗證通過具備權限
            Core->>MCP: 就時喚醒下游伺服器連線 (JIT)
            Core->>KV: 要求解析隱藏注入的 API 金鑰
            KV-->>Core: 回傳原生金鑰字串 (如從 macOS Keychain)
            Core->>MCP: 夾帶金鑰與參數轉發請求至下游 Tool
            MCP-->>Core: 回傳工具執行結果
            Core->>Core: [Plugin] 觸發 DataMaskingPlugin 脫敏輸出
            Core-->>AI: 傳回安全遮罩後的最終結果
        end
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
