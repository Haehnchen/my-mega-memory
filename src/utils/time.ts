export function toDateTimeString(timestamp: number): string {
  const ms = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(ms).toISOString();
}
