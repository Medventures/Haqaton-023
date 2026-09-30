import { tick } from '@/lib/flow';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function allowed(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get('x-cron-secret') === secret || req.headers.get('authorization') === `Bearer ${secret}` || url.searchParams.get('secret') === secret;
}

async function handle(req: Request) {
  if (!allowed(req)) return new Response('forbidden', { status: 403 });
  const res = await tick();
  return Response.json(res);
}
export const GET = handle;
export const POST = handle;
