# Plumb

Quotes, jobs, crew and hours for a small construction/landscaping outfit. Two sides to it:

- **Office (boss)** — quotes with automatic follow-ups, a price book, jobs with deadlines and crew, timesheet approval.
- **Crew** — only the jobs they're on: steps to tick off, the shopping list, the site diary with photos, and their own hours.

Built on Next.js 14 (App Router) + Supabase (Postgres, Auth, Storage), with row level security doing the actual separation between the two sides. Installs on a phone as a PWA, same as Site Tracker.

## What changed from Site Tracker (v1)

| Site Tracker (v1) | Plumb |
| --- | --- |
| One 2,300-line `App.jsx`, Vite | Next.js App Router, server-rendered, split into pages |
| RLS **off** — anyone with the public key could read everything | RLS on every table; crew can't read quotes, prices or pay rates at all |
| `projects` with `steps`/`shopping_list` as JSON blobs | Real tables: steps (with substeps), materials, reports, files |
| No quoting | Quote builder off a price book, PDF export, or upload the PDF you already sent |
| Nothing chased a quiet client | Every sent quote carries a follow-up date and surfaces in a nudge queue with the email pre-written |
| Timesheets per person | Timesheets per person **and** per job, with boss approval that locks the entry |
| Push reminder for photos | Kept, plus a morning push to the boss listing quotes to chase |

Your Supabase project, tables and data from v1 are untouched — this is a clean schema in a new project.

## Setting it up

### 1. Supabase project

1. Create a new project at [supabase.com](https://supabase.com) (free tier is fine).
2. Open **SQL Editor** and run these four files in order, one at a time:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_logic.sql`
   - `supabase/migrations/0003_rls.sql`
   - `supabase/seed.sql` *(optional — a starter price book for landscaping/concreting)*
3. The migrations create the `quotes` and `projects` storage buckets and their policies. Nothing else to click.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in from **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # server only, never NEXT_PUBLIC_
NEXT_PUBLIC_BUSINESS_NAME=Earth Design Landscaping & Construction
```

### 3. Run it

```bash
npm install
npm run dev
```

### 4. Make yourself the boss

Sign up through the app's **New account** tab, then in the Supabase SQL Editor:

```sql
update public.profiles set role = 'boss' where email = 'you@yourbusiness.com.au';
```

Sign out and back in. Everyone who signs up after that lands as crew, and you switch roles from the **Team** page — no more SQL.

### 5. The crew

Send them the URL, have them tap **New account**, then put them on a job from that job's page. Until they're assigned to something, they see an empty list — that's the security model working, not a bug.

## Deploying

Same as Site Tracker — push to GitHub, import the repo on Vercel, paste the environment variables in. `vercel.json` already declares two cron jobs:

| Path | When (UTC) | What it does |
| --- | --- | --- |
| `/api/cron?task=quotes` | `0 22 * * *` (8am Brisbane) | Expires dead quotes, pushes the boss a list of quotes to chase |
| `/api/cron?task=end-of-day` | `0 5 * * 1-5` (3pm Brisbane weekdays) | Reminds assigned crew to post photos and log hours |

Set `CRON_SECRET` in Vercel and the route rejects anything without it.

### Push notifications (optional)

```bash
npx web-push generate-vapid-keys
```

Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private one in `VAPID_PRIVATE_KEY`. Each person turns reminders on from their **Profile** page. Without the keys everything else still works; the toggle just says it isn't configured.

## How the quote → job handover works

1. Build a quote from the price book, or upload the PDF you already sent. Each line is tagged **work**, **material** or **other**.
2. Mark it sent. That stamps the send date and sets a follow-up date (default: 7 days later).
3. If the client goes quiet, the quote appears in **Quotes → Needs a nudge** and on the dashboard, with a follow-up email already written. Log the nudge and the next one moves out another week, up to the quota (default 3). Nothing is ever emailed to a client automatically — you press send.
4. When the client says yes, hit **Client accepted**. A database trigger immediately:
   - creates the job with its own `PJ-` reference and the quoted amount as the budget,
   - turns every **work** line into a job step,
   - turns every **material** line into the shopping list,
   - copies the quote PDF into the job's files.
5. Add a deadline and put people on it. It's on their phones from that moment.

Progress is never typed in by hand — it's the share of completed leaf steps, recalculated by a trigger. Substeps roll their parent to done when the last one is ticked.

## Who can see what

| | Boss | Crew |
| --- | --- | --- |
| Quotes, quote lines, follow-ups | ✅ | ❌ nothing, no rows |
| Price book | ✅ | ❌ |
| Jobs | all | only where assigned |
| Steps | edit everything | move status, add substeps |
| Shopping list | edit everything | update status, add items, flag missing |
| Site diary + photos | ✅ | ✅ on their jobs |
| Job notes | ✅ | ✅ (the one field they can edit on the job) |
| Pay/charge rates | everyone's | own pay rate only |
| Timesheets | all, approve | own, until approved |

This is enforced in Postgres, not in the UI — a crew member poking the API directly gets the same answers.

## Tests

The tricky part isn't the screens, it's the triggers and policies. There's a suite that runs them against a throwaway local Postgres:

```bash
./supabase/tests/run-local.sh
```

54 checks covering quote numbering and totals, the follow-up clock, the accept → job handover (including not creating the job twice), progress recalculation, substep roll-up, timesheet maths, and the access rules from both sides. `supabase/tests/local-harness.sql` is a small stand-in for the bits of Supabase the migrations touch (`auth.users`, `auth.uid()`, the storage tables) so no cloud project is involved.

## Layout

```
src/
  app/
    (boss)/          dashboard, quotes, projects, timesheets, clients, price-book, team
    (crew)/          jobs, my-hours, me
    api/cron         scheduled follow-up + end-of-day push
    api/push         subscription endpoints
    login, auth
  components/        shared UI, and the project cards both sides reuse
  lib/
    actions/         server actions (projects, timesheets, admin)
    supabase/        server, browser and service-role clients
    format.ts        money, dates, status labels, the follow-up email text
supabase/
  migrations/        0001 schema · 0002 triggers and automation · 0003 RLS and storage
  seed.sql           starter price book
  tests/             behaviour suite + local harness
```

## Known edges

- **No emails are sent.** Follow-ups are drafted for you to send from your own address, which is what you asked for. Wiring in Resend later is a small job: the text already comes from `followUpEmail()` in `src/lib/format.ts`.
- **Uploaded PDF quotes have no line items**, so accepting one creates a job with a single "Site set-up" step for the crew to build on.
- **Photos upload at full size.** v1 compressed them in the browser first; worth porting that back if the crew are on patchy 4G.
- **`gst_rate` is per quote**, defaulting to 10. Change the default in `0001_schema.sql` if you ever need to.

## Brand

Plumb has its own identity: a plumb-bob logo, steel blue and Bob Orange, Big Shoulders Display for headings, IBM Plex Sans for the interface and IBM Plex Mono for references and figures. The colour tokens live at the top of `src/app/globals.css`, the logo is the `PlumbLockup` / `PlumbMark` component in `src/components/logo.tsx`, and the SVG and PNG files are in `public/` and `public/brand/`. Rule of thumb: text on an orange fill is always dark (`--on-orange`), never white.
