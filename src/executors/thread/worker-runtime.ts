/**
 * Worker thread entry code and helper.
 */

export const WORKER_RUNTIME_CODE = `
const { parentPort } = require("node:worker_threads");

if (parentPort) {
  const fnCache = new Map();
  let currentExecutionId = null;

  process.on("unhandledRejection", (reason) => {
    if (parentPort && currentExecutionId) {
      parentPort.postMessage({
        type: "ERROR",
        executionId: currentExecutionId,
        error: {
          name: "UnhandledPromiseRejection",
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
        },
      });
    }
  });

  parentPort.on("message", async (msg) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "PING") {
      parentPort.postMessage({ type: "PONG" });
      return;
    }

    if (msg.type === "EXECUTE") {
      const { executionId, fnCode, modulePath, exportName, input, isChunk } = msg;
      currentExecutionId = executionId;
      try {
        let fn;
        if (fnCode) {
          fn = fnCache.get(fnCode);
          if (!fn) {
            // Evaluate function from string safely
            const trimmed = fnCode.trim();
            if (
              trimmed.startsWith("async function") ||
              trimmed.startsWith("function") ||
              trimmed.startsWith("(") ||
              trimmed.includes("=>")
            ) {
              fn = (0, eval)("(" + trimmed + ")");
            } else if (trimmed.startsWith("async ")) {
              fn = (0, eval)("(async function " + trimmed.slice(6) + ")");
            } else {
              fn = (0, eval)("(function " + trimmed + ")");
            }
            if (typeof fn === "function") {
              fnCache.set(fnCode, fn);
            }
          }
        } else if (modulePath) {
          const mod = await import(modulePath);
          fn = exportName ? mod[exportName] : (mod.default || mod);
        } else {
          throw new Error("Worker received neither fnCode nor modulePath");
        }

        if (typeof fn !== "function") {
          throw new TypeError("Target task is not a function: " + typeof fn);
        }

        let result;
        if (isChunk && Array.isArray(input)) {
          const chunkLen = input.length;
          const chunkResults = new Array(chunkLen);
          for (let i = 0; i < chunkLen; i++) {
            chunkResults[i] = await fn(input[i]);
          }
          result = chunkResults;
        } else {
          result = await fn(input);
        }

        let returnTransfers = [];
        if (result instanceof ArrayBuffer) {
          returnTransfers = [result];
        } else if (result && typeof result === "object" && Array.isArray(result.__transferList)) {
          returnTransfers = result.__transferList;
          delete result.__transferList;
        }

        parentPort.postMessage({
          type: "SUCCESS",
          executionId,
          result,
        }, returnTransfers);
      } catch (err) {
        let msg = err && err.message ? String(err.message) : String(err);
        const name = err && err.name ? String(err.name) : "Error";
        if (fnCode && (name === "ReferenceError" || msg.includes("is not defined"))) {
          msg += " (Hint: Inline functions in Worker Threads cannot access outer scope variables, closures, or imports. Pass values via task input, or use modulePath for file-based modules.)";
        }

        const error = {
          name,
          message: msg,
          stack: err && err.stack ? String(err.stack) : undefined,
          code: err && err.code ? String(err.code) : undefined,
        };
        parentPort.postMessage({
          type: "ERROR",
          executionId,
          error,
        });
      } finally {
        if (currentExecutionId === executionId) {
          currentExecutionId = null;
        }
      }
    }
  });

  parentPort.postMessage({ type: "READY" });
}
`;
