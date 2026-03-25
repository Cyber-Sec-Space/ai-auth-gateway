# AI Auth Gateway (AAG)

**AI Auth Gateway** 是一個以 TypeScript 打造的 Model Context Protocol (MCP) 代理伺服器。它可以彙總多個下游 MCP 伺服器，並安全地將機密憑證（如 JWT 或 API 金鑰）動態注入 API 請求中。這讓 AI 客戶端（例如 Claude Desktop 或 Cursor）無需在其本機設定檔中暴露敏感資料，即可安全地存取遠端外部工具。

[![Version: 1.0.2](https://img.shields.io/badge/Version-1.0.2-success.svg)](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/CHANGELOG.md)
[![NPM Package](https://img.shields.io/npm/v/@cyber-sec.space/ai-auth-gateway.svg)](https://www.npmjs.com/package/@cyber-sec.space/ai-auth-gateway)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

[🇺🇸 English README (英文版)](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/README.md) | [📜 版本更新紀錄 (Changelog)](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/CHANGELOG.md)

> **商業授權聲明 (Dual Licensing)**: 目前釋出的為 **社群開源版 (Community Edition)**，採用 [AGPL-3.0](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/LICENSE) 授權。若您計畫將此框架整合於商業閉源產品中、作為收費網路服務 (SaaS) 提供，或有客製化需求，請購買即將推出的 **商業企業版授權 (Commercial License)** 以取得免開源豁免權利。

## 專案特色
- 🛡️ **安全憑證管理**: 結合作業系統原生金鑰圈 (`keytar`) 與 AES-256-GCM 加密技術，提供雙層防護安全儲存並注入 API 金鑰。
- 🔀 **協定多路復用**: 支援 `stdio`、`sse` 與 `http` 多種通訊協定無縫連接下游伺服器。
- 🔒 **精細權限控制 (RBAC)**: 嚴格控管特定 AI 客戶端能存取哪些伺服器上的哪些特定 MCP 工具。
- 🕵️ **安全稽核日誌**: 自動遮罩敏感資訊的日誌系統，完整追蹤 AI_ID 連線時間與工具執行狀態 (`logs/proxy.log`)。

---

## 🚀 系統安裝

### 1. 先決條件
- [Node.js](https://nodejs.org/) (建議 v16 以上)
- `npm` 或 `yarn`

### 2. 透過 NPM 全域安裝 (官方建議)
若您只想快速使用此平台，可直接透過官方的 NPM registry 全域安裝：
```bash
npm install -g @cyber-sec.space/ai-auth-gateway
```
*NPM 套件位址: [@cyber-sec.space/ai-auth-gateway](https://www.npmjs.com/package/@cyber-sec.space/ai-auth-gateway)*

### 3. 下載與編譯 (原始碼部署)
若是從原始碼部署（如部署至 VPS 或本機開發測試）：
```bash
git clone https://github.com/Cyber-Sec-Space/ai-auth-gateway.git
cd ai_auth_gateway
npm install
npm run build
```

### 4. 系統更新 (System Update)
若您是透過 NPM 全域安裝，可透過以下指令將系統升級至最新版本：
```bash
npm update -g @cyber-sec.space/ai-auth-gateway
```
若您是從原始碼部署，請拉取最新程式碼後重新編譯：
```bash
git pull
npm install
npm run build
```

---

## ⚙️ 基本設定與使用

Proxy 的核心設定檔案為 `mcp-proxy-config.json`，我們於根目錄下提供了一份 `mcp-proxy-config.sample.json` 以供參考。

### 步驟一：啟動伺服器
預設會在 Port 3000 上啟動 Proxy：
```bash
npm start
```
*伺服器啟動後將在 `http://localhost:3000/sse` 監聽請求。*

### 步驟二：連接您的 AI 客戶端
要將您的 AI 客戶端（如 Claude Desktop 或 Cursor）連接至 Gateway，請提供相應的 `AI_ID` 與 `AI_KEY` 以通過身分驗證。目前有兩種主要的連接方式：

**方式一：透過 STDIO 橋接 (適用於 Claude Desktop 或 Cursor 本機代理)**
如果您希望 AI 客戶端直接在內部喚醒 Gateway，而不需要在背景執行 Daemon，請在客戶端設定中指向編譯好的 `stdio.js`：
*(💡 提示：您可以隨時在終端機輸入 `sudo npx aagcli stdio-path` 來取得該檔案的真實絕對路徑)*
```json
{
  "mcpServers": {
    "ai-auth-gateway": {
      "command": "node",
      "args": ["/您的絕對路徑/ai_auth_gateway/build/stdio.js"],
      "env": {
        "AI_ID": "my-ai",
        "AI_KEY": "在_aagcli_生成的_key"
      }
    }
  }
}
```

**方式二：原生 SSE 連線 (適用於 Cursor 等原生支援 SSE 的客戶端)**
如果您的 AI 客戶端原生支援 Server-Sent Events (SSE) (例如 Cursor 的介面設定或原生設定檔)，您可以直接將其網址指向 Gateway，並透過網址參數傳遞憑證：
```json
{
  "mcpServers": {
    "ai-auth-gateway-sse": {
      "transport": "sse",
      "url": "http://localhost:3000/sse?aiid=my-ai&key=您的金鑰Hash"
    }
  }
}
```
*(註：若客戶端支援自訂標頭，也可透過 `AI-ID: my-ai` 及 `Authorization: Bearer 您的金鑰Hash` 傳遞身分)*

---

## 🛠️ 命令列工具 (`aagcli`) 指南

為了方便管理 Gateway 的設定、權限與金鑰，系統內建了強大的 CLI 工具。**注意：所有的 CLI 指令皆須具備 `sudo` 管理員權限。**

### 1. 背景伺服器生命週期管理 (SSE Daemon)
若需要給外部 HTTP / 瀏覽器連線，您可以直接讓 Gateway 在背景常駐執行連線池，無需維持終端機開啟：
（註：如透過 `stdio` 方式連線，則完全不需要啟動此背景程序）
```bash
# 在背景啟動 SSE Proxy 伺服器
sudo npx aagcli sse start

# 檢查背景伺服器運作狀態
sudo npx aagcli sse status

# 安全地關閉背景伺服器
sudo npx aagcli sse stop
```

### 2. 系統設定 (System Config)
不需要手動編輯 JSON，即可動態管理 Proxy Port 或 Log 級別。
```bash
# 檢視目前的系統環境設定
sudo npx aagcli config view

# 更改 Proxy 的連線埠 (將於下次伺服器啟動時生效)
sudo npx aagcli config set port 8080
sudo npx aagcli config set logLevel DEBUG
```

### 2. 金鑰金庫 (Keychain) 管理
將下游的 API 金鑰安全地存入作業系統原生的保護加密區 (如 macOS 鑰匙圈、Linux libsecret)。
```bash
# 將 GitHub 的 Personal Access Token 存入系統金鑰圈
sudo npx aagcli keychain set github pat my_secret_token_123

# 完成後即可在 mcp-proxy-config.json 內如此引用：
# "value": "keytar://github/pat"
```

### 3. AI 客戶端與 RBAC 權限管理
註冊新 AI 身份，並針對個別的 AI 身份設定其下游工具白名單。
```bash
# 註冊一把新的 AI 金鑰
sudo npx aagcli ai register my-new-agent "用來測試的 Agent"

# 檢視目前所有已註冊的 AI 及狀態
sudo npx aagcli ai list

# 開放 'my-new-agent' 只能使用 GitHub 的 get_me 工具
sudo npx aagcli ai permit my-new-agent --tool github_mcp___get_me
```

### 4. MCP 在線探索 (Discovery)
即時監控 Proxy 與下游伺服器的連接狀態，並探索對方到底提供了什麼工具。
```bash
# 列出目前掛載在 Gateway 上的所有下游 MCP 伺服器
sudo npx aagcli mcp list

# 呼叫並陳列 `github_mcp` 上所有可供執行的工具與中文/英文功能描述
sudo npx aagcli mcp tools github_mcp
```

### 5. 輔助工具指令 (Utility)
當您需要讓本機上的 AI 客戶端 (如 Cursor, Claude Desktop) 透過 `stdio` 方式直接喚醒 Proxy 時，可以用此指令快速取得編譯好的代理啟動路徑，方便複製貼上到各種設定檔中。
```bash
# 取得本機 stdio 代理執行檔的絕對路徑
sudo npx aagcli stdio-path
```

---

## 📖 深入了解系統架構
對於想深入理解資料流動、雙層加解密模型以及 Proxy 底層運作邏輯的使用者，請參閱：
- [架構說明書 (英文版)](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/ARCHITECTURE.md)
- [架構說明書 (繁體中文版)](https://github.com/Cyber-Sec-Space/ai-auth-gateway/blob/main/ARCHITECTURE_ZH.md)

---

## 🐞 問題回報與參與貢獻
如果您在使用過程中發現任何 Bug、有新功能建議，或是遇到設定上的問題，歡迎隨時 **[在 GitHub 上提交 Issue](https://github.com/Cyber-Sec-Space/ai-auth-gateway/issues)**！

我們也非常歡迎您發起 Pull Request 一起來讓這套企業級 AI 代理框架變得更好更安全！
