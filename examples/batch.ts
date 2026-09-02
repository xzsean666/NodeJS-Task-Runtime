/**
 * Batch processing, concurrency control, and priority scheduling example.
 */

import { createRuntime } from "../src/index.js";

async function main() {
  const runtime = createRuntime({
    workers: 4,
    maxConcurrency: 3, // Only 3 tasks execute concurrently across runtime
  });

  const fetchSimulator = runtime.task(
    async (item: { id: number; priority: number }) => {
      console.log(`Processing item ${item.id} with priority ${item.priority}...`);
      await new Promise((r) => setTimeout(r, 100));
      return { id: item.id, status: "processed" };
    },
    { name: "processor" }
  );

  const items = [
    { id: 1, priority: 1 },
    { id: 2, priority: 10 },
    { id: 3, priority: 5 },
    { id: 4, priority: 20 },
    { id: 5, priority: 2 },
  ];

  // Map tasks across the worker pool
  const results = await fetchSimulator.map(items);
  console.log("Batch Results:", results);
  console.log("Metrics:", runtime.stats());

  await runtime.shutdown();
}

main().catch(console.error);
