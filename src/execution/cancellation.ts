/**
 * Cancellation controller and linked abort signal utilities.
 */

export function createLinkedAbortController(...parentSignals: (AbortSignal | undefined)[]): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const validSignals = parentSignals.filter(
    (s): s is AbortSignal => s !== undefined && s !== null
  );

  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return {
        controller,
        cleanup: () => {},
      };
    }
  }

  const listeners: Array<{ signal: AbortSignal; handler: () => void }> = [];

  for (const signal of validSignals) {
    const handler = () => {
      controller.abort(signal.reason);
    };
    signal.addEventListener("abort", handler, { once: true });
    listeners.push({ signal, handler });
  }

  const cleanup = () => {
    for (const { signal, handler } of listeners) {
      signal.removeEventListener("abort", handler);
    }
  };

  return { controller, cleanup };
}
