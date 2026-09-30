import { notFound } from 'next/navigation';
import { botUsername } from '@/lib/botinfo';
import { checklist, stoolScale } from '@/lib/content/checks';
import { analytes, labColumns, labFooter } from '@/lib/content/labs';
import { reportDisclaimer, specialistNames } from '@/lib/content/report';
import { questionByCode } from '@/lib/content/screening';
import { requiredTests, testByCode } from '@/lib/content/tests';
import type { ReportExplanation } from '@/lib/ai/explain';
import * as flow from '@/lib/flow';
import { nextSteps, statusNames, t } from '@/lib/i18n';
import { eventTitle, eventVars } from '@/lib/render';
import { eventTexts } from '@/lib/content/prep';
import * as repo from '@/lib/repo';
import { termById } from '@/lib/rules/report';
import { evaluateTests } from '@/lib/rules/tests';
import { fill } from '@/lib/rules/text';
import { clinic } from '@/lib/content/clinic';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/time';
import { readToken } from '@/lib/token';
import { Disclaimer, Footer, Header, StatusChip } from '../../_components/ui';
import { ActionButton, AskBox, FeedbackForm, TestsForm } from './client';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default async function PatientPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readToken(token);
  if (!id) return <BadLink />;
  const a = await repo.getAppt(id);
  if (!a) notFound();
  const p = await repo.getPatient(a.patient_id);
  const lang = p.lang;
  const [events, pre, report, requests, bot] = await Promise.all([
    repo.eventsFor(a.id), repo.docFor(a.id, 'PRE'), repo.docFor(a.id, 'REPORT'), repo.requestsFor(a.id), botUsername(),
  ]);
  const flags = await repo.flagsFor(a.id);
  const now = repo.nowFor(a);
  const P = a.scheduled_at ? new Date(a.scheduled_at) : null;
  const R = (ru: string, kk: string) => (lang === 'ru' ? ru : kk);
  const visible = events.filter((e) => e.kind !== 'nag');
  const actionable = events.filter((e) => e.status === 'SENT' && ['confirm', 'stool', 'checklist', 'message'].includes(e.kind));
  const testsEval = P ? evaluateTests(a.tests, P) : null;
  const screenFlags = flags.filter((f) => f.code.startsWith('SCREEN_'));
  const expl = report?.published ? (report.explanation as unknown as ReportExplanation) : null;
  const booked = requests.find((r) => r.type === 'SPECIALIST');
  const preParsed = pre?.published ? (pre.parsed as unknown as flow.PreDecision) : null;

  return (
    <>
      <Header lang={lang} path={`/p/${token}`} right={<span className="hidden text-sm text-muted sm:inline">{p.name}</span>} />
      <main className="container-x space-y-6 py-8">
        {/* Status */}
        <section className="card grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:p-6">
          <div className="space-y-2">
            <p className="text-sm text-muted">{R('Колоноскопия с седацией', 'Седациямен колоноскопия')}</p>
            <h1 className="text-2xl font-bold">{P ? fmtDateTime(P) : '—'}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={a.status} label={statusNames[a.status][lang]} />
              {a.clock_offset_sec > 0 && <span className="chip bg-violet-100 text-violet-800">🕒 {R('демо-время', 'демо-уақыт')}: {fmtDateTime(now)}</span>}
            </div>
            <p className="text-sm"><b>{R('Следующий шаг', 'Келесі қадам')}:</b> {nextSteps[a.status][lang]}</p>
            <p className="text-sm text-muted">📍 {clinic.address[lang]}</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {bot && !p.tg_chat_id && <a className="btn-primary btn-sm" href={`https://t.me/${bot}?start=${token}`} target="_blank" rel="noreferrer">✈️ {t(lang, 'link_telegram')}</a>}
            {p.tg_chat_id && <span className="chip bg-brand-100 text-brand-dark">✈️ Telegram ✓</span>}
            {(a.status === 'NEEDS_CLINIC_REVIEW' || a.status === 'NOT_CLEARED') && <ActionButton token={token} action="discuss" className="btn-ghost btn-sm">💬 {t(lang, 'discuss_btn')}</ActionButton>}
          </div>
        </section>

        {/* Urgent/red flags */}
        {flags.some((f) => f.severity === 'URGENT' && f.status === 'OPEN') && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            🚨 {t(lang, 'res_urgent')}
          </section>
        )}

        {/* Intake findings */}
        {(screenFlags.length > 0 || a.status === 'TESTS_PENDING') && !['PREPARATION', 'READY', 'COMPLETED', 'RESULTS_READY'].includes(a.status) && (
          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-bold">👩‍⚕️ {R('Что обсудить с врачом', 'Дәрігермен не талқылау керек')}</h2>
            {screenFlags.length > 0 && (
              <ul className="space-y-2 text-sm">
                {screenFlags.map((f) => {
                  const q = questionByCode[f.code.replace('SCREEN_', '')];
                  return q ? <li key={f.id}>• {q.text[lang]} {q.onFlagText && <span className="block pl-3 text-brand-dark">↳ {q.onFlagText[lang]}</span>}</li> : null;
                })}
              </ul>
            )}
            {testsEval && !testsEval.ok && (
              <div className="space-y-3">
                <p className="font-semibold">{t(lang, 'res_tests')}</p>
                <ul className="text-sm">
                  {testsEval.issues.map((i) => <li key={i.code}>{t(lang, 'res_test_line', { title: testByCode[i.code].title[lang], from: i.retakeFrom, by: i.retakeBy })}</li>)}
                </ul>
                <TestsForm token={token} lang={lang} tests={requiredTests.map((tt) => ({ code: tt.code, title: tt.title[lang] }))} />
              </div>
            )}
          </section>
        )}

        {/* Actions due now (web duplicate of Telegram buttons) */}
        {actionable.length > 0 && (
          <section className="card space-y-4 border-lime p-5">
            <h2 className="text-lg font-bold">🔔 {R('Нужно ваше действие', 'Сіздің әрекетіңіз қажет')}</h2>
            {actionable.map((e) => (
              <div key={e.id} className="rounded-2xl border border-line p-4">
                <p className="mb-2 text-xs font-semibold text-muted">{fmtDateTime(new Date(e.due_at))} · {eventTitle(e.code, lang)}</p>
                {e.kind !== 'checklist' && e.kind !== 'stool' && <p className="mb-3 whitespace-pre-line text-sm">{fill((eventTexts[(e.value?.textKey as string) ?? e.code] ?? eventTexts.DIET_REMINDER)[lang], { ...eventVars(a, lang, e), address: clinic.address[lang], phone: clinic.phone })}</p>}
                {e.kind === 'stool' && (
                  <div className="grid gap-2 sm:grid-cols-4">
                    {stoolScale.map((s) => (
                      <ActionButton key={s.value} token={token} action="stool" arg={`${e.id}:${s.value}`} className="btn w-full flex-col rounded-2xl border border-line bg-white p-2 text-xs text-ink">
                        <span className="block h-10 w-full rounded-lg" style={{ background: s.color }} />
                        <span>{s.value}. {s.text[lang]}</span>
                      </ActionButton>
                    ))}
                  </div>
                )}
                {e.kind === 'checklist' && <Checklist token={token} evId={e.id} answers={(e.value?.answers as Record<string, boolean>) ?? {}} lang={lang} />}
                {(e.kind === 'confirm' || e.kind === 'message') && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton token={token} action="event" arg={`${e.id}:done`}>{e.kind === 'confirm' ? t(lang, 'drank_btn') : t(lang, 'done_btn')}</ActionButton>
                    <ActionButton token={token} action="event" arg={`${e.id}:help`} className="btn-ghost btn-sm">{t(lang, 'help_btn')}</ActionButton>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          {/* Plan */}
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-bold">📋 {t(lang, 'plan_title')}{a.prep_drug ? ` · ${a.prep_drug}` : ''}</h2>
            {visible.length === 0 ? <p className="text-sm text-muted">{t(lang, 'plan_none')}</p> : (
              <ol className="relative space-y-3 border-l-2 border-brand-100 pl-5">
                {visible.map((e) => {
                  const due = new Date(e.due_at);
                  const done = e.status === 'CONFIRMED';
                  const skipped = e.status === 'SKIPPED';
                  const icon = done ? '✅' : skipped ? '⚪' : e.status === 'HELP' ? '🆘' : e.status === 'SENT' ? '🔔' : e.status === 'CANCELLED' ? '✖️' : '▫️';
                  const stool = e.value?.stool as number | undefined;
                  return (
                    <li key={e.id} className={`relative ${due > now && e.status === 'PENDING' ? '' : 'opacity-95'}`}>
                      <span className="absolute -left-[29px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px]">{icon}</span>
                      <span className="font-mono text-xs text-muted">{fmtDate(due).slice(0, 5)} {fmtTime(due)}</span>
                      <p className={`text-sm font-medium ${skipped ? 'text-muted line-through' : ''}`}>{eventTitle(e.code, lang)}</p>
                      {skipped && <p className="text-xs text-amber-700">{t(lang, 'plan_skipped')}</p>}
                      {stool && <p className="text-xs">{R('Стул', 'Нәжіс')}: <span className="inline-block h-2.5 w-6 rounded align-middle" style={{ background: stoolScale[stool - 1].color }} /> {stool}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* FAQ */}
          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-bold">❓ {R('Вопрос ассистенту', 'Көмекшіге сұрақ')}</h2>
            <p className="text-xs text-muted">{R('Ответы берутся только из памятки клиники и FAQ, одобренного врачами. Тревожные симптомы — сразу в клинику.', 'Жауаптар тек клиника жадынамасы мен дәрігерлер мақұлдаған FAQ-тан алынады. Алаңдатарлық белгілер — бірден клиникаға.')}</p>
            <AskBox token={token} lang={lang} />
          </section>
        </div>

        {/* Doctor documents before procedure */}
        {preParsed && (
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">🧾 {R('Документы врача', 'Дәрігер құжаттары')}</h2>
            {preParsed.labs?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="border-b border-line text-left text-muted">
                    {[R('Показатель', 'Көрсеткіш'), R('Результат', 'Нәтиже'), R('Ед.', 'Бірл.'), R('Референс', 'Референс'), R('Отметка', 'Белгі')].map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {preParsed.labs.map((l, i) => {
                      const about = analytes.find((x) => x.re.test(l.indicator))?.about[lang];
                      return (
                        <tr key={i} className="border-b border-line/60">
                          <td className="py-2 pr-3">{l.indicator} {about && <span title={about} className="cursor-help rounded-full bg-brand-50 px-1.5 text-xs text-brand">?</span>}</td>
                          <td className="py-2 pr-3 font-semibold">{l.value}</td><td className="py-2 pr-3">{l.units}</td><td className="py-2 pr-3">{l.reference}</td><td className="py-2 pr-3">{l.mark}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <details className="rounded-2xl bg-surface p-4 text-sm">
              <summary className="cursor-pointer font-semibold">{R('Как читать таблицу', 'Кестені қалай оқу керек')}</summary>
              <ul className="mt-2 space-y-1">{labColumns.map((c) => <li key={c.key}>• {c.text[lang]}</li>)}</ul>
              <p className="mt-2 font-semibold">{labFooter[lang]}</p>
            </details>
            {preParsed.conclusions?.length > 0 && <div><h3 className="font-semibold">{R('Заключения врача', 'Дәрігер қорытындылары')}</h3><ul className="list-disc pl-5 text-sm">{preParsed.conclusions.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
            {preParsed.instructions?.length > 0 && <div><h3 className="font-semibold">{R('Указания врача', 'Дәрігер нұсқаулары')}</h3><ul className="list-disc pl-5 text-sm">{preParsed.instructions.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
            <p className="text-sm font-semibold text-brand-dark">{R('Обсудите результаты с лечащим врачом.', 'Нәтижелерді емдеуші дәрігермен талқылаңыз.')}</p>
          </section>
        )}

        {/* Report after procedure */}
        {expl && (
          <section className="card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">📄 {R('Заключение колоноскопии', 'Колоноскопия қорытындысы')}</h2>
              {expl.analysis.alarm >= 2 && <span className="chip bg-red-100 text-red-700">{R('Рекомендована консультация специалиста', 'Маман кеңесі ұсынылады')}</span>}
            </div>
            <Highlighted text={String((report!.parsed as { text?: string }).text ?? '')} fragments={expl.analysis.terms.filter((x) => !x.negated).map((x) => x.fragment)} />
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">{expl.source === 'llm' ? R('Простыми словами (AI-пересказ по словарю терминов)', 'Қарапайым тілмен (терминдер сөздігі бойынша AI-мазмұндама)') : R('Простыми словами (по словарю терминов)', 'Қарапайым тілмен (терминдер сөздігі бойынша)')}</p>
              <p className="whitespace-pre-line text-sm">{expl.summary[lang]}</p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">{R('Термины', 'Терминдер')}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {expl.analysis.terms.map((x) => {
                  const term = termById(x.id);
                  if (!term) return null;
                  return (
                    <details key={x.id} className={`rounded-2xl border p-3 text-sm ${x.negated ? 'border-line opacity-70' : term.level === 2 ? 'border-red-200 bg-red-50/40' : term.level === 1 ? 'border-amber-200 bg-amber-50/40' : 'border-line'}`}>
                      <summary className="cursor-pointer font-semibold">{term.title[lang]} {x.negated && <span className="chip bg-zinc-100 text-zinc-600">{R('не выявлено', 'анықталмады')}</span>}</summary>
                      <p className="mt-1">{term.plain[lang]}</p>
                    </details>
                  );
                })}
              </div>
            </div>
            {expl.questions[lang]?.length > 0 && (
              <div><h3 className="font-semibold">{R('Вопросы, которые можно задать врачу', 'Дәрігерге қоюға болатын сұрақтар')}</h3><ul className="list-disc pl-5 text-sm">{expl.questions[lang].map((q, i) => <li key={i}>{q}</li>)}</ul></div>
            )}
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">⚠️ {reportDisclaimer[lang]}</p>
            {expl.analysis.alarm >= 1 && (
              <div className="rounded-2xl border border-line p-4">
                <h3 className="mb-2 font-semibold">👨‍⚕️ {t(lang, 'spec_btn')}: {specialistNames[expl.analysis.specialist ?? 'GASTRO'][lang]}</h3>
                {booked ? <p className="text-sm text-brand-dark">✅ {fmtDateTime(new Date(booked.meta.when as string))}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {flow.specialistSlots(now).map((d) => <ActionButton key={d.toISOString()} token={token} action="specialist" arg={String(Math.floor(d.getTime() / 60000))} className="btn-ghost btn-sm">{fmtDateTime(d)}</ActionButton>)}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {['COMPLETED', 'RESULTS_READY'].includes(a.status) && (
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-bold">⭐ {R('Отзыв о подготовке', 'Дайындық туралы пікір')}</h2>
            <FeedbackForm token={token} lang={lang} />
          </section>
        )}

        {!['COMPLETED', 'RESULTS_READY', 'CANCELLED'].includes(a.status) && (
          <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-muted">{R('Не успеваете подготовиться? Лучше перенести, чем прийти с плохой подготовкой.', 'Дайындалып үлгермейсіз бе? Нашар дайындықпен келгеннен гөрі ауыстырған дұрыс.')}</p>
            <div className="flex flex-wrap gap-2">
              {(['PREP', 'HEALTH', 'PLANS'] as const).map((r) => (
                <ActionButton key={r} token={token} action="cancel" arg={r} className="btn-ghost btn-sm" confirmText={R('Отменить визит?', 'Сапардан бас тарту керек пе?')}>✖️ {t(lang, `cancel_r_${r}`)}</ActionButton>
              ))}
            </div>
          </section>
        )}

        <Disclaimer lang={lang} />
      </main>
      <Footer lang={lang} />
    </>
  );
}

function Highlighted({ text, fragments }: { text: string; fragments: string[] }) {
  const uniq = [...new Set(fragments.filter((f) => f && f.length > 2))];
  if (!uniq.length) return <p className="whitespace-pre-line rounded-2xl border border-line p-4 text-sm">{text}</p>;
  const re = new RegExp(`(${uniq.map(esc).join('|')})`, 'gi');
  return (
    <p className="whitespace-pre-line rounded-2xl border border-line p-4 text-sm leading-relaxed">
      {text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i} className="rounded bg-lime/40 px-0.5">{part}</mark> : part))}
    </p>
  );
}

function Checklist({ token, evId, answers, lang }: { token: string; evId: number; answers: Record<string, boolean>; lang: 'ru' | 'kk' }) {
  const idx = checklist.findIndex((c) => answers[c.code] === undefined);
  if (idx < 0) return null;
  const item = checklist[idx];
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{idx + 1}/{checklist.length}. {item.text[lang]}</p>
      <div className="flex gap-2">
        <ActionButton token={token} action="check" arg={`${evId}:${idx}:y`}>{t(lang, 'yes')}</ActionButton>
        <ActionButton token={token} action="check" arg={`${evId}:${idx}:n`} className="btn-ghost btn-sm">{t(lang, 'no')}</ActionButton>
      </div>
    </div>
  );
}

function BadLink() {
  return (
    <main className="container-x py-20 text-center">
      <h1 className="text-2xl font-bold">Ссылка недействительна</h1>
      <p className="text-muted">Сілтеме жарамсыз немесе ескірген.</p>
    </main>
  );
}
