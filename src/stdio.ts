import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigManager } from "./config.js";
import { ClientManager } from "./clientManager.js";
import { ProxyServer } from "./proxy.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Override console to prevent corrupting stdio MCP communication
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
console.log = (...args) => console.error("[LOG]", ...args);
console.info = (...args) => console.error("[INFO]", ...args);
console.warn = (...args) => console.error("[WARN]", ...args);

async function main() {
  const configPath = path.join(__dirname, "..", "mcp-proxy-config.json");
  const configManager = new ConfigManager(configPath);
  const clientManager = new ClientManager(configManager);
  const proxy = new ProxyServer(clientManager, configManager);

  const initialConfig = configManager.load();
  await clientManager.syncConfig(initialConfig);

  configManager.watch();
  configManager.on("configChanged", async (newConfig) => {
    await clientManager.syncConfig(newConfig);
  });

  const transport = new StdioServerTransport();
  await proxy.server.connect(transport);
  console.error("[Proxy] Stdio Server Transport initialized and connected successfully!");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
