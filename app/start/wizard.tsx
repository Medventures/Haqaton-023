'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitIntake } from '../actions';
import type { Answer, Lang } from '@/lib/types';

interface Q { code: string; text: string; hint?: string; todo: boolean; flagText?: string }
interface Props {
  lang: Lang;
  dates: { iso: string; label: string; times: string[] }[];
  questions: Q[];
  tests: { code: string; title: string; validDays: number }[];
  disclaimer: string;
}

const L = {
  ru: {
    steps: ['Согласие', 'Дата', 'Анкета', 'Анализы', 'Проверка'], next: 'Далее', back: 'Назад', submit: 'Отправить врачу',
    consentTitle: 'Подготовка к колоноскопии с седацией', consent: 'Я согласен(на) на обработку моих данных для подготовки к исследованию',
    name: 'Имя (в демо можно вымышленное)', phone: 'Телефон (необязательно)',
    dateTitle: 'Дата и время процедуры (как в вашей записи)', afternoon: 'После 14:00 схему подготовки подтвердит клиника',
    qTitle: 'Анкета противопоказаний', qNote: '«Не знаю» — нормальный ответ: тогда вопрос уточнит врач.',
    yes: 'Да', no: 'Нет', unknown: 'Не знаю', review: 'требует проверки врачом',
    testsTitle: 'Анализы для седации', testsNote: 'Должны быть действительны на дату процедуры (не старше {d} дней).', done: 'Сдан', notDone: 'Ещё не сдан', date: 'Дата сдачи',
    reviewTitle: 'Проверьте ответы', edit: 'Изменить', acute: 'Вы отметили острые симптомы. Не начинайте подготовку — позвоните в клинику. При угрозе жизни — 103.',
    needAll: 'Ответьте на все вопросы', needDate: 'Выберите дату и время', needName: 'Отметьте согласие',
  },
  kk: {
    steps: ['Келісім', 'Күн', 'Сауалнама', 'Анализдер', 'Тексеру'], next: 'Әрі қарай', back: 'Артқа', submit: 'Дәрігерге жіберу',
    consentTitle: 'Седациямен колоноскопияға дайындық', consent: 'Зерттеуге дайындық үшін деректерімді өңдеуге келісемін',
    name: 'Аты (демода ойдан шығарылған болады)', phone: 'Телефон (міндетті емес)',
    dateTitle: 'Процедура күні мен уақыты (жазылуыңыздағыдай)', afternoon: '14:00-ден кейін дайындық схемасын клиника растайды',
    qTitle: 'Қарсы көрсетілімдер сауалнамасы', qNote: '«Білмеймін» — қалыпты жауап: онда сұрақты дәрігер нақтылайды.',
    yes: 'Иә', no: 'Жоқ', unknown: 'Білмеймін', review: 'дәрігердің тексеруін қажет етеді',
    testsTitle: 'Седацияға арналған анализдер', testsNote: 'Процедура күніне жарамды болуы керек ({d} күннен аспауы).', done: 'Тапсырылды', notDone: 'Әлі тапсырылған жоқ', date: 'Тапсырған күні',
    reviewTitle: 'Жауаптарды тексеріңіз', edit: 'Өзгерту', acute: 'Сіз жедел белгілерді белгіледіңіз. Дайындықты бастамаңыз — клиникаға қоңырау шалыңыз. Өмірге қауіп төнсе — 103.',
    needAll: 'Барлық сұраққа жауап беріңіз', needDate: 'Күн мен уақытты таңдаңыз', needName: 'Келісімді белгілеңіз',
  },
};

export default function IntakeWizard({ lang, dates, questions, tests, disclaimer }: Props) {
  const c = L[lang];
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [testState, setTestState] = useState<Record<string, { done: boolean; date?: string }>>({});
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const acute = answers.ACUTE_NOW === 'YES';
  const answered = questions.filter((q) => answers[q.code]).length;
  const times = useMemo(() => dates.find((d) => d.iso === date)?.times ?? [], [dates, date]);

  function go(n: number) {
    setError('');
    if (n > step) {
      if (step === 0 && !consent) return setError(c.needName);
      if (step === 1 && (!date || !time)) return setError(c.needDate);
      if (step === 2 && !acute && answered < questions.length) return setError(c.needAll);
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submit() {
    setError('');
    start(async () => {
      const res = await submitIntake({ lang, name, phone, consent, date, time, answers, tests: testState });
      if (res.ok) router.push(`/p/${res.token}`);
      else setError(res.error);
    });
  }

  const Pill = ({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: string }) => (
    <button type="button" onClick={onClick} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? tone ?? 'border-brand bg-brand text-white' : 'border-line bg-white hover:border-brand'}`}>{children}</button>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs font-semibold">
        {c.steps.map((s, i) => (
          <li key={s} className={`chip ${i === step ? 'bg-brand text-white' : i < step ? 'bg-brand-100 text-brand-dark' : 'bg-white text-muted border border-line'}`}>{i + 1}. {s}</li>
        ))}
      </ol>

      <div className="card p-5 sm:p-8">
        {step === 0 && (
          <div className="space-y-5">
            <h1 className="text-2xl font-bold">{c.consentTitle}</h1>
            <p className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-dark">⚕️ {disclaimer}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label">{c.name}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
              <label><span className="label">{c.phone}</span><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} inputMode="tel" /></label>
            </div>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#0e7a4e]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{c.consent}</label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold">{c.dateTitle}</h2>
            <div className="flex flex-wrap gap-2">
              {dates.map((d) => <Pill key={d.iso} active={date === d.iso} onClick={() => { setDate(d.iso); setTime(''); }}>{d.label.slice(0, 5)}</Pill>)}
            </div>
            {date && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {times.map((tm) => <Pill key={tm} active={time === tm} onClick={() => setTime(tm)}>{tm}{Number(tm.slice(0, 2)) >= 14 ? '*' : ''}</Pill>)}
                </div>
                <p className="text-xs text-muted">* {c.afternoon}</p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-xl font-bold">{c.qTitle}</h2>
              <span className="text-sm text-muted">{answered}/{questions.length}</span>
            </div>
            <p className="text-sm text-muted">{c.qNote}</p>
            {acute && <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">🚨 {c.acute}</p>}
            <ol className="space-y-4">
              {questions.map((q, i) => (
                <li key={q.code} className="rounded-2xl border border-line p-4">
                  <p className="font-semibold">{i + 1}. {q.text}</p>
                  {q.hint && <p className="mt-1 text-sm text-muted">💊 {q.hint}</p>}
                  {q.todo && <p className="mt-1 text-xs text-amber-700">[{c.review}]</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill active={answers[q.code] === 'YES'} onClick={() => setAnswers({ ...answers, [q.code]: 'YES' })}>{c.yes}</Pill>
                    <Pill active={answers[q.code] === 'NO'} onClick={() => setAnswers({ ...answers, [q.code]: 'NO' })}>{c.no}</Pill>
                    <Pill active={answers[q.code] === 'UNKNOWN'} onClick={() => setAnswers({ ...answers, [q.code]: 'UNKNOWN' })} tone="border-amber-500 bg-amber-500 text-white">{c.unknown}</Pill>
                  </div>
                  {q.flagText && (answers[q.code] === 'YES' || answers[q.code] === 'UNKNOWN') && <p className="mt-2 text-sm text-brand-dark">↳ {q.flagText}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold">{c.testsTitle}</h2>
            <p className="text-sm text-muted">{c.testsNote.replace('{d}', String(tests[0]?.validDays ?? 30))}</p>
            {tests.map((tt) => {
              const s = testState[tt.code];
              return (
                <div key={tt.code} className="rounded-2xl border border-line p-4 space-y-3">
                  <p className="font-semibold">🧪 {tt.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <Pill active={!!s?.done} onClick={() => setTestState({ ...testState, [tt.code]: { done: true, date: s?.date } })}>{c.done}</Pill>
                    <Pill active={s?.done === false} onClick={() => setTestState({ ...testState, [tt.code]: { done: false } })}>{c.notDone}</Pill>
                  </div>
                  {s?.done && (
                    <label className="block max-w-xs"><span className="label">{c.date}</span>
                      <input type="date" className="input" max={today} value={s.date ?? ''} onChange={(e) => setTestState({ ...testState, [tt.code]: { done: true, date: e.target.value } })} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">{c.reviewTitle}</h2>
            <p className="font-semibold">📅 {dates.find((d) => d.iso === date)?.label} {time}</p>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {questions.map((q, i) => (
                <li key={q.code} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <span>{i + 1}. {q.text}</span>
                  <span className={`chip shrink-0 ${answers[q.code] === 'UNKNOWN' ? 'bg-amber-100 text-amber-800' : answers[q.code] === 'YES' ? 'bg-brand-100 text-brand-dark' : 'bg-zinc-100 text-zinc-700'}`}>
                    {answers[q.code] === 'YES' ? c.yes : answers[q.code] === 'NO' ? c.no : answers[q.code] === 'UNKNOWN' ? c.unknown : '—'}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="text-sm">
              {tests.map((tt) => <li key={tt.code}>🧪 {tt.title}: {testState[tt.code]?.done ? testState[tt.code]?.date || '—' : c.notDone}</li>)}
            </ul>
            <button type="button" className="btn-ghost btn-sm" onClick={() => go(2)}>✏️ {c.edit}</button>
          </div>
        )}

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-6 flex justify-between gap-3">
          <button type="button" className="btn-ghost" disabled={step === 0} onClick={() => go(step - 1)}>{c.back}</button>
          {step < 4
            ? <button type="button" className="btn-primary" onClick={() => go(acute && step === 2 ? 4 : step + 1)}>{c.next}</button>
            : <button type="button" className="btn-primary" disabled={pending} onClick={submit}>{pending ? '…' : c.submit}</button>}
        </div>
      </div>
    </div>
  );
}
