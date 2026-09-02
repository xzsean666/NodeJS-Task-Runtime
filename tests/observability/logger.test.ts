import { describe, it, expect, vi } from "vitest";
import { ConsoleLogger, NoopLogger, defaultLogger } from "../../src/observability/logger.js";

describe("Logger", () => {
  it("should format logs according to log levels in ConsoleLogger", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const debugLogger = new ConsoleLogger("debug", "[TestPrefix]");
    debugLogger.debug("test debug");
    debugLogger.info("test info");
    debugLogger.warn("test warn");
    debugLogger.error("test error");

    expect(debugSpy).toHaveBeenCalledWith("[TestPrefix] [DEBUG] test debug");
    expect(infoSpy).toHaveBeenCalledWith("[TestPrefix] [INFO] test info");
    expect(warnSpy).toHaveBeenCalledWith("[TestPrefix] [WARN] test warn");
    expect(errorSpy).toHaveBeenCalledWith("[TestPrefix] [ERROR] test error");

    debugSpy.mockClear();
    infoSpy.mockClear();

    const infoLogger = new ConsoleLogger("info", "[TestPrefix]");
    infoLogger.debug("ignored debug");
    infoLogger.info("accepted info");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith("[TestPrefix] [INFO] accepted info");

    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("should do nothing in NoopLogger and defaultLogger", () => {
    const logger = new NoopLogger();
    expect(() => {
      logger.debug("test");
      logger.info("test");
      logger.warn("test");
      logger.error("test");
      defaultLogger.debug("test");
    }).not.toThrow();
  });
});
