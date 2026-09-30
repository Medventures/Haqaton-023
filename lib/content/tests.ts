import type { L } from '../types';

export interface RequiredTest {
  code: string;
  title: L;
  validDays: number;   // validity counted on the PROCEDURE date
  source: string;
}

// primegc.kz, услуга «Колоноскопия»: «Для седации необходимы ЭКГ и общий анализ крови (срок годности не более 30 дней)».
export const requiredTests: RequiredTest[] = [
  {
    code: 'CBC',
    title: { ru: 'Общий анализ крови (ОАК)', kk: 'Жалпы қан анализі (ЖҚА)' },
    validDays: 30,
    source: 'primegc.kz — услуга «Колоноскопия» (седация)',
  },
  {
    code: 'ECG',
    title: { ru: 'ЭКГ с расшифровкой', kk: 'ЭКГ (қорытындысымен)' },
    validDays: 30,
    source: 'primegc.kz — услуга «Колоноскопия» (седация)',
  },
];

export const testByCode = Object.fromEntries(requiredTests.map((t) => [t.code, t]));

// Oldest acceptable test date the patient may enter (sanity check, not a medical rule).
export const MAX_TEST_AGE_DAYS = 365;
