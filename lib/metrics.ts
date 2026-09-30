import { db, must } from './db';

export interface Metrics {
  total: number; byStatus: Record<string, number>;
  urgentOpen: number; reviewOpen: number; prepProblems: number;
  cancelled: number; cancelReasons: Record<string, number>;
  prepViolations: number;
  faqAnswered: number; faqEscalated: number; faqSelfServeRate: number | null;
  reportsWithAlarm: number; specialistBooked: number; consultConversion: number | null;
  feedbackCount: number; avgClarity: number | null;
}

export async function computeMetrics(): Promise<Metrics> {
  const [appts, flags, events, fb] = await Promise.all([
    db().from('appointments').select('id,status,cancel_reason'),
    db().from('flags').select('severity,status,appointment_id'),
    db().from('events').select('name,meta').in('name', ['prep_violation', 'faq_answered', 'faq_escalated', 'results_published', 'specialist_booked']),
    db().from('feedback').select('clarity'),
  ]);
  const A = must(appts, 'm appts') as { id: string; status: string; cancel_reason: string | null }[];
  const F = must(flags, 'm flags') as { severity: string; status: string }[];
  const E = must(events, 'm events') as { name: string; meta: Record<string, unknown> }[];
  const FB = must(fb, 'm fb') as { clarity: number | null }[];
  const byStatus: Record<string, number> = {};
  const cancelReasons: Record<string, number> = {};
  for (const a of A) {
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    if (a.status === 'CANCELLED') cancelReasons[a.cancel_reason ?? 'OTHER'] = (cancelReasons[a.cancel_reason ?? 'OTHER'] ?? 0) + 1;
  }
  const count = (n: string) => E.filter((e) => e.name === n).length;
  const faqAnswered = count('faq_answered');
  const faqEscalated = count('faq_escalated');
  const reportsWithAlarm = E.filter((e) => e.name === 'results_published' && Number(e.meta.alarm ?? 0) >= 1).length;
  const specialistBooked = count('specialist_booked');
  const clar = FB.map((f) => f.clarity).filter((x): x is number => typeof x === 'number');
  return {
    total: A.length, byStatus,
    urgentOpen: F.filter((f) => f.severity === 'URGENT' && f.status === 'OPEN').length,
    reviewOpen: byStatus.NEEDS_CLINIC_REVIEW ?? 0,
    prepProblems: byStatus.PREP_PROBLEM ?? 0,
    cancelled: byStatus.CANCELLED ?? 0, cancelReasons,
    prepViolations: count('prep_violation'),
    faqAnswered, faqEscalated, faqSelfServeRate: faqAnswered + faqEscalated ? faqAnswered / (faqAnswered + faqEscalated) : null,
    reportsWithAlarm, specialistBooked, consultConversion: reportsWithAlarm ? Math.min(1, specialistBooked / reportsWithAlarm) : null,
    feedbackCount: clar.length, avgClarity: clar.length ? clar.reduce((s, x) => s + x, 0) / clar.length : null,
  };
}
