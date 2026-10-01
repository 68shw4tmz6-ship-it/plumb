-- ============================================================
-- Plumb — 0002: functions, triggers, automation
-- ============================================================

-- ---------- Yearly sequential references ----------
create or replace function public.next_reference(p_prefix text, p_scope text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from current_date);
  v_val  int;
begin
  insert into public.counters (scope, year, value)
  values (p_scope, v_year, 1)
  on conflict (scope, year) do update set value = public.counters.value + 1
  returning value into v_val;
  return p_prefix || '-' || v_year || '-' || lpad(v_val::text, 4, '0');
end;
$$;

create or replace function public.tg_quote_reference()
returns trigger language plpgsql as $$
begin
  if new.reference is null or new.reference = '' then
    new.reference := public.next_reference('QT', 'quote');
  end if;
  return new;
end;
$$;
drop trigger if exists quotes_reference on public.quotes;
create trigger quotes_reference before insert on public.quotes
for each row execute function public.tg_quote_reference();

create or replace function public.tg_project_reference()
returns trigger language plpgsql as $$
begin
  if new.reference is null or new.reference = '' then
    new.reference := public.next_reference('PJ', 'project');
  end if;
  return new;
end;
$$;
drop trigger if exists projects_reference on public.projects;
create trigger projects_reference before insert on public.projects
for each row execute function public.tg_project_reference();

-- ---------- updated_at ----------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch before update on public.quotes
for each row execute function public.tg_touch_updated_at();
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
for each row execute function public.tg_touch_updated_at();

-- ---------- Generated quote total = sum of its lines ----------
create or replace function public.tg_recalc_quote_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quote uuid := coalesce(new.quote_id, old.quote_id);
begin
  update public.quotes q
     set amount_ex_gst = coalesce(
           (select sum(l.amount) from public.quote_lines l where l.quote_id = v_quote), 0)
   where q.id = v_quote
     and q.source = 'generated';
  return null;
end;
$$;
drop trigger if exists quote_lines_recalc on public.quote_lines;
create trigger quote_lines_recalc after insert or update or delete on public.quote_lines
for each row execute function public.tg_recalc_quote_total();

-- ---------- Quote lifecycle + follow-up scheduling ----------
-- A quote that is "sent", not paused and still under its follow-up quota always
-- carries a next_follow_up_on = (last follow-up or send date) + follow_up_days.
create or replace function public.tg_quote_lifecycle()
returns trigger language plpgsql as $$
declare v_base timestamptz;
begin
  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  end if;

  if new.status in ('accepted', 'declined') and new.decided_at is null then
    new.decided_at := now();
  end if;
  if new.status in ('draft', 'sent') then
    new.decided_at := null;
  end if;

  if new.valid_until is null then
    new.valid_until := new.issued_on + 30;
  end if;

  if new.status = 'sent'
     and not new.follow_ups_paused
     and new.follow_up_count < new.max_follow_ups then
    v_base := coalesce(new.last_follow_up_at, new.sent_at, now());
    new.next_follow_up_on := (v_base + make_interval(days => new.follow_up_days))::date;
  else
    new.next_follow_up_on := null;
  end if;

  return new;
end;
$$;
drop trigger if exists quotes_lifecycle on public.quotes;
create trigger quotes_lifecycle before insert or update on public.quotes
for each row execute function public.tg_quote_lifecycle();

-- ---------- A logged follow-up pushes the next one out ----------
create or replace function public.tg_after_follow_up()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.quotes
     set follow_up_count   = follow_up_count + 1,
         last_follow_up_at = new.occurred_at
   where id = new.quote_id;

  insert into public.activity (quote_id, actor_id, verb, summary)
  select new.quote_id, new.created_by, 'quote.followed_up',
         'Follow-up #' || q.follow_up_count || ' logged on ' || q.reference
    from public.quotes q where q.id = new.quote_id;
  return null;
end;
$$;
drop trigger if exists follow_ups_bump on public.quote_follow_ups;
create trigger follow_ups_bump after insert on public.quote_follow_ups
for each row execute function public.tg_after_follow_up();

-- ---------- Accepted quote → project, straight into the crew's app ----------
-- "work" lines become steps, "material" lines become the shopping list.
create or replace function public.create_project_from_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q         public.quotes;
  c         public.clients;
  v_project uuid;
begin
  select * into q from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'Quote not found: %', p_quote_id;
  end if;
  if q.project_id is not null then
    return q.project_id;
  end if;

  select * into c from public.clients where id = q.client_id;

  insert into public.projects (quote_id, client_id, name, description,
                               address, suburb, postcode,
                               status, budget_ex_gst, created_by)
  values (q.id, q.client_id, q.title, q.description,
          coalesce(q.site_address, c.address), coalesce(q.site_suburb, c.suburb), c.postcode,
          'unstarted', q.amount_ex_gst, q.created_by)
  returning id into v_project;

  insert into public.project_steps (project_id, position, label, detail)
  select v_project, l.position, l.label, l.detail
    from public.quote_lines l
   where l.quote_id = q.id and l.kind = 'work'
   order by l.position;

  insert into public.project_materials (project_id, label, qty, unit, added_by)
  select v_project, l.label, l.qty, l.unit, q.created_by
    from public.quote_lines l
   where l.quote_id = q.id and l.kind = 'material'
   order by l.position;

  -- an uploaded PDF quote has no lines: give the crew somewhere to start
  if not exists (select 1 from public.project_steps where project_id = v_project) then
    insert into public.project_steps (project_id, position, label)
    values (v_project, 0, 'Site set-up');
  end if;

  -- carry the signed quote PDF across to the project files
  if q.file_path is not null then
    insert into public.project_files (project_id, kind, storage_path, file_name, uploaded_by)
    values (v_project, 'quote', q.file_path, q.reference || '.pdf', q.created_by);
  end if;

  update public.quotes set project_id = v_project where id = q.id;

  insert into public.activity (project_id, quote_id, actor_id, verb, summary)
  values (v_project, q.id, q.created_by, 'quote.accepted',
          'Quote ' || q.reference || ' accepted — project created');

  return v_project;
end;
$$;

create or replace function public.tg_quote_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.create_project_from_quote(new.id);
  return null;
end;
$$;
drop trigger if exists quotes_accepted on public.quotes;
create trigger quotes_accepted after update of status on public.quotes
for each row when (new.status = 'accepted' and new.project_id is null)
execute function public.tg_quote_accepted();

-- ---------- Project progress from its leaf steps ----------
-- Column guards in 0003 stop the crew editing fields they shouldn't. Triggers
-- like this one write those same fields legitimately, so they raise a flag the
-- guards honour. set_config(..., true) is transaction-local.
create or replace function public.begin_internal()
returns void language sql as $$ select set_config('app.internal', 'on', true); $$;

create or replace function public.end_internal()
returns void language sql as $$ select set_config('app.internal', 'off', true); $$;

create or replace function public.is_internal()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.internal', true), 'off') = 'on';
$$;

create or replace function public.recalc_project_progress(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_total int; v_done int; v_prog int;
begin
  select count(*), count(*) filter (where s.status = 'done')
    into v_total, v_done
    from public.project_steps s
   where s.project_id = p_project
     and not exists (select 1 from public.project_steps c where c.parent_id = s.id);

  v_prog := case when v_total = 0 then 0 else round(100.0 * v_done / v_total) end;

  perform public.begin_internal();
  update public.projects p
     set progress = v_prog,
         status = case
                    when p.status in ('unstarted', 'next') and v_prog > 0 then 'in_progress'::project_status
                    else p.status
                  end
   where p.id = p_project;
  perform public.end_internal();
end;
$$;

create or replace function public.tg_recalc_project_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_project_progress(coalesce(new.project_id, old.project_id));
  return null;
end;
$$;
drop trigger if exists project_steps_progress on public.project_steps;
create trigger project_steps_progress after insert or update or delete on public.project_steps
for each row execute function public.tg_recalc_project_progress();

-- ---------- Step completion stamps, and parent follows its substeps ----------
create or replace function public.tg_step_done_stamp()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.done_at := coalesce(new.done_at, now());
    new.done_by := coalesce(new.done_by, auth.uid());
  elsif new.status <> 'done' then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end;
$$;
drop trigger if exists project_steps_done_stamp on public.project_steps;
create trigger project_steps_done_stamp before update on public.project_steps
for each row execute function public.tg_step_done_stamp();

create or replace function public.tg_step_roll_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_parent uuid := coalesce(new.parent_id, old.parent_id); v_open int;
begin
  if v_parent is null then
    return null;
  end if;
  select count(*) into v_open
    from public.project_steps
   where parent_id = v_parent and status <> 'done';

  perform public.begin_internal();
  update public.project_steps
     set status  = case when v_open = 0 then 'done'::step_status else 'doing'::step_status end,
         done_at = case when v_open = 0 then coalesce(done_at, now()) else null end
   where id = v_parent
     and status <> (case when v_open = 0 then 'done'::step_status else 'doing'::step_status end);
  perform public.end_internal();
  return null;
end;
$$;
drop trigger if exists project_steps_roll_up on public.project_steps;
create trigger project_steps_roll_up after insert or update of status or delete on public.project_steps
for each row execute function public.tg_step_roll_up();

-- ---------- Material flagged missing by the crew ----------
create or replace function public.tg_material_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'missing' and old.status is distinct from 'missing' then
    new.flagged_at := now();
    insert into public.activity (project_id, actor_id, verb, summary)
    values (new.project_id, auth.uid(), 'material.missing',
            'Missing on site: ' || new.label);
  elsif new.status <> 'missing' then
    new.flagged_at := null;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
drop trigger if exists project_materials_flag on public.project_materials;
create trigger project_materials_flag before update on public.project_materials
for each row execute function public.tg_material_flag();

-- ---------- Timesheet hours from start / finish / break ----------
create or replace function public.tg_timesheet_hours()
returns trigger language plpgsql as $$
declare v_minutes numeric;
begin
  if new.start_time is not null and new.finish_time is not null then
    v_minutes := extract(epoch from (new.finish_time - new.start_time)) / 60.0;
    if v_minutes < 0 then                      -- finished after midnight
      v_minutes := v_minutes + 24 * 60;
    end if;
    v_minutes := v_minutes - new.break_minutes;
    new.hours := round(greatest(v_minutes, 0) / 60.0, 2);
  end if;
  return new;
end;
$$;
drop trigger if exists timesheet_hours on public.timesheet_entries;
create trigger timesheet_hours before insert or update on public.timesheet_entries
for each row execute function public.tg_timesheet_hours();

-- ---------- Daily report logged in the activity feed ----------
create or replace function public.tg_report_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity (project_id, actor_id, verb, summary)
  values (new.project_id, new.author_id, 'report.posted',
          'Site report for ' || to_char(new.report_date, 'DD Mon'));
  return null;
end;
$$;
drop trigger if exists project_reports_activity on public.project_reports;
create trigger project_reports_activity after insert on public.project_reports
for each row execute function public.tg_report_activity();

-- ---------- Profile row created on sign-up ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, phone, trade)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'crew'),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'trade'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- Housekeeping, safe to run from a daily cron ----------
create or replace function public.expire_stale_quotes()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  with done as (
    update public.quotes
       set status = 'expired'
     where status = 'sent'
       and valid_until is not null
       and valid_until < current_date
       and follow_up_count >= max_follow_ups
    returning 1
  )
  select count(*) into v_count from done;
  return v_count;
end;
$$;

-- Quotes whose follow-up is due today or overdue.
create or replace function public.quotes_due_for_follow_up()
returns table (
  quote_id     uuid,
  reference    text,
  title        text,
  client_name  text,
  client_email text,
  amount_inc_gst numeric,
  sent_at      timestamptz,
  follow_up_count int,
  days_overdue int
) language sql security definer set search_path = public as $$
  select q.id, q.reference, q.title, c.name, c.email, q.amount_inc_gst,
         q.sent_at, q.follow_up_count,
         (current_date - q.next_follow_up_on)::int
    from public.quotes q
    join public.clients c on c.id = q.client_id
   where q.status = 'sent'
     and q.next_follow_up_on is not null
     and q.next_follow_up_on <= current_date
   order by q.next_follow_up_on asc;
$$;
