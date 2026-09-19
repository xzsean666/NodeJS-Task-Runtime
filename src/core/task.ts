/**
 * Task representation and callable interface.
 */

import type { TaskOptions, BatchOptions } from "./types.js";

export interface TaskCallable<TInput = unknown, TOutput = unknown> {
  (input: TInput, callOptions?: Partial<TaskOptions<TInput>>): Promise<TOutput>;
  readonly taskName?: string;
  readonly options: TaskOptions<TInput>;
  batch(inputs: TInput[], batchOptions?: BatchOptions<TInput>): Promise<TOutput[]>;
  batchSettled(
    inputs: TInput[],
    batchOptions?: BatchOptions<TInput>
  ): Promise<PromiseSettledResult<TOutput>[]>;
  map(inputs: TInput[], mapOptions?: BatchOptions<TInput>): Promise<TOutput[]>;
  pipe<TNextOutput>(
    nextTask:
      | TaskCallable<TOutput, TNextOutput>
      | ((input: TOutput) => Promise<TNextOutput> | TNextOutput)
  ): TaskCallable<TInput, TNextOutput>;
}

async function runWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  limit: number,
  fn: (item: TIn) => Promise<TOut>
): Promise<TOut[]> {
  if (limit <= 0 || items.length <= limit) {
    return Promise.all(items.map(fn));
  }
  const results: TOut[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx]);
    }
  });

  await Promise.all(workers);
  return results;
}

async function runSettledWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  limit: number,
  fn: (item: TIn) => Promise<TOut>
): Promise<PromiseSettledResult<TOut>[]> {
  if (limit <= 0 || items.length <= limit) {
    return Promise.allSettled(items.map(fn));
  }
  const results: PromiseSettledResult<TOut>[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      try {
        const val = await fn(items[idx]);
        results[idx] = { status: "fulfilled", value: val };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

export function createTaskCallable<TInput = unknown, TOutput = unknown>(
  executorFn: (input: TInput, options?: Partial<TaskOptions<TInput>>) => Promise<TOutput>,
  options: TaskOptions<TInput> = {}
): TaskCallable<TInput, TOutput> {
  const callable = function (
    input: TInput,
    callOptions?: Partial<TaskOptions<TInput>>
  ): Promise<TOutput> {
    const mergedOptions = { ...options, ...callOptions };
    return executorFn(input, mergedOptions);
  } as TaskCallable<TInput, TOutput>;

  Object.defineProperty(callable, "taskName", {
    value: options.name,
    writable: false,
  });

  Object.defineProperty(callable, "options", {
    value: Object.freeze({ ...options }),
    writable: false,
  });

  callable.batch = function (
    inputs: TInput[],
    batchOptions?: BatchOptions<TInput>
  ): Promise<TOutput[]> {
    const concurrency = batchOptions?.batchConcurrency ?? 0;
    return runWithConcurrencyLimit(inputs, concurrency, (item) =>
      callable(item, batchOptions)
    );
  };

  callable.batchSettled = function (
    inputs: TInput[],
    batchOptions?: BatchOptions<TInput>
  ): Promise<PromiseSettledResult<TOutput>[]> {
    const concurrency = batchOptions?.batchConcurrency ?? 0;
    return runSettledWithConcurrencyLimit(inputs, concurrency, (item) =>
      callable(item, batchOptions)
    );
  };

  callable.map = function (
    inputs: TInput[],
    mapOptions?: BatchOptions<TInput>
  ): Promise<TOutput[]> {
    return callable.batch(inputs, mapOptions);
  };

  callable.pipe = function <TNextOutput>(
    nextTask:
      | TaskCallable<TOutput, TNextOutput>
      | ((input: TOutput) => Promise<TNextOutput> | TNextOutput)
  ): TaskCallable<TInput, TNextOutput> {
    const nextTaskName = (nextTask as any).taskName ?? (nextTask as any).name ?? "pipe";
    const pipedFn = async (
      input: TInput,
      callOptions?: Partial<TaskOptions<TInput>>
    ): Promise<TNextOutput> => {
      const intermediate = await callable(input, callOptions);
      if (typeof nextTask === "function") {
        return nextTask(intermediate);
      }
      return (nextTask as any)(intermediate);
    };

    return createTaskCallable<TInput, TNextOutput>(pipedFn, {
      ...options,
      name: `${options.name ?? "task"}->${nextTaskName}`,
    });
  };

  return callable;
}
