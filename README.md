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
3c. Run `migration_3_admin.sql` the same way. This adds the database functions the admin catalog page (step 5 below) needs to see and manage every brand, not just your own.
3d. Run `migration_4_age.sql` too. This adds an optional age field so the app can apply the correct calcium safety threshold (2,500mg under 51, 2,000mg at 51+) — the one nutrient here with an established age-based change for adults.
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

Open `.env` and paste in your Project URL and anon key from step 1.5, and pick your own passcode for the admin page:

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_ADMIN_CODE=pick-anything-you'll-remember
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
show up in anyone's search yet, including the submitter's, until it's approved.
Use the admin catalog page below to approve, unpublish, or delete submissions.
(You can still do this by hand in the Supabase dashboard's Table Editor if
you'd rather — the admin page is just faster.)

## Admin catalog page

Visit your deployed site with `?admin` on the end of the URL, e.g.
`https://your-app.vercel.app/?admin`, and enter the passcode you set as
`VITE_ADMIN_CODE`. From there you can:

- See every brand — approved and pending — with its full ingredient
  breakdown and packaging photo (if one was attached)
- **Approve** a pending submission so it shows up in everyone's brand search,
  or **Unpublish** an approved one to hide it again
- **Delete** a brand entirely (removes its ingredient rows too)
- **Add a brand directly** — skips the pending queue entirely, goes straight
  in as approved. Useful for your own household's regular supplements.

Don't forget to set `VITE_ADMIN_CODE` as an environment variable in Vercel
too (**Project Settings → Environment Variables**), the same way you did for
the Supabase keys — otherwise the admin page will refuse to unlock.

**On the security model here:** the passcode is a simple app-level gate, not
real authentication — anyone with the code (and the exact URL) can approve,
delete, or add brands. That's a reasonable tradeoff for a personal-use app
with a handful of people you trust, but it isn't meant to withstand someone
actively trying to break in. If this ever gets wider use, worth replacing
with real Supabase auth (email/password or magic link) and an `is_admin`
flag checked server-side instead of a shared passcode.

## Age-adjusted calcium limit

There's an optional "Your age" field near the top of the app. It affects
exactly one thing: calcium's upper limit drops from 2,500mg to 2,000mg at
age 51+, per NIH reference data. That's the only nutrient in this list with
an established age-based change across the adult range — the others don't
shift within adulthood, so no other values change based on age. Leaving it
blank just uses the standard adult limit for everyone. The in-app copy spells
this scope out explicitly so it doesn't look more personalized than it is.

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
