import { faq, faqById } from '../content/faq';
import { completeJson } from '../ai/llm';
import { decideFuzzy, type FaqDecision } from './matcher';

const SYSTEM = `Ты классификатор вопросов пациентов перед колоноскопией. Тебе дан список FAQ (id и формулировки).
Выбери id, который отвечает на вопрос пациента, или "none", если ни один не подходит точно.
Не отвечай на вопрос сам. Ответ — только JSON: {"id": "<id или none>", "confidence": 0.0-1.0}`;

const catalog = JSON.stringify(faq.map((f) => ({ id: f.id, examples: f.variants.slice(0, 3) })));

/** Hybrid: fuzzy first; if unsure, the LLM picks an id from the catalog (never writes the answer). */
export async function decideFaq(text: string): Promise<FaqDecision> {
  const fuzzy = decideFuzzy(text);
  if (fuzzy.kind === 'answer') return fuzzy;
  const out = await completeJson<{ id?: string; confidence?: number }>(SYSTEM, `FAQ: ${catalog}\n\nВопрос пациента: ${text}`, 1000);
  if (out?.id && out.id !== 'none' && faqById[out.id] && (out.confidence ?? 0) >= 0.6) {
    return { kind: 'answer', item: faqById[out.id], score: Math.round((out.confidence ?? 0) * 100), via: 'llm' };
  }
  return fuzzy;
}
