import * as crypto from "crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16; // Standard for GCM

export class CryptoService {
  /**
   * Encrypts a plain text string using AES-256-GCM.
   * @param text The plain text to encrypt.
   * @param masterKeyHex A 64-character hex string representing the 32-byte key.
   * @returns A base64 encoded string containing the IV, auth tag, and encrypted data.
   */
  public static encrypt(text: string, masterKeyHex: string): string {
    const key = Buffer.from(masterKeyHex, "hex");
    if (key.length !== 32) {
      throw new Error("Invalid master key length. Must be exactly 32 bytes (64 hex characters).");
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Format: base64(iv:authTag:encryptedData)
    const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, "hex")]);
    return combined.toString("base64");
  }

  /**
   * Decrypts an encrypted string using AES-256-GCM.
   * @param encryptedBase64 The base64 combined data string returned from `encrypt()`.
   * @param masterKeyHex A 64-character hex string representing the 32-byte key.
   * @returns The decrypted plain text.
   */
  public static decrypt(encryptedBase64: string, masterKeyHex: string): string {
    const key = Buffer.from(masterKeyHex, "hex");
    if (key.length !== 32) {
      throw new Error("Invalid master key length. Must be exactly 32 bytes (64 hex characters).");
    }

    const combined = Buffer.from(encryptedBase64, "base64");

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encryptedData = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, undefined, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Generates a new cryptographically secure 32-byte master key.
   * @returns A 64-character hex string.
   */
  public static generateMasterKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }
}
