import { redFlagExclusions, redFlagPatterns } from '../content/redflags';
import { normalize, uni } from './text';

const patterns = redFlagPatterns.map((p) => ({ code: p.code, re: uni(p.re) }));
const exclusions = redFlagExclusions.map(uni);

/** Returns the red-flag code or null. Runs before FAQ on every free-text message. */
export function detectRedFlag(text: string): string | null {
  let n = normalize(text);
  for (const ex of exclusions) n = n.replace(ex, ' ');
  for (const p of patterns) if (p.re.test(n)) return p.code;
  return null;
}
