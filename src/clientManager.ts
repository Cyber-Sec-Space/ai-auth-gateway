import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ProxyConfig, McpServerConfig, ConfigManager, McpStdioConfig, McpSseConfig, McpHttpConfig } from "./config.js";
import { Logger } from "./utils/logger.js";

export class ClientManager {
  private clients: Map<string, Client> = new Map();
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  public async syncConfig(config: ProxyConfig) {
    const currentServerIds = new Set(this.clients.keys());
    const newServerIds = new Set(Object.keys(config.mcpServers));

    for (const id of currentServerIds) {
      if (!newServerIds.has(id)) {
        await this.removeClient(id);
      }
    }

    for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
      if (currentServerIds.has(id)) {
        await this.removeClient(id);
      }
      await this.addClient(id, serverConfig as McpServerConfig);
    }
  }

  private async removeClient(id: string) {
    const client = this.clients.get(id);
    if (client) {
      try {
        await client.close();
      } catch (e: any) {
        Logger.error("ClientManager", `Error closing client ${id}: ${e.message}`);
      }
      this.clients.delete(id);
      Logger.info("ClientManager", `Removed downstream client: ${id}`);
    }
  }

  private async addClient(id: string, config: McpServerConfig) {
    const client = new Client(
      { name: "mcp-proxy-client", version: "1.0.0" },
      { capabilities: {} }
    );

    try {
      let transport;

      if (config.transport === "stdio") {
        const stdioConfig = config as McpStdioConfig;
        const env: Record<string, string> = Object.assign({}, process.env, stdioConfig.env) as Record<string, string>;
        
        if (config.authInjection?.type === "env" && config.authInjection.key) {
          env[config.authInjection.key] = await this.configManager.resolveAuthValue(config.authInjection.value) || "";
        }

        transport = new StdioClientTransport({
          command: stdioConfig.command,
          args: stdioConfig.args,
          env
        });

      } else if (config.transport === "sse") {
        const sseConfig = config as McpSseConfig;
        const headers: Record<string, string> = {};
        
        if (config.authInjection?.type === "header" && config.authInjection.headerName) {
          headers[config.authInjection.headerName] = await this.configManager.resolveAuthValue(config.authInjection.value) || "";
        }

        transport = new SSEClientTransport(new URL(sseConfig.url), {
          requestInit: { headers },
          eventSourceInit: { headers } as any // Type bypass for node environments supporting custom EventSource headers
        });
      } else if (config.transport === "http") {
        const httpConfig = config as McpHttpConfig;
        const headers: Record<string, string> = {};
        
        if (config.authInjection?.type === "header" && config.authInjection.headerName) {
          headers[config.authInjection.headerName] = await this.configManager.resolveAuthValue(config.authInjection.value) || "";
        }

        transport = new StreamableHTTPClientTransport(new URL(httpConfig.url), {
          requestInit: { headers }
        });
      }

      if (transport) {
        await client.connect(transport);
        this.clients.set(id, client);
        Logger.info("ClientManager", `Successfully connected to downstream: ${id}`);
      }
    } catch (e: any) {
      Logger.error("ClientManager", `Failed to connect downstream: ${id} - ${e.message}`);
    }
  }

  public getClient(id: string): Client | undefined {
    return this.clients.get(id);
  }

  public getClients(): Map<string, Client> {
    return this.clients;
  }
}
