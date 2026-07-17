-- ============================================================
-- Stack Check — migration 4: age-banded calcium limit
-- Run this AFTER migration_3_admin.sql, in Supabase → SQL Editor
-- ============================================================
--
-- Of everything in the nutrients table, calcium is the one value with a
-- well-established, age-based upper limit change within the adult range:
-- 2,500mg for ages 19–50, dropping to 2,000mg at 51+. Nothing else in this
-- table has a comparable adult age split, so this migration intentionally
-- only touches calcium rather than inventing bands for other nutrients.

alter table nutrients add column ul_over_50 numeric;

update nutrients set ul_over_50 = 2000 where id = 'calcium';

-- Store the user's age alongside their stack (optional — null is fine,
-- the app just falls back to the standard adult limit).
alter table user_stacks add column age integer;
