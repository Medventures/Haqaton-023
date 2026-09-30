import { commonFoods, phases, type DietPhase, type Food } from '../content/diet';
import { toLocal } from '../time';
import type { Lang } from '../types';
import { normalize } from './text';
import type { DoseTimes } from './timeline';

export function dietPhase(t: DoseTimes | null, procedure: Date | null, now: Date, completed = false): DietPhase {
  if (completed) return 'AFTER';
  if (!t || !procedure) return 'UNKNOWN';
  if (now < t.dietStart) return 'NONE';
  if (now < t.brothStart) return 'DIET';
  if (now < t.clearStart) return 'BROTH';
  if (now < t.liquidStop) return 'CLEAR';
  if (now < new Date(procedure.getTime() + 3 * 3_600_000)) return 'NPO';
  return 'AFTER';
}

const allFoods: Food[] = [...new Map([...phases.DIET.allowed].map((f) => [f.ru, f])).values()];

/** Extracts X from «можно ли X?», «можно X», «X можно?», «X болады ма». Returns null if not a food question. */
export function extractFoodQuestion(text: string): string | null {
  const n = normalize(text);
  let m = n.match(/^(а\s+)?можно\s+(ли\s+)?(мне\s+)?(есть|кушать|поесть|пить|выпить|попить|съесть)?\s*(.+)$/);
  if (m) return m[5].replace(/\s*(сегодня|сейчас|перед колоноскопией|перед процедурой)\s*$/, '').trim() || null;
  m = n.match(/^(.+?)\s+(можно|разрешено|нельзя)(\s+ли)?(\s+(есть|пить|кушать))?$/);
  if (m) return m[1].trim();
  m = n.match(/^(.+?)\s+(жеуге|ішуге)?\s*бола\s*ма$/);
  if (m) return m[1].trim();
  return null;
}

function matchFood(product: string): Food | null {
  const p = ` ${product} `;
  let best: { f: Food; len: number } | null = null;
  for (const f of allFoods) {
    for (const s of [f.ru, f.kk, ...(f.syn ?? [])].map(normalize)) {
      if (s && p.includes(` ${s}`) && (!best || s.length > best.len)) best = { f, len: s.length };
    }
  }
  return best?.f ?? null;
}

export type FoodAnswer =
  | { kind: 'NO_RESTRICTIONS'; dietStart: Date }
  | { kind: 'ALLOWED'; food: string; phase: DietPhase }
  | { kind: 'ONLY'; allowed: string[]; phase: DietPhase; known: boolean }
  | { kind: 'NPO' }
  | { kind: 'AFTER' }
  | { kind: 'UNKNOWN_PLAN' };

export function answerFood(product: string, phase: DietPhase, t: DoseTimes | null, lang: Lang): FoodAnswer {
  if (phase === 'UNKNOWN') return { kind: 'UNKNOWN_PLAN' };
  if (phase === 'NONE') return { kind: 'NO_RESTRICTIONS', dietStart: t!.dietStart };
  if (phase === 'NPO') return { kind: 'NPO' };
  if (phase === 'AFTER') return { kind: 'AFTER' };
  const allowed = phases[phase].allowed;
  const food = matchFood(normalize(product));
  if (food && allowed.some((a) => a.ru === food.ru)) return { kind: 'ALLOWED', food: food[lang], phase };
  const known = !!food || commonFoods.some((c) => normalize(product).includes(c));
  return { kind: 'ONLY', allowed: allowed.map((a) => a[lang]), phase, known };
}

