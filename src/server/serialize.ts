/**
 * Serialization helpers — server-only.
 *
 * The Postgres client (postgres.js) returns timestamps as JS `Date` objects. React
 * refuses to render Dates, and server functions only serialize plain JSON.
 * Run rows through these helpers before returning them to the client.
 */

/** Coerce a single value to an ISO-8601 string (or null) when it is a Date. */
export function dateToString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return null;
  // Postgres date-ish text / anything else: pass through as-is.
  return String(value);
}

/** Map one DB row to a plain-JSON-safe object (Dates → ISO strings). */
export function serializeRow<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/** Map a set of DB rows to plain-JSON-safe objects. */
export function serializeRows<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
  return rows.map(serializeRow);
}