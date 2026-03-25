import { Command } from "commander";
import { ConfigManager } from "../config.js";
import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CONFIG_PATH = path.join(__dirname, "..", "..", "mcp-proxy-config.json");

function loadConfigAndManager(): { config: any, manager: ConfigManager, configPath: string } {
  let configPath = process.env.AAG_CONFIG_PATH || DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(configPath)) {
    console.error(`\x1b[31m[Error] Configuration file not found at: ${configPath}\x1b[0m`);
    process.exit(1);
  }
  const configManager = new ConfigManager(configPath);
  const config = configManager.load();
  return { config, manager: configManager, configPath };
}

export function registerSystemConfigCommand(program: Command) {
  const configCmd = program.command("config").description("Manage gateway system configuration");

  configCmd
    .command("view")
    .description("View current system settings")
    .action(() => {
      const { config } = loadConfigAndManager();
      console.log("\nSystem Configuration:");
      console.table([config.system || { port: 3000, logLevel: "INFO" }]);
    });

  configCmd
    .command("set <key> <value>")
    .description("Update a system setting (e.g., set port 8080, set logLevel DEBUG)")
    .action((key, value) => {
      const { config, manager } = loadConfigAndManager();
      
      if (!config.system) {
        config.system = { port: 3000, logLevel: "INFO" };
      }

      if (key === "port") {
        const port = parseInt(value, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
          console.error(`\x1b[31m[Error] Invalid port number: ${value}\x1b[0m`);
          process.exit(1);
        }
        config.system.port = port;
      } else if (key === "logLevel") {
        const validLevels = ["INFO", "WARN", "ERROR", "DEBUG"];
        if (!validLevels.includes(value.toUpperCase())) {
          console.error(`\x1b[31m[Error] Invalid logLevel. Must be one of: ${validLevels.join(", ")}\x1b[0m`);
          process.exit(1);
        }
        config.system.logLevel = value.toUpperCase() as any;
      } else {
        console.error(`\x1b[31m[Error] Unknown system setting: ${key}. Valid keys are: port, logLevel\x1b[0m`);
        process.exit(1);
      }

      manager.saveConfig(config);
      console.log(`\x1b[32m[Success] Updated system setting '${key}' to '${value}'\x1b[0m`);
    });
}
