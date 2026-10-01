\set ON_ERROR_STOP on
\pset pager off
\timing off

-- =========================================================
-- Plumb — behaviour tests
-- =========================================================
create or replace function ok(p_cond boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_cond then
    raise notice 'PASS  %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end;
$$;

-- ---------- Users ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'boss@example.com', '{"full_name":"Sam Boss"}'),
  ('22222222-2222-2222-2222-222222222222', 'dave@example.com', '{"full_name":"Dave Crew"}'),
  ('33333333-3333-3333-3333-333333333333', 'kim@example.com',  '{"full_name":"Kim Crew"}');

select ok(count(*) = 3, 'sign-up trigger creates a profile per user') from public.profiles;
select ok(
  (select role::text from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 'crew',
  'new accounts default to crew'
);

update public.profiles set role = 'boss', abn = '12 345 678 901'
 where id = '11111111-1111-1111-1111-111111111111';

-- ---------- Boss builds a quote ----------
set role authenticated;
select public.become('11111111-1111-1111-1111-111111111111');

select ok(public.is_boss(), 'is_boss() true for the boss');

insert into public.clients (id, name, contact_name, email, address, suburb)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'The Robinsons', 'Jo Robinson',
        'jo@example.com', '14 Baker St', 'Paddington');

insert into public.quotes (id, client_id, title, description, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Rear yard landscaping', 'Retaining wall, turf and irrigation.',
        '11111111-1111-1111-1111-111111111111');

select ok(
  (select reference from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001')
    = 'QT-' || extract(year from current_date)::text || '-0001',
  'quote reference is generated as QT-YYYY-0001'
);
select ok(
  (select valid_until from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001')
    = current_date + 30,
  'valid_until defaults to 30 days out'
);

insert into public.quote_lines (quote_id, position, kind, label, unit, qty, unit_price) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 0, 'work',     'Besser block retaining wall', 'm2', 12, 420),
  ('bbbbbbbb-0000-0000-0000-000000000001', 1, 'work',     'Turf supply and lay',         'm2', 80, 18.50),
  ('bbbbbbbb-0000-0000-0000-000000000001', 2, 'material', '20mm blue metal',             'm3', 4,  95),
  ('bbbbbbbb-0000-0000-0000-000000000001', 3, 'other',    'Provisional sum',             'lot', 1, 500);

select ok(
  (select amount_ex_gst from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001')
    = 12*420 + 80*18.50 + 4*95 + 500,
  'quote total recalculates from its lines'
);
select ok(
  (select amount_inc_gst from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001')
    = round((12*420 + 80*18.50 + 4*95 + 500) * 1.10, 2),
  'GST is added in the generated column'
);

-- ---------- Sending starts the follow-up clock ----------
update public.quotes set status = 'sent'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select ok(
  (select sent_at is not null from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'marking sent stamps sent_at'
);
select ok(
  (select next_follow_up_on from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001')
    = current_date + 7,
  'next follow-up lands 7 days after sending'
);

insert into public.quote_follow_ups (quote_id, channel, note, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'email', 'Sent a nudge',
        '11111111-1111-1111-1111-111111111111');

select ok(
  (select follow_up_count from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1,
  'logging a follow-up increments the counter'
);
select ok(
  (select next_follow_up_on from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001')
    = current_date + 7,
  'logging a follow-up pushes the next one out'
);

update public.quotes set follow_up_count = 3
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select ok(
  (select next_follow_up_on is null from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'chasing stops once the quota is used up'
);
update public.quotes set follow_up_count = 1, follow_ups_paused = true
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select ok(
  (select next_follow_up_on is null from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'pausing clears the next follow-up date'
);
update public.quotes set follow_ups_paused = false
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ---------- Accepting builds the job ----------
update public.quotes set status = 'accepted'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select ok(
  (select project_id is not null from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'accepting a quote creates a project and links it back'
);

create temporary view job as
  select * from public.projects
   where quote_id = 'bbbbbbbb-0000-0000-0000-000000000001';

select ok((select count(*) = 1 from job), 'exactly one project per accepted quote');
select ok(
  (select reference like 'PJ-%' from job),
  'project gets its own PJ- reference'
);
select ok(
  (select count(*) = 2 from public.project_steps s join job j on j.id = s.project_id),
  'work lines become job steps (2 of them)'
);
select ok(
  (select count(*) = 1 from public.project_materials m join job j on j.id = m.project_id),
  'material lines become the shopping list (1 of them)'
);
select ok(
  (select budget_ex_gst from job) = (select amount_ex_gst from public.quotes
                                     where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'project budget carries the quoted amount'
);
select ok(
  (select address from job) = '14 Baker St',
  'site address falls back to the client address'
);
select ok(
  exists (select 1 from public.activity where verb = 'quote.accepted'),
  'acceptance is written to the activity feed'
);

-- accepting twice must not build a second job
update public.quotes set status = 'sent' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
update public.quotes set status = 'accepted' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select ok((select count(*) = 1 from public.projects), 'no duplicate project on re-accepting');

-- ---------- Crew assignment and visibility ----------
insert into public.project_members (project_id, profile_id, role_on_job)
select id, '22222222-2222-2222-2222-222222222222', 'Site supervisor' from job;

-- a second job Dave is NOT on
insert into public.projects (id, name, client_id, created_by)
values ('cccccccc-0000-0000-0000-000000000001', 'Secret job',
        'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');

select public.become('22222222-2222-2222-2222-222222222222');

select ok(not public.is_boss(), 'crew are not boss');
select ok((select count(*) = 1 from public.projects), 'crew see only the jobs they are on');
select ok((select count(*) = 0 from public.quotes), 'crew cannot read quotes at all');
select ok((select count(*) = 0 from public.quote_lines), 'crew cannot read quote lines');
select ok((select count(*) = 0 from public.price_items), 'crew cannot read the price book');
select ok(
  (select count(*) = 0 from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'crew cannot read a teammate they share no job with'
);
select ok(
  (select count(*) = 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'crew can read their own profile'
);

-- ---------- Crew ticking steps moves the job along ----------
update public.project_steps set status = 'done'
 where id = (select s.id from public.project_steps s join job j on j.id = s.project_id
             order by s.position limit 1);

select ok((select progress from job) = 50, 'progress is recomputed from completed steps');
select ok(
  (select status::text from job) = 'in_progress',
  'a job that was unstarted flips to in progress on first tick'
);

-- ---------- Column guards ----------
update public.profiles set role = 'boss' where id = '22222222-2222-2222-2222-222222222222';
select ok(
  (select role::text from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 'crew',
  'crew cannot promote themselves to boss'
);

update public.profiles set hourly_rate = 999 where id = '22222222-2222-2222-2222-222222222222';
select ok(
  (select hourly_rate is null from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'crew cannot set their own pay rate'
);

update public.profiles set full_name = 'Dave the Legend'
 where id = '22222222-2222-2222-2222-222222222222';
select ok(
  (select full_name from public.profiles where id = '22222222-2222-2222-2222-222222222222')
    = 'Dave the Legend',
  'crew can still fix their own name'
);

update public.projects set notes = 'Gate code 4417', deadline = current_date + 365, name = 'Renamed'
 where id = (select id from job);
select ok((select notes from job) = 'Gate code 4417', 'crew can write the shared notes');
select ok((select name from job) <> 'Renamed', 'crew cannot rename the job');
select ok((select deadline is null from job), 'crew cannot move the deadline');

-- ---------- Missing material raises a flag ----------
update public.project_materials set status = 'missing'
 where project_id = (select id from job);
select ok(
  (select flagged_at is not null from public.project_materials
    where project_id = (select id from job)),
  'flagging a material missing stamps the time'
);
select ok(
  exists (select 1 from public.activity where verb = 'material.missing'),
  'a missing material lands in the activity feed'
);

-- ---------- Timesheets ----------
insert into public.timesheet_entries (profile_id, project_id, work_date, start_time, finish_time, break_minutes)
select '22222222-2222-2222-2222-222222222222', id, current_date, '07:00', '15:30', 30 from job;

select ok(
  (select hours from public.timesheet_entries
    where profile_id = '22222222-2222-2222-2222-222222222222') = 8.00,
  'hours computed from start, finish and break (07:00–15:30 less 30m = 8h)'
);

-- crew cannot approve their own hours: the write is refused outright
do $$
begin
  update public.timesheet_entries set is_approved = true
   where profile_id = '22222222-2222-2222-2222-222222222222';
  raise exception 'FAIL  crew cannot approve their own hours (the update went through)';
exception when insufficient_privilege then
  raise notice 'PASS  crew cannot approve their own hours (refused by RLS)';
end;
$$;

-- boss approves, after which the entry is locked to the crew member
select public.become('11111111-1111-1111-1111-111111111111');
update public.timesheet_entries set is_approved = true, approved_by = auth.uid(), approved_at = now()
 where profile_id = '22222222-2222-2222-2222-222222222222';
select ok(
  (select is_approved from public.timesheet_entries
    where profile_id = '22222222-2222-2222-2222-222222222222'),
  'boss can approve hours'
);

select public.become('22222222-2222-2222-2222-222222222222');
update public.timesheet_entries set hours = 12
 where profile_id = '22222222-2222-2222-2222-222222222222';
select ok(
  (select hours from public.timesheet_entries
    where profile_id = '22222222-2222-2222-2222-222222222222') = 8.00,
  'an approved entry is out of reach of the crew member (0 rows match)'
);

-- ---------- Substeps roll up into their parent ----------
select public.become('11111111-1111-1111-1111-111111111111');

insert into public.project_steps (id, project_id, position, label)
select 'dddddddd-0000-0000-0000-000000000001', id, 5, 'Irrigation' from job;
insert into public.project_steps (id, project_id, parent_id, position, label) values
  ('dddddddd-0000-0000-0000-000000000002', (select id from job),
   'dddddddd-0000-0000-0000-000000000001', 6, 'Trenching'),
  ('dddddddd-0000-0000-0000-000000000003', (select id from job),
   'dddddddd-0000-0000-0000-000000000001', 7, 'Heads and controller');

update public.project_steps set status = 'done' where id = 'dddddddd-0000-0000-0000-000000000002';
select ok(
  (select status::text from public.project_steps where id = 'dddddddd-0000-0000-0000-000000000001') = 'doing',
  'a parent step shows as doing while a substep is open'
);

update public.project_steps set status = 'done' where id = 'dddddddd-0000-0000-0000-000000000003';
select ok(
  (select status::text from public.project_steps where id = 'dddddddd-0000-0000-0000-000000000001') = 'done',
  'a parent step completes once every substep is done'
);
select ok(
  (select progress from job) = 75,
  'progress counts leaf steps only (3 of 4 done = 75%)'
);

-- ---------- Housekeeping functions ----------
insert into public.quotes (id, client_id, title, status, issued_on, valid_until,
                           follow_up_count, max_follow_ups, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
        'Old fence quote', 'sent', current_date - 60, current_date - 10, 3, 3,
        '11111111-1111-1111-1111-111111111111');

select ok(public.expire_stale_quotes() = 1, 'expire_stale_quotes closes off a dead quote');
select ok(
  (select status::text from public.quotes where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'expired',
  'the dead quote is marked expired'
);

insert into public.quotes (id, client_id, title, status, sent_at, follow_up_days, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
        'Deck quote', 'sent', now() - interval '20 days', 7,
        '11111111-1111-1111-1111-111111111111');

select ok(
  (select count(*) = 1 from public.quotes_due_for_follow_up()),
  'quotes_due_for_follow_up finds the quote that has gone quiet'
);
select ok(
  (select days_overdue = 13 from public.quotes_due_for_follow_up()),
  'and reports how many days overdue it is'
);

-- ---------- Storage policies ----------
insert into storage.objects (bucket_id, name, owner)
values ('quotes', 'bbbbbbbb-0000-0000-0000-000000000001/QT-1.pdf',
        '11111111-1111-1111-1111-111111111111');
insert into storage.objects (bucket_id, name, owner)
select 'projects', id || '/photo1.jpg', '22222222-2222-2222-2222-222222222222' from job;

select ok((select count(*) = 2 from storage.objects), 'boss sees both buckets');

select public.become('22222222-2222-2222-2222-222222222222');
select ok(
  (select count(*) = 1 from storage.objects),
  'crew see project files but not quote PDFs'
);
select ok(
  (select count(*) = 0 from storage.objects where bucket_id = 'quotes'),
  'the quotes bucket is invisible to the crew'
);

reset role;
\echo '=== ALL TESTS PASSED'
