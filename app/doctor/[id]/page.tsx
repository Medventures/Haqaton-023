import Link from 'next/link';
import { notFound } from 'next/navigation';
import { stoolScale } from '@/lib/content/checks';
import { questions } from '@/lib/content/screening';
import { requiredTests } from '@/lib/content/tests';
import { requireDoctorPage } from '@/lib/doctorAuth';
import type { PreDecision } from '@/lib/flow';
import { statusNames } from '@/lib/i18n';
import { eventTitle } from '@/lib/render';
import * as repo from '@/lib/repo';
import { evaluateScreening } from '@/lib/rules/screening';
import { evaluateTests } from '@/lib/rules/tests';
import { fmtDateTime } from '@/lib/time';
import { patientUrl } from '@/lib/token';
import { Logo, SeverityChip, StatusChip } from '../../_components/ui';
import { DoctorButton } from '../client';
import { PreForm, ReportForm } from './forms';

export const dynamic = 'force-dynamic';

const REQ: Record<string, string> = { DISCUSS: 'Обсудить с врачом', FAQ_UNANSWERED: 'Вопрос без ответа', HELP: 'Нужна помощь', URGENT: 'СРОЧНО', SPECIALIST: 'Запись к специалисту', CANCEL: 'Отмена визита' };

export default async function DoctorCard({ params }: { params: Promise<{ id: string }> }) {
  await requireDoctorPage();
  const { id } = await params;
  const a = await repo.getAppt(id);
  if (!a) notFound();
  const [p, flags, requests, events, pre, report] = await Promise.all([
    repo.getPatient(a.patient_id), repo.flagsFor(a.id), repo.requestsFor(a.id), repo.eventsFor(a.id), repo.docFor(a.id, 'PRE'), repo.docFor(a.id, 'REPORT'),
  ]);
  const screening = evaluateScreening(a.answers);
  const flagged = new Set(screening.flags.map((f) => f.code.replace('SCREEN_', '')));
  const P = a.scheduled_at ? new Date(a.scheduled_at) : null;
  const tests = P ? evaluateTests(a.tests, P) : null;
  const now = repo.nowFor(a);
  const open = flags.filter((f) => f.status === 'OPEN').sort((x, y) => ['URGENT', 'HIGH', 'MEDIUM'].indexOf(x.severity) - ['URGENT', 'HIGH', 'MEDIUM'].indexOf(y.severity));
  const canPrep = ['WAITING_DOCTOR', 'NEEDS_CLINIC_REVIEW', 'TESTS_PENDING', 'NOT_CLEARED', 'PREPARATION', 'PREP_PROBLEM', 'READY'].includes(a.status);
  const prepRunning = ['PREPARATION', 'PREP_PROBLEM', 'READY'].includes(a.status);

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="container-x flex h-16 items-center justify-between gap-3">
          <Link href="/doctor"><Logo /></Link>
          <Link href="/doctor" className="btn-ghost btn-sm">← Все пациенты</Link>
        </div>
      </header>
      <div className="container-x space-y-5 py-6">
        <section className="card flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{p.name ?? 'Без имени'}</h1>
            <p className="text-sm text-muted">Колоноскопия с седацией · {P ? fmtDateTime(P) : '—'} · {p.tg_chat_id ? '✈️ Telegram' : '🌐 Веб'} · язык: {p.lang}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={a.status} label={statusNames[a.status].ru} />
              {a.prep_drug && <span className="chip bg-zinc-100 text-zinc-700">{a.prep_drug} · {a.prep_scheme} · стоп жидкости −{a.liquid_stop_hours} ч</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="btn-ghost btn-sm" href={patientUrl(a.id)} target="_blank" rel="noreferrer">👁 Страница пациента</a>
            {a.status === 'NEEDS_CLINIC_REVIEW' && <DoctorButton apptId={a.id} action="review">Вопросы закрыты → ждёт допуска</DoctorButton>}
            {prepRunning && <DoctorButton apptId={a.id} action="completed" className="btn-primary btn-sm" confirmText="Отметить, что процедура проведена?">Процедура проведена</DoctorButton>}
          </div>
        </section>

        {open.length > 0 && (
          <section className="card space-y-2 p-5">
            <h2 className="font-bold">Флаги</h2>
            {open.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-2.5 text-sm">
                <span className="flex items-center gap-2"><SeverityChip severity={f.severity} /> <b>{f.code}</b> {f.note && <span className="text-muted">({f.note})</span>} <span className="chip bg-zinc-100 text-zinc-600">{f.assignee === 'DOCTOR' ? 'врач' : 'координатор'}</span></span>
                <DoctorButton apptId={a.id} action="resolve" arg={String(f.id)}>Решено</DoctorButton>
              </div>
            ))}
          </section>
        )}

        {requests.filter((r) => r.status === 'OPEN').length > 0 && (
          <section className="card space-y-2 p-5">
            <h2 className="font-bold">Заявки</h2>
            {requests.filter((r) => r.status === 'OPEN').map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-2.5 text-sm">
                <span><b className={r.type === 'URGENT' ? 'text-red-600' : ''}>{REQ[r.type] ?? r.type}</b> · {fmtDateTime(new Date(r.created_at))} {r.reason && <span className="text-muted">— {r.reason}</span>} {r.meta?.when ? <span className="chip bg-brand-100 text-brand-dark">{fmtDateTime(new Date(r.meta.when as string))} · {String(r.meta.priority)}</span> : null}</span>
                <DoctorButton apptId={a.id} action="request_done" arg={String(r.id)}>Обработано</DoctorButton>
              </div>
            ))}
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Анкета</h2>
            <ul className="divide-y divide-line text-sm">
              {questions.map((q) => {
                const ans = a.answers[q.code];
                return (
                  <li key={q.code} className={`flex justify-between gap-3 py-1.5 ${flagged.has(q.code) ? 'font-semibold text-red-700' : ''}`}>
                    <span>{q.text.ru}</span>
                    <span className={`chip shrink-0 ${ans === 'UNKNOWN' ? 'bg-amber-100 text-amber-800' : ans === 'YES' ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600'}`}>{ans === 'YES' ? 'Да' : ans === 'NO' ? 'Нет' : ans === 'UNKNOWN' ? 'Не знаю' : '—'}</span>
                  </li>
                );
              })}
            </ul>
            <h3 className="mb-1 mt-4 font-semibold">Анализы (срок на дату процедуры)</h3>
            <ul className="text-sm">
              {requiredTests.map((t) => {
                const rec = a.tests[t.code];
                const issue = tests?.issues.find((i) => i.code === t.code);
                return <li key={t.code}>{issue ? '❌' : '✅'} {t.title.ru}: {rec?.done ? rec.date : 'не сдан'} {issue && <span className="text-red-700">— {issue.kind === 'EXPIRES' ? 'истечёт' : 'нет'}, сдать {issue.retakeFrom}–{issue.retakeBy}</span>}</li>;
              })}
            </ul>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">План и напоминания</h2>
              {a.clock_offset_sec > 0 && <span className="chip bg-violet-100 text-violet-800">🕒 демо-время {fmtDateTime(now)}</span>}
            </div>
            {prepRunning && (
              <div className="mb-3 space-y-2 rounded-2xl bg-violet-50 p-3">
                <p className="text-xs font-semibold text-violet-800">Машина времени (только этот пациент)</p>
                <div className="flex flex-wrap gap-1.5">
                  {[['next', '→ следующее событие'], ['plus1h', '+1 ч'], ['plus1d', '+1 день'], ['dose1', '→ доза 1'], ['morning', '→ за 2 ч до процедуры'], ['reset', 'сброс']].map(([k, l]) => <DoctorButton key={k} apptId={a.id} action="time" arg={k} className="btn-ghost btn-sm">{l}</DoctorButton>)}
                </div>
              </div>
            )}
            {events.length === 0 ? <p className="text-sm text-muted">План появится после публикации допуска.</p> : (
              <ul className="space-y-1 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-line/50 py-1">
                    <span><span className="font-mono text-xs text-muted">{fmtDateTime(new Date(e.due_at))}</span> {eventTitle(e.code, 'ru')}</span>
                    <span className="flex items-center gap-1 text-xs">
                      {typeof e.value?.stool === 'number' && <span className="inline-block h-3 w-6 rounded" style={{ background: stoolScale[(e.value.stool as number) - 1].color }} title={`стул ${e.value.stool}`} />}
                      <span className={`chip ${e.status === 'CONFIRMED' ? 'bg-brand-100 text-brand-dark' : e.status === 'HELP' || e.status === 'FAILED' ? 'bg-red-100 text-red-700' : e.status === 'SENT' ? 'bg-sky-100 text-sky-800' : 'bg-zinc-100 text-zinc-600'}`}>{e.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {canPrep && (
          <section className="card p-5">
            <h2 className="mb-1 font-bold">Допуск и схема подготовки</h2>
            <p className="mb-4 text-sm text-muted">Загрузите PDF (анализы, заключения, указания, допуск) или заполните вручную. Таймлайн строится только после выбора препарата и схемы врачом.</p>
            <PreForm apptId={a.id} initial={pre?.published ? (pre.parsed as unknown as PreDecision) : null} />
          </section>
        )}

        {['COMPLETED', 'RESULTS_READY'].includes(a.status) && (
          <section className="card p-5">
            <h2 className="mb-1 font-bold">Заключение колоноскопии → объяснение пациенту</h2>
            <p className="mb-4 text-sm text-muted">Уровень тревоги считают правила по словарю терминов (с учётом отрицаний). AI только пересказывает определения из словаря; результат проверяется фильтром и публикуется после вашего подтверждения.</p>
            <ReportForm apptId={a.id} published={!!report?.published} />
          </section>
        )}
      </div>
    </main>
  );
}
