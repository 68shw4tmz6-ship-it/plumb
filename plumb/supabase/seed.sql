-- ============================================================
-- Plumb — optional seed data
-- Run AFTER the three migrations. Safe to skip.
-- Users are created through the app's sign-up screen or the Supabase
-- dashboard; to make someone the boss:
--     update public.profiles set role = 'boss' where email = 'you@example.com';
-- ============================================================

-- ---------- Price book (landscaping / construction starters) ----------
insert into public.price_items (category, label, unit, unit_price, kind) values
  ('Site works',   'Site set-up and protection',            'lot', 450.00,  'work'),
  ('Site works',   'Excavation, small machine',             'hr',  145.00,  'work'),
  ('Site works',   'Spoil removal and tip fees',            'm3',  95.00,   'work'),
  ('Concrete',     'Concrete slab, 100mm, reinforced',      'm2',  135.00,  'work'),
  ('Concrete',     'Exposed aggregate finish',              'm2',  48.00,   'work'),
  ('Concrete',     'Concrete N20 supply',                   'm3',  310.00,  'material'),
  ('Retaining',    'Besser block retaining wall',           'm2',  420.00,  'work'),
  ('Retaining',    'Timber sleeper wall, treated pine',     'm2',  265.00,  'work'),
  ('Retaining',    'Ag line and drainage gravel',           'm',   38.00,   'material'),
  ('Paving',       'Paver laying on sand bed',              'm2',  85.00,   'work'),
  ('Paving',       'Pavers, standard range',                'm2',  62.00,   'material'),
  ('Turf',         'Turf supply and lay',                   'm2',  18.50,   'work'),
  ('Turf',         'Underturf soil, 100mm',                 'm3',  88.00,   'material'),
  ('Planting',     'Garden bed preparation',                'm2',  22.00,   'work'),
  ('Planting',     'Mulch supply and spread',               'm3',  95.00,   'material'),
  ('Irrigation',   'Irrigation, 4 station system',          'lot', 1850.00, 'work'),
  ('Fencing',      'Colorbond fence, 1.8m',                 'm',   135.00,  'work'),
  ('Carpentry',    'Timber deck, merbau, framed',           'm2',  395.00,  'work'),
  ('Carpentry',    'Pergola, colorbond roof',               'm2',  310.00,  'work'),
  ('Labour',       'Labourer',                              'hr',  75.00,   'work'),
  ('Labour',       'Tradesman',                             'hr',  105.00,  'work'),
  ('Plant hire',   'Bobcat and operator',                   'hr',  160.00,  'work'),
  ('Plant hire',   'Truck cartage',                         'hr',  130.00,  'work'),
  ('General',      'Project management and supervision',    'lot', 0.00,    'other'),
  ('General',      'Allowance, provisional sum',            'lot', 0.00,    'other')
on conflict do nothing;
