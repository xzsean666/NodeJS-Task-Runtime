/**
 * Worker thread entry code and helper.
 */

export const WORKER_RUNTIME_CODE = `
const { parentPort } = require("node:worker_threads");

if (parentPort) {
  // Transpilation helper shims for TypeScript / Babel compiled functions
  if (typeof globalThis.__awaiter !== "function") {
    globalThis.__awaiter = function (thisArg, _arguments, P, generator) {
      function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
      return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
      });
    };
  }

  if (typeof globalThis.__generator !== "function") {
    globalThis.__generator = function (thisArg, body) {
      var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
      return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
      function verb(n) { return function (v) { return step([n, v]); }; }
      function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
          if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
          if (y = 0, t) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0: case 1: t = op; break;
            case 4: _.label++; return { value: op[1], done: false };
            case 5: _.label++; y = op[1]; op = [0]; continue;
            case 7: op = _.ops.pop(); _.trys.pop(); continue;
            default:
              if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
              if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
              if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
              if (t[2]) _.ops.pop();
              _.trys.pop(); continue;
          }
          op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
      }
    };
  }

  const fnCache = new Map();
  const MAX_FN_CACHE = 500;
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
        if (modulePath) {
          const mod = await import(modulePath);
          fn = exportName
            ? mod[exportName]
            : (typeof mod === "function"
                ? mod
                : (typeof mod?.default === "function"
                    ? mod.default
                    : (mod?.default?.default || mod)));
        } else if (fnCode) {
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
              if (fnCache.size >= MAX_FN_CACHE) {
                const firstKey = fnCache.keys().next().value;
                if (firstKey !== undefined) fnCache.delete(firstKey);
              }
              fnCache.set(fnCode, fn);
            }
          }
        } else {
          throw new Error("Worker received neither modulePath nor fnCode");
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
        } else if (ArrayBuffer.isView(result) && result.buffer instanceof ArrayBuffer) {
          // Auto zero-copy for standalone Buffer / TypedArray (not shared FastBuffer slices)
          if (result.byteOffset === 0 && result.byteLength === result.buffer.byteLength) {
            returnTransfers = [result.buffer];
          }
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
