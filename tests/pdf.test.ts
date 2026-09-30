import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parsePreText, parseReportText, pdfToText } from '../lib/pdf/parse';
import { analyzeReport } from '../lib/rules/report';

const read = (f: string) => fs.readFileSync(`public/demo/${f}`).buffer as ArrayBuffer;

describe('demo PDFs round-trip', () => {
  it('pre-procedure PDF → structured decision', async () => {
    const p = parsePreText(await pdfToText(read('doctor-pre-cleared.pdf')));
    expect(p.warnings).toEqual([]);
    expect(p).toMatchObject({ drug: 'Эзиклен', scheme: 'SPLIT', clearance: 'CLEARED', liquidStopHours: 2 });
    expect(p.labs).toHaveLength(4);
    expect(p.labs![1]).toMatchObject({ indicator: 'Тромбоциты', value: '140', mark: '↓' });
    expect(p.conclusions).toHaveLength(2);
    expect(p.instructions).toHaveLength(2);
  });
  it('report PDF → text → alarm level', async () => {
    const alarm = parseReportText(await pdfToText(read('report-alarm.pdf')));
    expect(alarm).not.toMatch(/ПАЦИЕНТ/);
    expect(analyzeReport(alarm).alarm).toBe(2);
    const calm = parseReportText(await pdfToText(read('report-calm.pdf')));
    expect(analyzeReport(calm).alarm).toBe(1); // hemorrhoids → routine discussion
  });
});
