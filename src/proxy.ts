import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import { ClientManager } from "./clientManager.js";
import { ConfigManager } from "./config.js";
import { Logger } from "./utils/logger.js";

export class ProxyServer {
  public server: Server;
  private clientManager: ClientManager;
  private configManager: ConfigManager;
  private authenticatedAiId: string | null = null;

  constructor(clientManager: ClientManager, configManager: ConfigManager) {
    this.clientManager = clientManager;
    this.configManager = configManager;

    this.server = new Server(
      { name: "mcp-proxy-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    this.setupRequestHandlers();
  }

  private validateAuth(request: any, extra?: any) {
    // If this session is already authenticated, allow
    if (this.authenticatedAiId) {
       return this.authenticatedAiId;
    }

    // Read from environment variables
    const aiid = process.env.AI_ID;
    const key = process.env.AI_KEY;

    if (!aiid || !key) {
      Logger.warn("Proxy", "Authentication failed: Missing AI_ID or AI_KEY in environment.");
      throw new Error("Authentication required: Please provide AI_ID and AI_KEY in environment variables.");
    }

    const config = this.configManager.getConfig();
    if (!config?.aiKeys) {
       Logger.error("Proxy", "Authentication failed: No AI keys configured in proxy.");
       throw new Error("No AI keys configured in proxy.");
    }

    const keyEntry = config.aiKeys[aiid];
    if (!keyEntry) {
      Logger.warn("Proxy", `Authentication failed: Invalid AIID '${aiid}'`);
      throw new Error(`Invalid AIID from environment: ${aiid}`);
    }

    if (keyEntry.revoked) {
      Logger.warn("Proxy", `Authentication failed: AI ID '${aiid}' is revoked`);
      throw new Error(`Key for AI ID '${aiid}' has been revoked.`);
    }

    if (keyEntry.key !== key) {
      Logger.warn("Proxy", `Authentication failed: Invalid key provided for AI ID '${aiid}'`);
      throw new Error(`Invalid Key for AI ID '${aiid}' provided in environment.`);
    }
    
    // Auth successful, bind to this server instance (session)
    this.authenticatedAiId = aiid;
    Logger.info("Auth", `AI ID '${aiid}' authenticated successfully`);
    return aiid;
  }

  private isAllowed(serverId: string, toolName: string): boolean {
    if (!this.authenticatedAiId) return false;
    
    const config = this.configManager.getConfig();
    const auth = config?.aiKeys?.[this.authenticatedAiId];
    if (!auth) return false;

    // By default, if no permissions are defined, everything is allowed
    if (!auth.permissions) return true;

    const { allowedServers, deniedServers, allowedTools, deniedTools } = auth.permissions;
    const fullToolName = `${serverId}___${toolName}`;

    // 1. Check server-level denial (Explicit deny always wins)
    if (deniedServers?.includes(serverId)) return false;

    // 2. Check tool-level denial (Explicit deny always wins)
    if (deniedTools?.includes(fullToolName)) return false;

    // 3. Strict AND validation for whitelists
    const hasServerWhitelist = allowedServers && allowedServers.length > 0;
    const hasToolWhitelist = allowedTools && allowedTools.length > 0;

    if (!hasServerWhitelist && !hasToolWhitelist) {
      return true; // No whitelists = allowed by default (unless denied)
    }

    // Server must be allowed (if there's a server whitelist)
    const serverIsAllowed = !hasServerWhitelist || allowedServers!.includes(serverId);
    
    // Tool must be allowed (if there's a tool whitelist)
    const toolIsAllowed = !hasToolWhitelist || allowedTools!.includes(fullToolName);

    return serverIsAllowed && toolIsAllowed;
  }

  private setupRequestHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
      this.validateAuth(request, extra);
      // console.log("[Proxy] Received ListTools request");
      const allTools: Tool[] = [];
      const clients = this.clientManager.getClients();

      for (const [serverId, client] of clients.entries()) {
        try {
          const response = await client.listTools();
          const prefixedTools = response.tools
            .filter(tool => this.isAllowed(serverId, tool.name))
            .map((tool) => ({
              ...tool,
              name: `${serverId}___${tool.name}` // Use ___ as separator to avoid clashes
            }));
          allTools.push(...prefixedTools);
        } catch (e: any) {
          Logger.error("Proxy", `Error listing tools for ${serverId}: ${e.message}`);
        }
      }

      Logger.info("Activity", `AI ID '${this.authenticatedAiId}' requested ListTools. Returning ${allTools.length} tools.`);
      return { tools: allTools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      this.validateAuth(request, extra);
      const requestedName = request.params.name;
      Logger.info("Activity", `AI ID '${this.authenticatedAiId}' calling tool: ${requestedName}`);
      
      let targetServerId: string | null = null;
      let actualToolName: string | null = null;

      for (const serverId of this.clientManager.getClients().keys()) {
        const prefix = `${serverId}___`;
        if (requestedName.startsWith(prefix)) {
          targetServerId = serverId;
          actualToolName = requestedName.substring(prefix.length);
          break;
        }
      }

      if (!targetServerId || !actualToolName) {
        Logger.warn("Proxy", `Tool not found: ${requestedName}`);
        throw new Error(`Tool ${requestedName} fully qualified server not found`);
      }

      if (!this.isAllowed(targetServerId, actualToolName)) {
        Logger.warn("Security", `Access Denied: AI ID '${this.authenticatedAiId}' attempted to use unauthorized tool '${requestedName}'`);
        throw new Error(`Permission denied: AI ID '${this.authenticatedAiId}' is not allowed to use tool '${requestedName}'.`);
      }

      const client = this.clientManager.getClient(targetServerId);
      if (!client) {
        Logger.error("Proxy", `Downstream client ${targetServerId} is disconnected`);
        throw new Error(`Client ${targetServerId} is disconnected`);
      }

      const config = this.configManager.getConfig()?.mcpServers[targetServerId] as any;
      if (!config) {
        throw new Error(`Config for ${targetServerId} not found`);
      }

      let args = { ...(request.params.arguments || {}) } as any;

      if (config.authInjection?.type === "payload" && config.authInjection.key) {
        args[config.authInjection.key] = await this.configManager.resolveAuthValue(config.authInjection.value);
      }

      try {
        Logger.debug("Proxy", `Forwarding CallTool (${actualToolName}) to downstream ${targetServerId}`);
        const result = await client.callTool({
          name: actualToolName,
          arguments: args
        });
        Logger.info("Activity", `AI ID '${this.authenticatedAiId}' call to '${requestedName}': Success`);
        return result;
      } catch (e: any) {
        Logger.error("Proxy", `Error calling ${actualToolName} on ${targetServerId}: ${e.message}`);
        throw e;
      }
    });
  }
}
