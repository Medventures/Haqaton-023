import { Bot, type Context } from 'grammy';
import { questions, questionByCode } from '../content/screening';
import { requiredTests, testByCode } from '../content/tests';
import { specialistNames } from '../content/report';
import { disclaimer } from '../content/clinic';
import { decideFaq } from '../faq/decide';
import * as flow from '../flow';
import { isTodo, nextSteps, phaseNames, statusNames, t, tc } from '../i18n';
import { toKeyboard, type Btn, type OutMsg } from '../notify';
import { apptTimes, eventTitle, planButton } from '../render';
import * as repo from '../repo';
import type { Appt, Patient } from '../repo';
import { answerFood, dietPhase, extractFoodQuestion } from '../rules/diet';
import { detectRedFlag } from '../rules/redflags';
import { bookableDates, combine, slotTimes, validateSlot } from '../rules/slots';
import { checkTestDate } from '../rules/tests';
import { redFlagResponse } from '../content/redflags';
import { addDays, fmtDate, fmtDateTime, fmtTime, isoDay, parseDmy, parseIsoDay } from '../time';
import { readToken } from '../token';
import type { Answer, Lang, ReportExplanationLike } from './types';

type Step = 'LANG' | 'CONSENT' | 'NAME' | 'SERVICE' | 'DATE' | 'TIME' | 'Q' | 'SUMMARY' | 'TESTS' | 'TEST_DATE' | 'DONE' | 'FEEDBACK_1' | 'FEEDBACK_2' | 'FEEDBACK_3' | 'ASK';
interface BotState { step?: Step; qi?: number; ti?: number; editing?: boolean; date?: string; lastQ?: string }

const st = (a: Appt) => a.bot_state as BotState;

async function reply(ctx: Context, msg: OutMsg) {
  await ctx.reply(msg.text, { reply_markup: toKeyboard(msg.buttons), link_preview_options: { is_disabled: true } });
}

function menuKeyboard(lang: Lang) {
  return {
    keyboard: [[{ text: t(lang, 'menu_visit') }, { text: t(lang, 'menu_plan') }], [{ text: t(lang, 'menu_ask') }, { text: t(lang, 'menu_contact') }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}
async function sendMenu(ctx: Context, lang: Lang, text: string) {
  await ctx.reply(text, { reply_markup: menuKeyboard(lang) });
}

async function load(ctx: Context): Promise<{ p: Patient | null; a: Appt | null }> {
  const chatId = ctx.chat?.id;
  if (!chatId) return { p: null, a: null };
  const p = await repo.getPatientByChat(chatId);
  if (!p) return { p: null, a: null };
  return { p, a: await repo.currentAppt(p.id) };
}

async function setState(a: Appt, s: BotState): Promise<Appt> {
  return repo.updateAppt(a.id, { bot_state: { ...a.bot_state, ...s } });
}

// ---------- intake steps ----------

async function askLang(ctx: Context) {
  await reply(ctx, { text: t('ru', 'choose_lang'), buttons: [[{ text: '🇷🇺 Русский', data: 'l:ru' }, { text: '🇰🇿 Қазақша', data: 'l:kk' }]] });
}

async function askConsent(ctx: Context, lang: Lang) {
  await reply(ctx, {
    text: t(lang, 'welcome', { disclaimer: disclaimer[lang] }),
    buttons: [[{ text: t(lang, 'consent_yes'), data: 'c:ok' }, { text: t(lang, 'no'), data: 'c:no' }]],
  });
}

async function askService(ctx: Context, lang: Lang) {
  await reply(ctx, { text: t(lang, 'choose_service'), buttons: [[{ text: t(lang, 'service_colono'), data: 'sv:colono' }], [{ text: t(lang, 'service_mri_soon'), data: 'sv:mri' }]] });
}

async function askDate(ctx: Context, lang: Lang) {
  const dates = bookableDates(new Date(), 12);
  const btns: Btn[] = dates.map((d) => ({ text: fmtDate(d).slice(0, 5), data: `d:${isoDay(d)}` }));
  const rows: Btn[][] = [];
  for (let i = 0; i < btns.length; i += 4) rows.push(btns.slice(i, i + 4));
  await reply(ctx, { text: t(lang, 'choose_date'), buttons: rows });
}

async function askTime(ctx: Context, lang: Lang, day: Date) {
  const times = slotTimes(day);
  const btns: Btn[] = times.map((h) => ({ text: Number(h.slice(0, 2)) >= 14 ? `${h}*` : h, data: `s:${isoDay(day)}:${h}` }));
  const rows: Btn[][] = [];
  for (let i = 0; i < btns.length; i += 4) rows.push(btns.slice(i, i + 4));
  rows.push([{ text: t(lang, 'back'), data: 'd:back' }]);
  await reply(ctx, { text: `${t(lang, 'choose_time', { date: fmtDate(day) })}\n${t(lang, 'time_review_note')}`, buttons: rows });
}

async function askQuestion(ctx: Context, lang: Lang, qi: number) {
  const q = questions[qi];
  const hint = q.hint ? `\n\n💊 ${q.hint[lang]}` : '';
  const todo = isTodo(q.source) ? `\n${t(lang, 'todo_review')}` : '';
  await reply(ctx, {
    text: `${t(lang, 'q_progress', { i: qi + 1, n: questions.length })}\n\n${q.text[lang]}${hint}${todo}`,
    buttons: [[{ text: t(lang, 'yes'), data: `q:${q.code}:Y` }, { text: t(lang, 'no'), data: `q:${q.code}:N` }, { text: t(lang, 'unknown'), data: `q:${q.code}:U` }]],
  });
}

const answerLabel = (lang: Lang, a?: Answer) => (a === 'YES' ? t(lang, 'yes') : a === 'NO' ? t(lang, 'no') : a === 'UNKNOWN' ? t(lang, 'unknown') : '—');

async function showSummary(ctx: Context, a: Appt, lang: Lang) {
  const lines = questions.map((q, i) => `${i + 1}. ${q.text[lang]}\n   → ${answerLabel(lang, a.answers[q.code])}`);
  await reply(ctx, {
    text: `${t(lang, 'summary_title')}\n📅 ${a.scheduled_at ? fmtDateTime(new Date(a.scheduled_at)) : '—'}\n\n${lines.join('\n')}`,
    buttons: [[{ text: t(lang, 'summary_ok'), data: 'sum:ok' }, { text: t(lang, 'summary_edit'), data: 'sum:edit' }]],
  });
}

async function askTest(ctx: Context, a: Appt, lang: Lang, ti: number) {
  const test = requiredTests[ti];
  const intro = ti === 0 ? `${t(lang, 'tests_intro', { date: a.scheduled_at ? fmtDate(new Date(a.scheduled_at)) : '—' })}\n\n` : '';
  await reply(ctx, {
    text: intro + t(lang, 'test_q', { title: test.title[lang] }),
    buttons: [[{ text: t(lang, 'test_done'), data: `t:${test.code}:done` }], [{ text: t(lang, 'test_not_done'), data: `t:${test.code}:no` }]],
  });
}

async function nextAfterQuestion(ctx: Context, a: Appt, lang: Lang) {
  const s = st(a);
  if (a.answers.ACUTE_NOW === 'YES') return finishIntake(ctx, a, lang);
  if (s.editing) {
    a = await setState(a, { step: 'SUMMARY', editing: false });
    return showSummary(ctx, a, lang);
  }
  const qi = questions.findIndex((q) => !a.answers[q.code]);
  if (qi >= 0) {
    await setState(a, { step: 'Q', qi });
    return askQuestion(ctx, lang, qi);
  }
  a = await setState(a, { step: 'SUMMARY' });
  return showSummary(ctx, a, lang);
}

async function nextTest(ctx: Context, a: Appt, lang: Lang, fromTi: number) {
  if (fromTi < requiredTests.length) {
    await setState(a, { step: 'TESTS', ti: fromTi });
    return askTest(ctx, a, lang, fromTi);
  }
  return finishIntake(ctx, a, lang);
}

async function finishIntake(ctx: Context, a: Appt, lang: Lang) {
  const r = await flow.finalizeIntake(a);
  const fresh = (await repo.getAppt(a.id))!;
  await reply(ctx, flow.intakeMessage(r, fresh, lang));
  await sendMenu(ctx, lang, `${t(lang, 'status_next', { next: nextSteps[r.status][lang] })}`);
}

// ---------- menu actions ----------

async function showStatus(ctx: Context, p: Patient, a: Appt | null) {
  const lang = p.lang;
  if (!a || a.status === 'DRAFT' && !a.scheduled_at) return reply(ctx, { text: t(lang, 'no_visit') });
  const when = a.scheduled_at ? fmtDateTime(new Date(a.scheduled_at)) : '—';
  const flags = (await repo.flagsFor(a.id)).filter((f) => f.status === 'OPEN');
  const lines = [t(lang, 'status_title'), t(lang, 'status_line', { when, status: statusNames[a.status][lang] }), t(lang, 'status_next', { next: nextSteps[a.status][lang] })];
  if (flags.length && ['NEEDS_CLINIC_REVIEW', 'PREP_PROBLEM'].includes(a.status)) lines.push(`⚠️ ${flags.length}`);
  const buttons: Btn[][] = [[planButton(a, lang)]];
  if (a.status === 'TESTS_PENDING') buttons.unshift([{ text: t(lang, 'tests_update_btn'), data: 'tupd' }]);
  if (a.status === 'NEEDS_CLINIC_REVIEW' || a.status === 'NOT_CLEARED') buttons.unshift([{ text: t(lang, 'discuss_btn'), data: 'disc' }]);
  if (a.status === 'RESULTS_READY') buttons.unshift([{ text: t(lang, 'spec_btn'), data: 'spec' }]);
  if (!['COMPLETED', 'RESULTS_READY', 'CANCELLED'].includes(a.status)) buttons.push([{ text: t(lang, 'cancel_btn'), data: 'cx' }]);
  await reply(ctx, { text: lines.join('\n'), buttons });
}

async function showPlan(ctx: Context, p: Patient, a: Appt | null) {
  const lang = p.lang;
  if (!a) return reply(ctx, { text: t(lang, 'no_visit') });
  const events = (await repo.eventsFor(a.id)).filter((e) => e.kind !== 'nag');
  if (!events.length) return reply(ctx, { text: t(lang, 'plan_none'), buttons: [[planButton(a, lang)]] });
  const now = repo.nowFor(a);
  const lines = events.map((e) => {
    const due = new Date(e.due_at);
    const icon = e.status === 'SKIPPED' ? '⚪' : ['CONFIRMED'].includes(e.status) ? '✅' : e.status === 'HELP' ? '🆘' : e.status === 'SENT' ? '🔔' : due < now ? '⏳' : '▫️';
    const extra = e.status === 'SKIPPED' ? ` — ${t(lang, 'plan_skipped')}` : '';
    return `${icon} ${fmtDate(due).slice(0, 5)} ${fmtTime(due)} — ${eventTitle(e.code, lang)}${extra}`;
  });
  await reply(ctx, { text: `${t(lang, 'plan_title')} (${a.prep_drug ?? ''})\n\n${lines.join('\n')}`, buttons: [[planButton(a, lang)]] });
}

async function handleQuestion(ctx: Context, p: Patient, a: Appt | null, text: string) {
  const lang = p.lang;
  // 1) food by diet phase
  const product = extractFoodQuestion(text);
  if (product && !/лекарств|таблет|препарат|дәрі|не пить|отмен/i.test(text)) {
    const times = a ? apptTimes(a) : null;
    const phase = dietPhase(times, a?.scheduled_at ? new Date(a.scheduled_at) : null, a ? repo.nowFor(a) : new Date(), a ? ['COMPLETED', 'RESULTS_READY'].includes(a.status) : false);
    const ans = answerFood(product, phase, times, lang);
    let out: string;
    switch (ans.kind) {
      case 'NO_RESTRICTIONS': out = t(lang, 'food_no_restrictions', { date: fmtDate(ans.dietStart) }); break;
      case 'ALLOWED': out = t(lang, 'food_allowed', { food: ans.food }); break;
      case 'ONLY': out = t(lang, 'food_only', { phase: phaseNames[ans.phase][lang], list: ans.allowed.join(', ') }); break;
      case 'NPO': out = t(lang, 'food_npo'); break;
      case 'AFTER': out = t(lang, 'food_after'); break;
      default: out = t(lang, 'food_unknown_plan');
    }
    if (a) await repo.logEvent(a.id, 'faq_answered', { id: `food:${ans.kind}`, via: 'rules' });
    return reply(ctx, { text: `${out}\n\n${t(lang, 'faq_source', { source: 'Памятка Prime Green Clinic' })}` });
  }
  // 2) "can I stop my medication" → always doctor
  if (/(можно|нужно|надо)\s.*(отмен|не пить|не принимать|бросить).*(лекарств|таблет|препарат|инсулин|аспирин|кардиомагнил|эликвис|ксарелто|варфарин)/i.test(text)) {
    if (a) await repo.logEvent(a.id, 'faq_answered', { id: 'meds_doctor', via: 'rules' });
    return reply(ctx, { text: t(lang, 'meds_doctor') });
  }
  // 3) FAQ (fuzzy, then LLM picks an id)
  const d = await decideFaq(text);
  if (d.kind === 'answer') {
    if (a) {
      await repo.logEvent(a.id, 'faq_answered', { id: d.item.id, score: d.score, via: d.via });
      if (d.item.escalate) await repo.addRequest(a.id, 'HELP', `faq:${d.item.id}`);
    }
    const todo = isTodo(d.item.source) ? `\n${t(lang, 'todo_review')}` : '';
    return reply(ctx, { text: `${tc(lang, d.item.answer)}${todo}\n\n${t(lang, 'faq_source', { source: d.item.source })}` });
  }
  if (a) await setState(a, { lastQ: text.slice(0, 500) });
  if (d.kind === 'suggest') {
    return reply(ctx, {
      text: t(lang, 'faq_maybe'),
      buttons: [...d.items.map((i) => [{ text: i.variants[lang === 'kk' ? i.variants.length - 1 : 0], data: `faq:${i.id}` }]), [{ text: t(lang, 'faq_send'), data: 'faqsend' }]],
    });
  }
  if (a) await repo.logEvent(a.id, 'faq_miss');
  return reply(ctx, { text: t(lang, 'faq_none'), buttons: [[{ text: t(lang, 'faq_send'), data: 'faqsend' }]] });
}

// ---------- bot ----------

export function createBot(token: string) {
  const bot = new Bot(token);
  // A failed send (patient blocked the bot, network hiccup) must not abort the handler
  // halfway: state changes after the reply would be lost. Log and continue.
  bot.api.config.use(async (prev, method, payload, signal) => {
    const res = await prev(method, payload, signal);
    if (!res.ok && ['sendMessage', 'answerCallbackQuery'].includes(method)) {
      console.error('tg_api_failed', method, res.error_code);
      return { ok: true, result: true } as unknown as typeof res;
    }
    return res;
  });

  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    let p = await repo.getPatientByChat(chatId);
    const payload = ctx.match?.trim();
    // Deep link from the website: attach Telegram to an existing web appointment.
    if (payload) {
      const apptId = readToken(payload.replace(/^p_/, ''));
      const target = apptId ? await repo.getAppt(apptId) : null;
      if (target) {
        const owner = await repo.getPatient(target.patient_id);
        if (p && p.id !== owner.id) await repo.updatePatient(p.id, { tg_chat_id: null });
        await repo.updatePatient(owner.id, { tg_chat_id: chatId });
        await repo.logEvent(target.id, 'telegram_linked');
        await sendMenu(ctx, owner.lang, t(owner.lang, 'tg_linked'));
        return showStatus(ctx, { ...owner, tg_chat_id: chatId }, target);
      }
      await ctx.reply(t('ru', 'link_bad'));
    }
    if (!p) p = await repo.createPatient({ tg_chat_id: chatId, name: ctx.from?.first_name ?? null });
    const a = await repo.currentAppt(p.id);
    if (a && a.status !== 'DRAFT') {
      await sendMenu(ctx, p.lang, t(p.lang, 'status_title'));
      return showStatus(ctx, p, a);
    }
    const draft = a ?? await repo.createAppt({ patient_id: p.id, channel: 'telegram' });
    await setState(draft, { step: 'LANG' });
    return askLang(ctx);
  });

  bot.command(['status', 'visit'], async (ctx) => { const { p, a } = await load(ctx); if (!p) return askLang(ctx); return showStatus(ctx, p, a); });
  bot.command('plan', async (ctx) => { const { p, a } = await load(ctx); if (!p) return askLang(ctx); return showPlan(ctx, p, a); });
  bot.command('contact', async (ctx) => { const { p } = await load(ctx); return ctx.reply(t(p?.lang ?? 'ru', 'contact')); });
  bot.command('help', async (ctx) => {
    const { p } = await load(ctx);
    const lang = p?.lang ?? 'ru';
    await ctx.reply(lang === 'ru'
      ? '/start — начать или продолжить\n/status — мой визит\n/plan — план подготовки\n/ask — задать вопрос\n/contact — связаться с клиникой\n/lang — сменить язык\n/cancel — отменить визит\n\nМожно просто написать вопрос, например «можно ли кофе?».'
      : '/start — бастау немесе жалғастыру\n/status — менің сапарым\n/plan — дайындық жоспары\n/ask — сұрақ қою\n/contact — клиникамен байланыс\n/lang — тілді ауыстыру\n/cancel — сапарды болдырмау\n\nСұрақты жай жаза беруге болады, мысалы «кофе ішуге бола ма?».');
  });
  bot.command('ask', async (ctx) => { const { p } = await load(ctx); return ctx.reply(t(p?.lang ?? 'ru', 'ask_prompt')); });
  bot.command('lang', async (ctx) => askLang(ctx));
  bot.command('cancel', async (ctx) => {
    const { p, a } = await load(ctx);
    if (!p || !a) return ctx.reply(t(p?.lang ?? 'ru', 'no_visit'));
    return askCancel(ctx, p.lang);
  });

  async function askCancel(ctx: Context, lang: Lang) {
    await reply(ctx, {
      text: t(lang, 'cancel_reason_q'),
      buttons: (['PREP', 'HEALTH', 'PLANS', 'OTHER'] as const).map((r) => [{ text: t(lang, `cancel_r_${r}`), data: `cxr:${r}` }]),
    });
  }

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery().catch(() => undefined);
    const { p: p0, a: a0 } = await load(ctx);
    let p = p0; let a = a0;
    if (!p) return askLang(ctx);
    let lang = p.lang;
    const [kind, x, y, z] = data.split(':');

    // Language switch works at any time.
    if (kind === 'l') {
      lang = x === 'kk' ? 'kk' : 'ru';
      await repo.updatePatient(p.id, { lang });
      if (a && st(a).step === 'LANG') {
        await setState(a, { step: p.consent_at ? 'SERVICE' : 'CONSENT' });
        return p.consent_at ? askService(ctx, lang) : askConsent(ctx, lang);
      }
      return sendMenu(ctx, lang, '✅');
    }
    if (kind === 'c') {
      if (x !== 'ok') return ctx.reply(t(lang, 'consent_required'));
      await repo.updatePatient(p.id, { consent_at: new Date().toISOString() });
      if (!a) a = await repo.createAppt({ patient_id: p.id, channel: 'telegram' });
      await setState(a, { step: 'NAME' });
      return ctx.reply(t(lang, 'ask_name'));
    }
    if (kind === 'sv') {
      if (x !== 'colono') return ctx.reply(t(lang, 'service_soon'));
      if (!a) return;
      await setState(a, { step: 'DATE' });
      return askDate(ctx, lang);
    }
    if (kind === 'd') {
      if (!a) return;
      if (x === 'back') return askDate(ctx, lang);
      const day = parseIsoDay(x);
      if (!day) return askDate(ctx, lang);
      await setState(a, { step: 'TIME', date: x });
      return askTime(ctx, lang, day);
    }
    if (kind === 's') {
      if (!a || a.status !== 'DRAFT') return;
      const day = parseIsoDay(x);
      if (!day) return askDate(ctx, lang);
      const when = combine(day, `${y}:${z}`);
      const check = validateSlot(when, new Date());
      if (!check.ok) { await ctx.reply(t(lang, `slot_bad_${check.reason}`)); return askTime(ctx, lang, day); }
      a = await repo.updateAppt(a.id, { scheduled_at: when.toISOString() });
      await ctx.reply(t(lang, 'q_intro', { n: questions.length }));
      return nextAfterQuestion(ctx, a, lang);
    }
    if (kind === 'q') {
      if (!a) return;
      if (a.status !== 'DRAFT') return ctx.reply(t(lang, 'locked'));
      if (!questionByCode[x]) return;
      const ans: Answer = y === 'Y' ? 'YES' : y === 'N' ? 'NO' : 'UNKNOWN';
      // Idempotency: ignore a stale button for an already answered question unless editing it.
      if (a.answers[x] && !st(a).editing) return;
      a = await repo.saveAnswer(a, x, ans);
      return nextAfterQuestion(ctx, a, lang);
    }
    if (kind === 'sum') {
      if (!a || a.status !== 'DRAFT') return;
      if (x === 'ok') return nextTest(ctx, a, lang, requiredTests.findIndex((tt) => !a!.tests[tt.code]) === -1 ? requiredTests.length : requiredTests.findIndex((tt) => !a!.tests[tt.code]));
      return reply(ctx, { text: t(lang, 'edit_pick'), buttons: questions.map((q, i) => [{ text: `${i + 1}. ${q.text[lang].slice(0, 40)}… → ${answerLabel(lang, a!.answers[q.code])}`, data: `e:${q.code}` }]) });
    }
    if (kind === 'e') {
      if (!a || a.status !== 'DRAFT') return ctx.reply(t(lang, 'locked'));
      const qi = questions.findIndex((q) => q.code === x);
      if (qi < 0) return;
      await setState(a, { step: 'Q', qi, editing: true });
      return askQuestion(ctx, lang, qi);
    }
    if (kind === 't') {
      if (!a) return;
      const ti = requiredTests.findIndex((tt) => tt.code === x);
      if (ti < 0) return;
      if (y === 'no') {
        a = await repo.saveTest(a, x, { done: false });
        return nextTest(ctx, a, lang, ti + 1);
      }
      await setState(a, { step: 'TEST_DATE', ti });
      return ctx.reply(t(lang, 'test_date_prompt', { title: testByCode[x].title[lang], example: fmtDate(addDays(new Date(), -3)) }));
    }
    if (kind === 'tupd') {
      if (!a) return;
      if (!['TESTS_PENDING', 'DRAFT'].includes(a.status)) return showStatus(ctx, p, a);
      a = await repo.updateAppt(a.id, { tests: {}, status: 'DRAFT' });
      return nextTest(ctx, a, lang, 0);
    }
    if (kind === 'ev') return reply(ctx, await flow.answerEvent(Number(x), y === 'help' ? 'help' : 'done', lang));
    if (kind === 'st') return reply(ctx, await flow.answerStool(Number(x), Number(y), lang));
    if (kind === 'ck') return reply(ctx, await flow.answerChecklist(Number(x), Number(y), z === 'y', lang));
    if (kind === 'fb') {
      if (!a) return;
      if (x === 'c') { await flow.saveFeedback(a.id, { clarity: Number(y) }); await setState(a, { step: 'FEEDBACK_2' }); return reply(ctx, flow.feedbackQ2(lang)); }
      if (x === 'p') { await flow.saveFeedback(a.id, { completed: y }); await setState(a, { step: 'FEEDBACK_3' }); return reply(ctx, { text: t(lang, 'fb_q3'), buttons: [[{ text: t(lang, 'fb_skip'), data: 'fb:skip' }]] }); }
      if (x === 'skip') { await setState(a, { step: 'DONE' }); await repo.logEvent(a.id, 'feedback_done'); return ctx.reply(t(lang, 'fb_thanks')); }
    }
    if (kind === 'faq') {
      const { faqById } = await import('../content/faq');
      const item = faqById[x];
      if (!item) return;
      if (a) await repo.logEvent(a.id, 'faq_answered', { id: item.id, via: 'suggest' });
      return ctx.reply(`${tc(lang, item.answer)}\n\n${t(lang, 'faq_source', { source: item.source })}`);
    }
    if (kind === 'faqsend') {
      if (a) { await repo.addRequest(a.id, 'FAQ_UNANSWERED', st(a).lastQ ?? ''); await repo.logEvent(a.id, 'faq_escalated'); }
      return ctx.reply(t(lang, 'faq_sent'));
    }
    if (kind === 'disc') {
      if (a) { await repo.addRequest(a.id, 'DISCUSS', 'patient_request'); await repo.logEvent(a.id, 'discuss_requested'); }
      return ctx.reply(t(lang, 'discuss_sent'));
    }
    if (kind === 'cx') return askCancel(ctx, lang);
    if (kind === 'cxr') {
      if (!a) return;
      await flow.cancelAppointment(a.id, x);
      return ctx.reply(t(lang, 'cancelled'));
    }
    if (kind === 'spec') {
      if (!a) return;
      const doc = await repo.docFor(a.id, 'REPORT');
      const spec = ((doc?.explanation as unknown as ReportExplanationLike | null)?.analysis?.specialist ?? 'GASTRO') as 'GASTRO' | 'PROCTO';
      const slots = flow.specialistSlots(repo.nowFor(a));
      return reply(ctx, { text: t(lang, 'spec_pick', { spec: specialistNames[spec][lang] }), buttons: slots.map((d) => [{ text: fmtDateTime(d), data: `spb:${Math.floor(d.getTime() / 60000)}` }]) });
    }
    if (kind === 'spb') {
      if (!a) return;
      return reply(ctx, await flow.bookSpecialist(a.id, new Date(Number(x) * 60000), lang));
    }
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    const { p, a: a0 } = await load(ctx);
    if (!p) return askLang(ctx);
    let a = a0;
    const lang = p.lang;

    // Red flags interrupt everything.
    const rf = detectRedFlag(text);
    if (rf) {
      await flow.reportRedFlag(a?.id ?? null, rf, 'telegram');
      return ctx.reply(tc(lang, redFlagResponse));
    }

    const step = a ? st(a).step : undefined;
    if (a && step === 'NAME') {
      await repo.updatePatient(p.id, { name: text.slice(0, 80) });
      await setState(a, { step: 'SERVICE' });
      return askService(ctx, lang);
    }
    if (a && step === 'TEST_DATE') {
      const ti = st(a).ti ?? 0;
      const test = requiredTests[ti];
      const date = parseDmy(text);
      const check = checkTestDate(date, new Date());
      if (!check.ok) return ctx.reply(t(lang, `test_date_${check.reason}`, { example: fmtDate(addDays(new Date(), -3)) }));
      a = await repo.saveTest(a, test.code, { done: true, date: isoDay(date!) });
      return nextTest(ctx, a, lang, ti + 1);
    }
    if (a && step === 'FEEDBACK_3') {
      await flow.saveFeedback(a.id, { comment: text.slice(0, 1000) });
      await setState(a, { step: 'DONE' });
      await repo.logEvent(a.id, 'feedback_done');
      return ctx.reply(t(lang, 'fb_thanks'));
    }

    const is = (key: 'menu_visit' | 'menu_plan' | 'menu_ask' | 'menu_contact') => text === t('ru', key) || text === t('kk', key);
    if (is('menu_visit')) return showStatus(ctx, p, a);
    if (is('menu_plan')) return showPlan(ctx, p, a);
    if (is('menu_ask')) return ctx.reply(t(lang, 'ask_prompt'));
    if (is('menu_contact')) return ctx.reply(t(lang, 'contact'));

    // In the middle of button-only steps, free text goes to FAQ but we remind where we are.
    if (a && a.status === 'DRAFT' && step && ['LANG', 'CONSENT', 'SERVICE', 'DATE', 'TIME', 'Q', 'SUMMARY', 'TESTS'].includes(step)) {
      await handleQuestion(ctx, p, a, text);
      if (step === 'Q' && st(a).qi !== undefined) return askQuestion(ctx, lang, st(a).qi!);
      return;
    }
    return handleQuestion(ctx, p, a, text);
  });

  bot.catch((err) => {
    console.error('bot_error', err.error instanceof Error ? err.error.message.slice(0, 200) : 'unknown');
  });

  return bot;
}
