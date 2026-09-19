/**
 * ProcessExecutor implementation for running tasks in isolated Node.js child processes.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { Executor, ExecutorStats } from "../../core/executor.js";
import type { ExecutionContext } from "../../core/execution.js";
import { writeToStdin, formatOutput } from "../../transport/protocol.js";
import { RuntimeError, RuntimeErrorCode } from "../../execution/error.js";

const NODE_CHILD_RUNNER = `
let buffer = "";
process.stdin.setEncoding("utf-8");

process.stdin.on("data", (chunk) => {
  buffer += chunk;
});

process.stdin.on("end", async () => {
  try {
    if (!buffer.trim()) {
      process.exit(0);
    }
    const payload = JSON.parse(buffer);
    let fn;
    if (payload.fnCode) {
      const trimmed = payload.fnCode.trim();
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
    } else if (payload.modulePath) {
      const mod = await import(payload.modulePath);
      fn = payload.exportName ? mod[payload.exportName] : (mod.default || mod);
    } else {
      throw new Error("No function or module specified");
    }

    const result = await fn(payload.input);
    if (result === undefined) {
      process.stdout.write("");
    } else {
      process.stdout.write(JSON.stringify(result));
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
});
`;

export class ProcessExecutor implements Executor {
  readonly type = "process" as const;
  private readonly activeProcesses = new Map<string, ChildProcess>();

  async execute<TInput, TOutput>(context: ExecutionContext<TInput, TOutput>): Promise<TOutput> {
    const fn = (context as any).handler ?? context.options.metadata?.fn;
    const fnCode = typeof fn === "function" ? fn.toString() : typeof fn === "string" ? fn : undefined;
    const modulePath = context.options.metadata?.modulePath as string | undefined;
    const exportName = context.options.metadata?.exportName as string | undefined;

    const payload = {
      fnCode,
      modulePath,
      exportName,
      input: context.input,
    };

    const nodeArgs = ["-e", NODE_CHILD_RUNNER];
    if (context.options.resource?.maxMemoryMb) {
      nodeArgs.unshift(`--max-old-space-size=${context.options.resource.maxMemoryMb}`);
    }

    return new Promise<TOutput>((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(process.execPath, nodeArgs, {
          cwd: context.options.cwd ?? process.cwd(),
          env: { ...process.env, ...context.options.env },
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (err: any) {
        reject(
          new RuntimeError({
            code: RuntimeErrorCode.PROCESS_FAILED,
            message: `Failed to spawn process: ${err.message}`,
            taskId: context.taskId,
            executionId: context.executionId,
            executor: "process",
            cause: err,
          })
        );
        return;
      }

      this.activeProcesses.set(context.executionId, child);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      let killTimer: NodeJS.Timeout | undefined;
      const onAbort = () => {
        try {
          child.kill("SIGTERM");
          killTimer = setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {}
          }, 1000);
        } catch {}
      };

      const cleanupSignal = () => {
        if (killTimer) clearTimeout(killTimer);
        if (context.signal) {
          context.signal.removeEventListener("abort", onAbort);
        }
      };

      if (context.signal) {
        if (context.signal.aborted) {
          onAbort();
        } else {
          context.signal.addEventListener("abort", onAbort, { once: true });
        }
      }

      if (child.stdin) {
        child.stdin.on("error", () => {
          // Suppress EPIPE errors if child process terminates early
        });
        try {
          writeToStdin(child.stdin, payload, "json");
        } catch (err) {
          try {
            child.kill("SIGKILL");
          } catch {}
          cleanupSignal();
          this.activeProcesses.delete(context.executionId);
          reject(err);
          return;
        }
      }

      child.on("error", (err: Error) => {
        cleanupSignal();
        this.activeProcesses.delete(context.executionId);
        reject(
          new RuntimeError({
            code: RuntimeErrorCode.PROCESS_FAILED,
            message: `Process execution error: ${err.message}`,
            taskId: context.taskId,
            executionId: context.executionId,
            executor: "process",
            cause: err,
          })
        );
      });

      child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
        cleanupSignal();
        this.activeProcesses.delete(context.executionId);

        const stdoutBuffer = Buffer.concat(stdoutChunks);
        const stderrBuffer = Buffer.concat(stderrChunks);
        const stderrStr = stderrBuffer.toString("utf-8").trim();

        if (exitCode !== 0 || signal) {
          if (context.isAborted) {
            reject(
              RuntimeError.cancelled(
                context.signal?.reason ? String(context.signal.reason) : "Process was aborted",
                {
                  taskId: context.taskId,
                  executionId: context.executionId,
                  executor: "process",
                  exitCode,
                  signal,
                  stderr: stderrStr,
                }
              )
            );
          } else {
            reject(
              RuntimeError.processFailed(exitCode, signal, stderrStr, {
                taskId: context.taskId,
                executionId: context.executionId,
                executor: "process",
              })
            );
          }
          return;
        }

        try {
          const result = formatOutput<TOutput>(stdoutBuffer, "json");
          resolve(result);
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });
  }

  async terminate(executionId: string, _reason = "Terminated by request"): Promise<void> {
    const child = this.activeProcesses.get(executionId);
    if (child) {
      try {
        child.kill("SIGKILL");
      } catch {}
      this.activeProcesses.delete(executionId);
    }
  }

  stats(): ExecutorStats {
    return {
      active: this.activeProcesses.size,
    };
  }

  async destroy(): Promise<void> {
    for (const child of this.activeProcesses.values()) {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
    this.activeProcesses.clear();
  }
}
