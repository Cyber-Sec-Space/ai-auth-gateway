import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { CryptoService } from "../crypto.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "..", "..", "mcp-proxy-config.json");

export function registerAiCommand(program: Command) {
  const ai = program.command("ai").description("Manage AI authentication keys and permissions");

  ai.command("register <aiid>")
    .description("Register a new AI ID and generate a Key")
    .option("-d, --description <desc>", "Description for this AI")
    .action((aiid, options) => {
      const config = loadConfig();
      const aiKeys = config.aiKeys || {};

      if (aiKeys[aiid]) {
        console.error(`AI ID '${aiid}' is already registered.`);
        return;
      }

      const key = CryptoService.generateMasterKey();
      aiKeys[aiid] = {
        key: key,
        description: options.description || "",
        createdAt: new Date().toISOString(),
        revoked: false,
        permissions: {
          allowedServers: [],
          deniedServers: [],
          allowedTools: [],
          deniedTools: []
        }
      };

      config.aiKeys = aiKeys;
      saveConfig(config);

      console.log(`Successfully registered AI: ${aiid}`);
      console.log(`AIID: ${aiid}`);
      console.log(`Key:  ${key}`);
    });

  ai.command("permit <aiids> <type> <targets>")
    .description("Allow access (supports comma-separated lists for AIIDs and Targets)")
    .action((aiids, type, targets) => {
      batchModifyPermission(aiids, type, targets, "allow");
    });

  ai.command("restrict <aiids> <type> <targets>")
    .description("Restrict access (supports comma-separated lists for AIIDs and Targets)")
    .action((aiids, type, targets) => {
      batchModifyPermission(aiids, type, targets, "deny");
    });

  ai.command("revoke <aiid>")
    .description("Revoke an AI ID's access")
    .action((aiid) => {
      const config = loadConfig();
      if (!config.aiKeys || !config.aiKeys[aiid]) {
        console.error(`AI ID '${aiid}' not found.`);
        return;
      }
      config.aiKeys[aiid].revoked = true;
      saveConfig(config);
      console.log(`Access for AI ID '${aiid}' has been revoked.`);
    });

  ai.command("list")
    .description("List all registered AI IDs and their permissions")
    .action(() => {
        const config = loadConfig();
        const aiKeys = config.aiKeys || {};
        const tableData = Object.entries(aiKeys).map(([aiid, data]: any) => {
            const perms = data.permissions || {};
            return {
                AIID: aiid,
                Status: data.revoked ? "REVOKED" : "ACTIVE",
                "Allowed Servers": (perms.allowedServers || []).join(", ") || "*",
                "Denied Servers": (perms.deniedServers || []).join(", ") || "none",
                "Allowed Tools": (perms.allowedTools || []).join(", ") || "*",
                "Denied Tools": (perms.deniedTools || []).join(", ") || "none"
            };
        });
        console.table(tableData);
    });
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { aiKeys: {}, mcpServers: {} };
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function saveConfig(config: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function batchModifyPermission(aiidsStr: string, type: string, targetsStr: string, mode: "allow" | "deny") {
  const aiids = aiidsStr.split(",").map(s => s.trim());
  const targets = targetsStr.split(",").map(s => s.trim());
  const config = loadConfig();

  for (const aiid of aiids) {
    if (!config.aiKeys || !config.aiKeys[aiid]) {
      console.warn(`[Warning] AI ID '${aiid}' not found, skipping.`);
      continue;
    }

    const auth = config.aiKeys[aiid];
    if (!auth.permissions) {
      auth.permissions = { allowedServers: [], deniedServers: [], allowedTools: [], deniedTools: [] };
    }

    for (const target of targets) {
      if (type === "server") {
        const list = mode === "allow" ? auth.permissions.allowedServers : auth.permissions.deniedServers;
        const otherList = mode === "allow" ? auth.permissions.deniedServers : auth.permissions.allowedServers;
        const idx = otherList.indexOf(target);
        if (idx !== -1) otherList.splice(idx, 1);
        if (!list.includes(target)) list.push(target);
      } else if (type === "tool") {
        if (mode === "allow") {
          // Cross-validate: You must have access to the parent server before permitting a tool
          const parts = target.split("___");
          if (parts.length > 1) {
            const serverId = parts[0];
            const hasServerWhitelist = auth.permissions.allowedServers.length > 0;
            const isServerAllowed = !hasServerWhitelist || auth.permissions.allowedServers.includes(serverId);
            if (!isServerAllowed) {
              console.error(`\x1b[31m[Error] Cannot permit tool '${target}' because AI ID '${aiid}' does not have explicit access to server '${serverId}'. Please permit the server first.\x1b[0m`);
              continue;
            }
          }
        }
        const list = mode === "allow" ? auth.permissions.allowedTools : auth.permissions.deniedTools;
        const otherList = mode === "allow" ? auth.permissions.deniedTools : auth.permissions.allowedTools;
        const idx = otherList.indexOf(target);
        if (idx !== -1) otherList.splice(idx, 1);
        if (!list.includes(target)) list.push(target);
      } else {
        console.error("Invalid type. Must be 'server' or 'tool'.");
        return;
      }
      console.log(`[Success] Updated ${mode} list for ${aiid}: ${type} '${target}'`);
    }
  }

  saveConfig(config);
}
