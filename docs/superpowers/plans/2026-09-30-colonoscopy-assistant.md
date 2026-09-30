# Green Clinic Colonoscopy Assistant — Spec + Implementation Plan

> **For agentic workers:** execute natively task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Telegram-бот и веб-сервис, которые ведут пациента по цепочке «противопоказания и анализы → план подготовки → напоминания о визите → объяснение заключения → запись к специалисту» для колоноскопии с седацией в Prime Green Clinic.

**Architecture:** Одно Next.js-приложение на Vercel. Там же webhook Telegram (grammY), веб-страницы пациента и панель врача. Вся медицинская логика — чистые функции в `lib/rules/*` и `lib/content/*`, их вызывают и бот, и сайт. Состояние хранится в Supabase Postgres. Напоминания отправляет `tick`: pg_cron раз в минуту делает POST на `/api/cron/tick`. AI (Claude) спрятан за адаптером с OpenAI-совместимой альтернативой (Ollama) и детерминированным fallback.

**Tech Stack:** TypeScript, Next.js 15 (MIT), React 19, Tailwind CSS 4 (MIT), grammY (MIT), @supabase/supabase-js (MIT) + Supabase Postgres (Apache-2.0), unpdf (MIT), @anthropic-ai/sdk, Vitest (MIT).

**Spec:** `docs/RESEARCH.md` (входные данные, переменные, путь, изменения ТЗ) + исходное ТЗ команды и разбор судьи.

## Global Constraints
- Бот не ставит диагноз, не назначает и не отменяет лекарства, не решает о допуске. Неопределённость → `NEEDS_CLINIC_REVIEW`.
- «Не знаю» всегда даёт флаг, никогда не равно «нет».
- Персональные анализы и заключения — только на странице `/p/{token}` (HMAC-токен), в Telegram — только нейтральные уведомления.
- У каждой медицинской записи в контенте есть `source`; `TODO_MEDICAL_REVIEW` показывается с пометкой «[требует проверки врачом]».
- Дисклеймер на каждом медицинском экране: «Сервис помогает подготовиться к визиту и не заменяет врача. Решения о лечении и допуске принимает врач.»
- Часовой пояс — фиксированный UTC+5 (Казахстан с 01.03.2024), без зависимости от tzdata.
- Часы клиники: Пн–Пт 08:00–20:00, Сб 09:00–17:00, Вс закрыто. Поддержанные слоты начала: 08:00–13:30 (шаг 30 мин).
- ОАК и ЭКГ действительны 30 дней на дату процедуры.
- Языки: ru и kk. Казахские медицинские тексты помечены как требующие проверки носителем.
- Секреты только в переменных окружения Vercel, в git их нет.
- LLM никогда не понижает уровень тревоги и не генерирует ответ FAQ: она выбирает id из `faq` или пересказывает словарь терминов.

## Review Focus
1. Двойное нажатие кнопки / повтор webhook от Telegram → не должно создавать дубли флагов и событий (идемпотентность по `update_id` и статусу).
2. Отрицания в заключении («полипов не выявлено», «без признаков стеноза») → термин не считается тревожным.
3. Безобидный текст со словом «кровь» («когда сдавать анализ крови») → не red flag.
4. Запись меньше чем за 3 дня до процедуры → прошедшие события плана помечаются «пропущено — уточните у клиники», а не отправляются пачкой.
5. Перемотка времени в демо одного пациента → не влияет на других пациентов.

---

## File Structure
```
app/                      Next.js App Router
  page.tsx                лендинг
  start/                  веб-анкета (дубль бота)
  p/[token]/              кабинет пациента (план, анализы, заключение, FAQ, отзыв)
  doctor/                 панель врача (логин, список, карточка)
  api/telegram/route.ts   webhook
  api/cron/tick/route.ts  отправка наступивших напоминаний
  api/setup/route.ts      setWebhook + setMyCommands
lib/
  content/*.ts            контент для медиков (анкета, анализы, диета, FAQ, red flags, словари), ru+kk
  rules/*.ts              screening, tests, slots, timeline, stool, checklist, redflags, diet, report
  faq/matcher.ts          нечёткий поиск + выбор через LLM
  ai/llm.ts               адаптер Claude / OpenAI-compatible
  db.ts, repo.ts          доступ к Supabase
  flow.ts                 оркестрация: intake → статусы → план → события
  bot/*.ts                grammY: хендлеры, клавиатуры, тексты
  i18n.ts, time.ts, token.ts
supabase/migrations/*.sql
tests/*.test.ts
```

## Tasks

### Task 1: Schema + security (Supabase)
- [ ] Миграция: `patients, appointments, flags, requests, prep_events, docs, feedback, events, tg_updates`.
- [ ] RLS на всех таблицах; одна политика `private.is_server()` сравнивает заголовок `x-app-secret` с `private.config`. У anon без секрета — пусто.
- [ ] Проверка: `select` через anon без заголовка → 0 строк; с заголовком → данные.

### Task 2: Content + rules (pure, TDD)
**Interfaces (Produces):**
- `evaluateScreening(answers: Record<string, Answer>): {flags: Flag[], urgent: boolean, tasks: string[]}`
- `evaluateTests(tests, procedureDate): {missing: TestIssue[], ok: boolean}`
- `validateSlot(date: Date, now: Date): {ok, reason?, needsReview?}`
- `buildTimeline(appt): PrepEventDraft[]` (skipped, если в прошлом)
- `dietPhase(appt, now): 'NONE'|'DIET'|'BROTH'|'CLEAR'|'NPO'|'AFTER'`
- `detectRedFlag(text): string | null`
- `explainReport(text, lang): {terms: MatchedTerm[], alarm: 0|1|2}`
- `matchFaq(text, lang): {id, score} | null`
- [ ] Тесты — сценарии 2–10 из ТЗ + пункты Review Focus 2, 3, 4.

### Task 3: Flow + repo
- [ ] `flow.submitIntake`, `flow.doctorPublishPre`, `flow.markCompleted`, `flow.publishReport`, `flow.tick(now)`, `flow.handleStool`, `flow.handleChecklist`, `flow.cancel`.
- [ ] Идемпотентность: `tg_updates(update_id pk)`; события плана уникальны по `(appointment_id, code)`.

### Task 4: Telegram bot
- [ ] /start (язык → согласие → слот → анкета по одному вопросу → сводка → анализы → итог), /status, /plan, /help, /contact, /lang, /cancel, deep-link `start=<token>` для привязки веб-визита.
- [ ] Каждый текст пациента проходит `detectRedFlag` → затем FAQ.

### Task 5: Web
- [ ] Лендинг в стиле клиники (зелёная палитра, белые карточки, скругления), переключатель RU/KK.
- [ ] `/start` — та же анкета формой; `/p/[token]` — кабинет; `/doctor` — панель с метриками, карточкой, публикациями, машиной времени.

### Task 6: AI
- [ ] `llm.complete()` с таймаутом 8 с; при ошибке — fallback.
- [ ] Пересказ заключения: JSON-ответ, пост-фильтр запрещённых фраз.
- [ ] FAQ: LLM выбирает id, только если нечёткий поиск < 75.

### Task 7: Deploy + verify
- [ ] Vercel project из GitHub, env, отключить защиту деплоя для webhook, `/api/setup`, pg_cron.
- [ ] Прогон сценариев на проде (веб + бот), фиксы.

## Strengths / Weaknesses (честно)
**Сильные стороны:** полная цепочка кейса, включая объяснение заключения и запись к специалисту; детерминированная безопасность (правила и словари), AI только поверх; веб-дубль страхует демо, если Telegram на площадке не работает; per-appointment машина времени; метрики кейса на дашборде.

**Слабые стороны и риски:**
- Claude и Vercel — не open source. Смягчение: адаптер с Ollama/Qwen, Supabase и весь код — OSS, AI можно выключить (`LLM_PROVIDER=none`).
- Тексты памятки взяты из поисковой выдачи, а не с сайта напрямую → медики команды должны сверить `lib/content`.
- Казахские медицинские формулировки написаны без проверки носителем-медиком.
- pg_cron даёт гранулярность 1 минута; при сбое Vercel напоминание уйдёт на следующем тике (retry по `attempts`).
- Защита панели врача — один пароль (уровень демо).
- Заключение колоноскопии уходит во внешний LLM (в демо данные синтетические; в проде — локальная модель).
