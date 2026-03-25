import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { ConfigManager } from "./config.js";
import { ClientManager } from "./clientManager.js";
import { ProxyServer } from "./proxy.js";
import * as path from "path";
import { fileURLToPath } from "url";
import { Logger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const app = express();
  app.use(cors());

  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    Logger.info("Proxy", "New SSE connection established");
    const absoluteEndpoint = `${req.protocol}://${req.get("host")}/message`;
    const transport = new SSEServerTransport(absoluteEndpoint, res);
    transports.set(transport.sessionId, transport);
    
    // Instantiate a new MCP Server per client connection to avoid "already initialized" errors
    const sessionProxy = new ProxyServer(clientManager, configManager);
    await sessionProxy.server.connect(transport);

    res.on("close", () => {
      Logger.info("Proxy", `SSE connection closed (Session: ${transport.sessionId})`);
      transports.delete(transport.sessionId);
    });
  });

  app.post("/message", async (req, res) => {
    Logger.debug("Proxy", `Received POST request to: ${req.originalUrl}, query:`, req.query);
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      Logger.warn("Proxy", `Session not found for ID: ${sessionId}`);
      res.status(404).send("Session not found");
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  const port = initialConfig.system?.port || process.env.PORT || 3000;
  app.listen(port, () => {
    Logger.info("Proxy", `AI Auth Gateway is running and listening on http://localhost:${port}`);
    Logger.info("Proxy", `Connect your MCP clients to: http://localhost:${port}/sse`);
  });
}

main().catch((e) => {
  Logger.error("Proxy", `Fatal error: ${e.message}`);
  process.exit(1);
});
