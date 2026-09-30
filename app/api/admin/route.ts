import * as flow from '@/lib/flow';
import { seedDemo, wipeDemo } from '@/lib/demo';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** Demo/ops endpoint (CRON_SECRET): seed | wipe | time | completed | tick. Used for scripted demo runs and verification. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get('secret') !== process.env.CRON_SECRET) return new Response('forbidden', { status: 403 });
  const op = url.searchParams.get('op');
  const id = url.searchParams.get('id') ?? '';
  try {
    switch (op) {
      case 'seed': return Response.json({ ok: true, text: await seedDemo() });
      case 'wipe': return Response.json({ ok: true, text: await wipeDemo() });
      case 'time': return Response.json({ ok: true, ...(await flow.timeMachine(id, (url.searchParams.get('jump') ?? 'next') as flow.TimeJump)) });
      case 'completed': await flow.markCompleted(id); return Response.json({ ok: true });
      case 'llm': {
        const { explainReport } = await import('@/lib/ai/explain');
        const t0 = Date.now();
        const e = await explainReport(url.searchParams.get('text') ?? 'Полип сигмы 4 мм удалён петлёй. BBPS 7.');
        return Response.json({ ok: true, ms: Date.now() - t0, source: e.source, model: e.model, alarm: e.analysis.alarm, summary: e.summary.ru.slice(0, 300) });
      }
      case 'tick': return Response.json({ ok: true, ...(await flow.tick(id || undefined)) });
      default: return Response.json({ ok: false, error: 'unknown op' }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
