import keytar from "@hackolade/keytar";
import { ISecretStore, IConfigStore } from "@cyber-sec.space/aag-core";
import { CryptoService } from "../crypto.js";

export class KeychainSecretStore implements ISecretStore {
  private configStore: IConfigStore;

  constructor(configStore: IConfigStore) {
    this.configStore = configStore;
  }

  public async resolveSecret(val: string): Promise<string | undefined> {
    if (!val) return undefined;
    
    if (val.startsWith("$")) {
      return process.env[val.substring(1)] || val;
    }

    if (val.includes("keytar://")) {
      const regex = /keytar:\/\/([^/\s}]+)\/([^\s/}]+)/g;
      let match;
      let finalString = val;
      
      const config = this.configStore.getConfig();

      while ((match = regex.exec(val)) !== null) {
        const fullMatch = match[0];
        const service = match[1];
        const account = match[2];
        try {
          const encryptedSecret = await keytar.getPassword(service, account);
          if (encryptedSecret !== null) {
            if (!config?.masterKey) {
              console.warn(`[SecretStore] No masterKey found in config. Cannot decrypt secret for ${service}/${account}`);
              return undefined;
            }
            try {
              const decryptedSecret = CryptoService.decrypt(encryptedSecret, config.masterKey);
              finalString = finalString.replace(fullMatch, decryptedSecret);
            } catch (decErr: any) {
              console.error(`[SecretStore] Failed to decrypt secret for ${service}/${account}. (Did you change your masterKey?)`, decErr.message);
              return undefined;
            }
          } else {
            console.warn(`[SecretStore] Keychain secret not found for ${service}/${account}`);
            return undefined;
          }
        } catch (error) {
          console.error(`[SecretStore] Error reading from keychain for ${service}/${account}:`, error);
          return undefined;
        }
      }
      return finalString;
    }
    
    return val;
  }
}
