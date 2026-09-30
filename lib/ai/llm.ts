import Anthropic from '@anthropic-ai/sdk';

/**
 * LLM adapter. The product never depends on the LLM being available:
 * every caller has a deterministic fallback.
 *
 * LLM_PROVIDER=anthropic  → Claude via the official SDK (hackathon demo)
 * LLM_PROVIDER=openai     → any OpenAI-compatible server, e.g. a local open-source
 *                            model in Ollama (OPENAI_BASE_URL=http://localhost:11434/v1, LLM_MODEL=qwen2.5:7b)
 * LLM_PROVIDER=none       → rules only
 */
const provider = (process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'none')).toLowerCase();
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 40000);

/** Name of the last failure (no content), shown to the doctor as the reason for the rules fallback. */
export let lastLlmError: string | null = null;

export const llmEnabled = provider !== 'none';
export const llmName = provider === 'anthropic' ? (process.env.LLM_MODEL || 'claude-opus-5-5') : provider === 'openai' ? (process.env.LLM_MODEL || 'local') : 'none';

let client: Anthropic | null = null;

async function anthropicText(system: string, user: string, maxTokens: number): Promise<string | null> {
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const response = await client.beta.messages.create({
    model: process.env.LLM_MODEL || 'claude-opus-5-5',
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: user }],
  } as Anthropic.Beta.MessageCreateParamsNonStreaming);
  if (response.stop_reason === 'refusal') return null;
  return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim() || null;
}

async function openaiText(system: string, user: string, maxTokens: number): Promise<string | null> {
  const base = process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.OPENAI_API_KEY ? { authorization: `Bearer ${process.env.OPENAI_API_KEY}` } : {}) },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'qwen2.5:7b',
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() || null;
}

/** Returns the first JSON object in the model output, or null on any failure. */
export async function completeJson<T>(system: string, user: string, maxTokens = 4000): Promise<T | null> {
  if (!llmEnabled) return null;
  lastLlmError = null;
  try {
    const text = provider === 'anthropic' ? await anthropicText(system, user, maxTokens) : await openaiText(system, user, maxTokens);
    if (!text) { lastLlmError = 'empty_or_refusal'; return null; }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) { lastLlmError = 'no_json'; return null; }
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch (err) {
    // Never log prompt content: it may contain medical text.
    lastLlmError = err instanceof Error ? `${err.name}${'status' in err ? ` ${(err as { status?: number }).status}` : ''}` : 'unknown';
    console.error('llm_error', provider, lastLlmError);
    return null;
  }
}
