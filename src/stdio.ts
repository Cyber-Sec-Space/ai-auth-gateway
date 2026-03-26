import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClientManager, ProxyServer } from "@cyber-sec.space/aag-core/build/index.js";
import { DataMaskingMiddleware } from "@cyber-sec.space/aag-core/build/middleware/dataMasking.js";
import { RateLimitMiddleware } from "@cyber-sec.space/aag-core/build/middleware/rateLimit.js";
import { FileConfigStore } from "./services/FileConfigStore.js";
import { KeychainSecretStore } from "./services/KeychainSecretStore.js";
import { ConsoleAuditLogger } from "./services/ConsoleAuditLogger.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
console.log = (...args) => console.error("[LOG]", ...args);
console.info = (...args) => console.error("[INFO]", ...args);
console.warn = (...args) => console.error("[WARN]", ...args);

async function main() {
  const configPath = path.join(__dirname, "..", "mcp-proxy-config.json");
  const configStore = new FileConfigStore(configPath);
  const secretStore = new KeychainSecretStore(configStore);
  const logger = new ConsoleAuditLogger();
  
  const clientManager = new ClientManager(configStore, secretStore, logger);
  const proxy = new ProxyServer(clientManager, configStore, secretStore, logger);
  proxy.use(new DataMaskingMiddleware([/sk-[a-zA-Z0-9]{32,}/g, /(password|secret|token).{0,5}[:=].{0,5}['"][^'"]+['"]/gi], '***[MASKED]***'));
  proxy.use(new RateLimitMiddleware(50, 60000, configStore));

  const initialConfig = configStore.load();
  await clientManager.syncConfig(initialConfig);

  configStore.watch();
  configStore.on("configChanged", async (newConfig) => {
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
