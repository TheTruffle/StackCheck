-- ============================================================
-- Stack Check — Supabase schema
-- Run this in Supabase: Project → SQL Editor → New query → Run
-- ============================================================

-- Reference tables (shared, read-only to the app, same for every user)
create table nutrients (
  id text primary key,
  name text not null,
  unit text not null,
  ul numeric,              -- tolerable upper limit, null if none established
  timing text not null,    -- 'with_meal' | 'empty_stomach' | 'either' | 'bedtime'
  reason text not null,
  synonyms text[] not null default '{}'
);

create table brands (
  id text primary key,
  label text not null
);

create table brand_items (
  id serial primary key,
  brand_id text references brands(id) on delete cascade,
  nutrient_id text references nutrients(id),
  amount numeric not null
);

create table interactions (
  id serial primary key,
  nutrient_a text references nutrients(id),
  nutrient_b text references nutrients(id),
  type text not null,      -- 'caution' | 'helpful'
  note text not null
);

-- Personal data: one row per signed-in user, holding their current stack as JSON.
-- Simplest workable shape for an MVP — normalize into per-ingredient rows later if you
-- want cross-stack analytics (e.g. "most common ingredient across all users").
create table user_stacks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ---- Row Level Security ----

-- Reference tables: anyone (including anonymous users) can read, nobody can write via the API
alter table nutrients enable row level security;
alter table brands enable row level security;
alter table brand_items enable row level security;
alter table interactions enable row level security;

create policy "public read nutrients" on nutrients for select using (true);
create policy "public read brands" on brands for select using (true);
create policy "public read brand_items" on brand_items for select using (true);
create policy "public read interactions" on interactions for select using (true);

-- user_stacks: a user can only read/write their own row
alter table user_stacks enable row level security;

create policy "own stack select" on user_stacks for select using (auth.uid() = user_id);
create policy "own stack insert" on user_stacks for insert with check (auth.uid() = user_id);
create policy "own stack update" on user_stacks for update using (auth.uid() = user_id);

-- ============================================================
-- Seed data
-- ============================================================

insert into nutrients (id, name, unit, ul, timing, reason, synonyms) values
('vitA','Vitamin A','mcg',3000,'with_meal','Fat-soluble — needs dietary fat alongside it to absorb well.',array['vitamin a','retinol']),
('vitC','Vitamin C','mg',2000,'either','Water-soluble; food doesn''t change absorption much, but may ease it on a sensitive stomach.',array['vitamin c','ascorbic acid']),
('vitD','Vitamin D','IU',4000,'with_meal','Fat-soluble — absorption improves significantly when taken with a meal containing fat.',array['vitamin d3','vitamin d2','vitamin d','cholecalciferol']),
('vitE','Vitamin E','mg',1000,'with_meal','Fat-soluble — needs dietary fat to be absorbed effectively.',array['vitamin e','tocopherol']),
('vitK','Vitamin K','mcg',null,'with_meal','Fat-soluble — best absorbed alongside a meal with some fat.',array['vitamin k']),
('b1','Vitamin B1 (Thiamin)','mg',null,'with_meal','Can cause mild nausea on an empty stomach for some people.',array['thiamin','vitamin b1']),
('b2','Vitamin B2 (Riboflavin)','mg',null,'with_meal','Gentler on the stomach when taken with food.',array['riboflavin','vitamin b2']),
('b3','Vitamin B3 (Niacin)','mg',35,'with_meal','Food blunts the harmless but uncomfortable ''niacin flush'' skin reaction.',array['niacin','vitamin b3']),
('b6','Vitamin B6','mg',100,'with_meal','Reduces the chance of stomach upset at higher doses.',array['vitamin b6','pyridoxine']),
('folate','Folate','mcg',1000,'either','Water-soluble; absorbed well with or without food.',array['folate','folic acid']),
('b12','Vitamin B12','mcg',null,'empty_stomach','Absorption is somewhat better on an empty stomach, though it''s still fine with food.',array['vitamin b12','cobalamin','cyanocobalamin','methylcobalamin']),
('biotin','Biotin','mcg',null,'either','Water-soluble; timing relative to food doesn''t matter much.',array['biotin']),
('calcium','Calcium','mg',2500,'with_meal','Stomach acid from eating helps absorb it; also best split from iron and zinc doses.',array['calcium']),
('iron','Iron','mg',45,'empty_stomach','Absorbs best without food, but take with a little food if it upsets your stomach — just avoid calcium, coffee, or tea nearby.',array['iron','ferrous']),
('magnesium','Magnesium','mg',350,'with_meal','Food reduces the loose-stool effect it can have on an empty stomach.',array['magnesium']),
('zinc','Zinc','mg',40,'with_meal','Can cause nausea on an empty stomach; also competes with calcium and iron for absorption.',array['zinc']),
('copper','Copper','mg',10,'with_meal','Best taken with food to avoid stomach irritation.',array['copper']),
('selenium','Selenium','mcg',400,'with_meal','Taking it with food reduces mild GI irritation.',array['selenium']),
('potassium','Potassium','mg',null,'with_meal','Food buffers the stomach against irritation from potassium salts.',array['potassium']),
('omega3','Omega-3 (fish oil)','mg',null,'with_meal','Fat-soluble and better absorbed with dietary fat; also cuts down on ''fish burps''.',array['omega-3','omega 3','fish oil','epa','dha']),
('melatonin','Melatonin','mg',null,'bedtime','Timed to your sleep window, roughly 30–60 minutes before bed, ideally without a heavy meal.',array['melatonin']),
('ashwagandha','Ashwagandha','mg',null,'with_meal','Food helps prevent the mild stomach upset it can cause on its own.',array['ashwagandha']),
('creatine','Creatine','g',null,'either','Timing relative to food doesn''t meaningfully affect it — consistency day to day matters more.',array['creatine']),
('caffeine','Caffeine','mg',400,'either','Fine with or without food, but food can soften the jitters and stomach acidity for sensitive users.',array['caffeine']);

insert into brands (id, label) values
('b1','Nature Made Multi for Him'),
('b2','Centrum Silver Adults 50+'),
('b3','Nature''s Bounty Vitamin D3 2000 IU'),
('b4','NOW Foods Magnesium Citrate 200mg'),
('b5','Garden of Life Vitamin C 1000mg'),
('b6b','Nordic Naturals Ultimate Omega'),
('b7','Solgar Vitamin B12 1000mcg'),
('b8','Nature Made Iron 65mg'),
('b9','Thorne Zinc Picolinate 15mg'),
('b10','NOW Ashwagandha 450mg'),
('b11','Nature Made Melatonin 5mg'),
('b12b','Optimum Nutrition Creatine Monohydrate'),
('b13','Nature Made Calcium 600mg + D3'),
('b14','Life Extension Selenium 200mcg'),
('b15','Kirkland Signature Fish Oil');

insert into brand_items (brand_id, nutrient_id, amount) values
('b1','vitA',900),('b1','vitC',90),('b1','vitD',1000),('b1','vitE',20),('b1','b6',2),('b1','folate',400),('b1','b12',6),('b1','zinc',11),('b1','selenium',55),
('b2','vitA',700),('b2','vitC',85),('b2','vitD',1000),('b2','vitE',30),('b2','b6',3),('b2','b12',25),('b2','calcium',220),('b2','magnesium',100),('b2','zinc',11),('b2','copper',0.5),
('b3','vitD',2000),
('b4','magnesium',200),
('b5','vitC',1000),
('b6b','omega3',1280),
('b7','b12',1000),
('b8','iron',65),
('b9','zinc',15),
('b10','ashwagandha',450),
('b11','melatonin',5),
('b12b','creatine',5),
('b13','calcium',600),('b13','vitD',800),
('b14','selenium',200),
('b15','omega3',400);

insert into interactions (nutrient_a, nutrient_b, type, note) values
('calcium','iron','caution','Calcium can block iron absorption — space these at least 2 hours apart.'),
('zinc','iron','caution','Zinc and iron compete for the same absorption pathway — space them apart if doses are high.'),
('calcium','zinc','caution','High-dose calcium can reduce how much zinc your body absorbs.'),
('zinc','copper','caution','Ongoing high-dose zinc can deplete copper over time — many multivitamins balance the two intentionally.'),
('calcium','magnesium','caution','Very high doses of either can compete for absorption, though typical doses together are usually fine.'),
('vitE','vitK','caution','High-dose vitamin E can interfere with vitamin K''s role in blood clotting.'),
('melatonin','caffeine','caution','Caffeine can counteract melatonin''s effect on sleep — best not to take close together.'),
('vitC','iron','helpful','Vitamin C actually improves iron absorption — a genuinely useful pairing, not a conflict.'),
('magnesium','vitD','helpful','Magnesium helps activate vitamin D in the body — a supportive pairing.');
