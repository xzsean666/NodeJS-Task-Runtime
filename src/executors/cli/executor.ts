/**
 * CLIExecutor implementation for spawning external commands and binaries.
 */

import type { ChildProcess } from "node:child_process";
import type { Executor, ExecutorStats } from "../../core/executor.js";
import type { ExecutionContext } from "../../core/execution.js";
import { runCliProcess } from "./process.js";
import { RuntimeError, RuntimeErrorCode } from "../../execution/error.js";

export class CLIExecutor implements Executor {
  readonly type = "cli" as const;
  private readonly defaultCommand?: string;
  private readonly activeProcesses = new Map<string, ChildProcess>();

  constructor(defaultCommand?: string) {
    this.defaultCommand = defaultCommand;
  }

  async execute<TInput, TOutput>(context: ExecutionContext<TInput, TOutput>): Promise<TOutput> {
    const command =
      (context.options as any).command ??
      context.options.metadata?.command ??
      this.defaultCommand;

    if (!command || (typeof command !== "string" && typeof command !== "function")) {
      throw new RuntimeError({
        code: RuntimeErrorCode.INVALID_ARGUMENT,
        message: "No command or command resolver specified for CLI execution",
        taskId: context.taskId,
        executionId: context.executionId,
        executor: "cli",
      });
    }

    try {
      return await runCliProcess(context, command, (child) => {
        this.activeProcesses.set(context.executionId, child);
      });
    } finally {
      this.activeProcesses.delete(context.executionId);
    }
  }

  async terminate(executionId: string, _reason = "Terminated by request"): Promise<void> {
    const child = this.activeProcesses.get(executionId);
    if (child) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
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
      } catch {
        // ignore
      }
    }
    this.activeProcesses.clear();
  }
}
