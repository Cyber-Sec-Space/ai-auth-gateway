import { Command } from "commander";
import keytar from "@hackolade/keytar";
import * as readline from "readline";
import * as path from "path";
import { fileURLToPath } from "url";
import { ConfigManager } from "../config.js";
import { CryptoService } from "../crypto.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function initializeConfig(): ConfigManager {
  const configPath = path.join(__dirname, "..", "..", "mcp-proxy-config.json");
  const configManager = new ConfigManager(configPath);
  configManager.load(); // This will auto-generate the master key if missing
  return configManager;
}

export function registerKeychainCommand(program: Command) {
  const keychainCmd = program
    .command("keychain")
    .description("Manage secure credentials in the OS Keychain with AES-256 encryption");

  keychainCmd
    .command("set <service> <account> [password]")
    .description("Securely encrypt and store a password in the OS Keychain. If password is not provided, it prompts for one.")
    .action(async (service, account, password) => {
      try {
        const configManager = initializeConfig();
        const masterKey = configManager.getConfig()?.masterKey;
        if (!masterKey) {
          throw new Error("Master Key not found in configuration. Please start the proxy once to generate it.");
        }

        let secret = password;
        if (!secret) {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          secret = await new Promise<string>((resolve) => {
            rl.question(`Enter password for ${service}/${account}: `, (answer) => {
              rl.close();
              resolve(answer);
            });
          });
        }

        const encrypted = CryptoService.encrypt(secret, masterKey);
        await keytar.setPassword(service, account, encrypted);
        console.log(`\nSuccess: Encrypted password saved to Keychain for ${service}/${account}`);
        console.log(`Use the following in your mcp-proxy-config.json: "value": "keytar://${service}/${account}"`);
      } catch (err: any) {
        console.error("Failed to set password:", err.message);
      }
    });

  keychainCmd
    .command("get <service> <account>")
    .description("Retrieve and decrypt a password from the OS Keychain")
    .action(async (service, account) => {
      try {
        const configManager = initializeConfig();
        const masterKey = configManager.getConfig()?.masterKey;
        if (!masterKey) {
          throw new Error("Master Key not found in configuration.");
        }

        const encryptedSecret = await keytar.getPassword(service, account);
        if (encryptedSecret !== null) {
          const decrypted = CryptoService.decrypt(encryptedSecret, masterKey);
          console.log(`Decrypted password for ${service}/${account}: ${decrypted}`);
        } else {
          console.log(`No password found in Keychain for ${service}/${account}`);
        }
      } catch (err: any) {
        console.error("Failed to get password:", err.message);
      }
    });

  keychainCmd
    .command("delete <service> <account>")
    .description("Delete a password from the OS Keychain")
    .action(async (service, account) => {
      try {
        const result = await keytar.deletePassword(service, account);
        if (result) {
          console.log(`Success: Password deleted from Keychain for ${service}/${account}`);
        } else {
          console.log(`No password found in Keychain for ${service}/${account} to delete.`);
        }
      } catch (err: any) {
        console.error("Failed to delete password:", err.message);
      }
    });
}
