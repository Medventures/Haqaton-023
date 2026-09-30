// Kazakhstan uses a single UTC+5 zone since 2024-03-01. We use a fixed offset
// instead of tzdata so the rules behave the same on every runtime.
export const TZ_OFFSET_MIN = 300;
const OFF = TZ_OFFSET_MIN * 60_000;

export interface LocalParts {
  y: number; m: number; d: number; hh: number; mm: number; dow: number; // dow: 0=Sun
}

export function toLocal(date: Date): LocalParts {
  const t = new Date(date.getTime() + OFF);
  return {
    y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
    hh: t.getUTCHours(), mm: t.getUTCMinutes(), dow: t.getUTCDay(),
  };
}

export function fromLocal(y: number, m: number, d: number, hh = 0, mm = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - OFF);
}

/** Local midnight of the given date shifted by `days`. */
export function localDay(date: Date, days = 0): Date {
  const p = toLocal(date);
  return fromLocal(p.y, p.m, p.d + days);
}

/** Local date + days, at hh:mm local. */
export function atLocal(date: Date, days: number, hh: number, mm = 0): Date {
  const p = toLocal(date);
  return fromLocal(p.y, p.m, p.d + days, hh, mm);
}

export const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

const pad = (n: number) => String(n).padStart(2, '0');
export function fmtDate(date: Date): string {
  const p = toLocal(date);
  return `${pad(p.d)}.${pad(p.m)}.${p.y}`;
}
export function fmtTime(date: Date): string {
  const p = toLocal(date);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}
export function fmtDateTime(date: Date): string {
  return `${fmtDate(date)} ${fmtTime(date)}`;
}
export function isoDay(date: Date): string {
  const p = toLocal(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Parses "dd.mm.yyyy" (also dd/mm/yyyy, dd-mm-yyyy) into local midnight. */
export function parseDmy(text: string): Date | null {
  const m = text.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = fromLocal(y, mo, d);
  const p = toLocal(date);
  if (p.d !== d || p.m !== mo || p.y !== y) return null;
  return date;
}

/** Parses "YYYY-MM-DD" into local midnight. */
export function parseIsoDay(text: string): Date | null {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return fromLocal(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Whole local calendar days from a to b (b - a). */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((localDay(b).getTime() - localDay(a).getTime()) / 86_400_000);
}
