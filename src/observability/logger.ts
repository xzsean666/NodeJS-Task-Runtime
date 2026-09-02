/**
 * Logger adapter and interface for observability.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export class ConsoleLogger implements Logger {
  private readonly levelPriority: number;
  private readonly prefix: string;

  constructor(level: LogLevel = "info", prefix = "[TaskRuntime]") {
    this.levelPriority = LOG_LEVEL_PRIORITIES[level] ?? LOG_LEVEL_PRIORITIES.info;
    this.prefix = prefix;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.levelPriority <= LOG_LEVEL_PRIORITIES.debug) {
      console.debug(`${this.prefix} [DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.levelPriority <= LOG_LEVEL_PRIORITIES.info) {
      console.info(`${this.prefix} [INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.levelPriority <= LOG_LEVEL_PRIORITIES.warn) {
      console.warn(`${this.prefix} [WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.levelPriority <= LOG_LEVEL_PRIORITIES.error) {
      console.error(`${this.prefix} [ERROR] ${message}`, ...args);
    }
  }
}

export class NoopLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

export const defaultLogger = new NoopLogger();
