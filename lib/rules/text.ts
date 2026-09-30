// Text helpers shared by red flags, FAQ, diet and report rules.

/** Lowercase, ё→е, punctuation → spaces, collapsed whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * JS `\w` and `\b` are ASCII-only, so `кров\w*` would not match «крови».
 * Content files are written with `\w` for readability; we compile them into
 * Unicode-aware regexes here.
 */
export function uni(re: RegExp): RegExp {
  const src = re.source.replace(/\\w/g, '[\\p{L}\\p{N}_]');
  const flags = re.flags.includes('u') ? re.flags : re.flags + 'u';
  return new RegExp(src, flags);
}

export function fill(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
}
