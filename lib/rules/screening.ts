import { questions, type Outcome } from '../content/screening';
import type { Answer, Flag } from '../types';

export interface ScreeningResult {
  flags: Flag[];
  urgent: boolean;
  tasks: string[];           // e.g. EXTENDED_DIET
  missing: string[];         // unanswered question codes
}

function outcomeFor(code: string, answer: Answer): Outcome {
  const q = questions.find((x) => x.code === code);
  if (!q) return { type: 'none' };
  const o = q.outcomes[answer];
  if (o) return o;
  // Defaults: UNKNOWN is always a flag, never "no".
  if (answer === 'UNKNOWN') return { type: 'flag', severity: 'MEDIUM', assignee: 'DOCTOR' };
  if (answer === 'YES') return { type: 'flag', severity: 'MEDIUM', assignee: 'DOCTOR' };
  return { type: 'none' };
}

export function evaluateScreening(answers: Record<string, Answer | undefined>): ScreeningResult {
  const res: ScreeningResult = { flags: [], urgent: false, tasks: [], missing: [] };
  for (const q of questions) {
    const a = answers[q.code];
    if (!a) {
      res.missing.push(q.code);
      continue;
    }
    const o = outcomeFor(q.code, a);
    if (o.type === 'urgent') {
      res.urgent = true;
      res.flags.push({ code: `SCREEN_${q.code}`, severity: 'URGENT', assignee: 'DOCTOR', note: `${q.code}=${a}` });
    } else if (o.type === 'flag') {
      res.flags.push({ code: `SCREEN_${q.code}`, severity: o.severity, assignee: o.assignee, note: `${q.code}=${a}` });
    } else if (o.type === 'task') {
      res.tasks.push(o.task);
    }
  }
  return res;
}

/** Index of the next unanswered question (ACUTE_NOW=YES stops the questionnaire). */
export function nextQuestionIndex(answers: Record<string, Answer | undefined>): number {
  if (answers.ACUTE_NOW === 'YES') return -1;
  return questions.findIndex((q) => !answers[q.code]);
}
