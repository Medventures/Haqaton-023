import { questions } from './content/screening';
import { db, must } from './db';
import * as flow from './flow';
import * as repo from './repo';
import { addDays, atLocal, isoDay, localDay, toLocal } from './time';
import type { Answer, TestRecord } from './types';

const allNo = (): Record<string, Answer> => {
  const a = Object.fromEntries(questions.map((q) => [q.code, 'NO' as Answer]));
  a.COMPANION = 'YES';
  return a;
};

/** First weekday at least `minDays` ahead. */
function weekdayAhead(minDays: number): Date {
  let d = addDays(localDay(new Date()), minDays);
  while (toLocal(d).dow === 0 || toLocal(d).dow === 6) d = addDays(d, 1);
  return d;
}

const pre = (drug = 'Эзиклен'): flow.PreDecision => ({
  clearance: 'CLEARED', drug, scheme: 'SPLIT', liquidStopHours: 2,
  labs: [
    { indicator: 'Гемоглобин', value: '128', units: 'г/л', reference: '120–160', mark: '' },
    { indicator: 'Тромбоциты', value: '140', units: '×10⁹/л', reference: '150–400', mark: '↓' },
    { indicator: 'МНО', value: '1.1', units: '', reference: '0.8–1.2', mark: '' },
  ],
  conclusions: ['ЭКГ: синусовый ритм, без острых изменений.', 'Противопоказаний к седации не выявлено.'],
  instructions: [`${drug} по двухэтапной схеме строго по инструкции.`, 'Симетикон добавить в последнюю порцию препарата.'],
});

const ALARM_REPORT = 'Колоноскоп проведён до купола слепой кишки. BBPS 7/9.\nВ восходящей ободочной кишке образование 25 мм с изъязвлением, взята биопсия (6 фрагментов).\nВ сигмовидной кишке полип 4 мм, выполнена полипэктомия петлёй, материал на гистологию.';

interface Scenario {
  name: string;
  answers?: Partial<Record<string, Answer>>;
  tests?: Record<string, TestRecord>;
  hour?: number;
  day?: number;
  after?: (a: repo.Appt) => Promise<void>;
}

export async function seedDemo(): Promise<string> {
  const fresh = (d: Date) => isoDay(addDays(d, -3));
  const scenarios: Scenario[] = [
    { name: 'Демо 1 · Всё в порядке (ждёт врача)' },
    { name: 'Демо 2 · Принимает Эликвис', answers: { ANTICOAGULANTS: 'YES' } },
    { name: 'Демо 3 · «Не знаю» про диабет', answers: { DIABETES: 'UNKNOWN' } },
    { name: 'Демо 4 · ЭКГ истечёт к процедуре', day: 12, tests: { CBC: { done: true, date: fresh(new Date()) }, ECG: { done: true, date: isoDay(addDays(new Date(), -25)) } } },
    { name: 'Демо 5 · Слот 15:00', hour: 15 },
    { name: 'Демо 6 · Идёт подготовка (машина времени)', day: 3, after: async (a) => { await flow.doctorPublishPre(a.id, pre()); } },
    {
      name: 'Демо 7 · Результаты с тревожной формулировкой', day: 3,
      after: async (a) => {
        await flow.doctorPublishPre(a.id, pre('Кленсия'));
        await flow.markCompleted(a.id);
        await flow.publishReport(a.id, ALARM_REPORT, await flow.prepareReport(ALARM_REPORT));
      },
    },
  ];
  for (const s of scenarios) {
    const day = weekdayAhead(s.day ?? 6);
    const when = atLocal(day, 0, s.hour ?? 9, 0);
    const p = await repo.createPatient({ name: s.name, lang: 'ru', consent_at: new Date().toISOString() });
    const tests = s.tests ?? { CBC: { done: true, date: fresh(new Date()) }, ECG: { done: true, date: fresh(new Date()) } };
    const a = await repo.createAppt({ patient_id: p.id, channel: 'web', is_demo: true, scheduled_at: when.toISOString(), answers: { ...allNo(), ...s.answers } as Record<string, Answer>, tests });
    await flow.finalizeIntake(a);
    if (s.after) await s.after((await repo.getAppt(a.id))!);
  }
  return `Создано демо-пациентов: ${scenarios.length}`;
}

export async function wipeDemo(): Promise<string> {
  const rows = must(await db().from('appointments').select('patient_id').eq('is_demo', true), 'demo list') as { patient_id: string }[];
  const ids = [...new Set(rows.map((r) => r.patient_id))];
  if (ids.length) must(await db().from('patients').delete().in('id', ids), 'wipe demo');
  return `Удалено демо-пациентов: ${ids.length}`;
}
