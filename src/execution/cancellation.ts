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

  const cleanup = () => {
    while (listeners.length > 0) {
      const entry = listeners.pop();
      if (entry) {
        entry.signal.removeEventListener("abort", entry.handler);
      }
    }
  };

  for (const signal of validSignals) {
    const handler = () => {
      cleanup();
      controller.abort(signal.reason);
    };
    signal.addEventListener("abort", handler, { once: true });
    listeners.push({ signal, handler });
  }

  return { controller, cleanup };
}
