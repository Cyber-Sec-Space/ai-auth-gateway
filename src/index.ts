import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { ClientManager, ProxyServer } from "@cyber-sec.space/aag-core";
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
  const proxy = new ProxyServer(clientManager, configStore, secretStore, logger);

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
    const absoluteEndpoint = `${req.protocol}://${req.get("host")}/message`;
    const transport = new SSEServerTransport(absoluteEndpoint, res);
    transports.set(transport.sessionId, transport);
    
    const sessionProxy = new ProxyServer(clientManager, configStore, secretStore, logger);
    await sessionProxy.server.connect(transport);

    res.on("close", () => {
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
