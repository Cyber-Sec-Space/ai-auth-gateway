import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ClientManager } from "@cyber-sec.space/aag-core";
import { FileConfigStore } from "../services/FileConfigStore.js";
import { KeychainSecretStore } from "../services/KeychainSecretStore.js";
import { ConsoleAuditLogger } from "../services/ConsoleAuditLogger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "..", "..", "mcp-proxy-config.json");

export function registerMcpCommand(program: Command) {
  const mcp = program.command("mcp").description("Manage and discover downstream MCP servers");

  mcp.command("list")
    .description("List all configured downstream servers")
    .action(() => {
      const config = loadConfig();
      const servers = config.mcpServers || {};
      console.log("\nConfigured Downstream Servers:");
      const tableData = Object.entries(servers).map(([id, cfg]: [string, any]) => ({
        ServerID: id,
        Transport: cfg.transport,
        Endpoint: cfg.url || cfg.command || "N/A"
      }));
      console.table(tableData);
    });

  mcp.command("tools <serverId>")
    .description("List actual tools from a specific downstream server (requires connection)")
    .action(async (serverId) => {
      const configStore = new FileConfigStore(CONFIG_PATH);
      const secretStore = new KeychainSecretStore(configStore);
      const logger = new ConsoleAuditLogger();
      
      const clientManager = new ClientManager(configStore, secretStore, logger);
      const config = configStore.load();
      
      const serverConfig = config.mcpServers[serverId];
      if (!serverConfig) {
        console.error(`Server ID '${serverId}' not found in configuration.`);
        return;
      }

      console.log(`Connecting to '${serverId}'...`);
      const discoveryConfig = { ...config, mcpServers: { [serverId]: serverConfig } };
      await clientManager.syncConfig(discoveryConfig);

      const client = clientManager.getClient(serverId);
      if (!client) {
        console.error(`Failed to connect to '${serverId}'.`);
        return;
      }

      try {
        const response = await client.listTools();
        console.log(`\nAvailable Tools for '${serverId}':`);
        const tableData = response.tools.map((t: any) => ({
            "Tool Name": t.name,
            "Full Namespaced Path": `${serverId}___${t.name}`,
            "Description": t.description || "(no description)"
        }));
        console.table(tableData);
        
        await client.close();
      } catch (err: any) {
        console.error(`Error listing tools: ${err.message}`);
      } finally {
          process.exit(0);
      }
    });
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { mcpServers: {} };
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}
