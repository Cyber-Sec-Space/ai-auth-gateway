export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG"
}

export interface IAuditLogger {
  info(context: string, message: string, data?: any): void;
  warn(context: string, message: string, data?: any): void;
  error(context: string, message: string, data?: any): void;
  debug(context: string, message: string, data?: any): void;
}
