/**
 * CLI Task execution example with argument passing and JSON parsing.
 */

import { createRuntime } from "../dist/index.js";

async function main() {
  const runtime = createRuntime();

  // Define an external CLI task
  const runNodeEval = runtime.cli<{ message: string }, { echo: string }>("node", {
    name: "nodeEval",
    args: (input) => [
      "-e",
      `console.log(JSON.stringify({ echo: process.argv[1].toUpperCase() }))`,
      input.message,
    ],
    stdout: "json",
  });

  const response = await runNodeEval({ message: "hello world from task runtime" });
  console.log("CLI Result:", response);

  await runtime.shutdown();
}

main().catch(console.error);
