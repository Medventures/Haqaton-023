import { supportedSlots, type Slot } from '../content/prep';
import { addDays, atLocal, fromLocal, localDay, toLocal } from '../time';

export const OPEN_HOURS: Record<number, [number, number] | null> = {
  0: null, 1: [8, 20], 2: [8, 20], 3: [8, 20], 4: [8, 20], 5: [8, 20], 6: [9, 17],
};

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function findSlot(procedure: Date): Slot | null {
  const p = toLocal(procedure);
  const min = p.hh * 60 + p.mm;
  return supportedSlots.find((s) => min >= toMin(s.from) && min < toMin(s.to)) ?? null;
}

export type SlotCheck =
  | { ok: true; supported: true; slot: Slot }
  | { ok: true; supported: false }                   // valid clinic time, memo has no dose times → clinic review
  | { ok: false; reason: 'PAST' | 'SUNDAY' | 'CLOSED' | 'TOO_SOON' };

/** Minimum lead time so the patient gets at least the day-before instructions. */
export const MIN_LEAD_HOURS = 20;

export function validateSlot(procedure: Date, now: Date): SlotCheck {
  if (procedure.getTime() <= now.getTime()) return { ok: false, reason: 'PAST' };
  const p = toLocal(procedure);
  const hours = OPEN_HOURS[p.dow];
  if (!hours) return { ok: false, reason: 'SUNDAY' };
  const min = p.hh * 60 + p.mm;
  // The procedure (~40 min) must fit before closing.
  if (min < hours[0] * 60 || min > hours[1] * 60 - 60) return { ok: false, reason: 'CLOSED' };
  if (procedure.getTime() - now.getTime() < MIN_LEAD_HOURS * 3_600_000) return { ok: false, reason: 'TOO_SOON' };
  const slot = findSlot(procedure);
  return slot ? { ok: true, supported: true, slot } : { ok: true, supported: false };
}

/** Bookable dates for the next `days` days (no Sundays, no today). */
export function bookableDates(now: Date, days = 14): Date[] {
  const out: Date[] = [];
  for (let i = 1; out.length < days && i < days + 10; i++) {
    const d = addDays(localDay(now), i);
    const p = toLocal(d);
    if (p.dow !== 0) out.push(fromLocal(p.y, p.m, p.d));
  }
  return out;
}

/** Hourly start times offered for a date; afternoon ones are offered but go to clinic review. */
export function slotTimes(date: Date): string[] {
  const p = toLocal(date);
  const hours = OPEN_HOURS[p.dow];
  if (!hours) return [];
  const out: string[] = [];
  for (let h = hours[0]; h <= hours[1] - 1; h++) out.push(`${String(h).padStart(2, '0')}:00`);
  return out;
}

export function combine(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return atLocal(date, 0, h, m);
}
