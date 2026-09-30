'use client';

import { useActionState } from 'react';
import { doctorLogin } from '../../actions';
import { Logo } from '../../_components/ui';

export default function Login() {
  const [state, action, pending] = useActionState(doctorLogin, {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <Logo />
        <h1 className="text-xl font-bold">Кабинет врача</h1>
        <label className="block"><span className="label">Пароль</span><input className="input" name="password" type="password" autoFocus required /></label>
        {state?.error && <p className="text-sm font-semibold text-red-700">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? '…' : 'Войти'}</button>
        <p className="text-xs text-muted">Демо-уровень защиты: один пароль из переменной окружения.</p>
      </form>
    </main>
  );
}
