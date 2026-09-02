/**
 * Task representation and callable interface.
 */

import type { TaskOptions } from "./types.js";

export interface TaskCallable<TInput = unknown, TOutput = unknown> {
  (input: TInput, callOptions?: Partial<TaskOptions<TInput>>): Promise<TOutput>;
  readonly taskName?: string;
  readonly options: TaskOptions<TInput>;
  batch(inputs: TInput[], batchOptions?: Partial<TaskOptions<TInput>>): Promise<TOutput[]>;
  map(inputs: TInput[], mapOptions?: Partial<TaskOptions<TInput>>): Promise<TOutput[]>;
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
    batchOptions?: Partial<TaskOptions<TInput>>
  ): Promise<TOutput[]> {
    return Promise.all(inputs.map((item) => callable(item, batchOptions)));
  };

  callable.map = function (
    inputs: TInput[],
    mapOptions?: Partial<TaskOptions<TInput>>
  ): Promise<TOutput[]> {
    return callable.batch(inputs, mapOptions);
  };

  return callable;
}
