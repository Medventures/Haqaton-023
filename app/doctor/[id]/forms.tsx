'use client';

import { useState, useTransition } from 'react';
import { doctorParsePdf, doctorPrepareReport, doctorPublishPre, doctorPublishReport } from '../../actions';
import type { ReportExplanation } from '@/lib/ai/explain';
import type { PreDecision } from '@/lib/flow';

const labsToText = (labs: PreDecision['labs']) => labs.map((l) => [l.indicator, l.value, l.units, l.reference, l.mark].join(' | ')).join('\n');
const textToLabs = (s: string): PreDecision['labs'] => s.split('\n').map((line) => line.split('|').map((c) => c.trim())).filter((c) => c[0] && c[1]).map(([indicator, value, units = '', reference = '', mark = '']) => ({ indicator, value, units, reference, mark }));

const DEMO: PreDecision = {
  clearance: 'CLEARED', drug: 'Эзиклен', scheme: 'SPLIT', liquidStopHours: 2,
  labs: [
    { indicator: 'Гемоглобин', value: '128', units: 'г/л', reference: '120–160', mark: '' },
    { indicator: 'Тромбоциты', value: '140', units: '×10⁹/л', reference: '150–400', mark: '↓' },
    { indicator: 'МНО', value: '1.1', units: '', reference: '0.8–1.2', mark: '' },
  ],
  conclusions: ['ЭКГ: синусовый ритм, без острых изменений.', 'Противопоказаний к седации не выявлено.'],
  instructions: ['Эзиклен по двухэтапной схеме строго по инструкции.', 'Симетикон добавить в последнюю порцию препарата.'],
};

export function PreForm({ apptId, initial }: { apptId: string; initial?: PreDecision | null }) {
  const [d, setD] = useState<PreDecision>(initial ?? { ...DEMO, labs: [], conclusions: [], instructions: [] });
  const [labs, setLabs] = useState(labsToText(d.labs));
  const [concl, setConcl] = useState(d.conclusions.join('\n'));
  const [instr, setInstr] = useState(d.instructions.join('\n'));
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const fill = (x: PreDecision) => { setD(x); setLabs(labsToText(x.labs)); setConcl(x.conclusions.join('\n')); setInstr(x.instructions.join('\n')); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-ghost btn-sm cursor-pointer">📎 Загрузить PDF
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const fd = new FormData(); fd.append('file', f);
            start(async () => {
              const r = await doctorParsePdf(fd);
              if (!r.ok || r.kind !== 'PRE' || !r.pre) { setMsg(r.error ?? 'Это не документ допуска'); return; }
              const p = r.pre;
              fill({ clearance: p.clearance ?? 'CONSULT', drug: p.drug ?? 'Эзиклен', scheme: p.scheme ?? 'SPLIT', liquidStopHours: p.liquidStopHours ?? 2, labs: p.labs ?? [], conclusions: p.conclusions ?? [], instructions: p.instructions ?? [] });
              setMsg(p.warnings.length ? `Разобрано с замечаниями: ${p.warnings.join('; ')}. Проверьте поля.` : 'PDF разобран — проверьте поля перед публикацией.');
            });
          }} />
        </label>
        <a className="btn-ghost btn-sm" href="/demo/doctor-pre-cleared.pdf" target="_blank">⬇ Демо-PDF (допуск)</a>
        <a className="btn-ghost btn-sm" href="/demo/doctor-pre-eliquis.pdf" target="_blank">⬇ Демо-PDF (Эликвис)</a>
        <button type="button" className="btn-ghost btn-sm" onClick={() => fill(DEMO)}>Заполнить демо-данными</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label><span className="label">Допуск</span>
          <select className="input" value={d.clearance} onChange={(e) => setD({ ...d, clearance: e.target.value as PreDecision['clearance'] })}>
            <option value="CLEARED">ДОПУЩЕН</option><option value="CONSULT">НУЖНА КОНСУЛЬТАЦИЯ</option><option value="NOT_CLEARED">НЕ ДОПУЩЕН</option>
          </select></label>
        <label><span className="label">Препарат</span>
          <select className="input" value={d.drug} onChange={(e) => setD({ ...d, drug: e.target.value })}>
            {['Эзиклен', 'Кленсия', 'Фортранс'].map((x) => <option key={x}>{x}</option>)}
          </select></label>
        <label><span className="label">Схема</span>
          <select className="input" value={d.scheme} onChange={(e) => setD({ ...d, scheme: e.target.value as PreDecision['scheme'] })}>
            <option value="SPLIT">SPLIT (двухэтапная)</option><option value="SINGLE_EVENING">SINGLE_EVENING (одноэтапная)</option>
          </select></label>
        <label><span className="label">Стоп жидкости, ч до процедуры</span>
          <select className="input" value={d.liquidStopHours} onChange={(e) => setD({ ...d, liquidStopHours: Number(e.target.value) })}>
            {[2, 3, 4].map((x) => <option key={x} value={x}>{x}</option>)}
          </select></label>
      </div>
      <label className="block"><span className="label">Анализы (Показатель | Результат | Ед. | Референс | Отметка)</span><textarea className="input font-mono text-xs" rows={4} value={labs} onChange={(e) => setLabs(e.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">Заключения (по строке)</span><textarea className="input" rows={3} value={concl} onChange={(e) => setConcl(e.target.value)} /></label>
        <label><span className="label">Указания для подготовки (по строке)</span><textarea className="input" rows={3} value={instr} onChange={(e) => setInstr(e.target.value)} /></label>
      </div>
      <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await doctorPublishPre(apptId, { ...d, labs: textToLabs(labs), conclusions: concl.split('\n').map((s) => s.trim()).filter(Boolean), instructions: instr.split('\n').map((s) => s.trim()).filter(Boolean) });
        setMsg(r.ok ? '✅ Опубликовано. Пациент получил нейтральное уведомление.' : `Ошибка: ${r.error}`);
      })}>{pending ? '…' : 'Подтвердить и опубликовать'}</button>
      {msg && <p className="text-sm text-brand-dark">{msg}</p>}
    </div>
  );
}

export function ReportForm({ apptId, published }: { apptId: string; published: boolean }) {
  const [text, setText] = useState('');
  const [expl, setExpl] = useState<ReportExplanation | null>(null);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const levelTone = ['bg-brand-100 text-brand-dark', 'bg-amber-100 text-amber-800', 'bg-red-100 text-red-700'];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-ghost btn-sm cursor-pointer">📎 PDF заключения
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const fd = new FormData(); fd.append('file', f);
            start(async () => { const r = await doctorParsePdf(fd); if (r.ok && r.report) { setText(r.report); setExpl(null); } else setMsg(r.error ?? 'В PDF нет раздела «ЗАКЛЮЧЕНИЕ КОЛОНОСКОПИИ»'); });
          }} />
        </label>
        <a className="btn-ghost btn-sm" href="/demo/report-calm.pdf" target="_blank">⬇ Демо: спокойное</a>
        <a className="btn-ghost btn-sm" href="/demo/report-alarm.pdf" target="_blank">⬇ Демо: тревожное</a>
      </div>
      <textarea className="input" rows={5} value={text} onChange={(e) => { setText(e.target.value); setExpl(null); }} placeholder="Текст заключения колоноскопии (дословно)" />
      <button type="button" className="btn-ghost" disabled={pending || !text.trim()} onClick={() => start(async () => setExpl(await doctorPrepareReport(text)))}>{pending && !expl ? 'AI готовит пересказ…' : '1. Сформировать объяснение'}</button>
      {expl && (
        <div className="space-y-2 rounded-2xl border border-line p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${levelTone[expl.analysis.alarm]}`}>Уровень тревоги (правила): {expl.analysis.alarm}</span>
            <span className="chip bg-zinc-100 text-zinc-700">Пересказ: {expl.source === 'llm' ? `AI (${expl.model})` : 'правила'}</span>
            {expl.analysis.bbps !== null && <span className="chip bg-zinc-100 text-zinc-700">BBPS {expl.analysis.bbps}</span>}
          </div>
          <p className="text-xs text-muted">Термины: {expl.analysis.terms.map((t) => `${t.id}${t.negated ? ' (отрицание)' : ''}`).join(', ') || '—'}</p>
          <p className="whitespace-pre-line">{expl.summary.ru}</p>
          <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => { await doctorPublishReport(apptId, text, expl); setMsg('✅ Опубликовано. Пациенту отправлено уведомление «результаты готовы».'); })}>2. Опубликовать пациенту</button>
        </div>
      )}
      {published && !expl && <p className="text-xs text-muted">Заключение уже опубликовано; повторная публикация заменит его.</p>}
      {msg && <p className="text-sm text-brand-dark">{msg}</p>}
    </div>
  );
}
