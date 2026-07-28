# 26 weeks

A single-page accountability dashboard for a weekly partnership. It holds the
long-range target, the weekly inputs that drive it, and a daily checklist —
framed against a fixed six-month deadline that is already running.

The organising idea is **a 26-week clock, not a habit app**.

---

## Running it

No build step. Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

Everything works immediately with no account: state lives in `localStorage`,
and the app is fully usable offline.

---

## Syncing across devices

Without setup, each browser keeps its own separate history. To share one
history across your phone, laptop and every browser you use, connect a free
Supabase project.

**The project keys are already baked in** (`js/config.js`), so no device ever
needs to paste them. Two one-time steps remain in the Supabase dashboard, plus
a sign-in on each device.

The publishable key in `js/config.js` is safe to commit — it is designed to
ship in client code. Your data is kept private by the row-level security in
step 1 and your email sign-in, not by hiding the key. (Never commit a Supabase
*secret* key — that one is different.)

### 1. Create the table

In the project's **SQL Editor**, run:

```sql
create table if not exists dashboard (
  user_id    uuid primary key references auth.users on delete cascade,
  doc        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table dashboard enable row level security;

create policy "own row only" on dashboard
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Row-level security means your row is readable only by you, even though the
publishable key ships in the page. Without that policy the revenue ledger
would be readable by anyone who found the URL.

### 2. Allow your site to redirect back

**Authentication → URL Configuration**. Set the **Site URL** and add to
**Redirect URLs**:

```
https://kemalrahmandesign.github.io/kemalsgoals/
```

Add `http://localhost:8000` too if you want sync while developing. Without
this, the emailed sign-in link has nowhere valid to return to.

### 3. Sign in on each device

Open the dashboard, expand **Sync across devices**, enter your email, and open
the link it sends. Repeat once per device. That's the only step you touch per
device — the keys are already there.

To point a browser at a *different* project, the pre-filled fields under
**Project keys (advanced)** override the baked-in config, per browser.

### How merging works

Sync is local-first: every edit writes locally and renders instantly, then
pushes in the background. The app pulls on load, on tab focus, on reconnect,
and once a minute while visible.

Merging happens **per field, not per document**. Every independently editable
leaf — each day's checkbox, each weekly counter, each review answer — carries
its own timestamp, and the newer side wins field by field. A whole-document
last-write-wins would quietly destroy data the first time you ticked something
on your phone and something else on your laptop. Deleted revenue rows leave
tombstones so another device can't resurrect them.

The one case it can't resolve perfectly: incrementing the *same* counter on two
devices while both are offline keeps the later value rather than the sum.

---

## Layout

| Section | What it's for |
|---|---|
| **Masthead** | The clock — week N of 26, days remaining, end date, pace, and one rail segment per week |
| **Today** | The daily checklist. Ticking an item auto-increments its linked weekly counter by a configured step |
| **Streaks** | Consecutive days on the keystone habit, and a cumulative all-time count |
| **This week** | The weekly counters with −/+ steppers |
| **The other four** | Four tracked metrics as liquid meters that fill toward the week's target, over a per-week history |
| **Revenue vs. pace** | Target ramp against actual, which stops at NOW and never extrapolates. Hover or drag to scrub |
| **Revenue booked** | Cumulative total, pace badge, and the ledger |
| **Sunday review** | Three questions, saved per week |
| **Build the 1:1 agenda** | Assembles everything into a summary to read out loud |
| **Adjust the plan** | Edit daily items and weekly targets — on Sundays, not on Wednesdays |

Today sits above the charts on purpose. The page gets opened once, in the
morning, usually on a phone, and the first thing on screen should be what to
do — not a six-month revenue curve. The clock and the pace number stay in the
masthead so the deadline is still the first thing you read.

---

## Notes on the build

- **No framework, no build step, no chart library.** Charts are hand-rolled
  inline SVG.
- **Monotone cubic interpolation** on the pace curve. A plain smooth spline
  overshoots, which on a *cumulative* series draws money being un-earned
  between two weeks. Monotone tangents can't dip.
- **Chart colours are validated, not chosen by eye.** DESIGN_2's vivid violet
  and vivid blue are ΔE 1.6 apart under deuteranopia — the same colour to
  roughly 5% of men. Slot 1 is a deepened violet (`#8a1fd0`) that keeps the
  brand family and clears the gate. The four series validate all-pairs on
  white: worst CVD ΔE 8.0, every slot ≥3:1 contrast.
- **Streak logic**: today not being done *yet* never breaks the streak.
  Otherwise the page tells you you've failed every morning before you start.
- **Migrations are non-destructive** — missing counters get pushed, stale
  labels get rewritten in place, and the storage key is never bumped to wipe
  history.
- **`prefers-reduced-motion`** disables the wave animation, the draw-on, the
  count-ups and the celebration.

---

## Backup

**Adjust the plan → Sync across devices → Backup** exports the whole state as
JSON. Import **merges** rather than replaces, so pulling in an older export
can't wipe newer work.
