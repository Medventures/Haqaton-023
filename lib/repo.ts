import { db, must } from './db';
import type { Answer, AppointmentLike, Assignee, Flag, Lang, Severity, Status, TestRecord } from './types';

export interface Patient {
  id: string; name: string | null; phone: string | null; lang: Lang; tg_chat_id: number | null; consent_at: string | null; created_at: string;
}
export interface Appt extends AppointmentLike {
  patient_id: string; channel: string; bot_state: Record<string, unknown>; cancel_reason: string | null; is_demo: boolean;
  created_at: string; updated_at: string;
}
export interface PrepEvent {
  id: number; appointment_id: string; code: string; kind: string; due_at: string; status: string;
  sent_at: string | null; confirmed_at: string | null; attempts: number; value: Record<string, unknown> | null;
}
export interface FlagRow { id: number; appointment_id: string; code: string; severity: Severity; assignee: Assignee; status: string; note: string | null; created_at: string; resolved_at: string | null }
export interface RequestRow { id: number; appointment_id: string; type: string; reason: string | null; status: string; meta: Record<string, unknown>; created_at: string }
export interface DocRow { id: number; appointment_id: string; kind: 'PRE' | 'REPORT'; parsed: Record<string, unknown>; explanation: Record<string, unknown> | null; published: boolean; published_at: string | null }

export const nowFor = (a: Pick<Appt, 'clock_offset_sec'>) => new Date(Date.now() + Number(a.clock_offset_sec || 0) * 1000);

export async function getPatientByChat(chatId: number): Promise<Patient | null> {
  return must(await db().from('patients').select('*').eq('tg_chat_id', chatId).maybeSingle(), 'patient by chat');
}
export async function getPatient(id: string): Promise<Patient> {
  return must(await db().from('patients').select('*').eq('id', id).single(), 'patient');
}
export async function createPatient(p: Partial<Patient>): Promise<Patient> {
  return must(await db().from('patients').insert(p).select('*').single(), 'create patient');
}
export async function updatePatient(id: string, p: Partial<Patient>): Promise<void> {
  must(await db().from('patients').update(p).eq('id', id), 'update patient');
}

export async function getAppt(id: string): Promise<Appt | null> {
  return must(await db().from('appointments').select('*').eq('id', id).maybeSingle(), 'appointment');
}
export async function currentAppt(patientId: string): Promise<Appt | null> {
  const rows = must(await db().from('appointments').select('*').eq('patient_id', patientId).neq('status', 'CANCELLED').order('created_at', { ascending: false }).limit(1), 'current appointment') as Appt[];
  return rows[0] ?? null;
}
export async function createAppt(a: Partial<Appt>): Promise<Appt> {
  return must(await db().from('appointments').insert(a).select('*').single(), 'create appointment');
}
export async function updateAppt(id: string, a: Partial<Appt>): Promise<Appt> {
  return must(await db().from('appointments').update({ ...a, updated_at: new Date().toISOString() }).eq('id', id).select('*').single(), 'update appointment');
}

export async function saveAnswer(a: Appt, code: string, answer: Answer): Promise<Appt> {
  return updateAppt(a.id, { answers: { ...a.answers, [code]: answer } });
}
export async function saveTest(a: Appt, code: string, rec: TestRecord): Promise<Appt> {
  return updateAppt(a.id, { tests: { ...a.tests, [code]: rec } });
}

/** Idempotent: one flag per (appointment, code); re-raising reopens it with the higher severity. */
export async function raiseFlag(appointmentId: string, f: Flag): Promise<void> {
  must(await db().from('flags').upsert(
    { appointment_id: appointmentId, code: f.code, severity: f.severity, assignee: f.assignee, note: f.note ?? null, status: 'OPEN', resolved_at: null },
    { onConflict: 'appointment_id,code' },
  ), 'raise flag');
}
export async function flagsFor(appointmentId: string): Promise<FlagRow[]> {
  return must(await db().from('flags').select('*').eq('appointment_id', appointmentId).order('created_at'), 'flags') as FlagRow[];
}
export async function resolveFlag(id: number): Promise<void> {
  must(await db().from('flags').update({ status: 'RESOLVED', resolved_at: new Date().toISOString() }).eq('id', id), 'resolve flag');
}

export async function addRequest(appointmentId: string, type: string, reason?: string, meta: Record<string, unknown> = {}): Promise<RequestRow> {
  return must(await db().from('requests').insert({ appointment_id: appointmentId, type, reason: reason ?? null, meta }).select('*').single(), 'request');
}
export async function requestsFor(appointmentId: string): Promise<RequestRow[]> {
  return must(await db().from('requests').select('*').eq('appointment_id', appointmentId).order('created_at'), 'requests') as RequestRow[];
}

export async function logEvent(appointmentId: string | null, name: string, meta: Record<string, unknown> = {}): Promise<void> {
  await db().from('events').insert({ appointment_id: appointmentId, name, meta });
}

export async function eventsFor(appointmentId: string): Promise<PrepEvent[]> {
  return must(await db().from('prep_events').select('*').eq('appointment_id', appointmentId).order('due_at'), 'prep events') as PrepEvent[];
}
export async function getEvent(id: number): Promise<PrepEvent | null> {
  return must(await db().from('prep_events').select('*').eq('id', id).maybeSingle(), 'prep event');
}
export async function updateEvent(id: number, e: Partial<PrepEvent>): Promise<void> {
  must(await db().from('prep_events').update(e).eq('id', id), 'update event');
}
/** Atomically moves an event from one status to another; false if someone else got it first. */
export async function claimEvent(id: number, from: string, to: string, extra: Partial<PrepEvent> = {}): Promise<boolean> {
  const rows = must(await db().from('prep_events').update({ status: to, ...extra }).eq('id', id).eq('status', from).select('id'), 'claim event') as { id: number }[];
  return rows.length > 0;
}

export async function docFor(appointmentId: string, kind: 'PRE' | 'REPORT'): Promise<DocRow | null> {
  return must(await db().from('docs').select('*').eq('appointment_id', appointmentId).eq('kind', kind).maybeSingle(), 'doc');
}
export async function upsertDoc(appointmentId: string, kind: 'PRE' | 'REPORT', d: Partial<DocRow>): Promise<void> {
  must(await db().from('docs').upsert({ appointment_id: appointmentId, kind, ...d }, { onConflict: 'appointment_id,kind' }), 'upsert doc');
}

/** Telegram delivers updates at-least-once. Returns false for a duplicate update_id. */
export async function firstTimeUpdate(updateId: number): Promise<boolean> {
  const res = await db().from('tg_updates').insert({ update_id: updateId });
  return !res.error;
}

export type { Status };
