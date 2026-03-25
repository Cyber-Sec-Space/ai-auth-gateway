import { z } from "zod";
import * as fs from "fs";
import chokidar from "chokidar";
import { EventEmitter } from "events";
import keytar from "keytar";
import { CryptoService } from "./crypto.js";

export const AuthInjectionSchema = z.object({
  type: z.enum(["none", "env", "header", "payload"]),
  key: z.string().optional(), // For payload or env
  value: z.string().optional(), // The static key, but can be pulled from process.env if starts with $
  headerName: z.string().optional() // For SSE headers
});

export const StdioServerSchema = z.object({
  transport: z.literal("stdio").optional().default("stdio"),
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional(),
  authInjection: AuthInjectionSchema.optional()
});

export const SseServerSchema = z.object({
  transport: z.literal("sse"),
  url: z.string(),
  authInjection: AuthInjectionSchema.optional()
});

export const HttpServerSchema = z.object({
  transport: z.literal("http"),
  url: z.string(),
  authInjection: AuthInjectionSchema.optional()
});

export const McpServerConfigSchema = z.discriminatedUnion("transport", [
  StdioServerSchema.extend({ transport: z.literal("stdio") }),
  SseServerSchema,
  HttpServerSchema
]);
// Zod infers the discriminated union correctly, but let's re-export types nicely
export type McpStdioConfig = z.infer<typeof StdioServerSchema>;
export type McpSseConfig = z.infer<typeof SseServerSchema>;
export type McpHttpConfig = z.infer<typeof HttpServerSchema>;
export type McpServerConfig = McpStdioConfig | McpSseConfig | McpHttpConfig;

export const AuthKeySchema = z.object({
  key: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  revoked: z.boolean().default(false),
  permissions: z.object({
    allowedServers: z.array(z.string()).optional(),
    deniedServers: z.array(z.string()).optional(),
    allowedTools: z.array(z.string()).optional(),
    deniedTools: z.array(z.string()).optional(),
  }).optional()
});

export const SystemConfigSchema = z.object({
  port: z.number().default(3000),
  logLevel: z.enum(["INFO", "WARN", "ERROR", "DEBUG"]).default("INFO")
});

export const ProxyConfigSchema = z.object({
  masterKey: z.string().optional(),
  system: SystemConfigSchema.optional().default({ port: 3000, logLevel: "INFO" }),
  mcpServers: z.record(z.string(), McpServerConfigSchema).optional().default({}),
  aiKeys: z.record(z.string(), AuthKeySchema).optional().default({}) // AIID -> Key Metadata
});
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
export type AuthKey = z.infer<typeof AuthKeySchema>;

export class ConfigManager extends EventEmitter {
  private config: ProxyConfig | null = null;
  private configPath: string;

  constructor(configPath: string) {
    super();
    this.configPath = configPath;
  }

  public async resolveAuthValue(val?: string): Promise<string | undefined> {
    if (!val) return undefined;
    if (val.startsWith("$")) {
      return process.env[val.substring(1)] || val;
    }
    if (val.includes("keytar://")) {
      const regex = /keytar:\/\/([^/\s}]+)\/([^\s/}]+)/g;
      let match;
      let finalString = val;
      
      while ((match = regex.exec(val)) !== null) {
        const fullMatch = match[0];
        const service = match[1];
        const account = match[2];
        try {
          const encryptedSecret = await keytar.getPassword(service, account);
          if (encryptedSecret !== null) {
            if (!this.config?.masterKey) {
              console.warn(`[ConfigManager] No masterKey found in config. Cannot decrypt secret for ${service}/${account}`);
              return undefined;
            }
            try {
              const decryptedSecret = CryptoService.decrypt(encryptedSecret, this.config.masterKey);
              finalString = finalString.replace(fullMatch, decryptedSecret);
            } catch (decErr: any) {
              console.error(`[ConfigManager] Failed to decrypt secret for ${service}/${account}. (Did you change your masterKey?)`, decErr.message);
              return undefined;
            }
          } else {
            console.warn(`[ConfigManager] Keychain secret not found for ${service}/${account}`);
            return undefined;
          }
        } catch (error) {
          console.error(`[ConfigManager] Error reading from keychain for ${service}/${account}:`, error);
          return undefined;
        }
      }
      return finalString;
    }
    return val;
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
        console.log("[ConfigManager] Generated new master encryption key and saved to config.");
        needsSave = true;
      }
      
      // Ensure system config exists
      if (!this.config.system) {
        this.config.system = { port: 3000, logLevel: "INFO" };
        needsSave = true;
      }

      if (needsSave) {
        this.saveConfig(this.config);
      }

      return this.config;
    } catch (error) {
      console.error("[ConfigManager] Config load error:", error);
      throw error;
    }
  }

  public watch() {
    chokidar.watch(this.configPath).on("change", () => {
      console.log(`\n[ConfigManager] ${this.configPath} changed, reloading configuration...`);
      try {
        const newConfig = this.load();
        this.emit("configChanged", newConfig);
      } catch (error) {
        console.error("[ConfigManager] Failed to reload config:", error);
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
