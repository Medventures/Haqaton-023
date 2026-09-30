import { tgApi } from '@/lib/notify';
import { baseUrl } from '@/lib/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const commands = {
  ru: [
    { command: 'start', description: 'Начать или продолжить подготовку' },
    { command: 'status', description: 'Мой визит и следующий шаг' },
    { command: 'plan', description: 'План подготовки' },
    { command: 'ask', description: 'Задать вопрос' },
    { command: 'contact', description: 'Связаться с клиникой' },
    { command: 'lang', description: 'Сменить язык / Тілді ауыстыру' },
    { command: 'cancel', description: 'Отменить или перенести визит' },
    { command: 'help', description: 'Помощь' },
  ],
  kk: [
    { command: 'start', description: 'Дайындықты бастау немесе жалғастыру' },
    { command: 'status', description: 'Менің сапарым және келесі қадам' },
    { command: 'plan', description: 'Дайындық жоспары' },
    { command: 'ask', description: 'Сұрақ қою' },
    { command: 'contact', description: 'Клиникамен байланыс' },
    { command: 'lang', description: 'Тілді ауыстыру / Сменить язык' },
    { command: 'cancel', description: 'Сапарды болдырмау немесе ауыстыру' },
    { command: 'help', description: 'Көмек' },
  ],
};

/** One-time setup: registers the webhook and bot commands. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get('secret') !== process.env.CRON_SECRET) return new Response('forbidden', { status: 403 });
  const api = tgApi();
  const origin = url.searchParams.get('origin') || baseUrl();
  const hook = `${origin}/api/telegram`;
  await api.setWebhook(hook, { secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
  await api.setMyCommands(commands.ru);
  await api.setMyCommands(commands.ru, { language_code: 'ru' });
  await api.setMyCommands(commands.kk, { language_code: 'kk' });
  await api.setMyDescription('Ассистент Prime Green Clinic: подготовка к колоноскопии — противопоказания, анализы, план, напоминания, объяснение заключения. Не заменяет врача.');
  await api.setMyShortDescription('Подготовка к колоноскопии — Prime Green Clinic (демо)');
  const me = await api.getMe();
  const info = await api.getWebhookInfo();
  return Response.json({ bot: `@${me.username}`, webhook: info.url, pending: info.pending_update_count, last_error: info.last_error_message ?? null });
}
