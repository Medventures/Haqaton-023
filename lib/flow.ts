import { checklist, checklistReplies, postcare, stoolReplies } from './content/checks';
import { specialistNames } from './content/report';
import { questionByCode } from './content/screening';
import { testByCode } from './content/tests';
import { explainReport, type ReportExplanation } from './ai/explain';
import { t, tc } from './i18n';
import { sendToChat, type OutMsg } from './notify';
import { apptTimes, checklistQuestion, planButton, renderEvent } from './render';
import * as repo from './repo';
import type { Appt, Patient, PrepEvent } from './repo';
import { evaluateScreening } from './rules/screening';
import { validateSlot } from './rules/slots';
import { evaluateTests, type TestIssue } from './rules/tests';
import { buildTimeline } from './rules/timeline';
import { addDays, addMin, atLocal, fmtDate, fmtDateTime, fmtTime, localDay, toLocal } from './time';
import { patientUrl } from './token';
import type { Flag, Lang, PrepScheme, Status } from './types';
import { db, must } from './db';
import { detectRedFlag } from './rules/redflags';

// ---------- intake ----------

export interface IntakeResult {
  status: Status;
  urgent: boolean;
  flags: Flag[];
  testIssues: TestIssue[];
  slotSupported: boolean;
}

/** Evaluates questionnaire + tests + slot, stores flags/requests and moves the status. Idempotent. */
export async function finalizeIntake(a: Appt): Promise<IntakeResult> {
  const now = new Date();
  const screening = evaluateScreening(a.answers);
  const procedure = a.scheduled_at ? new Date(a.scheduled_at) : null;
  const slot = procedure ? validateSlot(procedure, now) : null;
  const tests = procedure ? evaluateTests(a.tests, procedure) : { ok: false, issues: [] };
  const flags: Flag[] = [...screening.flags];
  const slotSupported = !!(slot && slot.ok && slot.supported);
  if (slot && slot.ok && !slot.supported) flags.push({ code: 'SLOT_NOT_IN_MEMO', severity: 'MEDIUM', assignee: 'DOCTOR', note: procedure ? fmtTime(procedure) : undefined });

  for (const f of flags) await repo.raiseFlag(a.id, f);

  let status: Status;
  if (screening.urgent) status = 'NEEDS_CLINIC_REVIEW';
  else if (flags.length) status = 'NEEDS_CLINIC_REVIEW';
  else if (!tests.ok) status = 'TESTS_PENDING';
  else status = 'WAITING_DOCTOR';

  if (flags.length) {
    const existing = await repo.requestsFor(a.id);
    const type = screening.urgent ? 'URGENT' : 'DISCUSS';
    if (!existing.some((r) => r.type === type && r.status === 'OPEN')) {
      await repo.addRequest(a.id, type, flags.map((f) => f.code).join(', '));
    }
  }
  await repo.updateAppt(a.id, { status, bot_state: { ...a.bot_state, step: 'DONE' } });
  await repo.logEvent(a.id, 'intake_finalized', { status, flags: flags.length, tests_ok: tests.ok });
  return { status, urgent: screening.urgent, flags, testIssues: tests.issues, slotSupported };
}

export function intakeMessage(r: IntakeResult, a: Appt, lang: Lang): OutMsg {
  const lines: string[] = [];
  if (r.urgent) return { text: t(lang, 'res_urgent') };
  const screenFlags = r.flags.filter((f) => f.code.startsWith('SCREEN_'));
  if (screenFlags.length) {
    lines.push(t(lang, 'res_review'));
    lines.push('', t(lang, 'res_review_items'));
    for (const f of screenFlags) {
      const q = questionByCode[f.code.replace('SCREEN_', '')];
      if (!q) continue;
      lines.push(`• ${q.text[lang]}`);
      if (q.onFlagText) lines.push(`  ↳ ${q.onFlagText[lang]}`);
    }
  }
  if (r.flags.some((f) => f.code === 'SLOT_NOT_IN_MEMO') && a.scheduled_at) {
    lines.push('', t(lang, 'res_slot_review', { time: fmtTime(new Date(a.scheduled_at)) }));
  }
  const missing = r.testIssues.filter((i) => i.kind !== 'MISSING_ANSWER');
  if (missing.length) {
    lines.push('', t(lang, 'res_tests'));
    for (const i of missing) lines.push(t(lang, 'res_test_line', { title: testByCode[i.code].title[lang], from: i.retakeFrom, by: i.retakeBy }));
    lines.push(t(lang, 'res_tests_after'));
  }
  if (r.status === 'WAITING_DOCTOR') lines.push(t(lang, 'res_wait_doctor'));
  const buttons: OutMsg['buttons'] = [[planButton(a, lang)]];
  if (r.status === 'NEEDS_CLINIC_REVIEW') buttons.unshift([{ text: t(lang, 'discuss_btn'), data: 'disc' }]);
  if (missing.length) buttons.unshift([{ text: t(lang, 'tests_update_btn'), data: 'tupd' }]);
  return { text: lines.join('\n').trim(), buttons };
}

// ---------- doctor decisions ----------

export interface PreDecision {
  clearance: 'CLEARED' | 'NOT_CLEARED' | 'CONSULT';
  drug: string;
  scheme: PrepScheme;
  liquidStopHours: number;
  labs: { indicator: string; value: string; units: string; reference: string; mark: string }[];
  conclusions: string[];
  instructions: string[];
}

export async function doctorPublishPre(apptId: string, d: PreDecision): Promise<{ ok: boolean; error?: string }> {
  const a = await repo.getAppt(apptId);
  if (!a) return { ok: false, error: 'not found' };
  const patient = await repo.getPatient(a.patient_id);
  await repo.upsertDoc(a.id, 'PRE', { parsed: d as unknown as Record<string, unknown>, published: true, published_at: new Date().toISOString() });

  if (d.clearance !== 'CLEARED') {
    await repo.updateAppt(a.id, { status: 'NOT_CLEARED' });
    await sendToChat(patient.tg_chat_id, { text: `${t(patient.lang, 'doc_checked')}\n${t(patient.lang, 'doc_not_cleared')}`, buttons: [[planButton(a, patient.lang)]] });
    await repo.logEvent(a.id, 'doctor_not_cleared');
    return { ok: true };
  }
  if (!a.scheduled_at) return { ok: false, error: 'no date' };
  const updated = await repo.updateAppt(a.id, { prep_drug: d.drug, prep_scheme: d.scheme, liquid_stop_hours: d.liquidStopHours });
  const now = repo.nowFor(updated);
  const tl = buildTimeline({
    procedure: new Date(a.scheduled_at),
    scheme: d.scheme,
    extendedDiet: a.answers.CONSTIPATION === 'YES' || a.answers.CONSTIPATION === 'UNKNOWN',
    liquidStopHours: d.liquidStopHours,
  }, now);
  if (!tl) return { ok: false, error: 'Для этого времени процедуры памятка не задаёт окна приёма препарата. Выберите схему SINGLE_EVENING или перенесите время на 08:00–13:30.' };

  // Rebuild the plan from scratch (doctor may republish).
  must(await db().from('prep_events').delete().eq('appointment_id', a.id).in('status', ['PENDING', 'SKIPPED']), 'clear plan');
  must(await db().from('prep_events').upsert(
    tl.events.map((e) => ({ appointment_id: a.id, code: e.code, kind: e.kind, due_at: e.dueAt.toISOString(), status: e.status, value: e.value ?? null, attempts: 0 })),
    { onConflict: 'appointment_id,code', ignoreDuplicates: true },
  ), 'insert plan');
  if (tl.lateDiet) await repo.raiseFlag(a.id, { code: 'LATE_BOOKING', severity: 'MEDIUM', assignee: 'COORDINATOR', note: 'diet shorter than recommended' });
  // Doctor's decision closes the screening flags.
  must(await db().from('flags').update({ status: 'RESOLVED', resolved_at: new Date().toISOString() }).eq('appointment_id', a.id).like('code', 'SCREEN_%').neq('severity', 'URGENT'), 'resolve screening flags');
  await repo.updateAppt(a.id, { status: 'PREPARATION' });
  await sendToChat(patient.tg_chat_id, { text: `${t(patient.lang, 'doc_checked')}\n${t(patient.lang, 'doc_cleared', { drug: d.drug })}`, buttons: [[planButton(a, patient.lang)]] });
  await repo.logEvent(a.id, 'doctor_cleared', { scheme: d.scheme });
  await tick(a.id);
  return { ok: true };
}

// ---------- reminders ----------

const ACTIVE: Status[] = ['PREPARATION', 'PREP_PROBLEM', 'READY'];

/** Sends every due PENDING event. Safe to run concurrently: each event is claimed atomically. */
export async function tick(onlyApptId?: string): Promise<{ sent: number; checked: number }> {
  let q = db().from('prep_events').select('*, appointments!inner(*, patients!inner(*))').eq('status', 'PENDING').in('appointments.status', ACTIVE).order('due_at').limit(300);
  if (onlyApptId) q = q.eq('appointment_id', onlyApptId);
  const rows = must(await q, 'due events') as (PrepEvent & { appointments: Appt & { patients: Patient } })[];
  let sent = 0;
  for (const row of rows) {
    const { appointments: appt, ...ev } = row;
    const patient = appt.patients;
    if (new Date(ev.due_at) > repo.nowFor(appt)) continue;
    if (!(await repo.claimEvent(ev.id, 'PENDING', 'SENDING'))) continue;
    const ok = await deliverEvent(appt, patient, ev);
    if (ok) {
      await repo.updateEvent(ev.id, { status: 'SENT', sent_at: new Date().toISOString(), attempts: ev.attempts + 1 });
      sent++;
    } else {
      const attempts = ev.attempts + 1;
      await repo.updateEvent(ev.id, { status: attempts >= 3 ? 'FAILED' : 'PENDING', attempts });
    }
  }
  return { sent, checked: rows.length };
}

async function deliverEvent(a: Appt, p: Patient, ev: PrepEvent): Promise<boolean> {
  if (ev.kind === 'nag') {
    const target = must(await db().from('prep_events').select('*').eq('appointment_id', a.id).eq('code', ev.value?.target as string).maybeSingle(), 'nag target') as PrepEvent | null;
    if (!target || ['CONFIRMED', 'HELP'].includes(target.status)) {
      await repo.updateEvent(ev.id, { status: 'CANCELLED' });
      return true;
    }
    if (ev.value?.final) {
      await repo.raiseFlag(a.id, { code: `${target.code}_NOT_CONFIRMED`, severity: 'HIGH', assignee: 'DOCTOR' });
      await repo.logEvent(a.id, 'prep_violation', { kind: 'dose_not_confirmed', code: target.code });
    }
    return sendToChat(p.tg_chat_id, renderEvent(a, ev, p.lang, target.id));
  }
  if (ev.code === 'DIET_START' && ev.value?.late) await repo.logEvent(a.id, 'late_booking');
  return sendToChat(p.tg_chat_id, renderEvent(a, ev, p.lang));
}

export async function answerEvent(evId: number, action: 'done' | 'help', lang: Lang): Promise<OutMsg> {
  const ev = await repo.getEvent(evId);
  if (!ev) return { text: t(lang, 'ev_already') };
  const a = (await repo.getAppt(ev.appointment_id))!;
  if (action === 'help') {
    await repo.updateEvent(ev.id, { status: 'HELP', confirmed_at: new Date().toISOString() });
    await repo.addRequest(a.id, 'HELP', ev.code);
    await repo.raiseFlag(a.id, { code: `HELP_${ev.code}`, severity: ev.kind === 'confirm' ? 'HIGH' : 'MEDIUM', assignee: ev.kind === 'confirm' ? 'DOCTOR' : 'COORDINATOR' });
    await repo.logEvent(a.id, 'help_requested', { code: ev.code });
    return { text: t(lang, 'ev_help_sent') };
  }
  const ok = await repo.claimEvent(ev.id, 'SENT', 'CONFIRMED', { confirmed_at: new Date().toISOString() })
    || await repo.claimEvent(ev.id, 'PENDING', 'CONFIRMED', { confirmed_at: new Date().toISOString() });
  return { text: t(lang, ok ? 'ev_thanks' : 'ev_already') };
}

export async function answerStool(evId: number, value: number, lang: Lang): Promise<OutMsg> {
  const ev = await repo.getEvent(evId);
  if (!ev) return { text: t(lang, 'ev_already') };
  if (!(await repo.claimEvent(ev.id, 'SENT', 'CONFIRMED', { confirmed_at: new Date().toISOString(), value: { ...ev.value, stool: value } }))
    && !(await repo.claimEvent(ev.id, 'PENDING', 'CONFIRMED', { confirmed_at: new Date().toISOString(), value: { ...ev.value, stool: value } }))) {
    return { text: t(lang, 'ev_already') };
  }
  const a = (await repo.getAppt(ev.appointment_id))!;
  await repo.logEvent(a.id, 'stool_check', { code: ev.code, value });
  const final = !!ev.value?.final;
  if (!final) return { text: tc(lang, value === 1 ? stoolReplies.evening_brown : stoolReplies.evening_ok) };
  if (value === 4) return { text: tc(lang, stoolReplies.morning_ok) };
  await repo.raiseFlag(a.id, { code: 'PREP_STOOL_NOT_CLEAR', severity: 'HIGH', assignee: 'DOCTOR', note: `stool=${value}` });
  await repo.updateAppt(a.id, { status: 'PREP_PROBLEM' });
  await repo.logEvent(a.id, 'prep_violation', { kind: 'stool_not_clear', value });
  return { text: tc(lang, stoolReplies.morning_bad) };
}

/** Morning checklist: one item per call. Returns the next question or the verdict. */
export async function answerChecklist(evId: number, idx: number, yes: boolean, lang: Lang): Promise<OutMsg> {
  const ev = await repo.getEvent(evId);
  if (!ev || ['CONFIRMED'].includes(ev.status)) return { text: t(lang, 'ev_already') };
  const answers = { ...((ev.value?.answers as Record<string, boolean>) ?? {}) };
  if (answers[checklist[idx].code] !== undefined) return { text: t(lang, 'ev_already') };
  answers[checklist[idx].code] = yes;
  const next = idx + 1;
  if (next < checklist.length) {
    await repo.updateEvent(ev.id, { value: { ...ev.value, answers } });
    const extra = !yes && !checklist[idx].critical ? `${tc(lang, checklistReplies.minor_no)}\n\n` : '';
    const q = checklistQuestion(ev.id, next, lang);
    return { text: extra + q.text, buttons: q.buttons };
  }
  await repo.updateEvent(ev.id, { status: 'CONFIRMED', confirmed_at: new Date().toISOString(), value: { ...ev.value, answers } });
  const a = (await repo.getAppt(ev.appointment_id))!;
  const criticalNo = checklist.filter((c) => c.critical && answers[c.code] === false).map((c) => c.code);
  if (criticalNo.length) {
    await repo.raiseFlag(a.id, { code: 'PREP_CHECKLIST_FAILED', severity: 'HIGH', assignee: 'DOCTOR', note: criticalNo.join(',') });
    await repo.updateAppt(a.id, { status: 'PREP_PROBLEM' });
    await repo.logEvent(a.id, 'prep_violation', { kind: 'checklist', items: criticalNo });
    return { text: tc(lang, checklistReplies.critical_no) };
  }
  if (a.status === 'PREPARATION') await repo.updateAppt(a.id, { status: 'READY' });
  await repo.logEvent(a.id, 'ready');
  return { text: tc(lang, a.status === 'PREP_PROBLEM' ? checklistReplies.critical_no : checklistReplies.ok) };
}

// ---------- after the procedure ----------

export async function markCompleted(apptId: string): Promise<void> {
  const a = (await repo.getAppt(apptId))!;
  const p = await repo.getPatient(a.patient_id);
  must(await db().from('prep_events').update({ status: 'CANCELLED' }).eq('appointment_id', a.id).eq('status', 'PENDING'), 'cancel pending');
  await repo.updateAppt(a.id, { status: 'COMPLETED', bot_state: { ...a.bot_state, step: 'FEEDBACK_1' } });
  await repo.logEvent(a.id, 'completed');
  await sendToChat(p.tg_chat_id, { text: tc(p.lang, postcare) });
  await sendToChat(p.tg_chat_id, feedbackQ1(p.lang));
}

export const feedbackQ1 = (lang: Lang): OutMsg => ({
  text: t(lang, 'fb_q1'),
  buttons: [[1, 2, 3, 4, 5].map((n) => ({ text: String(n), data: `fb:c:${n}` }))],
});
export const feedbackQ2 = (lang: Lang): OutMsg => ({
  text: t(lang, 'fb_q2'),
  buttons: [[{ text: t(lang, 'fb_full'), data: 'fb:p:yes' }, { text: t(lang, 'fb_partly'), data: 'fb:p:partly' }, { text: t(lang, 'no'), data: 'fb:p:no' }]],
});

export async function saveFeedback(apptId: string, patch: { clarity?: number; completed?: string; comment?: string }): Promise<void> {
  must(await db().from('feedback').upsert({ appointment_id: apptId, ...patch }, { onConflict: 'appointment_id' }), 'feedback');
}

export async function prepareReport(text: string): Promise<ReportExplanation> {
  return explainReport(text);
}

export async function publishReport(apptId: string, text: string, explanation: ReportExplanation): Promise<void> {
  const a = (await repo.getAppt(apptId))!;
  const p = await repo.getPatient(a.patient_id);
  await repo.upsertDoc(a.id, 'REPORT', { parsed: { text }, explanation: explanation as unknown as Record<string, unknown>, published: true, published_at: new Date().toISOString() });
  await repo.updateAppt(a.id, { status: 'RESULTS_READY' });
  await repo.logEvent(a.id, 'results_published', { alarm: explanation.analysis.alarm, source: explanation.source });
  if (explanation.analysis.alarm >= 2) await repo.raiseFlag(a.id, { code: 'REPORT_ALARM', severity: 'HIGH', assignee: 'COORDINATOR', note: 'specialist appointment offered' });
  const buttons: OutMsg['buttons'] = [[{ text: t(p.lang, 'open_cabinet'), url: patientUrl(a.id) }]];
  let text2 = t(p.lang, 'results_ready');
  if (explanation.analysis.alarm >= 1) {
    text2 += `\n\n${t(p.lang, 'results_consult')}`;
    buttons.unshift([{ text: t(p.lang, 'spec_btn'), data: 'spec' }]);
  }
  await sendToChat(p.tg_chat_id, { text: text2, buttons });
}

/** Three nearest working slots for a specialist visit (demo schedule). */
export function specialistSlots(from: Date): Date[] {
  const out: Date[] = [];
  for (let i = 1; out.length < 3 && i < 10; i++) {
    const d = addDays(localDay(from), i);
    if (toLocal(d).dow === 0) continue;
    out.push(atLocal(d, 0, out.length % 2 === 0 ? 10 : 15, 0));
  }
  return out;
}

export async function bookSpecialist(apptId: string, when: Date, lang: Lang): Promise<OutMsg> {
  const a = (await repo.getAppt(apptId))!;
  const doc = await repo.docFor(a.id, 'REPORT');
  const expl = doc?.explanation as unknown as ReportExplanation | undefined;
  const spec = expl?.analysis.specialist ?? 'GASTRO';
  const existing = (await repo.requestsFor(a.id)).find((r) => r.type === 'SPECIALIST' && r.status !== 'CANCELLED');
  if (!existing) {
    await repo.addRequest(a.id, 'SPECIALIST', specialistNames[spec].ru, { when: when.toISOString(), specialist: spec, priority: (expl?.analysis.alarm ?? 0) >= 2 ? 'HIGH' : 'NORMAL' });
    await repo.logEvent(a.id, 'specialist_booked', { alarm: expl?.analysis.alarm ?? 0 });
  }
  const w = existing ? new Date(existing.meta.when as string) : when;
  return { text: t(lang, 'spec_booked', { spec: specialistNames[spec][lang], when: fmtDateTime(w) }) };
}

// ---------- misc patient actions ----------

export async function cancelAppointment(apptId: string, reason: string): Promise<void> {
  must(await db().from('prep_events').update({ status: 'CANCELLED' }).eq('appointment_id', apptId).eq('status', 'PENDING'), 'cancel events');
  await repo.updateAppt(apptId, { status: 'CANCELLED', cancel_reason: reason });
  await repo.addRequest(apptId, 'CANCEL', reason);
  await repo.logEvent(apptId, 'cancelled', { reason });
}

export async function reportRedFlag(apptId: string | null, code: string, channel: string): Promise<void> {
  if (!apptId) return;
  await repo.raiseFlag(apptId, { code: `RED_${code}`, severity: 'URGENT', assignee: 'DOCTOR' });
  await repo.addRequest(apptId, 'URGENT', code, { channel });
  await repo.logEvent(apptId, 'red_flag', { code });
}

export { detectRedFlag };

// ---------- demo time machine ----------

export type TimeJump = 'next' | 'plus1h' | 'plus1d' | 'dose1' | 'morning' | 'after' | 'reset';

export async function timeMachine(apptId: string, jump: TimeJump): Promise<{ offsetSec: number; sent: number }> {
  const a = (await repo.getAppt(apptId))!;
  const now = Date.now();
  let target = repo.nowFor(a).getTime();
  const P = a.scheduled_at ? new Date(a.scheduled_at) : null;
  const tt = apptTimes(a);
  switch (jump) {
    case 'reset': target = now; break;
    case 'plus1h': target += 3_600_000; break;
    case 'plus1d': target += 86_400_000; break;
    case 'dose1': if (tt) target = addMin(tt.dose1Start, 1).getTime(); break;
    case 'morning': if (P) target = addMin(P, -119).getTime(); break;
    case 'after': if (P) target = addMin(P, 60).getTime(); break;
    case 'next': {
      const next = (await repo.eventsFor(a.id)).find((e) => e.status === 'PENDING' && new Date(e.due_at).getTime() > target);
      if (next) target = new Date(next.due_at).getTime() + 1000;
      break;
    }
  }
  const offsetSec = Math.max(0, Math.round((target - now) / 1000));
  await repo.updateAppt(a.id, { clock_offset_sec: offsetSec });
  const { sent } = await tick(a.id);
  return { offsetSec, sent };
}

export { fmtDate };
