/**
 * Formats 24h time "HH:mm" to 12-hour AM/PM for user-friendly display.
 * Example: "14:30" -> "2:30 PM", "09:15" -> "9:15 AM", "00:00" -> "12:00 AM"
 */
export function formatTime12h(timeStr: string): string {
  if (!timeStr || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) {
    return timeStr;
  }

  const [hoursStr, minutesStr] = timeStr.split(":");
  let hours = parseInt(hoursStr, 10);
  const minutes = minutesStr;
  const ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  hours = hours ? hours : 12; // hour '0' should be '12'

  return `${hours}:${minutes} ${ampm}`;
}

/**
 * Formats arbitrary field values for change previews.
 */
export function formatDiffValue(val: unknown): string {
  if (val === null || val === undefined) {
    return "—";
  }

  if (typeof val === "boolean") {
    return val ? "true" : "false";
  }

  if (typeof val === "number") {
    return String(val);
  }

  if (typeof val === "string") {
    // If it matches HH:mm 24h time, format as 12h AM/PM
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(val)) {
      return formatTime12h(val);
    }
    // Truncate long strings for diff preview
    if (val.length > 100) {
      return val.slice(0, 97) + "...";
    }
    return val;
  }

  if (typeof val === "object") {
    const img = val as { url?: unknown; alt?: unknown };
    if (typeof img.url === "string") {
      return typeof img.alt === "string" && img.alt ? `${img.url} (${img.alt})` : img.url;
    }
    return JSON.stringify(val);
  }

  return String(val);
}
