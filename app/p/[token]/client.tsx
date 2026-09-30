'use client';

import { useState, useTransition } from 'react';
import { askQuestion, patientAction } from '../../actions';

export function ActionButton({ token, action, arg, className, children, confirmText }: { token: string; action: string; arg?: string; className?: string; children: React.ReactNode; confirmText?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={pending} className={className ?? 'btn-primary btn-sm'} onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        start(async () => { const r = await patientAction(token, action, arg); if (r.text) setMsg(r.text); });
      }}>{pending ? '…' : children}</button>
      {msg && <span className="whitespace-pre-line text-xs text-brand-dark">{msg}</span>}
    </span>
  );
}

export function AskBox({ token, lang }: { token: string; lang: 'ru' | 'kk' }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ q: string; a: string; urgent?: boolean }[]>([]);
  const [pending, start] = useTransition();
  const examples = lang === 'ru' ? ['Можно гречку?', 'Можно чай?', 'Что взять с собой?', 'Можно ли за руль после?'] : ['Кофе ішуге бола ма?', 'Өзіммен не алу керек?'];
  const send = (text: string) => start(async () => {
    const r = await askQuestion(token, text);
    setItems((prev) => [{ q: text, a: r.text, urgent: r.urgent }, ...prev]);
    setQ('');
  });
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) send(q); }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === 'ru' ? 'Например: можно ли кофе?' : 'Мысалы: кофе ішуге бола ма?'} maxLength={500} />
        <button className="btn-primary" disabled={pending}>{pending ? '…' : '➤'}</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {examples.map((e) => <button key={e} type="button" className="chip border border-line bg-white text-muted hover:border-brand" onClick={() => send(e)}>{e}</button>)}
      </div>
      {items.map((it, i) => (
        <div key={i} className={`rounded-2xl p-3 text-sm ${it.urgent ? 'bg-red-50 text-red-800' : 'bg-brand-50'}`}>
          <p className="font-semibold">❓ {it.q}</p>
          <p className="mt-1 whitespace-pre-line">{it.a}</p>
        </div>
      ))}
    </div>
  );
}

export function TestsForm({ token, tests, lang }: { token: string; tests: { code: string; title: string }[]; lang: 'ru' | 'kk' }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-3">
      {tests.map((t) => (
        <label key={t.code} className="block max-w-sm"><span className="label">🧪 {t.title}</span>
          <input type="date" className="input" max={today} value={vals[t.code] ?? ''} onChange={(e) => setVals({ ...vals, [t.code]: e.target.value })} />
        </label>
      ))}
      <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
        const arg = tests.map((t) => `${t.code}=${vals[t.code] || 'no'}`).join(',');
        const r = await patientAction(token, 'tests', arg);
        setMsg(r.text ?? '');
      })}>{pending ? '…' : lang === 'ru' ? 'Сохранить даты анализов' : 'Анализ күндерін сақтау'}</button>
      {msg && <p className="whitespace-pre-line text-sm text-brand-dark">{msg}</p>}
    </div>
  );
}

export function FeedbackForm({ token, lang }: { token: string; lang: 'ru' | 'kk' }) {
  const [clarity, setClarity] = useState(0);
  const [done, setDone] = useState('');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  if (msg) return <p className="text-sm text-brand-dark">{msg}</p>;
  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold">{lang === 'ru' ? 'Насколько понятной была подготовка?' : 'Дайындық қаншалықты түсінікті болды?'}</p>
      <div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`h-9 w-9 rounded-full border font-bold ${clarity === n ? 'border-brand bg-brand text-white' : 'border-line'}`} onClick={() => setClarity(n)}>{n}</button>)}</div>
      <p className="font-semibold">{lang === 'ru' ? 'Удалось выполнить подготовку полностью?' : 'Дайындықты толық орындай алдыңыз ба?'}</p>
      <div className="flex gap-2">{[['yes', lang === 'ru' ? 'Полностью' : 'Толық'], ['partly', lang === 'ru' ? 'Частично' : 'Ішінара'], ['no', lang === 'ru' ? 'Нет' : 'Жоқ']].map(([v, l]) => <button key={v} type="button" className={`rounded-full border px-3 py-1 ${done === v ? 'border-brand bg-brand text-white' : 'border-line'}`} onClick={() => setDone(v)}>{l}</button>)}</div>
      <textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={lang === 'ru' ? 'Что было непонятно? (необязательно)' : 'Не түсініксіз болды? (міндетті емес)'} />
      <button type="button" className="btn-primary btn-sm" disabled={pending || !clarity} onClick={() => start(async () => {
        const r = await patientAction(token, 'feedback', `${clarity}:${done}:${encodeURIComponent(comment.replace(/:/g, ' '))}`);
        setMsg(r.text ?? '✓');
      })}>{lang === 'ru' ? 'Отправить отзыв' : 'Пікір жіберу'}</button>
    </div>
  );
}
