import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => {
  const s = process.env.SIGNING_SECRET;
  if (!s) throw new Error('SIGNING_SECRET is not set');
  return s;
};
const b64 = (b: Buffer) => b.toString('base64url');
const sign = (payload: string) => b64(createHmac('sha256', secret()).update(payload).digest()).slice(0, 32);

export const TOKEN_TTL_DAYS = 30;

/** Signed link token for the patient page: <appointmentId>.<expUnix>.<sig> */
export function makeToken(appointmentId: string, ttlDays = TOKEN_TTL_DAYS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const payload = `${appointmentId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return id;
}

export function signValue(value: string): string {
  return `${value}.${sign(`v:${value}`)}`;
}
export function checkSigned(signed: string | undefined, value: string): boolean {
  if (!signed) return false;
  const expected = signValue(value);
  return signed.length === expected.length && timingSafeEqual(Buffer.from(signed), Buffer.from(expected));
}

export function baseUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export const patientUrl = (appointmentId: string) => `${baseUrl()}/p/${makeToken(appointmentId)}`;
