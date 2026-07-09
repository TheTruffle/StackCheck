-- ============================================================
-- Stack Check — migration 2: brand submissions + packaging photos
-- Run this AFTER schema.sql, in Supabase → SQL Editor
-- ============================================================

-- Existing seeded brands become 'approved' automatically via the default.
alter table brands add column status text not null default 'approved';
alter table brands add column photo_path text;
alter table brands add column submitted_by uuid references auth.users(id);

-- Replace the old "anyone can read everything" policy with one that only
-- exposes approved brands publicly, but still lets a user see their own
-- pending submissions.
drop policy if exists "public read brands" on brands;

create policy "read approved or own brands" on brands
  for select using (status = 'approved' or submitted_by = auth.uid());

-- Anyone signed in (including anonymous sessions) can submit a new brand,
-- but it always lands as 'pending' and tagged with who submitted it.
create policy "submit new brand as pending" on brands
  for insert with check (submitted_by = auth.uid() and status = 'pending');

-- Let a submitter add ingredient rows to a brand they just created.
create policy "add items to own submitted brand" on brand_items
  for insert with check (
    exists (select 1 from brands b where b.id = brand_items.brand_id and b.submitted_by = auth.uid())
  );

-- ---- Storage bucket for packaging photos ----
insert into storage.buckets (id, name, public)
values ('brand-photos', 'brand-photos', true)
on conflict (id) do nothing;

-- Photos are not sensitive, so public read is fine. Anyone can upload
-- (tightening this to "only the submitter can upload to their own path"
-- is a reasonable follow-up once there's real traffic to worry about).
create policy "public read brand photos" on storage.objects
  for select using (bucket_id = 'brand-photos');

create policy "anyone can upload brand photos" on storage.objects
  for insert with check (bucket_id = 'brand-photos');

-- ---- How to review pending submissions ----
-- For now, review happens directly in the Supabase dashboard:
-- Table Editor → brands → filter where status = 'pending' → change to
-- 'approved' (or delete) once you've checked it. A simple query to see
-- what's waiting:
--
--   select id, label, photo_path, submitted_by from brands where status = 'pending';
