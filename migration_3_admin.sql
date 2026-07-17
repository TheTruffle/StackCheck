-- ============================================================
-- Stack Check — migration 3: admin catalog functions
-- Run this AFTER migration_2_submissions.sql, in Supabase → SQL Editor
-- ============================================================
--
-- Normal RLS only lets a user see approved brands, or pending ones they
-- personally submitted. The admin page needs to see and manage EVERYTHING
-- (every pending submission, from any device) — these functions provide
-- that, scoped narrowly to just what the admin page needs, rather than
-- exposing the service_role key in frontend code (which should never
-- happen). Access to the admin page itself is gated by a passcode at the
-- app level — see VITE_ADMIN_CODE in .env. This is a reasonable lock for a
-- personal-use app, not enterprise-grade auth.

create or replace function admin_list_brands()
returns setof brands
language sql security definer set search_path = public as $$
  select * from brands order by status, label;
$$;

create or replace function admin_list_brand_items()
returns setof brand_items
language sql security definer set search_path = public as $$
  select * from brand_items;
$$;

create or replace function admin_set_brand_status(p_id text, p_status text)
returns void
language sql security definer set search_path = public as $$
  update brands set status = p_status where id = p_id;
$$;

create or replace function admin_delete_brand(p_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from brand_items where brand_id = p_id;
  delete from brands where id = p_id;
end;
$$;

-- Add a brand directly as approved (skips the pending queue — for you,
-- adding your own household's multivitamins straight from the admin page).
create or replace function admin_add_brand(p_id text, p_label text, p_photo_path text, p_items jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into brands (id, label, status, photo_path) values (p_id, p_label, 'approved', p_photo_path);
  insert into brand_items (brand_id, nutrient_id, amount)
  select p_id, (item->>'nutrientId')::text, (item->>'amount')::numeric
  from jsonb_array_elements(p_items) as item;
end;
$$;

grant execute on function admin_list_brands() to anon, authenticated;
grant execute on function admin_list_brand_items() to anon, authenticated;
grant execute on function admin_set_brand_status(text, text) to anon, authenticated;
grant execute on function admin_delete_brand(text) to anon, authenticated;
grant execute on function admin_add_brand(text, text, text, jsonb) to anon, authenticated;
