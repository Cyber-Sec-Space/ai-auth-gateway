import * as fs from "fs";
import chokidar from "chokidar";
import { EventEmitter } from "events";
import { IConfigStore, ProxyConfigSchema, ProxyConfig } from "@cyber-sec.space/aag-core";
import { CryptoService } from "../crypto.js";

export class FileConfigStore extends EventEmitter implements IConfigStore {
  private config: ProxyConfig | null = null;
  private configPath: string;

  constructor(configPath: string) {
    super();
    this.configPath = configPath;
  }

  public load(): ProxyConfig {
    if (!fs.existsSync(this.configPath)) {
      const defaultConfig = {
        mcpServers: {
          example_stdio: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-everything"]
          }
        }
      };
      fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
    }
    
    try {
      const fileContent = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(fileContent);
      this.config = ProxyConfigSchema.parse(parsed);

      let needsSave = false;

      if (!this.config.masterKey) {
        this.config.masterKey = CryptoService.generateMasterKey();
        console.log("[FileConfigStore] Generated new master encryption key and saved to config.");
        needsSave = true;
      }
      
      if (!this.config.system) {
        this.config.system = { port: 3000, logLevel: "INFO" };
        needsSave = true;
      }

      if (needsSave) {
        this.saveConfig(this.config);
      }

      return this.config;
    } catch (error) {
      console.error("[FileConfigStore] Config load error:", error);
      throw error;
    }
  }

  public watch() {
    chokidar.watch(this.configPath).on("change", () => {
      console.log(`\n[FileConfigStore] ${this.configPath} changed, reloading configuration...`);
      try {
        const newConfig = this.load();
        this.emit("configChanged", newConfig);
      } catch (error) {
        console.error("[FileConfigStore] Failed to reload config:", error);
      }
    });
  }

  public getConfig(): ProxyConfig | null {
    return this.config;
  }

  public saveConfig(newConfig: ProxyConfig) {
    fs.writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2));
    this.config = newConfig;
  }
}
