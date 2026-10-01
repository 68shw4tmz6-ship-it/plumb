-- ============================================================
-- Plumb — 0003: row level security + storage
-- The gap v1 had: RLS was off, so the anon key could read everything.
-- Here the boss sees all; the crew only sees jobs they are on, and
-- never touches quotes, prices, charge rates or other people's pay.
-- ============================================================

-- ---------- Helpers (security definer, so policies don't recurse) ----------
create or replace function public.is_boss()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'boss' and is_active
  );
$$;

create or replace function public.is_on_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members
     where project_id = p_project_id and profile_id = auth.uid()
  );
$$;

create or replace function public.can_see_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_boss() or public.is_on_project(p_project_id);
$$;

grant execute on function public.is_boss() to authenticated;
grant execute on function public.is_on_project(uuid) to authenticated;
grant execute on function public.can_see_project(uuid) to authenticated;
grant execute on function public.create_project_from_quote(uuid) to authenticated;
grant execute on function public.quotes_due_for_follow_up() to authenticated;
grant execute on function public.recalc_project_progress(uuid) to authenticated;

-- ---------- Enable ----------
alter table public.profiles           enable row level security;
alter table public.clients            enable row level security;
alter table public.price_items        enable row level security;
alter table public.quotes             enable row level security;
alter table public.quote_lines        enable row level security;
alter table public.quote_follow_ups   enable row level security;
alter table public.projects           enable row level security;
alter table public.project_members    enable row level security;
alter table public.project_steps      enable row level security;
alter table public.project_materials  enable row level security;
alter table public.project_reports    enable row level security;
alter table public.project_files      enable row level security;
alter table public.timesheet_entries  enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.activity           enable row level security;
alter table public.counters           enable row level security;

-- ---------- Profiles ----------
-- Everyone can read the team directory (names show up on steps and reports).
-- Pay rates are hidden from the crew by the public.team_directory view below.
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_select_boss on public.profiles;
create policy profiles_select_boss on public.profiles
  for select to authenticated using (public.is_boss());

drop policy if exists profiles_select_teammates on public.profiles;
create policy profiles_select_teammates on public.profiles
  for select to authenticated using (
    exists (
      select 1
        from public.project_members mine
        join public.project_members theirs on theirs.project_id = mine.project_id
       where mine.profile_id = auth.uid()
         and theirs.profile_id = public.profiles.id
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_boss_all on public.profiles;
create policy profiles_boss_all on public.profiles
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

-- Without this, a crew member could flip their own role to 'boss' through
-- profiles_update_self. Column grants would also block the boss, so guard with a
-- trigger: anyone who is not the boss silently keeps the old sensitive values.
create or replace function public.tg_guard_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role and the Supabase SQL editor, which is
  -- how the first boss gets promoted; RLS already blocks anonymous callers.
  if auth.uid() is null or public.is_boss() or public.is_internal() then
    return new;
  end if;
  new.id          := old.id;
  new.role        := old.role;
  new.hourly_rate := old.hourly_rate;
  new.charge_rate := old.charge_rate;
  new.is_active   := old.is_active;
  new.email       := old.email;
  return new;
end;
$$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
for each row execute function public.tg_guard_profile_columns();

-- Safe directory: no pay rates, no ABN.
create or replace view public.team_directory
with (security_invoker = true) as
  select id, full_name, role, trade, phone, is_active
    from public.profiles;
grant select on public.team_directory to authenticated;

-- ---------- Clients ----------
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated using (
    public.is_boss()
    or exists (
      select 1 from public.projects p
       where p.client_id = public.clients.id and public.is_on_project(p.id)
    )
  );

drop policy if exists clients_boss_write on public.clients;
create policy clients_boss_write on public.clients
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

-- ---------- Price book: boss only (it holds the margins) ----------
drop policy if exists price_items_boss on public.price_items;
create policy price_items_boss on public.price_items
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

-- ---------- Quotes: boss only, end to end ----------
drop policy if exists quotes_boss on public.quotes;
create policy quotes_boss on public.quotes
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

drop policy if exists quote_lines_boss on public.quote_lines;
create policy quote_lines_boss on public.quote_lines
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

drop policy if exists quote_follow_ups_boss on public.quote_follow_ups;
create policy quote_follow_ups_boss on public.quote_follow_ups
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

-- ---------- Projects ----------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (public.is_boss() or public.is_on_project(id));

drop policy if exists projects_boss_write on public.projects;
create policy projects_boss_write on public.projects
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

-- The crew may keep the shared notes box up to date, nothing else:
-- the guard trigger restores every other column for non-boss updates.
drop policy if exists projects_crew_notes on public.projects;
create policy projects_crew_notes on public.projects
  for update to authenticated using (public.is_on_project(id)) with check (public.is_on_project(id));

create or replace function public.tg_guard_project_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_boss() or public.is_internal() then
    return new;
  end if;
  new.id := old.id; new.reference := old.reference; new.quote_id := old.quote_id;
  new.client_id := old.client_id; new.name := old.name; new.address := old.address;
  new.suburb := old.suburb; new.postcode := old.postcode; new.description := old.description;
  new.status := old.status; new.start_date := old.start_date; new.deadline := old.deadline;
  new.budget_ex_gst := old.budget_ex_gst; new.progress := old.progress;
  new.created_by := old.created_by; new.created_at := old.created_at;
  return new;                                    -- only `notes` survives
end;
$$;
drop trigger if exists projects_guard on public.projects;
create trigger projects_guard before update on public.projects
for each row execute function public.tg_guard_project_columns();

drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members
  for select to authenticated using (
    public.is_boss() or profile_id = auth.uid() or public.is_on_project(project_id)
  );

drop policy if exists members_boss_write on public.project_members;
create policy members_boss_write on public.project_members
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

-- ---------- Steps: the crew ticks them off ----------
drop policy if exists steps_select on public.project_steps;
create policy steps_select on public.project_steps
  for select to authenticated using (public.can_see_project(project_id));

drop policy if exists steps_boss_write on public.project_steps;
create policy steps_boss_write on public.project_steps
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

drop policy if exists steps_crew_update on public.project_steps;
create policy steps_crew_update on public.project_steps
  for update to authenticated using (public.is_on_project(project_id))
  with check (public.is_on_project(project_id));

-- The crew moves a step's status (and can reassign it); the wording, order,
-- due date and parent stay with the boss.
create or replace function public.tg_guard_step_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_boss() or public.is_internal() then
    return new;
  end if;
  new.id := old.id; new.project_id := old.project_id; new.parent_id := old.parent_id;
  new.position := old.position; new.label := old.label; new.due_date := old.due_date;
  new.created_at := old.created_at;
  return new;                    -- status, detail, assignee_id, done_* survive
end;
$$;
drop trigger if exists project_steps_guard on public.project_steps;
create trigger project_steps_guard before update on public.project_steps
for each row execute function public.tg_guard_step_columns();

-- crew can add a substep to a job they are on
drop policy if exists steps_crew_insert on public.project_steps;
create policy steps_crew_insert on public.project_steps
  for insert to authenticated with check (public.is_on_project(project_id) and parent_id is not null);

-- ---------- Shopping list ----------
drop policy if exists materials_select on public.project_materials;
create policy materials_select on public.project_materials
  for select to authenticated using (public.can_see_project(project_id));

drop policy if exists materials_boss_write on public.project_materials;
create policy materials_boss_write on public.project_materials
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

drop policy if exists materials_crew_update on public.project_materials;
create policy materials_crew_update on public.project_materials
  for update to authenticated using (public.is_on_project(project_id))
  with check (public.is_on_project(project_id));

drop policy if exists materials_crew_insert on public.project_materials;
create policy materials_crew_insert on public.project_materials
  for insert to authenticated with check (public.is_on_project(project_id));

-- ---------- Daily reports ----------
drop policy if exists reports_select on public.project_reports;
create policy reports_select on public.project_reports
  for select to authenticated using (public.can_see_project(project_id));

drop policy if exists reports_insert on public.project_reports;
create policy reports_insert on public.project_reports
  for insert to authenticated
  with check (public.can_see_project(project_id) and author_id = auth.uid());

drop policy if exists reports_update_own on public.project_reports;
create policy reports_update_own on public.project_reports
  for update to authenticated using (author_id = auth.uid() or public.is_boss())
  with check (author_id = auth.uid() or public.is_boss());

drop policy if exists reports_delete on public.project_reports;
create policy reports_delete on public.project_reports
  for delete to authenticated using (public.is_boss() or author_id = auth.uid());

-- ---------- Files and photos ----------
drop policy if exists files_select on public.project_files;
create policy files_select on public.project_files
  for select to authenticated using (public.can_see_project(project_id));

drop policy if exists files_insert on public.project_files;
create policy files_insert on public.project_files
  for insert to authenticated with check (public.can_see_project(project_id));

drop policy if exists files_delete on public.project_files;
create policy files_delete on public.project_files
  for delete to authenticated using (public.is_boss() or uploaded_by = auth.uid());

-- ---------- Timesheets ----------
drop policy if exists timesheets_select on public.timesheet_entries;
create policy timesheets_select on public.timesheet_entries
  for select to authenticated using (public.is_boss() or profile_id = auth.uid());

drop policy if exists timesheets_insert_own on public.timesheet_entries;
create policy timesheets_insert_own on public.timesheet_entries
  for insert to authenticated
  with check (profile_id = auth.uid() and is_approved = false);

-- once the boss approves an entry the person can no longer touch it
drop policy if exists timesheets_update_own on public.timesheet_entries;
create policy timesheets_update_own on public.timesheet_entries
  for update to authenticated
  using (profile_id = auth.uid() and not is_approved)
  with check (profile_id = auth.uid() and not is_approved);

drop policy if exists timesheets_delete_own on public.timesheet_entries;
create policy timesheets_delete_own on public.timesheet_entries
  for delete to authenticated
  using (public.is_boss() or (profile_id = auth.uid() and not is_approved));

drop policy if exists timesheets_boss_all on public.timesheet_entries;
create policy timesheets_boss_all on public.timesheet_entries
  for all to authenticated using (public.is_boss()) with check (public.is_boss());

-- ---------- Push subscriptions: own rows only ----------
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists push_boss_select on public.push_subscriptions;
create policy push_boss_select on public.push_subscriptions
  for select to authenticated using (public.is_boss());

-- ---------- Activity feed ----------
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select to authenticated using (
    public.is_boss() or (project_id is not null and public.is_on_project(project_id))
  );

-- rows are written by triggers (security definer); no client insert policy on purpose

-- ---------- counters: no policy at all, reachable only via next_reference() ----------

-- ============================================================
-- Storage
--   quotes     — client PDFs, boss only
--   projects   — plans, progress pictures; readable by whoever is on the job
-- Paths are "<project_id>/<filename>" so the policy can check membership.
-- ============================================================
insert into storage.buckets (id, name, public) values ('quotes', 'quotes', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('projects', 'projects', false)
on conflict (id) do nothing;

drop policy if exists quotes_bucket_boss on storage.objects;
create policy quotes_bucket_boss on storage.objects
  for all to authenticated
  using (bucket_id = 'quotes' and public.is_boss())
  with check (bucket_id = 'quotes' and public.is_boss());

drop policy if exists projects_bucket_read on storage.objects;
create policy projects_bucket_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'projects'
    and public.can_see_project(nullif(split_part(name, '/', 1), '')::uuid)
  );

drop policy if exists projects_bucket_insert on storage.objects;
create policy projects_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'projects'
    and public.can_see_project(nullif(split_part(name, '/', 1), '')::uuid)
  );

drop policy if exists projects_bucket_delete on storage.objects;
create policy projects_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'projects'
    and (public.is_boss() or owner = auth.uid())
  );
