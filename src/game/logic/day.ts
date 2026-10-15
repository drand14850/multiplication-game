/**
 * Calendar date "YYYY-MM-DD". With a time zone, the date in that zone (the family's);
 * without one, the device-local date like the reference today().
 */
export function today(timeZone?: string, now: Date = new Date()): string {
  if (!timeZone) {
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  }
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
