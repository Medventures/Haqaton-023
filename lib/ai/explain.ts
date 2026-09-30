import { reportDisclaimer, specialistNames } from '../content/report';
import { analyzeReport, termById, type ReportAnalysis } from '../rules/report';
import type { Lang } from '../types';
import { completeJson, lastLlmError, llmName } from './llm';

export interface ReportExplanation {
  analysis: ReportAnalysis;
  summary: { ru: string; kk: string };
  questions: { ru: string[]; kk: string[] };
  source: 'llm' | 'rules';
  model: string;
}

// Phrases the paraphrase must never contain: diagnosis, prognosis, treatment advice.
const FORBIDDEN = /(у вас (рак|опухоль|онкологи|злокачеств)|ваш диагноз|вам поставлен|вы (здоров|больны)|не о чем беспокоиться|ничего страшного|беспокоиться не стоит|прогноз благоприят|прогноз неблагоприят|вылечит|принимайте|отмените|сізде (қатерлі|рак)|диагнозыңыз)/i;

function rulesSummary(a: ReportAnalysis, lang: Lang): string {
  const active = a.terms.filter((t) => !t.negated);
  if (!active.length) {
    return lang === 'ru'
      ? 'В заключении не найдено терминов из нашего словаря. Смысл заключения объяснит врач.'
      : 'Қорытындыда біздің сөздіктегі терминдер табылмады. Қорытындының мағынасын дәрігер түсіндіреді.';
  }
  const parts = active.map((t) => {
    const term = termById(t.id)!;
    return `• ${term.title[lang]}: ${term.plain[lang]}`;
  });
  return parts.join('\n');
}

function rulesQuestions(a: ReportAnalysis, lang: Lang): string[] {
  const q: string[] = [];
  if (a.terms.some((t) => !t.negated && (t.id === 'BIOPSY' || t.id === 'POLYPECTOMY'))) {
    q.push(lang === 'ru' ? 'Когда будет готов результат гистологии и как я его получу?' : 'Гистология нәтижесі қашан дайын болады және оны қалай аламын?');
  }
  if (a.alarm > 0) {
    q.push(lang === 'ru' ? 'Какие следующие шаги вы рекомендуете и к какому специалисту обратиться?' : 'Қандай келесі қадамдарды ұсынасыз және қай маманға жүгіну керек?');
    q.push(lang === 'ru' ? 'Когда нужна повторная колоноскопия?' : 'Қайталама колоноскопия қашан қажет?');
  }
  if (!q.length) q.push(lang === 'ru' ? 'Когда мне стоит пройти следующее обследование?' : 'Келесі тексеруден қашан өткен дұрыс?');
  return q;
}

const SYSTEM = `Ты помогаешь пациенту клиники понять текст заключения колоноскопии.
Жёсткие правила:
- Не ставь диагноз, не давай прогноз, не советуй лечение и лекарства, не оценивай, «хорошо» это или «плохо».
- Объясняй только значение слов, используя ТОЛЬКО определения из переданного словаря. Не добавляй медицинских фактов, которых нет в словаре или в тексте заключения.
- Если термин отмечен как отрицаемый (negated=true), скажи, что этого не нашли.
- Пиши спокойно, короткими предложениями, 3–6 предложений, без markdown.
- Всегда заканчивай фразой, что интерпретирует заключение врач.
Ответ — только JSON: {"summary_ru": "...", "summary_kk": "...", "questions_ru": ["..."], "questions_kk": ["..."]}
questions_* — 2–3 вопроса, которые пациент может задать врачу.`;

/** Removes the patient name line and obvious identifiers before sending text to an external model. */
function redact(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/^(пациент|фио|patient|науқас)\s*[:：]/i.test(l.trim()))
    .join('\n')
    .replace(/\+?\d[\d\s()-]{8,}\d/g, '[номер]');
}

export async function explainReport(reportText: string): Promise<ReportExplanation> {
  const analysis = analyzeReport(reportText);
  const glossary = analysis.terms.map((t) => {
    const term = termById(t.id);
    return { term: term?.title.ru ?? t.id, negated: t.negated, definition_ru: term?.plain.ru ?? '', definition_kk: term?.plain.kk ?? '' };
  });
  const fallback: ReportExplanation = {
    analysis,
    summary: { ru: rulesSummary(analysis, 'ru'), kk: rulesSummary(analysis, 'kk') },
    questions: { ru: rulesQuestions(analysis, 'ru'), kk: rulesQuestions(analysis, 'kk') },
    source: 'rules',
    model: 'rules',
  };
  const out = await completeJson<{ summary_ru?: string; summary_kk?: string; questions_ru?: string[]; questions_kk?: string[] }>(
    SYSTEM,
    `Заключение:\n${redact(reportText)}\n\nСловарь (JSON):\n${JSON.stringify(glossary)}`,
  );
  if (!out?.summary_ru || !out.summary_kk) return { ...fallback, model: `rules (${lastLlmError ?? 'llm_off'})` };
  const texts = [out.summary_ru, out.summary_kk, ...(out.questions_ru ?? []), ...(out.questions_kk ?? [])];
  if (texts.some((t) => FORBIDDEN.test(t))) return { ...fallback, model: 'rules (filtered)' };
  return {
    analysis, // the LLM never changes the alarm level
    summary: { ru: out.summary_ru, kk: out.summary_kk },
    questions: {
      ru: (out.questions_ru ?? []).slice(0, 3).length ? out.questions_ru!.slice(0, 3) : fallback.questions.ru,
      kk: (out.questions_kk ?? []).slice(0, 3).length ? out.questions_kk!.slice(0, 3) : fallback.questions.kk,
    },
    source: 'llm',
    model: llmName,
  };
}

export { reportDisclaimer, specialistNames };
