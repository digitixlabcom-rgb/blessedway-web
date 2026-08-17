# Bless Way — Fleet & Ledger

A working prototype of the fleet management, invoicing, payments, expenses,
and profit & loss app for Bless Way General Transport & Contracting.

## Run it locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Deploy to Vercel

1. Push this folder to a new GitHub repository.
2. Go to vercel.com → **Add New Project** → import that repo.
3. Vercel auto-detects **Vite** as the framework — leave the defaults
   (Build Command: `vite build`, Output Directory: `dist`) and click **Deploy**.
4. You'll get a live URL like `blessway-ledger.vercel.app` within a minute.

## Important: current data storage

This version saves data to **localStorage in the browser** — meaning each
device/browser has its own separate copy of the data. That's fine for
testing and demoing, but it's **not** shared between the client and staff,
and it disappears if someone clears their browser data.

To make data shared, synced across devices, and backed up automatically,
the storage layer needs to be swapped for a real backend — recommended:
**Supabase** (Postgres database + authentication + daily backups, free to
start). That's the next step once the workflow itself is approved —
ask Claude to do the Supabase migration when you're ready.

## Login

Demo PINs (not real security — see note above):
- Admin: `1111`
- Staff: `2222`
