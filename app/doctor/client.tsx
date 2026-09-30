'use client';

import { useState, useTransition } from 'react';
import { doctorAction, doctorDemo, doctorLogout } from '../actions';

export function DoctorButton({ apptId, action, arg, className, children, confirmText }: { apptId: string; action: string; arg?: string; className?: string; children: React.ReactNode; confirmText?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={pending} className={className ?? 'btn-ghost btn-sm'} onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        start(async () => { const r = await doctorAction(apptId, action, arg); if (r.text) setMsg(r.text); });
      }}>{pending ? '…' : children}</button>
      {msg && <span className="text-xs text-brand-dark">{msg}</span>}
    </span>
  );
}

export function DemoButtons() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-lime btn-sm" disabled={pending} onClick={() => start(async () => setMsg((await doctorDemo('seed')).text))}>＋ Демо-пациенты</button>
      <button className="btn-ghost btn-sm" disabled={pending} onClick={() => { if (confirm('Удалить всех демо-пациентов?')) start(async () => setMsg((await doctorDemo('wipe')).text)); }}>Сбросить демо</button>
      <button className="btn-ghost btn-sm" onClick={() => doctorLogout()}>Выйти</button>
      {pending && <span className="text-xs text-muted">выполняется… (демо с заключением ждёт AI ~15 с)</span>}
      {msg && <span className="text-xs text-brand-dark">{msg}</span>}
    </div>
  );
}
