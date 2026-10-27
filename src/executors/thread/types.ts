/**
 * Worker Threads Executor message protocol and types.
 */

import type { ResourceLimits } from "../../resource/limits.js";

export type WorkerInboundMessage =
  | {
      type: "EXECUTE";
      executionId: string;
      fnCode?: string;
      modulePath?: string;
      exportName?: string;
      input: unknown;
      isChunk?: boolean;
    }
  | {
      type: "PING";
    };

export type WorkerOutboundMessage =
  | {
      type: "READY";
    }
  | {
      type: "SUCCESS";
      executionId: string;
      result: unknown;
    }
  | {
      type: "ERROR";
      executionId: string;
      error: {
        message: string;
        stack?: string;
        name?: string;
        code?: string;
      };
    }
  | {
      type: "PONG";
    };

export interface WorkerPoolOptions {
  size?: number | "auto" | "max" | "all";
  resource?: ResourceLimits;
}

export interface WorkerExecutionPayload {
  executionId: string;
  fn?: ((input: any) => any) | string;
  modulePath?: string;
  exportName?: string;
  input: unknown;
  transferList?: readonly any[];
  isChunk?: boolean;
}
