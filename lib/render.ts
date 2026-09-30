import { checklist, stoolScale } from './content/checks';
import { phases } from './content/diet';
import { eventTexts, eventTitles } from './content/prep';
import { t, tc } from './i18n';
import type { Btn, OutMsg } from './notify';
import type { Appt, PrepEvent } from './repo';
import { doseTimes, type DoseTimes } from './rules/timeline';
import { fmtDate, fmtTime } from './time';
import { patientUrl } from './token';
import type { Lang } from './types';

export function apptTimes(a: Appt): DoseTimes | null {
  if (!a.scheduled_at || !a.prep_scheme) return null;
  return doseTimes({
    procedure: new Date(a.scheduled_at),
    scheme: a.prep_scheme,
    extendedDiet: a.answers.CONSTIPATION === 'YES' || a.answers.CONSTIPATION === 'UNKNOWN',
    liquidStopHours: a.liquid_stop_hours,
  });
}

const win = (s: Date | null, e: Date | null) => (s && e ? `${fmtTime(s)}–${fmtTime(e)} (${fmtDate(s)})` : '—');

export function eventVars(a: Appt, lang: Lang, ev?: PrepEvent): Record<string, string | number | undefined> {
  const t0 = apptTimes(a);
  const P = a.scheduled_at ? new Date(a.scheduled_at) : null;
  return {
    date: P ? fmtDate(P) : '—',
    time: P ? fmtTime(P) : '—',
    drug: a.prep_drug ?? '—',
    d1: t0 ? win(t0.dose1Start, t0.dose1End) : '—',
    d2: t0 ? win(t0.dose2Start, t0.dose2End) : '—',
    stop: t0 ? fmtTime(t0.liquidStop) : '—',
    diet_days: (ev?.value?.dietDays as number | undefined) ?? 3,
    allowed: phases.DIET.allowed.map((f) => f[lang]).join(', '),
  };
}

export const eventTitle = (code: string, lang: Lang) => (eventTitles[code] ?? { ru: code, kk: code })[lang];

export const planButton = (a: Appt, lang: Lang): Btn => ({ text: t(lang, 'plan_btn'), url: patientUrl(a.id) });

export function stoolButtons(evId: number, lang: Lang): Btn[][] {
  return stoolScale.map((s) => [{ text: `${s.emoji} ${s.text[lang]}`, data: `st:${evId}:${s.value}` }]);
}

export function checklistQuestion(evId: number, idx: number, lang: Lang): OutMsg {
  const item = checklist[idx];
  return {
    text: `${idx + 1}/${checklist.length}. ${item.text[lang]}`,
    buttons: [[{ text: t(lang, 'yes'), data: `ck:${evId}:${idx}:y` }, { text: t(lang, 'no'), data: `ck:${evId}:${idx}:n` }]],
  };
}

/** Message for a due plan event (Telegram). The web cabinet renders the same data itself. */
export function renderEvent(a: Appt, ev: PrepEvent, lang: Lang, targetId?: number): OutMsg {
  const vars = eventVars(a, lang, ev);
  const plan = planButton(a, lang);
  const textKey = (ev.value?.textKey as string | undefined) ?? ev.code;
  switch (ev.kind) {
    case 'confirm':
      return {
        text: tc(lang, eventTexts[textKey], vars),
        buttons: [[{ text: t(lang, 'drank_btn'), data: `ev:${ev.id}:done` }, { text: t(lang, 'help_btn'), data: `ev:${ev.id}:help` }], [plan]],
      };
    case 'stool':
      return { text: tc(lang, eventTexts[ev.code], vars), buttons: stoolButtons(ev.id, lang) };
    case 'checklist': {
      const q = checklistQuestion(ev.id, 0, lang);
      return { text: `${tc(lang, eventTexts.CHECKLIST, vars)}\n\n${q.text}`, buttons: q.buttons };
    }
    case 'nag': {
      const final = !!ev.value?.final;
      if (final) return { text: tc(lang, eventTexts.DOSE_NAG_FINAL, vars), buttons: [[plan]] };
      const tid = targetId ?? ev.id;
      return {
        text: tc(lang, eventTexts.DOSE_NAG, vars),
        buttons: [[{ text: t(lang, 'drank_btn'), data: `ev:${tid}:done` }, { text: t(lang, 'help_btn'), data: `ev:${tid}:help` }]],
      };
    }
    default: {
      const key = ev.code === 'DIET_START' && ev.value?.late ? 'DIET_START_LATE' : ev.code === 'LEAVE' && a.status === 'PREP_PROBLEM' ? 'LEAVE_BLOCKED' : ev.code;
      return {
        text: tc(lang, eventTexts[key] ?? { ru: ev.code, kk: ev.code }, vars),
        buttons: [[{ text: t(lang, 'done_btn'), data: `ev:${ev.id}:done` }, { text: t(lang, 'help_btn'), data: `ev:${ev.id}:help` }], [plan]],
      };
    }
  }
}
