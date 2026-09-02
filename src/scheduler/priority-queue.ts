/**
 * Priority queue with stable FIFO ordering for identical priority items.
 */

import type { Queue } from "./queue.js";

interface PriorityNode<T> {
  item: T;
  priority: number;
  sequence: number;
}

export class PriorityQueue<T> implements Queue<T> {
  private heap: PriorityNode<T>[] = [];
  private sequenceCounter = 0;

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  enqueue(item: T, priority = 0): void {
    const node: PriorityNode<T> = {
      item,
      priority,
      sequence: ++this.sequenceCounter,
    };

    this.heap.push(node);
    this.siftUp(this.heap.length - 1);
  }

  dequeue(): T | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    const root = this.heap[0];
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }

    return root.item;
  }

  peek(): T | undefined {
    return this.heap.length > 0 ? this.heap[0].item : undefined;
  }

  clear(): void {
    this.heap = [];
    this.sequenceCounter = 0;
  }

  remove(predicate: (item: T) => boolean): boolean {
    const index = this.heap.findIndex((node) => predicate(node.item));
    if (index === -1) {
      return false;
    }

    const last = this.heap.pop()!;
    if (index < this.heap.length) {
      this.heap[index] = last;
      this.siftDown(index);
      this.siftUp(index);
    }

    return true;
  }

  toArray(): T[] {
    return this.heap.map((n) => n.item);
  }

  private compare(a: PriorityNode<T>, b: PriorityNode<T>): number {
    if (a.priority !== b.priority) {
      // Higher priority value comes first
      return b.priority - a.priority;
    }
    // Equal priority: smaller sequence number (enqueued earlier) comes first
    return a.sequence - b.sequence;
  }

  private siftUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.compare(this.heap[current], this.heap[parent]) < 0) {
        this.swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let current = index;
    const length = this.heap.length;

    while (true) {
      let candidate = current;
      const left = 2 * current + 1;
      const right = 2 * current + 2;

      if (left < length && this.compare(this.heap[left], this.heap[candidate]) < 0) {
        candidate = left;
      }

      if (right < length && this.compare(this.heap[right], this.heap[candidate]) < 0) {
        candidate = right;
      }

      if (candidate !== current) {
        this.swap(current, candidate);
        current = candidate;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}
