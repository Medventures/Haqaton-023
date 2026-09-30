import { tgApi } from './notify';

let cached: string | null = null;
/** Bot username for t.me links (env override, else getMe once per instance). */
export async function botUsername(): Promise<string | null> {
  if (process.env.TELEGRAM_BOT_USERNAME) return process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, '');
  if (cached) return cached;
  try {
    cached = (await tgApi().getMe()).username ?? null;
  } catch {
    cached = null;
  }
  return cached;
}
