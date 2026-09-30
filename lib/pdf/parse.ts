import type { PreDecision } from '../flow';

// Parses the structured doctor template (see scripts/make-demo-pdfs.mjs).
// In production the same fields would come from the clinic information system;
// if parsing fails the doctor fills the form manually.

export interface ParsedPre extends Partial<PreDecision> { patient?: string; warnings: string[] }

const SECTION = /^(АНАЛИЗЫ|ЗАКЛЮЧЕНИЯ|УКАЗАНИЯ ДЛЯ ПОДГОТОВКИ|ДОПУСК|ЗАКЛЮЧЕНИЕ КОЛОНОСКОПИИ)(?![А-ЯЁа-яё])/i;

export function parsePreText(text: string): ParsedPre {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedPre = { labs: [], conclusions: [], instructions: [], warnings: [] };
  let section = '';
  for (const line of lines) {
    const kv = line.match(/^([А-ЯЁA-Z ]+):\s*(.*)$/);
    if (kv && !SECTION.test(line)) {
      const [, k, v] = kv;
      const key = k.trim().toUpperCase();
      if (key === 'ПАЦИЕНТ') out.patient = v;
      if (key.startsWith('ПРЕПАРАТ')) out.drug = v.trim();
      if (key === 'СХЕМА') out.scheme = /SINGLE|ОДНО/i.test(v) ? 'SINGLE_EVENING' : 'SPLIT';
      if (key.startsWith('ОКНО')) out.liquidStopHours = Number(v.match(/\d/)?.[0] ?? 2);
      continue;
    }
    const sec = line.match(SECTION);
    if (sec) {
      section = sec[1].toUpperCase();
      if (section === 'ДОПУСК') {
        const v = line.split(':')[1] ?? '';
        out.clearance = /НЕ ДОПУЩ/i.test(v) ? 'NOT_CLEARED' : /КОНСУЛЬТ/i.test(v) ? 'CONSULT' : /ДОПУЩ/i.test(v) ? 'CLEARED' : undefined;
      }
      continue;
    }
    if (section === 'АНАЛИЗЫ' && line.includes('|')) {
      const cells = line.split('|').map((c) => c.trim());
      while (cells.length && cells[0] === '') cells.shift();
      if (/^показатель/i.test(cells[0] ?? '')) continue;
      const [indicator, value, units = '', reference = '', mark = ''] = cells;
      if (indicator && value) out.labs!.push({ indicator, value, units, reference, mark });
    } else if (section === 'ЗАКЛЮЧЕНИЯ') {
      out.conclusions!.push(line.replace(/^\d+[.)]\s*/, ''));
    } else if (section === 'УКАЗАНИЯ ДЛЯ ПОДГОТОВКИ') {
      out.instructions!.push(line.replace(/^\d+[.)]\s*/, ''));
    }
  }
  if (!out.drug) out.warnings.push('Не найден препарат');
  if (!out.scheme) out.warnings.push('Не найдена схема');
  if (!out.clearance) out.warnings.push('Не найдено решение о допуске');
  return out;
}

export function parseReportText(text: string): string {
  const idx = text.search(/ЗАКЛЮЧЕНИЕ КОЛОНОСКОПИИ/i);
  const body = idx >= 0 ? text.slice(idx).replace(/ЗАКЛЮЧЕНИЕ КОЛОНОСКОПИИ\s*:?/i, '') : text;
  return body.split(/\r?\n/).filter((l) => !/^(ПАЦИЕНТ|ДАТА)\s*:/i.test(l.trim())).join('\n').trim();
}

export async function pdfToText(buf: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join('\n');
}
