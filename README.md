# Stack Check

A supplement-stack checker: enter what you're taking, and it flags redundant
ingredients, dose overlaps against upper limits, nutrient-nutrient
interactions, and meal-timing guidance.

## What's in this folder

```
stack-check-app/
├── index.html          entry HTML
├── package.json         dependencies
├── vite.config.js       build config + PWA setup
├── schema.sql            run this in Supabase to create your tables
├── .env.example          copy to .env and fill in your Supabase keys
├── .gitignore
└── src/
    ├── main.jsx          React entry point
    ├── App.jsx           the whole app UI + logic
    ├── data.js           local fallback data (used if Supabase is unreachable)
    └── supabaseClient.js Supabase connection
```

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any name/region, set a database password (save it somewhere — you won't need it day-to-day, but you'll want it if you ever connect a raw Postgres client).
2. Once it's provisioned, open **SQL Editor** in the left sidebar → **New query**.
3. Open `schema.sql` from this folder, paste the whole thing in, and click **Run**. This creates the `nutrients`, `brands`, `brand_items`, `interactions`, and `user_stacks` tables, sets up Row Level Security, and seeds the reference data.
3b. Open a **New query** again, paste in `migration_2_submissions.sql`, and run that too. This adds brand-submission moderation (a `status` column so new user-submitted brands start as `pending` and only show up in search once you approve them) and a `brand-photos` Storage bucket for optional packaging photos.
4. Go to **Authentication → Providers** (or **Authentication → Settings**, depending on your Supabase version) and make sure **Anonymous sign-ins** is enabled. The app uses this so each visitor gets a stable identity to save their stack against, with no login screen.
5. Go to **Project Settings → API**. You'll need two values from here in step 3 below:
   - **Project URL**
   - **anon public** key (not the `service_role` key — never put that in frontend code)

## 2. Run it locally

You'll need [Node.js](https://nodejs.org) installed (v18+).

```bash
cd stack-check-app
npm install
cp .env.example .env
```

Open `.env` and paste in your Project URL and anon key from step 1.5:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Then:

```bash
npm run dev
```

Open the local URL it prints (usually `http://localhost:5173`). You should see
the app, and the small indicator in the top-right corner should say **Synced**
once it connects to Supabase. Try adding a supplement — refresh the page —
it should still be there, pulled back from your `user_stacks` table.

If you skip the `.env` step entirely, the app still runs fine using the
built-in fallback data in `src/data.js` — it just won't persist your stack
between sessions.

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo (Vercel deploys from git).
   ```bash
   git init
   git add .
   git commit -m "Stack Check"
   git branch -M main
   git remote add origin <your-empty-github-repo-url>
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import that GitHub repo.
3. Vercel auto-detects Vite. Before deploying, expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   (same values as your local `.env`)
4. Click **Deploy**. You'll get a live URL like `stack-check.vercel.app`.

## 4. Install it on your Android phone

1. Open your Vercel URL in Chrome on your phone.
2. Tap the **⋮** menu → **Add to Home screen** (or you may see an automatic install banner, since this is set up as a PWA).
3. It installs like a real app — full-screen, own icon, works offline for anything already loaded.

Note: the manifest in `vite.config.js` references `icon-192.png` and
`icon-512.png` in a `public/` folder that isn't included yet — add two PNG
icons at those sizes to `public/` (any square logo works) before this part
looks fully polished; without them the app still installs, just with a
generic icon.

## Reviewing submitted brands

When someone fills in a supplement manually and taps **"Save for others,"** it's
inserted into the `brands` table with `status = 'pending'` — it does **not**
show up in anyone's search yet, including the submitter's, until you approve it.

To review and approve:

1. Supabase dashboard → **Table Editor → brands**
2. Filter where `status = pending`
3. Check the `label`, ingredient amounts (in `brand_items`), and photo
   (`photo_path` — view it via **Storage → brand-photos**)
4. Edit the row and change `status` to `approved` (or delete it if it's junk/a duplicate)

There's no in-app moderation queue yet — this is a manual dashboard step for
now, which is fine at low volume. Worth building an in-app admin view once
submissions pick up.

## Local search history

Each device keeps its own small history of recently searched/selected brand
names, stored in **IndexedDB** (`src/history.js`) — not Supabase. This is
intentional: it's pure UX convenience (quick re-access to what you've looked
up before), doesn't need to sync across devices, and adds no extra database
writes or Supabase quota usage. It shows up as "Recent" chips under the brand
search box when the search field is empty. Clearing browser data on the
device will clear it.

## Notes on what's real vs. approximate

- **Nutrient upper limits** are general adult reference figures — not
  personalized, and don't account for age, pregnancy, kidney function, or
  medications.
- **Brand data** (`brands` / `brand_items` tables) reflects typical/representative
  formulations, not live label data pulled from manufacturers — brands
  reformulate, so double-check against the actual label.
- **Label scanning (OCR)** uses Tesseract.js loaded from a CDN at scan time —
  it's a best-effort read of the photo, not guaranteed accurate. Always
  spot-check scanned amounts against the real label.
- None of this is medical advice — encourage anyone using it to check with a
  pharmacist or doctor before changing their supplement routine.

## Where to go next

- Add real product icons to `public/` for a polished install prompt
- Normalize `user_stacks` into per-ingredient rows if you want cross-user
  analytics later (e.g. "most common ingredient among all users")
- Swap the curated `brands` table for a real product/nutrition API if you
  want broader brand coverage than the ~15 seeded here
- Consider Capacitor later if you want Play Store distribution instead of
  (or alongside) the PWA install path
