import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { ClientManager, ProxyServer, SessionManager, PluginLoader, RateLimitPlugin, DataMaskingPlugin } from "@cyber-sec.space/aag-core";
import { FileConfigStore } from "./services/FileConfigStore.js";
import { KeychainSecretStore } from "./services/KeychainSecretStore.js";
import { ConsoleAuditLogger } from "./services/ConsoleAuditLogger.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const configPath = path.join(__dirname, "..", "mcp-proxy-config.json");
  const configStore = new FileConfigStore(configPath);
  const secretStore = new KeychainSecretStore(configStore);
  const logger = new ConsoleAuditLogger();

  const clientManager = new ClientManager(configStore, secretStore, logger);
  const sessionManager = new SessionManager(configStore, logger);
  const initialConfig = configStore.load();
  await clientManager.syncConfig(initialConfig);

  configStore.watch();
  configStore.on("configChanged", async (newConfig) => {
    await clientManager.syncConfig(newConfig);
  });

  const app = express();
  app.disable("x-powered-by");
  app.use(cors());

  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    logger.info("Proxy", "New SSE connection established");
    
    // aag-core v2.0.0 multi-tenant authentication extraction
    const aiid = (req.headers["x-ai-id"] || req.query.aiid) as string;
    const key = (req.headers["x-ai-key"] || req.query.key) as string;

    if (!aiid || !key) {
      logger.warn("Proxy", "SSE Authentication failed: Missing x-ai-id or x-ai-key headers");
      res.status(401).send("Authentication required: Please provide x-ai-id and x-ai-key headers.");
      return;
    }

    const config = configStore.getConfig();
    const keyEntry = config?.aiKeys?.[aiid];
    
    if (!keyEntry || keyEntry.revoked || keyEntry.key !== key) {
      logger.warn("Proxy", `SSE Authentication failed for AIID '${aiid}'`);
      res.status(403).send("Forbidden: Invalid credentials or revoked key.");
      return;
    }

    const absoluteEndpoint = `${req.protocol}://${req.get("host")}/message`;
    const transport = new SSEServerTransport(absoluteEndpoint, res);
    transports.set(transport.sessionId, transport);

    const unregisterSession = sessionManager.registerSession(aiid, () => {
      logger.info("Proxy", `Forcibly closing SSE session ${transport.sessionId} due to credential revocation.`);
      transport.close().catch(()=>{});
      res.end();
    });

    // Bind authenticated SaaS identity safely into the proxy instance
    const sessionProxy = new ProxyServer(clientManager, configStore, secretStore, logger, {
        aiId: aiid,
        disableEnvFallback: true
    });
    // Initialize v2.1.0 Plugin Ecosystem
    const configData = configStore.getConfig();
    const plugins = configData?.plugins || [];
    const pluginLoader = new PluginLoader(logger);
    await pluginLoader.loadPlugins(sessionProxy, configStore, plugins);

    // Manually register built-in plugins as fallback if not defined in config
    if (!plugins.find(p => p.name === "@cyber-sec.space/aag-core-data-masking")) {
      await DataMaskingPlugin.register({
        proxyServer: sessionProxy,
        configStore,
        logger,
        options: { rules: [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, /sk-[a-zA-Z0-9]{32,}/g, /(password|secret|token).{0,5}[:=].{0,5}['"][^'"]+['"]/gi], maskString: '***[MASKED]***' }
      });
    }
    
    if (!plugins.find(p => p.name === "@cyber-sec.space/aag-core-rate-limit")) {
      await RateLimitPlugin.register({
        proxyServer: sessionProxy,
        configStore,
        logger,
        options: { maxRequests: 50, windowMs: 60000 }
      });
    }
    await sessionProxy.server.connect(transport);

    res.on("close", () => {
      unregisterSession();
      logger.info("Proxy", `SSE connection closed (Session: ${transport.sessionId})`);
      transports.delete(transport.sessionId);
    });
  });

  app.post("/message", async (req, res) => {
    logger.debug("Proxy", `Received POST request to: ${req.originalUrl}, query:`, req.query);
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      logger.warn("Proxy", `Session not found for ID: ${sessionId}`);
      res.status(404).send("Session not found");
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  const port = initialConfig.system?.port || process.env.PORT || 3000;
  app.listen(port, () => {
    logger.info("Proxy", `AI Auth Gateway is running and listening on http://localhost:${port}`);
    logger.info("Proxy", `Connect your MCP clients to: http://localhost:${port}/sse`);
  });
}

main().catch((e) => {
  console.error(`Fatal error: ${e.message}`);
  process.exit(1);
});
