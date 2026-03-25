import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { IAuditLogger, LogLevel } from "@cyber-sec.space/aag-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, "..", "..", "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "proxy.log");

export class ConsoleAuditLogger implements IAuditLogger {
  private initialized = false;

  private init() {
    if (this.initialized) return;
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    this.initialized = true;
  }

  private mask(message: string): string {
    let masked = message;
    masked = masked.replace(/(AI_KEY["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$3');
    masked = masked.replace(/(Authorization["']?\s*[:=]\s*["']Bearer\s+)([^"']+)(["'])/gi, '$1[REDACTED]$3');
    return masked;
  }

  public info(context: string, message: string, data?: any) {
    this.log(LogLevel.INFO, context, message, data);
  }

  public warn(context: string, message: string, data?: any) {
    this.log(LogLevel.WARN, context, message, data);
  }

  public error(context: string, message: string, data?: any) {
    this.log(LogLevel.ERROR, context, message, data);
  }

  public debug(context: string, message: string, data?: any) {
    this.log(LogLevel.DEBUG, context, message, data);
  }

  private log(level: LogLevel, context: string, message: string, data?: any) {
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

    if (level === LogLevel.ERROR) {
      console.error(maskedLine);
    } else {
      console.log(maskedLine);
    }

    fs.appendFileSync(LOG_FILE, maskedLine + "\n");
  }
}
