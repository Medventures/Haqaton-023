import { describe, expect, it } from 'vitest';
import { questions } from '../lib/content/screening';
import { answerFood, dietPhase, extractFoodQuestion } from '../lib/rules/diet';
import { detectRedFlag } from '../lib/rules/redflags';
import { analyzeReport } from '../lib/rules/report';
import { evaluateScreening, nextQuestionIndex } from '../lib/rules/screening';
import { validateSlot } from '../lib/rules/slots';
import { evaluateTests } from '../lib/rules/tests';
import { buildTimeline, doseTimes } from '../lib/rules/timeline';
import { decideFuzzy } from '../lib/faq/matcher';
import { fmtDateTime, fromLocal, isoDay, addDays } from '../lib/time';
import type { Answer } from '../lib/types';

const allNo = (): Record<string, Answer> => {
  const a: Record<string, Answer> = Object.fromEntries(questions.map((q) => [q.code, 'NO' as Answer]));
  a.COMPANION = 'YES';
  return a;
};
// Monday 2026-10-12 09:00 local; "now" = Monday 2026-10-05 10:00
const NOW = fromLocal(2026, 10, 5, 10, 0);
const PROC = fromLocal(2026, 10, 12, 9, 0);

describe('screening', () => {
  it('clean questionnaire → no flags', () => {
    const r = evaluateScreening(allNo());
    expect(r.flags).toEqual([]);
    expect(r.urgent).toBe(false);
    expect(r.missing).toEqual([]);
  });
  it('scenario 2: Eliquis → HIGH doctor flag', () => {
    const r = evaluateScreening({ ...allNo(), ANTICOAGULANTS: 'YES' });
    expect(r.flags).toContainEqual(expect.objectContaining({ code: 'SCREEN_ANTICOAGULANTS', severity: 'HIGH', assignee: 'DOCTOR' }));
  });
  it('scenario 3: "не знаю" про диабет → HIGH flag, never treated as NO', () => {
    const r = evaluateScreening({ ...allNo(), DIABETES: 'UNKNOWN' });
    expect(r.flags.map((f) => f.code)).toContain('SCREEN_DIABETES');
    expect(r.flags[0].severity).toBe('HIGH');
  });
  it('every question: UNKNOWN produces a flag or a safer task', () => {
    for (const q of questions) {
      const r = evaluateScreening({ ...allNo(), [q.code]: 'UNKNOWN' });
      expect(r.flags.length + r.tasks.length, q.code).toBeGreaterThan(0);
    }
  });
  it('acute symptoms → URGENT and questionnaire stops', () => {
    const a = { ACUTE_NOW: 'YES' as Answer };
    expect(evaluateScreening(a).urgent).toBe(true);
    expect(nextQuestionIndex(a)).toBe(-1);
  });
  it('no companion → coordinator (not doctor) flag', () => {
    const r = evaluateScreening({ ...allNo(), COMPANION: 'NO' });
    expect(r.flags[0]).toMatchObject({ severity: 'MEDIUM', assignee: 'COORDINATOR' });
  });
  it('unanswered questions are reported as missing', () => {
    expect(evaluateScreening({}).missing.length).toBe(questions.length);
  });
});

describe('tests validity (counted on procedure date)', () => {
  it('scenario 5: ECG 25 days ago, procedure in 7 days (32 days on procedure date) → expires', () => {
    const r = evaluateTests({
      CBC: { done: true, date: isoDay(addDays(NOW, -2)) },
      ECG: { done: true, date: isoDay(addDays(NOW, -25)) },
    }, PROC);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([expect.objectContaining({ code: 'ECG', kind: 'EXPIRES', retakeFrom: '12.09.2026', retakeBy: '11.10.2026' })]);
  });
  it('fresh tests → ok', () => {
    const r = evaluateTests({ CBC: { done: true, date: isoDay(NOW) }, ECG: { done: true, date: isoDay(NOW) } }, PROC);
    expect(r.ok).toBe(true);
  });
  it('not done → NOT_DONE with retake window', () => {
    const r = evaluateTests({ CBC: { done: false }, ECG: { done: true, date: isoDay(NOW) } }, PROC);
    expect(r.issues[0]).toMatchObject({ code: 'CBC', kind: 'NOT_DONE' });
  });
});

describe('slots', () => {
  it('scenario 6: 15:00 → valid clinic time but not supported by memo (clinic review)', () => {
    expect(validateSlot(fromLocal(2026, 10, 12, 15, 0), NOW)).toEqual({ ok: true, supported: false });
  });
  it('09:00 weekday → supported', () => {
    expect(validateSlot(PROC, NOW)).toMatchObject({ ok: true, supported: true });
  });
  it('Sunday / past / closed / too soon are rejected', () => {
    expect(validateSlot(fromLocal(2026, 10, 11, 9, 0), NOW)).toEqual({ ok: false, reason: 'SUNDAY' });
    expect(validateSlot(fromLocal(2026, 10, 1, 9, 0), NOW)).toEqual({ ok: false, reason: 'PAST' });
    expect(validateSlot(fromLocal(2026, 10, 10, 17, 0), NOW)).toEqual({ ok: false, reason: 'CLOSED' }); // Saturday closes 17:00
    expect(validateSlot(fromLocal(2026, 10, 5, 19, 0), NOW)).toEqual({ ok: false, reason: "TOO_SOON" });
  });
});

describe('timeline', () => {
  const input = { procedure: PROC, scheme: 'SPLIT' as const, extendedDiet: false, liquidStopHours: 2 };
  it('scenario 1: 09:00 SPLIT → dose windows from memo, liquids stop after dose 2', () => {
    const t = doseTimes(input)!;
    expect(fmtDateTime(t.dose1Start)).toBe('11.10.2026 18:00');
    expect(fmtDateTime(t.dose2Start!)).toBe('12.10.2026 04:00');
    expect(fmtDateTime(t.liquidStop)).toBe('12.10.2026 07:00');
    const tl = buildTimeline(input, NOW)!;
    expect(tl.events.every((e) => e.status === 'PENDING')).toBe(true);
    expect(tl.events.map((e) => e.code)).toEqual(expect.arrayContaining(['DIET_START', 'VISIT_REMINDER', 'DOSE1', 'STOOL_EVENING', 'DOSE2', 'STOOL_MORNING', 'CHECKLIST', 'LEAVE']));
  });
  it('liquid stop never earlier than end of last dose (08:00 slot, 4 h)', () => {
    const t = doseTimes({ ...input, procedure: fromLocal(2026, 10, 12, 8, 0), liquidStopHours: 4 })!;
    expect(fmtDateTime(t.liquidStop)).toBe('12.10.2026 05:00');
  });
  it('afternoon slot → no timeline (clinic review)', () => {
    expect(buildTimeline({ ...input, procedure: fromLocal(2026, 10, 12, 15, 0) }, NOW)).toBeNull();
  });
  it('constipation → diet starts 5 days before', () => {
    const tl = buildTimeline({ ...input, extendedDiet: true }, NOW)!;
    expect(fmtDateTime(tl.events.find((e) => e.code === 'DIET_START')!.dueAt)).toBe('07.10.2026 09:00');
  });
  it('late booking: past events skipped, diet start sent now (review focus 4)', () => {
    const now = fromLocal(2026, 10, 10, 12, 0); // 2 days before
    const tl = buildTimeline(input, now)!;
    const diet = tl.events.find((e) => e.code === 'DIET_START')!;
    expect(tl.lateDiet).toBe(true);
    expect(diet.status).toBe('PENDING');
    expect(diet.dueAt.getTime()).toBe(now.getTime());
    expect(tl.events.find((e) => e.code === 'DIET_REMINDER')!.status).toBe('SKIPPED');
  });
});

describe('diet FAQ by phase', () => {
  const t = doseTimes({ procedure: PROC, scheme: 'SPLIT', extendedDiet: false, liquidStopHours: 2 });
  it('extracts product from question', () => {
    expect(extractFoodQuestion('Можно гречку?')).toBe('гречку');
    expect(extractFoodQuestion('можно ли пить чай')).toBe('чай');
    expect(extractFoodQuestion('кофе можно?')).toBe('кофе');
  });
  it('before diet → no restrictions', () => {
    expect(answerFood('гречку', dietPhase(t, PROC, NOW), t, 'ru').kind).toBe('NO_RESTRICTIONS');
  });
  it('scenario 9: «можно гречку?» during diet → lists allowed', () => {
    const now = fromLocal(2026, 10, 10, 12, 0);
    const a = answerFood('гречку', dietPhase(t, PROC, now), t, 'ru');
    expect(a).toMatchObject({ kind: 'ONLY', phase: 'DIET', known: true });
  });
  it('rice allowed during diet', () => {
    const now = fromLocal(2026, 10, 10, 12, 0);
    expect(answerFood('рис', dietPhase(t, PROC, now), t, 'ru').kind).toBe('ALLOWED');
  });
  it('scenario 10: «можно чай?» after 14:00 the day before → yes', () => {
    const now = fromLocal(2026, 10, 11, 15, 0);
    expect(dietPhase(t, PROC, now)).toBe('CLEAR');
    expect(answerFood('чай', 'CLEAR', t, 'ru').kind).toBe('ALLOWED');
    expect(answerFood('бульон', 'CLEAR', t, 'ru').kind).toBe('ONLY');
  });
});

describe('red flags (phrases + exclusions)', () => {
  it('scenario 8: «у меня кровь в стуле» → red flag', () => {
    expect(detectRedFlag('У меня кровь в стуле!')).toBe('BLOOD_STOOL');
  });
  it.each([
    'очень болит живот', 'сильная боль в животе', 'потеряла сознание', 'температура 38.5', 'черный стул', 'вырвало с кровью', 'нәжісте қан бар',
  ])('fires: %s', (s) => expect(detectRedFlag(s)).not.toBeNull());
  it.each([
    'когда сдавать анализ крови', 'нужно ли сдать кровь натощак', 'анализ крови на свертываемость', 'принимаю препараты разжижающие кровь',
    'можно ли кофе', 'что взять с собой', 'как пить фортранс', 'сколько длится процедура', 'можно чай', 'болит ли после процедуры',
    'у меня давление крови высокое бывает', 'где сдать ОАК', 'какие анализы нужны', 'можно гречку', 'как перенести запись',
    'қан тапсыру керек пе', 'во сколько приехать', 'нужен ли сопровождающий', 'можно ли курить', 'стул стал жидким',
  ])('does not fire: %s', (s) => expect(detectRedFlag(s)).toBeNull());
});

describe('report explanation (deterministic alarm)', () => {
  it('calm report → level 0', () => {
    const r = analyzeReport('Осмотрена до купола слепой кишки. Слизистая без особенностей. Полипов и образований не выявлено. BBPS 8/9.');
    expect(r.alarm).toBe(0);
    expect(r.bbps).toBe(8);
    expect(r.terms.find((t) => t.id === 'POLYP')?.negated).toBe(true);
  });
  it('polyp removed + biopsy → level 1', () => {
    const r = analyzeReport('В сигмовидной кишке полип 5 мм, удалён петлёй (полипэктомия), материал на гистологию. BBPS 7.');
    expect(r.alarm).toBe(1);
  });
  it('mass with biopsy → level 2 + specialist', () => {
    const r = analyzeReport('В восходящей кишке образование 25 мм с изъязвлением, взята биопсия. Подозрение на злокачественный процесс.');
    expect(r.alarm).toBe(2);
    expect(r.specialist).toBe('GASTRO');
  });
  it('BBPS < 6 → poor prep term added', () => {
    expect(analyzeReport('Бостонская шкала: 4. Осмотр затруднён.').terms.map((t) => t.id)).toContain('POOR_PREP');
  });
});

describe('FAQ fuzzy', () => {
  it('answers a close paraphrase', () => {
    const d = decideFuzzy('Что взять с собой на колоноскопию?');
    expect(d.kind).toBe('answer');
    if (d.kind === 'answer') expect(d.item.id).toBe('what_to_bring');
  });
  it('vomiting is escalated', () => {
    const d = decideFuzzy('меня вырвало после раствора');
    expect(d.kind === 'answer' && d.item.escalate).toBe(true);
  });
  it('nonsense → none', () => {
    expect(decideFuzzy('погода в Астане').kind).toBe('none');
  });
});
