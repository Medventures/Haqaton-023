import Link from 'next/link';
import { clinic, disclaimer } from '@/lib/content/clinic';
import type { Lang } from '@/lib/types';

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={small ? 26 : 32} height={small ? 26 : 32} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#0e7a4e" />
        <path d="M16 7c-4.4 3.2-6.5 6.6-6.5 10.1A6.5 6.5 0 0 0 16 23.6a6.5 6.5 0 0 0 6.5-6.5C22.5 13.6 20.4 10.2 16 7Z" fill="#8cc63f" />
        <path d="M16 11v14" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="leading-none">
        <span className={`block font-display font-extrabold tracking-tight text-brand ${small ? 'text-sm' : 'text-base'}`}>PRIME</span>
        <span className={`block font-display font-semibold text-ink ${small ? 'text-[10px]' : 'text-xs'} tracking-[.18em] uppercase`}>Green Clinic</span>
      </span>
    </span>
  );
}

export function LangToggle({ lang, path }: { lang: Lang; path: string }) {
  const sep = path.includes('?') ? '&' : '?';
  return (
    <div className="inline-flex rounded-full border border-line bg-white p-0.5 text-xs font-semibold">
      {(['ru', 'kk'] as const).map((l) => (
        <Link key={l} href={`${path}${sep}lang=${l}`} className={`rounded-full px-2.5 py-1 ${lang === l ? 'bg-brand text-white' : 'text-muted hover:text-brand'}`}>
          {l === 'ru' ? 'RU' : 'ҚАЗ'}
        </Link>
      ))}
    </div>
  );
}

export function Header({ lang, path, right }: { lang: Lang; path: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between gap-3">
        <Link href={`/?lang=${lang}`}><Logo /></Link>
        <div className="flex items-center gap-2 sm:gap-3">
          {right}
          <LangToggle lang={lang} path={path} />
        </div>
      </div>
    </header>
  );
}

export function Disclaimer({ lang }: { lang: Lang }) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-dark">
      ⚕️ {disclaimer[lang]}
    </div>
  );
}

export function Footer({ lang }: { lang: Lang }) {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="container-x grid gap-6 py-8 text-sm text-muted sm:grid-cols-3">
        <div className="space-y-2"><Logo small /><p>{disclaimer[lang]}</p></div>
        <div className="space-y-1">
          <p>📍 {clinic.address[lang]}</p>
          <p>🕘 {clinic.hours[lang]}</p>
          <p>📞 {clinic.phone}</p>
        </div>
        <div className="space-y-1">
          <p>{lang === 'ru' ? 'Хакатон-прототип. Все данные синтетические.' : 'Хакатон прототипі. Барлық деректер синтетикалық.'}</p>
          <p>{lang === 'ru' ? 'Open source: Next.js, grammY, Supabase (Postgres). AI за адаптером — заменяется локальной open-source моделью.' : 'Open source: Next.js, grammY, Supabase (Postgres). AI адаптер арқылы — жергілікті open-source модельмен ауыстырылады.'}</p>
        </div>
      </div>
    </footer>
  );
}

export function StatusChip({ status, label }: { status: string; label: string }) {
  const tone: Record<string, string> = {
    NEEDS_CLINIC_REVIEW: 'bg-amber-100 text-amber-800', TESTS_PENDING: 'bg-amber-100 text-amber-800', NOT_CLEARED: 'bg-red-100 text-red-700',
    PREP_PROBLEM: 'bg-red-100 text-red-700', PREPARATION: 'bg-brand-100 text-brand-dark', READY: 'bg-lime/30 text-brand-dark',
    COMPLETED: 'bg-sky-100 text-sky-800', RESULTS_READY: 'bg-sky-100 text-sky-800', CANCELLED: 'bg-zinc-100 text-zinc-600',
    WAITING_DOCTOR: 'bg-brand-50 text-brand-dark', DRAFT: 'bg-zinc-100 text-zinc-600',
  };
  return <span className={`chip ${tone[status] ?? 'bg-zinc-100 text-zinc-700'}`}>{label}</span>;
}

export function SeverityChip({ severity }: { severity: string }) {
  const tone = severity === 'URGENT' ? 'bg-red-600 text-white' : severity === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800';
  return <span className={`chip ${tone}`}>{severity}</span>;
}

export const getLang = (sp: Record<string, string | string[] | undefined>): Lang => (sp.lang === 'kk' ? 'kk' : 'ru');
