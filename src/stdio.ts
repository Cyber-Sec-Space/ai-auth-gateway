import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClientManager, ProxyServer, SessionManager, PluginLoader, RateLimitPlugin, DataMaskingPlugin } from "@cyber-sec.space/aag-core";
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
  
  const aiId = process.env.AI_ID;
  const aiKey = process.env.AI_KEY;

  if (!aiId || !aiKey) {
    console.error("Fatal error: Missing AI_ID or AI_KEY in environment variables.");
    process.exit(1);
  }

  const initialConfig = configStore.load(); // Load upfront for synchronous auth check
  const keyEntry = initialConfig?.aiKeys?.[aiId];
  if (!keyEntry || keyEntry.revoked || keyEntry.key !== aiKey) {
    console.error(`Fatal error: Authentication failed for AI ID '${aiId}'. Invalid credentials or revoked key.`);
    process.exit(1);
  }

  const clientManager = new ClientManager(configStore, secretStore, logger);
  const sessionManager = new SessionManager(configStore, logger);
  const proxy = new ProxyServer(clientManager, configStore, secretStore, logger, {
      aiId: aiId,
      disableEnvFallback: true
  });
  // Initialize v2.1.0 Plugin Ecosystem
  const configData = configStore.getConfig();
  const plugins = configData?.plugins || [];
  const pluginLoader = new PluginLoader(logger);
  await pluginLoader.loadPlugins(proxy, configStore, plugins);

  // Manually register built-in plugins as fallback if not defined in config
  if (!plugins.find(p => p.name === "@cyber-sec.space/aag-core-data-masking")) {
    await DataMaskingPlugin.register({
      proxyServer: proxy,
      configStore,
      logger,
      options: { rules: [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, /sk-[a-zA-Z0-9]{32,}/g, /(password|secret|token).{0,5}[:=].{0,5}['"][^'"]+['"]/gi], maskString: '***[MASKED]***' }
    });
  }
  
  if (!plugins.find(p => p.name === "@cyber-sec.space/aag-core-rate-limit")) {
    await RateLimitPlugin.register({
      proxyServer: proxy,
      configStore,
      logger,
      options: { maxRequests: 50, windowMs: 60000 }
    });
  }

  await clientManager.syncConfig(initialConfig);

  configStore.watch();
  configStore.on("configChanged", async (newConfig) => {
    await clientManager.syncConfig(newConfig);
  });

  const transport = new StdioServerTransport();
  
  sessionManager.registerSession(aiId, () => {
    console.error(`\n[Proxy] AI ID '${aiId}' has been revoked. Terminating active Stdio connection.`);
    transport.close().catch(()=>{});
    process.exit(1);
  });

  await proxy.server.connect(transport);
  console.error("[Proxy] Stdio Server Transport initialized and connected successfully!");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
