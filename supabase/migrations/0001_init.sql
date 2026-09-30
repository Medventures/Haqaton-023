-- Green Clinic colonoscopy assistant: schema
-- Access model: every table has RLS; the only policy lets requests through when
-- the PostgREST request carries header x-app-secret equal to private.config('app_secret').
-- The secret lives only in Vercel env (APP_DB_SECRET) and in private.config (set outside git).

create schema if not exists private;

create table if not exists private.config (
  key text primary key,
  value text not null
);
revoke all on private.config from anon, authenticated;

create or replace function private.is_server() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.config c
    where c.key = 'app_secret'
      and c.value = coalesce((current_setting('request.headers', true))::json ->> 'x-app-secret', '')
  );
$$;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_server() to anon, authenticated;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  lang text not null default 'ru',
  tg_chat_id bigint unique,
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  service_code text not null default 'COLONOSCOPY_SEDATION',
  scheduled_at timestamptz,
  status text not null default 'DRAFT',
  channel text not null default 'telegram',
  answers jsonb not null default '{}',
  tests jsonb not null default '{}',
  bot_state jsonb not null default '{}',
  prep_drug text,
  prep_scheme text,
  liquid_stop_hours int not null default 2,
  clock_offset_sec bigint not null default 0,
  cancel_reason text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_patient_idx on public.appointments(patient_id);

create table if not exists public.flags (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  code text not null,
  severity text not null,           -- URGENT | HIGH | MEDIUM
  assignee text not null,           -- DOCTOR | COORDINATOR
  status text not null default 'OPEN',
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (appointment_id, code)
);

create table if not exists public.requests (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  type text not null,               -- DISCUSS | FAQ_UNANSWERED | HELP | URGENT | SPECIALIST | CANCEL
  reason text,
  status text not null default 'OPEN',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.prep_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  code text not null,
  kind text not null,               -- message | confirm | stool | checklist | nag
  due_at timestamptz not null,
  status text not null default 'PENDING', -- PENDING | SENT | CONFIRMED | HELP | SKIPPED | FAILED | CANCELLED
  sent_at timestamptz,
  confirmed_at timestamptz,
  attempts int not null default 0,
  value jsonb,
  unique (appointment_id, code)
);
create index if not exists prep_events_due_idx on public.prep_events(status, due_at);

create table if not exists public.docs (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  kind text not null,               -- PRE | REPORT
  parsed jsonb not null default '{}',
  explanation jsonb,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (appointment_id, kind)
);

create table if not exists public.feedback (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  clarity int,
  completed text,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  appointment_id uuid references public.appointments(id) on delete cascade,
  name text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.tg_updates (
  update_id bigint primary key,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['patients','appointments','flags','requests','prep_events','docs','feedback','events','tg_updates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists server_only on public.%I', t);
    execute format('create policy server_only on public.%I for all to anon, authenticated using ((select private.is_server())) with check ((select private.is_server()))', t);
  end loop;
end $$;
