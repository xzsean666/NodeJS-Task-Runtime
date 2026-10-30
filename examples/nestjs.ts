/**
 * NestJS Integration & Best Practice Guide Example
 */

import { TaskRuntimeModule, TASK_RUNTIME, type TaskRuntime } from "../dist/index.js";

// 1. Simulating NestJS Module Setup:
export const appModuleMetadata = {
  imports: [
    TaskRuntimeModule.forRoot({
      workers: "auto",           // Leaves 1 core for the NestJS HTTP event loop
      eager: true,               // Prewarms worker threads on application start
      maxTasksPerWorker: 5000,   // Gracefully recycles workers to prevent V8 memory fragmentation
      maxQueueSize: 2000,        // Protects against OOM during traffic spikes
      overflowStrategy: "reject",
    }),
  ],
};

// 2. Simulating a NestJS Service using TaskRuntime:
export class HeavyComputeService {
  constructor(private readonly runtime: TaskRuntime) {}

  // Pattern A: Pure in-memory CPU calculation (no closures or DB injected into worker)
  async calculateRiskScore(transactions: number[]): Promise<number> {
    const computeTask = this.runtime.task((data: number[]) => {
      // Runs inside Worker Thread without blocking main Event Loop
      return data.reduce((acc, curr) => acc + Math.sqrt(curr) * 1.5, 0);
    }, { name: "risk-scoring", timeout: 5000 });

    return await computeTask(transactions);
  }

  // Pattern B: External CLI tool (e.g. FFmpeg / ImageMagick / Go / Rust)
  async generateThumbnail(videoPath: string): Promise<string> {
    const ffmpegTask = this.runtime.cli<{ file: string }, string>("ffmpeg", {
      name: "video-thumbnail",
      concurrency: 2, // Hard cap: max 2 FFmpeg processes simultaneously to avoid server collapse
      timeout: 30000,
      args: (input, ctx) => {
        const out = ctx.createTempFile(".jpg");
        return ["-y", "-i", input.file, "-ss", "00:00:01", "-vframes", "1", out];
      },
      stdout: "string",
    });

    return await ffmpegTask({ file: videoPath });
  }
}

async function runDemo() {
  const dynamicModule = TaskRuntimeModule.forRoot({ workers: 2 });
  const runtime = dynamicModule.providers[0].useFactory();

  const service = new HeavyComputeService(runtime);
  const score = await service.calculateRiskScore([100, 400, 900, 1600]);
  console.log("Calculated Risk Score:", score);

  await runtime.destroy();
}

runDemo().catch(console.error);
