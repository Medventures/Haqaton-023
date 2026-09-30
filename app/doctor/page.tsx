import Link from 'next/link';
import { db, must } from '@/lib/db';
import { requireDoctorPage } from '@/lib/doctorAuth';
import { statusNames } from '@/lib/i18n';
import { computeMetrics } from '@/lib/metrics';
import { fmtDateTime } from '@/lib/time';
import { Logo, SeverityChip, StatusChip } from '../_components/ui';
import { DemoButtons } from './client';

export const dynamic = 'force-dynamic';

const RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2 };

export default async function DoctorHome() {
  await requireDoctorPage();
  const [m, rows] = await Promise.all([
    computeMetrics(),
    db().from('appointments').select('id,status,scheduled_at,channel,is_demo,updated_at,patients(name,tg_chat_id),flags(severity,status,assignee,code)').order('updated_at', { ascending: false }).limit(200),
  ]);
  type Row = { id: string; status: string; scheduled_at: string | null; channel: string; is_demo: boolean; updated_at: string; patients: { name: string | null; tg_chat_id: number | null } | null; flags: { severity: string; status: string; assignee: string; code: string }[] };
  const list = (must(rows, 'list') as unknown as Row[]).map((r) => {
    const open = r.flags.filter((f) => f.status === 'OPEN');
    const top = open.reduce((best, f) => Math.min(best, RANK[f.severity] ?? 9), 9);
    return { ...r, open, top };
  }).sort((a, b) => a.top - b.top || (b.updated_at > a.updated_at ? 1 : -1));
  const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
  const tiles: [string, string | number, string][] = [
    ['Визитов', m.total, ''],
    ['Открытых URGENT', m.urgentOpen, m.urgentOpen ? 'text-red-600' : ''],
    ['Ждут решения', m.reviewOpen, m.reviewOpen ? 'text-amber-600' : ''],
    ['Проблемы подготовки', m.prepProblems, m.prepProblems ? 'text-red-600' : ''],
    ['Нарушения подготовки (события)', m.prepViolations, ''],
    ['Отмены', m.cancelled, ''],
    ['FAQ без звонка', pct(m.faqSelfServeRate), ''],
    ['Конверсия в консультацию', pct(m.consultConversion), ''],
    ['Понятность подготовки', m.avgClarity ? m.avgClarity.toFixed(1) + ' / 5' : '—', ''],
  ];
  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="container-x flex h-16 items-center justify-between gap-3">
          <Link href="/doctor"><Logo /></Link>
          <span className="text-sm font-semibold text-muted">Панель врача / координатора</span>
        </div>
      </header>
      <div className="container-x space-y-6 py-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-9">
          {tiles.map(([label, value, tone]) => (
            <div key={label} className="card p-3">
              <div className={`font-display text-2xl font-extrabold ${tone}`}>{value}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>
        {m.cancelled > 0 && <p className="text-xs text-muted">Причины отмен: {Object.entries(m.cancelReasons).map(([k, v]) => `${k} — ${v}`).join(', ')}</p>}
        <DemoButtons />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-line text-left text-muted">
              <th className="p-3">Пациент</th><th className="p-3">Процедура</th><th className="p-3">Статус</th><th className="p-3">Флаги</th><th className="p-3">Канал</th><th className="p-3">Обновлено</th>
            </tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-line/60 hover:bg-brand-50/50">
                  <td className="p-3"><Link className="font-semibold text-brand hover:underline" href={`/doctor/${r.id}`}>{r.patients?.name ?? 'Без имени'}</Link>{r.is_demo && <span className="chip ml-2 bg-violet-100 text-violet-700">демо</span>}</td>
                  <td className="p-3">{r.scheduled_at ? fmtDateTime(new Date(r.scheduled_at)) : '—'}</td>
                  <td className="p-3"><StatusChip status={r.status} label={statusNames[r.status]?.ru ?? r.status} /></td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{r.open.slice(0, 4).map((f) => <span key={f.code} title={`${f.code} → ${f.assignee === 'DOCTOR' ? 'врач' : 'координатор'}`}><SeverityChip severity={f.severity} /></span>)}{r.open.length > 4 && <span className="text-xs">+{r.open.length - 4}</span>}</div></td>
                  <td className="p-3">{r.patients?.tg_chat_id ? '✈️ Telegram' : '🌐 Веб'}</td>
                  <td className="p-3 text-xs text-muted">{fmtDateTime(new Date(r.updated_at))}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} className="p-6 text-center text-muted">Пока нет визитов. Нажмите «＋ Демо-пациенты» или пройдите анкету в боте / на сайте.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
