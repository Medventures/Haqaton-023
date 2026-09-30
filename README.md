# Prime Green Clinic — ассистент подготовки к колоноскопии (хакатон)

Telegram-бот + веб-сервис, который ведёт пациента по цепочке кейса:
**противопоказания и анализы → персональный план подготовки → напоминания о визите → объяснение заключения → запись к специалисту**.

- Ресерч, входные данные, пользовательский путь и изменения ТЗ: [`docs/RESEARCH.md`](docs/RESEARCH.md)
- План, сильные и слабые стороны: [`docs/superpowers/plans/2026-09-30-colonoscopy-assistant.md`](docs/superpowers/plans/2026-09-30-colonoscopy-assistant.md)

## Принципы безопасности
- Медицинские решения принимают **правила из `lib/content` + врач**. Бот не ставит диагноз, не отменяет лекарства и не решает о допуске.
- «Не знаю» всегда даёт флаг. Неопределённость → `NEEDS_CLINIC_REVIEW`.
- AI (Claude за адаптером) **только** пересказывает определения из словаря терминов и выбирает id ответа из FAQ. Уровень тревоги заключения считают правила; LLM его не меняет. Без LLM всё работает на правилах (`LLM_PROVIDER=none`).
- Анализы и заключения — только на странице `/p/<подписанный токен>`, в Telegram — нейтральные уведомления.

## Стек (open source)
TypeScript · Next.js 15 · React 19 · Tailwind CSS 4 · grammY (Telegram webhook) · Supabase Postgres (+ pg_cron / pg_net для напоминаний) · unpdf · Vitest.
Хостинг демо — Vercel. LLM — Claude через адаптер; для продакшена: `LLM_PROVIDER=openai` + локальная open-source модель в Ollama.

## Структура
```
lib/content/   контент для медиков (анкета, анализы, диета, план, FAQ, red flags, словарь заключений) — ru + kk, у каждой записи source
lib/rules/     чистые функции: screening, tests, slots, timeline, diet, redflags, report
lib/faq/       нечёткий поиск + выбор id через LLM
lib/ai/        адаптер LLM и объяснение заключения
lib/flow.ts    оркестрация статусов, план, tick, ответы на напоминания, отчёт
lib/bot/       Telegram-бот (grammY)
app/           сайт: лендинг, /start (веб-анкета), /p/[token] (кабинет), /doctor (панель)
supabase/      миграции
tests/         vitest: сценарии ТЗ, red flags (20 безобидных фраз), отрицания в заключении, PDF
```

## Запуск локально
```bash
npm install
cp .env.example .env.local   # заполнить
npm test                     # правила и сценарии
npm run dev
```
База: применить `supabase/migrations/*.sql`, затем `insert into private.config(key,value) values ('app_secret','<APP_DB_SECRET>');`

## Деплой
1. Vercel → импорт репозитория, переменные из `.env.example`.
2. Открыть `https://<app>/api/setup?secret=<CRON_SECRET>` — регистрирует webhook и команды бота.
3. Напоминания: pg_cron раз в минуту вызывает `/api/cron/tick` (см. `supabase/migrations/0002_cron.sql`).

## Демо
Панель врача `/doctor` → «＋ Демо-пациенты» создаёт 7 сценариев; «Сбросить демо» удаляет их.
В карточке пациента — **машина времени** (двигает время только этого пациента) для прогона напоминаний на сцене.
