import { Api } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';

export type Btn = { text: string; data: string } | { text: string; url: string };
export interface OutMsg { text: string; buttons?: Btn[][] }

let api: Api | null = null;
export function tgApi(): Api {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  api ??= new Api(process.env.TELEGRAM_BOT_TOKEN);
  return api;
}

const canUseUrl = (url: string) => url.startsWith('https://');

export function toKeyboard(buttons?: Btn[][]): { inline_keyboard: InlineKeyboardButton[][] } | undefined {
  if (!buttons?.length) return undefined;
  const rows = buttons
    .map((row) => row
      .filter((b) => !('url' in b) || canUseUrl(b.url)) // Telegram rejects localhost URLs in buttons
      .map((b): InlineKeyboardButton => ('url' in b ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data })))
    .filter((r) => r.length);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

/** Sends to Telegram if the patient has linked a chat. Returns true when delivered or when there is no chat (web-only). */
export async function sendToChat(chatId: number | null | undefined, msg: OutMsg): Promise<boolean> {
  if (!chatId) return true;
  try {
    await tgApi().sendMessage(chatId, msg.text, { reply_markup: toKeyboard(msg.buttons), link_preview_options: { is_disabled: true } });
    return true;
  } catch (err) {
    console.error('tg_send_failed', err instanceof Error ? err.message.slice(0, 120) : 'unknown');
    return false;
  }
}
