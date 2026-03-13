/**
 * Format a Date as YYYY-MM-DD using local timezone (not UTC).
 * Avoids the common bug where toISOString() shifts dates back a day
 * for timezones ahead of UTC (e.g. AEST).
 */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
