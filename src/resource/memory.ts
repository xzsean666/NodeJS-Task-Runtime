/**
 * Memory limit parsing and Node.js V8 flag conversion.
 */

export function parseMemoryLimit(limit: string | number): number {
  if (typeof limit === "number") {
    return limit > 0 ? Math.floor(limit) : 0;
  }

  if (typeof limit !== "string") {
    return 0;
  }

  const cleaned = limit.trim().toUpperCase();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|K|M|G|T)?$/);

  if (!match) {
    const parsed = Number.parseFloat(cleaned);
    return !Number.isNaN(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }

  const value = Number.parseFloat(match[1]);
  const unit = match[2] ?? "MB";

  switch (unit) {
    case "B":
      return Math.floor(value / (1024 * 1024));
    case "KB":
    case "K":
      return Math.floor(value / 1024);
    case "GB":
    case "G":
      return Math.floor(value * 1024);
    case "TB":
    case "T":
      return Math.floor(value * 1024 * 1024);
    case "MB":
    case "M":
    default:
      return Math.floor(value);
  }
}

export function toNodeMaxOldSpaceSizeArg(limitMb: number): string | undefined {
  if (limitMb > 0) {
    return `--max-old-space-size=${Math.floor(limitMb)}`;
  }
  return undefined;
}
