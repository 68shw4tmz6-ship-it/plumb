-- ============================================================
-- Plumb — 0001: schema
-- Vocabulary kept from v1: projects, steps (+ substeps), shopping list,
-- timesheets, team members. New in v2: quotes, roles, RLS.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin create type app_role as enum ('boss', 'crew');
exception when duplicate_object then null; end $$;

do $$ begin create type project_status as enum ('unstarted', 'next', 'in_progress', 'on_hold', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin create type step_status as enum ('todo', 'doing', 'done', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin create type material_status as enum ('to_order', 'ordered', 'delivered', 'missing');
exception when duplicate_object then null; end $$;

do $$ begin create type quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin create type quote_source as enum ('generated', 'uploaded');
exception when duplicate_object then null; end $$;

do $$ begin create type quote_line_kind as enum ('work', 'material', 'other');
exception when duplicate_object then null; end $$;

do $$ begin create type follow_up_channel as enum ('email', 'phone', 'sms', 'visit');
exception when duplicate_object then null; end $$;

do $$ begin create type file_kind as enum ('plan', 'quote', 'photo', 'invoice', 'other');
exception when duplicate_object then null; end $$;

-- ---------- Reference counters (QT-2026-0001, PJ-2026-0001) ----------
create table if not exists public.counters (
  scope text not null,
  year  int  not null,
  value int  not null default 0,
  primary key (scope, year)
);

-- ---------- Team members ----------
-- v1 merged team_members + team_financials; v2 keeps one row per person.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  first_name  text,
  last_name   text,
  role        app_role not null default 'crew',
  email       text,
  phone       text,
  trade       text,                       -- landscaper, concreter, chippy…
  abn         text,
  hourly_rate numeric(10, 2),             -- what the person is paid
  charge_rate numeric(10, 2),             -- what the client is charged (boss only)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Clients ----------
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text,
  email        text,
  phone        text,
  address      text,
  suburb       text,
  postcode     text,
  state        text,
  notes        text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists clients_name_idx on public.clients (name);

-- ---------- Price book (for generated quotes) ----------
create table if not exists public.price_items (
  id         uuid primary key default gen_random_uuid(),
  category   text not null default 'General',
  label      text not null,
  detail     text,
  unit       text not null default 'ea',   -- ea, m, m2, m3, hr, item, lot
  unit_price numeric(12, 2) not null default 0,
  kind       quote_line_kind not null default 'work',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists price_items_category_idx on public.price_items (category, label);

-- ---------- Quotes (boss side only) ----------
create table if not exists public.quotes (
  id            uuid primary key default gen_random_uuid(),
  reference     text unique,                             -- set by trigger
  client_id     uuid not null references public.clients (id) on delete restrict,
  title         text not null,
  description   text,
  source        quote_source not null default 'generated',
  status        quote_status not null default 'draft',
  file_path     text,                                    -- PDF in the "quotes" bucket
  amount_ex_gst numeric(12, 2) not null default 0,        -- recomputed from lines when generated
  gst_rate      numeric(5, 2)  not null default 10,
  amount_inc_gst numeric(12, 2) generated always as
                 (round(amount_ex_gst * (1 + gst_rate / 100), 2)) stored,
  issued_on     date not null default current_date,
  sent_at       timestamptz,
  valid_until   date,
  decided_at    timestamptz,
  decision_note text,
  site_address  text,
  site_suburb   text,

  -- automatic follow-ups when the client goes quiet
  follow_up_days      int not null default 7 check (follow_up_days between 1 and 90),
  max_follow_ups      int not null default 3 check (max_follow_ups between 0 and 10),
  follow_up_count     int not null default 0,
  last_follow_up_at   timestamptz,
  next_follow_up_on   date,                              -- maintained by trigger
  follow_ups_paused   boolean not null default false,

  project_id    uuid,                                    -- created on acceptance (FK below)
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists quotes_status_idx on public.quotes (status, next_follow_up_on);
create index if not exists quotes_client_idx on public.quotes (client_id);

create table if not exists public.quote_lines (
  id             uuid primary key default gen_random_uuid(),
  quote_id       uuid not null references public.quotes (id) on delete cascade,
  position       int not null default 0,
  kind           quote_line_kind not null default 'work',
  label          text not null,
  detail         text,
  unit           text not null default 'ea',
  qty            numeric(12, 3) not null default 1,
  unit_price     numeric(12, 2) not null default 0,
  amount         numeric(12, 2) generated always as (round(qty * unit_price, 2)) stored,
  price_item_id  uuid references public.price_items (id) on delete set null
);
create index if not exists quote_lines_quote_idx on public.quote_lines (quote_id, position);

create table if not exists public.quote_follow_ups (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  channel     follow_up_channel not null default 'email',
  note        text,
  created_by  uuid references public.profiles (id) on delete set null
);
create index if not exists quote_follow_ups_quote_idx on public.quote_follow_ups (quote_id, occurred_at desc);

-- ---------- Projects (v1 "projects", now relational) ----------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  reference   text unique,
  quote_id    uuid references public.quotes (id) on delete set null,
  client_id   uuid references public.clients (id) on delete set null,
  name        text not null,
  address     text,
  suburb      text,
  postcode    text,
  description text,
  notes       text,                                      -- v1 free-text notes box
  status      project_status not null default 'unstarted',
  start_date  date,
  deadline    date,
  budget_ex_gst numeric(12, 2),
  progress    int not null default 0 check (progress between 0 and 100),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_status_idx on public.projects (status, deadline);

alter table public.quotes drop constraint if exists quotes_project_id_fkey;
alter table public.quotes
  add constraint quotes_project_id_fkey
  foreign key (project_id) references public.projects (id) on delete set null;

-- who is on the job
create table if not exists public.project_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  role_on_job text,                                      -- site supervisor, labourer…
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id) on delete set null,
  unique (project_id, profile_id)
);
create index if not exists project_members_profile_idx on public.project_members (profile_id);

-- steps, with one level of substeps like v1's checklist
create table if not exists public.project_steps (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  parent_id   uuid references public.project_steps (id) on delete cascade,
  position    int not null default 0,
  label       text not null,
  detail      text,
  status      step_status not null default 'todo',
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date    date,
  done_at     timestamptz,
  done_by     uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists project_steps_project_idx on public.project_steps (project_id, position);
create index if not exists project_steps_parent_idx on public.project_steps (parent_id);

-- shopping list / materials
create table if not exists public.project_materials (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label      text not null,
  qty        numeric(12, 3) not null default 1,
  unit       text not null default 'ea',
  status     material_status not null default 'to_order',
  needed_by  date,
  supplier   text,
  note       text,
  flagged_at timestamptz,                                -- crew flagged it missing
  added_by   uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_materials_project_idx on public.project_materials (project_id, status);

-- daily site report
create table if not exists public.project_reports (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  report_date date not null default current_date,
  content     text not null,
  weather     text,
  blocker     text,
  created_at  timestamptz not null default now()
);
create index if not exists project_reports_project_idx on public.project_reports (project_id, report_date desc);

-- progress pictures and documents (v1 "plans" jsonb becomes rows)
create table if not exists public.project_files (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  report_id    uuid references public.project_reports (id) on delete set null,
  kind         file_kind not null default 'photo',
  storage_path text not null,
  file_name    text,
  caption      text,
  taken_on     date,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists project_files_project_idx on public.project_files (project_id, kind, created_at desc);

-- ---------- Timesheets (v1 day calendar: start/finish + break) ----------
create table if not exists public.timesheet_entries (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete set null,
  work_date    date not null default current_date,
  start_time   time,
  finish_time  time,
  break_minutes int not null default 0 check (break_minutes >= 0 and break_minutes < 600),
  hours        numeric(5, 2) not null default 0 check (hours >= 0 and hours <= 24),
  note         text,
  is_approved  boolean not null default false,
  approved_by  uuid references public.profiles (id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists timesheet_profile_idx on public.timesheet_entries (profile_id, work_date desc);
create index if not exists timesheet_project_idx on public.timesheet_entries (project_id, work_date desc);

-- ---------- Web push (kept from v1) ----------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- ---------- Activity feed (so the boss sees what moved) ----------
create table if not exists public.activity (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects (id) on delete cascade,
  quote_id    uuid references public.quotes (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  verb        text not null,
  summary     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists activity_created_idx on public.activity (created_at desc);
create index if not exists activity_project_idx on public.activity (project_id, created_at desc);
