import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "proxy.log");

export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG"
}

export class Logger {
  private static initialized = false;

  private static init() {
    if (this.initialized) return;
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    this.initialized = true;
  }

  private static mask(message: string): string {
    // Mask AI_KEY and other sensitive keys in JSON or strings
    let masked = message;

    // Mask AI_KEY: "long-hex-string"
    masked = masked.replace(/(AI_KEY["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$3');
    
    // Mask Bearer tokens: Authorization: Bearer xxxx
    masked = masked.replace(/(Authorization["']?\s*[:=]\s*["']Bearer\s+)([^"']+)(["'])/gi, '$1[REDACTED]$3');

    // Mask keytar paths if needed (though they aren't secrets themselves, sometimes they contain sensitive IDs)
    // masked = masked.replace(/(keytar:\/\/)([^/\s}]+)\/([^\s/}]+)/gi, '$1[REDACTED]/[REDACTED]');

    // Mask any AI_ID to prevent user tracking in logs (optional but safer)
    // masked = masked.replace(/(AI_ID["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$3');

    return masked;
  }

  public static info(context: string, message: string, data?: any) {
    this.log(LogLevel.INFO, context, message, data);
  }

  public static warn(context: string, message: string, data?: any) {
    this.log(LogLevel.WARN, context, message, data);
  }

  public static error(context: string, message: string, data?: any) {
    this.log(LogLevel.ERROR, context, message, data);
  }

  public static debug(context: string, message: string, data?: any) {
    this.log(LogLevel.DEBUG, context, message, data);
  }

  private static log(level: LogLevel, context: string, message: string, data?: any) {
    this.init();
    const timestamp = new Date().toISOString();
    let dataStr = "";
    if (data) {
      try {
        dataStr = " | " + JSON.stringify(data);
      } catch (e) {
        dataStr = " | [Circular Data]";
      }
    }

    const rawLine = `[${timestamp}] [${level}] [${context}] ${message}${dataStr}`;
    const maskedLine = this.mask(rawLine);

    // Print to console (for local debugging/start output)
    if (level === LogLevel.ERROR) {
      console.error(maskedLine);
    } else {
      console.log(maskedLine);
    }

    // Append to file
    fs.appendFileSync(LOG_FILE, maskedLine + "\n");
  }
}
