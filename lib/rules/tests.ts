import { MAX_TEST_AGE_DAYS, requiredTests } from '../content/tests';
import { addDays, dayDiff, fmtDate, localDay, parseIsoDay } from '../time';
import type { TestRecord } from '../types';

export type TestIssueKind = 'NOT_DONE' | 'EXPIRES' | 'MISSING_ANSWER';
export interface TestIssue { code: string; kind: TestIssueKind; retakeFrom?: string; retakeBy?: string }

export type DateCheck = { ok: true } | { ok: false; reason: 'FUTURE' | 'TOO_OLD' | 'FORMAT' };

export function checkTestDate(date: Date | null, now: Date): DateCheck {
  if (!date) return { ok: false, reason: 'FORMAT' };
  if (localDay(date) > localDay(now)) return { ok: false, reason: 'FUTURE' };
  if (dayDiff(date, now) > MAX_TEST_AGE_DAYS) return { ok: false, reason: 'TOO_OLD' };
  return { ok: true };
}

/**
 * Validity is counted on the PROCEDURE date, not on today.
 * A test taken on day T is valid through T + validDays (inclusive).
 */
export function evaluateTests(tests: Record<string, TestRecord | undefined>, procedure: Date): { ok: boolean; issues: TestIssue[] } {
  const issues: TestIssue[] = [];
  for (const t of requiredTests) {
    const rec = tests[t.code];
    // Earliest date from which a new test would still be valid on procedure day.
    const retakeFrom = fmtDate(addDays(localDay(procedure), -t.validDays));
    const retakeBy = fmtDate(addDays(localDay(procedure), -1));
    if (!rec) { issues.push({ code: t.code, kind: 'MISSING_ANSWER' }); continue; }
    if (!rec.done || !rec.date) { issues.push({ code: t.code, kind: 'NOT_DONE', retakeFrom, retakeBy }); continue; }
    const d = parseIsoDay(rec.date);
    if (!d || dayDiff(d, procedure) > t.validDays) issues.push({ code: t.code, kind: 'EXPIRES', retakeFrom, retakeBy });
  }
  return { ok: issues.length === 0, issues };
}
