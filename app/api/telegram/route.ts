import type { Update } from 'grammy/types';
import { createBot } from '@/lib/bot/bot';
import { firstTimeUpdate } from '@/lib/repo';

export const runtime = 'nodejs';
export const maxDuration = 60;

let bot: ReturnType<typeof createBot> | null = null;
let ready: Promise<void> | null = null;

export async function POST(req: Request) {
  if (process.env.TELEGRAM_WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const update = (await req.json()) as Update;
  // Telegram retries on non-2xx; process each update once.
  if (!(await firstTimeUpdate(update.update_id))) return new Response('dup');
  bot ??= createBot(process.env.TELEGRAM_BOT_TOKEN!);
  ready ??= bot.init();
  await ready;
  try {
    await bot.handleUpdate(update);
  } catch (err) {
    console.error('update_failed', err instanceof Error ? err.message.slice(0, 200) : 'unknown');
  }
  return new Response('ok');
}
