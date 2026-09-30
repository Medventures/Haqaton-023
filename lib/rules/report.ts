import { negationRe, reportTerms, type ReportTerm, type Specialist } from '../content/report';
import { uni } from './text';

export interface MatchedTerm {
  id: string;
  level: 0 | 1 | 2;
  specialist?: Specialist;
  fragment: string;   // text as written in the report
  negated: boolean;
}

export interface ReportAnalysis {
  terms: MatchedTerm[];
  alarm: 0 | 1 | 2;
  specialist: Specialist | null;
  bbps: number | null;
}

const compiled = reportTerms.map((t) => ({ t, re: uni(new RegExp(t.re.source, 'i')) }));
const neg = uni(new RegExp(negationRe.source, 'i'));

/** Splits into clauses so negation only applies locally («полипов не выявлено, дивертикулы есть»). */
function clauses(text: string): string[] {
  return text.split(/[.;,\n]|\s+но\s+|\s+однако\s+/i).map((s) => s.trim()).filter(Boolean);
}

export function parseBbps(text: string): number | null {
  const m = text.match(/(?:bbps|бостонск\S*\s+шкал\S*)[^\d]{0,20}(\d)(?:\s*\/\s*9)?/i);
  if (m) return Number(m[1]);
  return null;
}

/** Deterministic analysis. The LLM may only add wording on top; it never changes `alarm`. */
export function analyzeReport(text: string): ReportAnalysis {
  const found = new Map<string, MatchedTerm>();
  for (const clause of clauses(text)) {
    const low = clause.toLowerCase().replace(/ё/g, 'е');
    const negated = neg.test(low);
    for (const { t, re } of compiled) {
      const m = low.match(re);
      if (!m) continue;
      const prev = found.get(t.id);
      const term: MatchedTerm = { id: t.id, level: t.level, specialist: t.specialist, fragment: clause.slice(m.index!, m.index! + m[0].length), negated };
      // A non-negated mention wins over a negated one.
      if (!prev || (prev.negated && !negated)) found.set(t.id, term);
    }
  }
  const bbps = parseBbps(text);
  let terms = [...found.values()];
  if (bbps !== null && bbps < 6 && !terms.some((t) => t.id === 'POOR_PREP' && !t.negated)) {
    terms.push({ id: 'POOR_PREP', level: 1, specialist: 'GASTRO', fragment: `BBPS ${bbps}`, negated: false });
  }
  // A polyp that is also "adenoma"/"large" is explained by the more specific term too — keep both.
  terms = terms.sort((a, b) => b.level - a.level);
  const active = terms.filter((t) => !t.negated);
  const alarm = active.reduce<number>((m, t) => Math.max(m, t.level), 0) as 0 | 1 | 2;
  const specialist = active.find((t) => t.level === alarm && t.specialist)?.specialist ?? (alarm > 0 ? 'GASTRO' : null);
  return { terms, alarm, specialist, bbps };
}

export function termById(id: string): ReportTerm | undefined {
  return reportTerms.find((t) => t.id === id);
}
