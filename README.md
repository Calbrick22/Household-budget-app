# Household Budget - Streamlit App

A web app version of the household budgeting tool - push to GitHub, connect
it to Streamlit Community Cloud, and it's live at a URL you can open from
any device. No terminal needed day to day, no desktop installs.

I built and tested this against a real local Postgres database and
Streamlit's own testing framework (adding months, editing bills, entering
income, confirming, saving, changing settings, deleting months) before
handing it over - every flow described below has actually been exercised,
not just written and hoped for.

## The budgeting methodology

Unchanged from every previous version of this app. Every month, in order:

1. **Total income** = Cal's salary + Cal's variable RAF pay (whatever it
   actually was that month) + Dani's income.
2. **Bills & expenses** are paid from the joint pot - this includes the
   previous month's Amex balance, entered as a bill each month.
3. **Personal allowance**: £250 to each person (configurable in Settings).
4. **Individual savings**: 15% of each person's *own* income goes to their
   personal savings (configurable rate).
5. **Whatever's left** goes to joint savings: first tops up the
   **easy-access pot** to its target balance (£5,000 by default,
   configurable), then the rest goes to the **long-term pot**.

Shortfalls are flagged as a warning, never auto-adjusted. No running
balances are tracked inside the app - each month is calculated fresh from
that month's actual figures, and you tell the app your current easy-access
balance each month so it can work out the top-up needed.

## Why this needs a real database

Streamlit Community Cloud's filesystem is wiped on every restart (sleeping
after inactivity, redeploys, etc.) - a local SQLite file would lose your
data. This version uses a small hosted Postgres database instead, which
persists properly. Both Supabase and Neon have a free tier that's more
than enough for a two-person household budget.

## Password protection

The app now sits behind a single shared password (no separate accounts -
you both use the same one). Set it in secrets as `app_password`:

```toml
app_password = "choose-a-password"
```

Add this line to both your local `secrets.toml` and Streamlit Cloud's
Secrets panel (see `.streamlit/secrets.toml.example` for where it sits
relative to the database section), then reboot the app. You'll see a
password field before anything else loads.

## Performance

Two changes address the sluggishness from before:

- **Startup setup only runs once per app instance**, not on every click -
  it was previously re-checking and re-seeding the database on every
  single interaction.
- **Reads are cached for 5 seconds** and automatically invalidated the
  moment you save anything, so you still always see your own latest
  changes - you're just not hitting the database on every keystroke for
  data that hasn't changed.
- **The CSV export no longer rebuilds on every rerun** - it only computes
  when you click "Prepare CSV export".

If it's still slow after redeploying this version, that's more likely
network latency to your database region than the app itself - worth
checking your Neon project's region is reasonably close to where you are.

## What's new in this redesign

**Look & feel:**
- A custom colour theme (`.streamlit/config.toml`) using the same teal/
  coral/yellow palette as the charts, instead of Streamlit's defaults.
- Sidebar navigation (Dashboard / Settings) that's always visible, instead
  of a "Home" button repeated on every page.
- The dashboard is now organised into **Overview / Transfers / Trends /
  History** tabs instead of one long scrolling page.
- Card-style bordered sections group related content visually.
- Save confirmations now use small toast pop-ups instead of banners.

**Functional:**
- **Month-over-month deltas** on the Overview tab - each figure shows how
  it changed versus the previous confirmed month (e.g. "Bills £3,389.63,
  ↓£120 vs last month"). Bills deltas are colour-inverted, since a
  decrease is the good direction there.

**Performance:**
- What used to be 4-5 separate database queries per month shown is now a
  single combined query (`get_month_financials`), and results are cached
  for 5 seconds and automatically invalidated the moment you save
  anything - so viewing the dashboard (which shows several months at
  once for the trend chart) hits the database far less.

## One-time setup

### 1. Create a free Postgres database

Pick one (both work the same way from here):

- **Supabase** (supabase.com) - sign up, "New Project", wait ~2 minutes
  for it to provision. Go to **Project Settings → Database** and copy the
  connection details (host, port, database name, user, password).
- **Neon** (neon.tech) - sign up, "New Project". It gives you a full
  connection string immediately - the pieces you need are in it.

Either way, note down: **host, port, database name, username, password**.

### 2. Push this code to GitHub

If you haven't already:

```bash
cd streamlit_app
git init
git add .
git commit -m "Household budget app"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

`.streamlit/secrets.toml` is gitignored on purpose - your database password
should never end up in the repo.

### 3. Set up local secrets (optional, for testing on your own machine)

Copy the template and fill in your real values:

```bash
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
```

Edit `.streamlit/secrets.toml` with the host/port/database/username/
password from step 1.

Then run it locally to check everything works before deploying:

```bash
pip install -r requirements.txt
streamlit run app.py
```

### 4. Deploy on Streamlit Community Cloud

1. Go to **share.streamlit.io** and sign in with GitHub.
2. **New app** → pick your repository, branch `main`, main file `app.py`.
3. Before (or right after) it deploys, open **Advanced settings → Secrets**
   and paste in the same content as your `secrets.toml`, but with your
   **real remote database's** host/port/database/username/password (from
   step 1) - not `localhost`.
4. Deploy. You'll get a URL like `https://your-app-name.streamlit.app` -
   that's what you open from any device.

## Transfers section

The dashboard now includes a **Transfers** breakdown for the latest
confirmed month - what to move out of the joint account, split by person:
spending allowance, bills tagged to that person (paid from their own
account rather than Joint), and their individual savings, plus a total.
This is what vindicated keeping the Joint/Cal/Dani tags on bills - they
were originally kept just for visibility, but now directly drive this
calculation. Bills tagged "Joint" are excluded, since those get paid
straight from the joint account rather than transferred out.

## Using it each month

1. **+ Add New Month** on the dashboard - type the month/year (it suggests
   the current month, but you can enter any month, past or future). Bills
   carry forward from the most recent month as a starting point.
2. **Review the bill list** - edit any amount, add one-off items
   (including this month's Amex balance), or remove anything (✕) no
   longer relevant.
3. **Confirm inputs** saves your bills and income without moving on, or
   **Confirm & Calculate** saves and shows you the full breakdown.
4. **Save month** on the results screen locks it in as confirmed.

Past months stay editable from the dashboard (Open), with a warning if
you edit an already-confirmed one. Delete asks for confirmation before
removing a month permanently.

## Changing settings

Click **⚙ Settings** on the dashboard to change the personal allowance,
individual savings rate, or easy-access target. Changes apply next time a
month's figures are calculated - already-confirmed months keep the
figures they were saved with.

## Exporting your data

**⬇ Export CSV** on the dashboard downloads one row per month with income,
bills, and the full waterfall breakdown.

## A note on privacy

There's no login screen, matching the original "just the two of us on one
shared view" decision. On the open web, that means the app's URL is what's
protecting your data - don't share the link, and treat it like you would
any other private account link. If you want a proper password screen
later, Streamlit has a few simple patterns for this (a shared password
stored in secrets, or a full login library) - worth asking for if you
want it added.

## Running the tests

```bash
pip install -r requirements.txt
python3 -m pytest tests/ -v
```

These test the waterfall calculation specifically (unchanged from every
previous version) - a normal month, partial/full easy-access pot, and a
shortfall month.

## Project structure

- `calculations.py` - pure waterfall maths, no UI or database dependency.
- `db.py` - all Postgres access, via Streamlit's built-in SQL connection.
- `app.py` - the UI itself; routes between Dashboard, Month Entry,
  Results, and Settings using Streamlit's session state.
- `tests/` - automated tests for the calculation logic.

## What's deliberately not included

Same scope decisions as every earlier version of this app - no running
balance/net-worth tracking, no multiple named savings goals beyond the two
pots, no actual-vs-planned variance tracking, and (for now) no login
screen. If any of these turn out to be genuinely needed, they can be added
without redesigning what's here.
