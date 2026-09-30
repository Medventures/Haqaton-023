import { faq, type FaqItem } from '../content/faq';
import { normalize } from '../rules/text';

const STOP = new Set(['ли', 'а', 'и', 'в', 'на', 'я', 'мне', 'мой', 'моя', 'мои', 'у', 'меня', 'это', 'как', 'что', 'ма', 'ме', 'бе', 'пе', 'не', 'ну', 'же', 'бы', 'по', 'до', 'с', 'со', 'к', 'о', 'об', 'для', 'при']);
const stem = (w: string) => (w.length > 5 ? w.slice(0, 5) : w);
const tokens = (s: string) => normalize(s).split(' ').filter((w) => w && !STOP.has(w)).map(stem);

/** token_set_ratio-like score in 0..100 on stems. */
export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const containment = inter / Math.min(A.size, B.size);
  const jaccard = inter / (A.size + B.size - inter);
  return Math.round(100 * (0.7 * containment + 0.3 * jaccard));
}

export interface FaqHit { item: FaqItem; score: number }

export function rankFaq(text: string): FaqHit[] {
  const n = normalize(text);
  return faq
    .map((item) => {
      const base = Math.max(...item.variants.map((v) => similarity(text, v)));
      const bonus = item.keywords.some((k) => n.includes(normalize(k))) ? 10 : 0;
      return { item, score: Math.min(100, base + bonus) };
    })
    .sort((a, b) => b.score - a.score);
}

export const FAQ_ANSWER = 75;
export const FAQ_SUGGEST = 55;

export type FaqDecision =
  | { kind: 'answer'; item: FaqItem; score: number; via: 'fuzzy' | 'llm' }
  | { kind: 'suggest'; items: FaqItem[] }
  | { kind: 'none' };

export function decideFuzzy(text: string): FaqDecision {
  const ranked = rankFaq(text);
  const top = ranked[0];
  if (top && top.score >= FAQ_ANSWER) return { kind: 'answer', item: top.item, score: top.score, via: 'fuzzy' };
  const sug = ranked.filter((r) => r.score >= FAQ_SUGGEST).slice(0, 3).map((r) => r.item);
  if (sug.length) return { kind: 'suggest', items: sug };
  return { kind: 'none' };
}
