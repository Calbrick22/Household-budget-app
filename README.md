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
