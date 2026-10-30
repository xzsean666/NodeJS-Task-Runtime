/**
 * NestJS Integration helpers and module adapter.
 */

import { createRuntime } from "../api/runtime.js";
import type { RuntimeOptions } from "../core/types.js";

export const TASK_RUNTIME = "TASK_RUNTIME";

export interface NestTaskRuntimeOptions extends RuntimeOptions {
  /**
   * Whether the TaskRuntime should be registered as a global NestJS module.
   * Default: true.
   */
  isGlobal?: boolean;
}

export interface NestTaskRuntimeAsyncOptions {
  isGlobal?: boolean;
  useFactory: (...args: any[]) => Promise<RuntimeOptions> | RuntimeOptions;
  inject?: any[];
}

/**
 * NestJS Dynamic Module provider helper for TaskRuntime.
 *
 * Example usage:
 * ```typescript
 * import { Module } from "@nestjs/common";
 * import { TaskRuntimeModule } from "node-task-runtime";
 *
 * @Module({
 *   imports: [
 *     TaskRuntimeModule.forRoot({
 *       workers: "auto",
 *       eager: true,
 *       maxTasksPerWorker: 5000,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
export class TaskRuntimeModule {
  static forRoot(options: NestTaskRuntimeOptions = {}) {
    const { isGlobal = true, ...runtimeOpts } = options;
    const runtimeProvider = {
      provide: TASK_RUNTIME,
      useFactory: () => {
        return createRuntime(runtimeOpts);
      },
    };

    return {
      module: TaskRuntimeModule,
      global: isGlobal,
      providers: [runtimeProvider],
      exports: [TASK_RUNTIME],
    };
  }

  static forRootAsync(asyncOptions: NestTaskRuntimeAsyncOptions) {
    const { isGlobal = true, useFactory, inject = [] } = asyncOptions;
    const runtimeProvider = {
      provide: TASK_RUNTIME,
      useFactory: async (...args: any[]) => {
        const config = await useFactory(...args);
        return createRuntime(config);
      },
      inject,
    };

    return {
      module: TaskRuntimeModule,
      global: isGlobal,
      providers: [runtimeProvider],
      exports: [TASK_RUNTIME],
    };
  }
}
