# Household Budget (web)

The same app as the Streamlit version at the repo root - same maths, same
Neon database, same tables - rebuilt in Next.js so it can run on Vercel's free
tier, open as an app on both your phones, and move on to live updates and
notifications later.

- `src/lib/calculations.ts` is a line-for-line port of `calculations.py`.
  `npm test` runs the ten original tests plus 3,000 random months checked
  against the Python file, field by field, to the penny.
- `src/lib/db.ts` runs the same SQL as `db.py`. Both apps can use one database
  side by side.
- Login is the same shared password, now remembered on each device for 30
  days (the Lock button forgets it).

## Run it locally

```bash
cd web
cp .env.example .env.local   # point DATABASE_URL at a local or Neon *dev branch* database
npm install
npm run dev                  # http://localhost:3000
npm test                     # the maths, against calculations.py (needs python3)
```

## Deploy on Vercel (free)

1. Vercel -> Add New -> Project -> import `Calbrick22/Household-budget-app`.
2. **Root Directory: `web`**. Framework preset: Next.js (detected).
3. Environment variables (Production):
   - `DATABASE_URL` - Neon dashboard -> Connect -> the **pooled** connection string
     (host contains `-pooler`), ending `?sslmode=require`.
   - `APP_PASSWORD` - the shared password.
   - `SESSION_SECRET` - a long random string:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
4. Deploy. On each phone, open the address and use Share -> Add to Home Screen
   (iPhone) or the menu -> Install app (Android).

On its first request the app makes sure the tables and the three frozen-settings
columns exist and freezes any confirmed month that has no settings yet - the
same start-up work the Streamlit app does, so running both is safe.
