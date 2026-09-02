/**
 * Child process execution and stdio management for CLI commands.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { ExecutionContext } from "../../core/execution.js";
import { writeToStdin, formatOutput } from "../../transport/protocol.js";
import { RuntimeError, RuntimeErrorCode } from "../../execution/error.js";

export interface CliProcessOptions {
  command: string;
  args?: string[] | ((input: any) => string[]);
  cwd?: string;
  env?: Record<string, string>;
  stdin?: "json" | "string" | "binary" | "pipe";
  stdout?: "json" | "string" | "binary" | "inherit" | "ignore";
  stderr?: "string" | "binary" | "inherit" | "ignore";
}

export function runCliProcess<TInput = unknown, TOutput = unknown>(
  context: ExecutionContext<TInput, TOutput>,
  command: string,
  onSpawn?: (child: ChildProcess) => void
): Promise<TOutput> {
  return new Promise<TOutput>((resolve, reject) => {
    const options = context.options;
    let resolvedArgs: string[] = [];

    if (typeof options.args === "function") {
      try {
        resolvedArgs = options.args(context.input);
      } catch (err) {
        reject(
          new RuntimeError({
            code: RuntimeErrorCode.INVALID_ARGUMENT,
            message: `Failed to evaluate dynamic CLI args: ${err instanceof Error ? err.message : String(err)}`,
            taskId: context.taskId,
            executionId: context.executionId,
            executor: "cli",
            cause: err,
          })
        );
        return;
      }
    } else if (Array.isArray(options.args)) {
      resolvedArgs = options.args;
    }

    const env = { ...process.env, ...options.env };
    const cwd = options.cwd ?? process.cwd();

    // Determine stdio config
    const stdinMode = options.stdin ? "pipe" : "pipe";
    const stdoutMode = options.stdout === "inherit" ? "inherit" : options.stdout === "ignore" ? "ignore" : "pipe";
    const stderrMode = options.stderr === "inherit" ? "inherit" : options.stderr === "ignore" ? "ignore" : "pipe";

    let child: ChildProcess;
    try {
      child = spawn(command, resolvedArgs, {
        cwd,
        env,
        stdio: [stdinMode, stdoutMode, stderrMode],
        shell: false,
      });
    } catch (err: any) {
      reject(
        new RuntimeError({
          code: RuntimeErrorCode.PROCESS_FAILED,
          message: `Failed to spawn command '${command}': ${err.message}`,
          taskId: context.taskId,
          executionId: context.executionId,
          executor: "cli",
          cause: err,
        })
      );
      return;
    }

    if (onSpawn) {
      onSpawn(child);
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });
    }

    // Handle AbortSignal cancellation
    let killTimer: NodeJS.Timeout | undefined;
    const onAbort = () => {
      try {
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
        }, 1000);
      } catch {
        // ignore
      }
    };

    if (context.signal) {
      if (context.signal.aborted) {
        onAbort();
      } else {
        context.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    // Write input to stdin if pipe is open
    if (child.stdin) {
      child.stdin.on("error", () => {
        // Suppress EPIPE errors if child exits before reading stdin
      });
      try {
        writeToStdin(child.stdin, context.input, options.stdin ?? "json");
      } catch (err) {
        // stdin write failed
        reject(err);
        return;
      }
    }

    child.on("error", (err: Error) => {
      if (killTimer) clearTimeout(killTimer);
      if (context.signal) {
        context.signal.removeEventListener("abort", onAbort);
      }
      reject(
        new RuntimeError({
          code: RuntimeErrorCode.PROCESS_FAILED,
          message: `Process error for '${command}': ${err.message}`,
          taskId: context.taskId,
          executionId: context.executionId,
          executor: "cli",
          cause: err,
        })
      );
    });

    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (killTimer) clearTimeout(killTimer);
      if (context.signal) {
        context.signal.removeEventListener("abort", onAbort);
      }

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
                executor: "cli",
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
              executor: "cli",
            })
          );
        }
        return;
      }

      try {
        const outputFormat = options.stdout ?? "json";
        const result = formatOutput<TOutput>(stdoutBuffer, outputFormat);
        resolve(result);
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}
