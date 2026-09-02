/**
 * Basic usage example of Node.js Task Runtime.
 */

import { createRuntime } from "../dist/index.js";

async function main() {
  // 1. Create a runtime with auto worker allocation
  const runtime = createRuntime({
    workers: "auto",
    defaultTimeout: 5000,
  });

  console.log("Runtime initialized. Workers allocated:", runtime.stats().totalWorkers);

  // 2. Define a computational task
  const heavyCalculation = runtime.task(
    (input: { numbers: number[] }) => {
      console.log("Computing in worker thread...");
      return input.numbers.reduce((acc, n) => acc + n * n, 0);
    },
    { name: "sumOfSquares" }
  );

  // 3. Execute task
  const result = await heavyCalculation({ numbers: [1, 2, 3, 4, 5, 10] });
  console.log("Result:", result); // 155

  // 4. View runtime statistics
  console.log("Stats:", runtime.stats());

  // 5. Graceful shutdown
  await runtime.shutdown();
  console.log("Runtime shutdown complete.");
}

main().catch(console.error);
