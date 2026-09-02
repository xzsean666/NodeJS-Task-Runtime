import { describe, it, expect } from "vitest";
import { PriorityQueue } from "../../src/scheduler/priority-queue.js";

describe("PriorityQueue", () => {
  it("should dequeue items in order of highest priority first", () => {
    const pq = new PriorityQueue<string>();
    pq.enqueue("low", 1);
    pq.enqueue("critical", 10);
    pq.enqueue("medium", 5);
    pq.enqueue("lowest", 0);

    expect(pq.dequeue()).toBe("critical");
    expect(pq.dequeue()).toBe("medium");
    expect(pq.dequeue()).toBe("low");
    expect(pq.dequeue()).toBe("lowest");
    expect(pq.dequeue()).toBeUndefined();
  });

  it("should preserve FIFO order for items with equal priority", () => {
    const pq = new PriorityQueue<string>();
    pq.enqueue("first", 5);
    pq.enqueue("second", 5);
    pq.enqueue("third", 5);

    expect(pq.dequeue()).toBe("first");
    expect(pq.dequeue()).toBe("second");
    expect(pq.dequeue()).toBe("third");
  });

  it("should support peek, size, isEmpty and clear", () => {
    const pq = new PriorityQueue<number>();
    expect(pq.isEmpty).toBe(true);
    expect(pq.size).toBe(0);
    expect(pq.peek()).toBeUndefined();

    pq.enqueue(100, 2);
    pq.enqueue(200, 5);

    expect(pq.isEmpty).toBe(false);
    expect(pq.size).toBe(2);
    expect(pq.peek()).toBe(200);

    pq.clear();
    expect(pq.isEmpty).toBe(true);
    expect(pq.size).toBe(0);
  });

  it("should remove items matching predicate", () => {
    const pq = new PriorityQueue<{ id: string; val: number }>();
    pq.enqueue({ id: "a", val: 1 }, 1);
    pq.enqueue({ id: "b", val: 2 }, 10);
    pq.enqueue({ id: "c", val: 3 }, 5);

    const removed = pq.remove((item) => item.id === "b");
    expect(removed).toBe(true);
    expect(pq.size).toBe(2);
    expect(pq.dequeue()?.id).toBe("c");
    expect(pq.dequeue()?.id).toBe("a");
  });
});
