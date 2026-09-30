'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import * as flow from '@/lib/flow';
import * as repo from '@/lib/repo';
import { decideFaq } from '@/lib/faq/decide';
import { t, tc, phaseNames, isTodo } from '@/lib/i18n';
import { questions } from '@/lib/content/screening';
import { requiredTests } from '@/lib/content/tests';
import { redFlagResponse } from '@/lib/content/redflags';
import { detectRedFlag } from '@/lib/rules/redflags';
import { answerFood, dietPhase, extractFoodQuestion } from '@/lib/rules/diet';
import { checkTestDate } from '@/lib/rules/tests';
import { combine, validateSlot } from '@/lib/rules/slots';
import { apptTimes } from '@/lib/render';
import { checkSigned, makeToken, readToken, signValue } from '@/lib/token';
import { fmtDate, parseIsoDay } from '@/lib/time';
import { parsePreText, parseReportText, pdfToText } from '@/lib/pdf/parse';
import type { Answer, Lang, TestRecord } from '@/lib/types';
import type { ReportExplanation } from '@/lib/ai/explain';
import { seedDemo, wipeDemo } from '@/lib/demo';

// ---------- web intake ----------

export interface IntakePayload {
  lang: Lang; name: string; phone: string; consent: boolean;
  date: string; time: string;
  answers: Record<string, Answer>;
  tests: Record<string, TestRecord>;
}

export async function submitIntake(p: IntakePayload): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const lang = p.lang === 'kk' ? 'kk' : 'ru';
  if (!p.consent) return { ok: false, error: t(lang, 'consent_required') };
  const day = parseIsoDay(p.date);
  if (!day || !/^\d{2}:\d{2}$/.test(p.time)) return { ok: false, error: t(lang, 'slot_bad_PAST') };
  const when = combine(day, p.time);
  const slot = validateSlot(when, new Date());
  if (!slot.ok) return { ok: false, error: t(lang, `slot_bad_${slot.reason}`) };
  const answers: Record<string, Answer> = {};
  for (const q of questions) {
    const a = p.answers[q.code];
    if (a !== 'YES' && a !== 'NO' && a !== 'UNKNOWN') {
      if (p.answers.ACUTE_NOW === 'YES') break;
      return { ok: false, error: lang === 'ru' ? 'Ответьте на все вопросы анкеты.' : 'Сауалнаманың барлық сұрағына жауап беріңіз.' };
    }
    answers[q.code] = a;
  }
  const tests: Record<string, TestRecord> = {};
  for (const test of requiredTests) {
    const r = p.tests[test.code];
    if (r?.done) {
      const d = r.date ? parseIsoDay(r.date) : null;
      const c = checkTestDate(d, new Date());
      if (!c.ok) return { ok: false, error: `${test.title[lang]}: ${t(lang, `test_date_${c.reason}`, { example: fmtDate(new Date()) })}` };
      tests[test.code] = { done: true, date: r.date };
    } else tests[test.code] = { done: false };
  }
  const patient = await repo.createPatient({ name: p.name.slice(0, 80) || null, phone: p.phone.slice(0, 30) || null, lang, consent_at: new Date().toISOString() });
  const appt = await repo.createAppt({ patient_id: patient.id, channel: 'web', scheduled_at: when.toISOString(), answers, tests });
  await flow.finalizeIntake(appt);
  return { ok: true, token: makeToken(appt.id) };
}

// ---------- patient cabinet ----------

async function apptFromToken(token: string) {
  const id = readToken(token);
  if (!id) throw new Error('bad token');
  const a = await repo.getAppt(id);
  if (!a) throw new Error('not found');
  const p = await repo.getPatient(a.patient_id);
  return { a, p };
}

export async function patientAction(token: string, action: string, arg?: string): Promise<{ text?: string }> {
  const { a, p } = await apptFromToken(token);
  const lang = p.lang;
  let text: string | undefined;
  const [x, y, z] = (arg ?? '').split(':');
  switch (action) {
    case 'event': text = (await flow.answerEvent(Number(x), y === 'help' ? 'help' : 'done', lang)).text; break;
    case 'stool': text = (await flow.answerStool(Number(x), Number(y), lang)).text; break;
    case 'check': text = (await flow.answerChecklist(Number(x), Number(y), z === 'y', lang)).text; break;
    case 'discuss': await repo.addRequest(a.id, 'DISCUSS', 'web'); await repo.logEvent(a.id, 'discuss_requested'); text = t(lang, 'discuss_sent'); break;
    case 'cancel': await flow.cancelAppointment(a.id, x || 'OTHER'); text = t(lang, 'cancelled'); break;
    case 'specialist': text = (await flow.bookSpecialist(a.id, new Date(Number(x) * 60000), lang)).text; break;
    case 'feedback': {
      await flow.saveFeedback(a.id, { clarity: Number(x) || undefined, completed: y || undefined, comment: decodeURIComponent(z || '') || undefined });
      await repo.logEvent(a.id, 'feedback_done');
      text = t(lang, 'fb_thanks');
      break;
    }
    case 'tests': {
      // arg: CODE=YYYY-MM-DD|no,...
      const tests: Record<string, TestRecord> = {};
      for (const part of (arg ?? '').split(',')) {
        const [code, v] = part.split('=');
        if (!requiredTests.some((tt) => tt.code === code)) continue;
        if (v && v !== 'no') {
          const c = checkTestDate(parseIsoDay(v), new Date());
          if (!c.ok) return { text: t(lang, `test_date_${c.reason}`, { example: fmtDate(new Date()) }) };
          tests[code] = { done: true, date: v };
        } else tests[code] = { done: false };
      }
      const updated = await repo.updateAppt(a.id, { tests: { ...a.tests, ...tests } });
      const r = await flow.finalizeIntake(updated);
      text = flow.intakeMessage(r, updated, lang).text;
      break;
    }
    case 'lang': await repo.updatePatient(p.id, { lang: x === 'kk' ? 'kk' : 'ru' }); break;
  }
  revalidatePath(`/p/${token}`);
  return { text };
}

export async function askQuestion(token: string, question: string): Promise<{ text: string; urgent?: boolean; escalate?: boolean }> {
  const { a, p } = await apptFromToken(token);
  const lang = p.lang;
  const q = question.trim().slice(0, 500);
  if (!q) return { text: t(lang, 'ask_prompt') };
  const rf = detectRedFlag(q);
  if (rf) {
    await flow.reportRedFlag(a.id, rf, 'web');
    return { text: tc(lang, redFlagResponse), urgent: true };
  }
  const product = extractFoodQuestion(q);
  if (product && !/лекарств|таблет|препарат|дәрі|отмен/i.test(q)) {
    const times = apptTimes(a);
    const phase = dietPhase(times, a.scheduled_at ? new Date(a.scheduled_at) : null, repo.nowFor(a), ['COMPLETED', 'RESULTS_READY'].includes(a.status));
    const ans = answerFood(product, phase, times, lang);
    await repo.logEvent(a.id, 'faq_answered', { id: `food:${ans.kind}`, via: 'rules' });
    switch (ans.kind) {
      case 'NO_RESTRICTIONS': return { text: t(lang, 'food_no_restrictions', { date: fmtDate(ans.dietStart) }) };
      case 'ALLOWED': return { text: t(lang, 'food_allowed', { food: ans.food }) };
      case 'ONLY': return { text: t(lang, 'food_only', { phase: phaseNames[ans.phase][lang], list: ans.allowed.join(', ') }) };
      case 'NPO': return { text: t(lang, 'food_npo') };
      case 'AFTER': return { text: t(lang, 'food_after') };
      default: return { text: t(lang, 'food_unknown_plan') };
    }
  }
  const d = await decideFaq(q);
  if (d.kind === 'answer') {
    await repo.logEvent(a.id, 'faq_answered', { id: d.item.id, score: d.score, via: d.via });
    if (d.item.escalate) await repo.addRequest(a.id, 'HELP', `faq:${d.item.id}`);
    return { text: `${tc(lang, d.item.answer)}${isTodo(d.item.source) ? `\n${t(lang, 'todo_review')}` : ''}\n\n${t(lang, 'faq_source', { source: d.item.source })}` };
  }
  await repo.addRequest(a.id, 'FAQ_UNANSWERED', q);
  await repo.logEvent(a.id, 'faq_escalated');
  return { text: t(lang, 'faq_sent'), escalate: true };
}

// ---------- doctor ----------

async function requireDoctor() {
  const c = (await cookies()).get('doc')?.value;
  if (!checkSigned(c, 'doctor')) redirect('/doctor/login');
}

export async function doctorLogin(_: unknown, form: FormData): Promise<{ error?: string }> {
  const pwd = String(form.get('password') ?? '');
  if (!process.env.DOCTOR_PASSWORD || pwd !== process.env.DOCTOR_PASSWORD) return { error: 'Неверный пароль' };
  (await cookies()).set('doc', signValue('doctor'), { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 12, path: '/' });
  redirect('/doctor');
}

export async function doctorLogout() {
  (await cookies()).delete('doc');
  redirect('/doctor/login');
}

export async function doctorParsePdf(form: FormData): Promise<{ ok: boolean; kind?: 'PRE' | 'REPORT'; pre?: ReturnType<typeof parsePreText>; report?: string; error?: string }> {
  await requireDoctor();
  const file = form.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Файл не выбран' };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: 'Файл больше 10 МБ' };
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return { ok: false, error: 'Нужен PDF с текстовым слоем' };
  try {
    const text = await pdfToText(await file.arrayBuffer());
    if (/ЗАКЛЮЧЕНИЕ КОЛОНОСКОПИИ/i.test(text)) return { ok: true, kind: 'REPORT', report: parseReportText(text) };
    return { ok: true, kind: 'PRE', pre: parsePreText(text) };
  } catch {
    return { ok: false, error: 'Не удалось прочитать PDF — заполните поля вручную' };
  }
}

export async function doctorPublishPre(apptId: string, d: flow.PreDecision): Promise<{ ok: boolean; error?: string }> {
  await requireDoctor();
  const res = await flow.doctorPublishPre(apptId, d);
  revalidatePath(`/doctor/${apptId}`);
  return res;
}

export async function doctorPrepareReport(text: string): Promise<ReportExplanation> {
  await requireDoctor();
  return flow.prepareReport(text);
}

export async function doctorPublishReport(apptId: string, text: string, explanation: ReportExplanation): Promise<void> {
  await requireDoctor();
  await flow.publishReport(apptId, text, explanation);
  revalidatePath(`/doctor/${apptId}`);
}

export async function doctorAction(apptId: string, action: string, arg?: string): Promise<{ text?: string }> {
  await requireDoctor();
  let text: string | undefined;
  switch (action) {
    case 'completed': await flow.markCompleted(apptId); text = 'Отмечено: процедура проведена. Пациенту отправлены памятка и опрос.'; break;
    case 'resolve': await repo.resolveFlag(Number(arg)); break;
    case 'request_done': await import('@/lib/db').then(({ db }) => db().from('requests').update({ status: 'DONE' }).eq('id', Number(arg))); break;
    case 'time': {
      const r = await flow.timeMachine(apptId, arg as flow.TimeJump);
      text = `Демо-время сдвинуто на ${Math.round(r.offsetSec / 3600)} ч; отправлено событий: ${r.sent}`;
      break;
    }
    case 'tick': text = `Отправлено: ${(await flow.tick(apptId)).sent}`; break;
    case 'review': {
      // Coordinator/doctor closed the questions without a PDF: back to the normal path.
      const a = (await repo.getAppt(apptId))!;
      await repo.updateAppt(apptId, { status: 'WAITING_DOCTOR' });
      await repo.logEvent(a.id, 'review_closed');
      break;
    }
  }
  revalidatePath(`/doctor/${apptId}`);
  revalidatePath('/doctor');
  return { text };
}

export async function doctorDemo(action: 'seed' | 'wipe'): Promise<{ text: string }> {
  await requireDoctor();
  const text = action === 'seed' ? await seedDemo() : await wipeDemo();
  revalidatePath('/doctor');
  return { text };
}
