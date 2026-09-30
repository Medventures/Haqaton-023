import {
  DIET_DAYS, DOSE_NAG_MIN, EXTENDED_DIET_DAYS, singleEvening, type Slot,
} from '../content/prep';
import { addMin, atLocal, localDay } from '../time';
import type { PrepScheme } from '../types';
import { findSlot } from './slots';

export type EventKind = 'message' | 'confirm' | 'stool' | 'checklist' | 'nag';

export interface PrepEventDraft {
  code: string;
  kind: EventKind;
  dueAt: Date;
  status: 'PENDING' | 'SKIPPED';
  value?: Record<string, unknown>;
}

export interface TimelineInput {
  procedure: Date;
  scheme: PrepScheme;
  extendedDiet: boolean;     // constipation
  liquidStopHours: number;   // 2..4, doctor-set
}

export interface DoseTimes {
  dose1Start: Date; dose1End: Date;
  dose2Start: Date | null; dose2End: Date | null;
  liquidStop: Date;
  dietStart: Date;
  brothStart: Date;     // D-1 00:00
  clearStart: Date;     // D-1 14:00
}

const hm = (s: string) => s.split(':').map(Number) as [number, number];

export function doseTimes(input: TimelineInput): DoseTimes | null {
  const { procedure, scheme } = input;
  let d1s: Date, d1e: Date, d2s: Date | null = null, d2e: Date | null = null;
  if (scheme === 'SPLIT') {
    const slot: Slot | null = findSlot(procedure);
    if (!slot) return null;               // memo has no dose times for this slot → clinic review
    d1s = atLocal(procedure, slot.dose1.day, ...hm(slot.dose1.start));
    d1e = atLocal(procedure, slot.dose1.day, ...hm(slot.dose1.end));
    d2s = atLocal(procedure, slot.dose2.day, ...hm(slot.dose2.start));
    d2e = atLocal(procedure, slot.dose2.day, ...hm(slot.dose2.end));
  } else {
    d1s = atLocal(procedure, singleEvening.day, ...hm(singleEvening.start));
    d1e = atLocal(procedure, singleEvening.day, ...hm(singleEvening.end));
  }
  const stopHours = Math.min(4, Math.max(2, input.liquidStopHours || 2));
  let liquidStop = addMin(procedure, -stopHours * 60);
  const lastDoseEnd = d2e ?? d1e;
  if (liquidStop < lastDoseEnd) liquidStop = lastDoseEnd; // can't stop drinking before the prep is finished
  const dietDays = input.extendedDiet ? EXTENDED_DIET_DAYS : DIET_DAYS;
  return {
    dose1Start: d1s, dose1End: d1e, dose2Start: d2s, dose2End: d2e, liquidStop,
    dietStart: atLocal(procedure, -dietDays, 0, 0),
    brothStart: localDay(procedure, -1),
    clearStart: atLocal(procedure, -1, 14, 0),
  };
}

/**
 * Builds the personal plan. Events already in the past at build time are SKIPPED
 * (shown as «пропущено — уточните у клиники»), except the diet start, which is sent
 * immediately as a "late start" message when the diet phase is still running.
 */
export function buildTimeline(input: TimelineInput, now: Date): { events: PrepEventDraft[]; lateDiet: boolean } | null {
  const t = doseTimes(input);
  if (!t) return null;
  const P = input.procedure;
  const ev: Omit<PrepEventDraft, 'status'>[] = [];
  const dietDays = input.extendedDiet ? EXTENDED_DIET_DAYS : DIET_DAYS;

  ev.push({ code: 'DIET_START', kind: 'message', dueAt: atLocal(P, -dietDays, 9, 0), value: { dietDays } });
  ev.push({ code: 'DIET_REMINDER', kind: 'message', dueAt: atLocal(P, -2, 9, 0) });
  ev.push({ code: 'VISIT_REMINDER', kind: 'message', dueAt: atLocal(P, -1, 8, 0) });
  ev.push({ code: 'CLEAR_LIQUIDS', kind: 'message', dueAt: t.clearStart });

  const pushDose = (prefix: 'DOSE1' | 'DOSE2', start: Date, end: Date, textKey: string) => {
    ev.push({ code: `${prefix}`, kind: 'confirm', dueAt: start, value: { textKey } });
    DOSE_NAG_MIN.forEach((m, i) => {
      const at = addMin(end, m);
      if (at < addMin(P, -30)) ev.push({ code: `${prefix}_NAG${i + 1}`, kind: 'nag', dueAt: at, value: { target: prefix, final: i === DOSE_NAG_MIN.length - 1 } });
    });
  };

  ev.push({ code: 'DOSE1_SOON', kind: 'message', dueAt: addMin(t.dose1Start, -30) });
  if (input.scheme === 'SPLIT' && t.dose2Start && t.dose2End) {
    pushDose('DOSE1', t.dose1Start, t.dose1End, 'DOSE1');
    ev.push({ code: 'STOOL_EVENING', kind: 'stool', dueAt: addMin(t.dose1End, 120), value: { final: false } });
    pushDose('DOSE2', t.dose2Start, t.dose2End, 'DOSE2');
    ev.push({ code: 'STOOL_MORNING', kind: 'stool', dueAt: addMin(t.dose2End, 60), value: { final: true } });
  } else {
    pushDose('DOSE1', t.dose1Start, t.dose1End, 'DOSE_SINGLE');
    ev.push({ code: 'STOOL_MORNING', kind: 'stool', dueAt: addMin(P, -180), value: { final: true } });
  }
  ev.push({ code: 'LIQUID_STOP', kind: 'message', dueAt: t.liquidStop });
  ev.push({ code: 'CHECKLIST', kind: 'checklist', dueAt: addMin(P, -120) });
  ev.push({ code: 'LEAVE', kind: 'message', dueAt: addMin(P, -90) });

  let lateDiet = false;
  const events: PrepEventDraft[] = ev.map((e) => {
    if (e.dueAt.getTime() >= now.getTime()) return { ...e, status: 'PENDING' as const };
    if (e.code === 'DIET_START' && now < t.brothStart) {
      lateDiet = true;
      return { ...e, dueAt: now, status: 'PENDING' as const, value: { ...e.value, late: true } };
    }
    return { ...e, status: 'SKIPPED' as const };
  });
  events.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return { events, lateDiet };
}
