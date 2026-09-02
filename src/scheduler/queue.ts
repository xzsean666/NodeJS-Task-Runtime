/**
 * Base queue interface.
 */

export interface Queue<T> {
  readonly size: number;
  readonly isEmpty: boolean;
  enqueue(item: T, priority?: number): void;
  dequeue(): T | undefined;
  peek(): T | undefined;
  clear(): void;
}
