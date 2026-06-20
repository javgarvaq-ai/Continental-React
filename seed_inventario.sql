-- =============================================================================
-- SEED: inventory_items — Continental POS
-- Generado: 2026-06-18  |  Fuente: Inventario.xlsx
-- =============================================================================
-- Conversión: 1 oz = 29.5735296 ml
-- unit_cost = precio_pomo ÷ capacity_oz  (MXN por oz)
-- ON CONFLICT (name): actualiza unit_type, capacity_oz y unit_cost
--   → safe para re-ejecutar sin duplicar
-- =============================================================================

INSERT INTO public.inventory_items
  (name, unit_type, capacity_oz, unit_cost, current_stock, active)
VALUES

  -- ── Bebidas sin Alcohol ──────────────────────────────────────────────────
  ('Refresco',              'unit', NULL,     12.0000,  0, true),
  ('Agua Mineral',          'unit', NULL,     11.0000,  0, true),
  ('Agua Natural',          'unit', NULL,      4.0000,  0, true),
  ('Heineken 0%',           'unit', NULL,     18.0833,  0, true),  -- 434/24 cajas

  -- ── Mezcladores (sin costo capturado aún) ───────────────────────────────
  ('Jarabe natural',        'oz',   33.8140,  NULL,     0, true),
  ('Anis',                  'oz',   33.8140,  NULL,     0, true),
  ('Granadina',             'oz',   33.8140,  NULL,     0, true),
  ('Curazao',               'oz',   33.8140,  NULL,     0, true),
  ('Oso negro ginebra',     'oz',   33.8140,  NULL,     0, true),

  -- ── Brandy ──────────────────────────────────────────────────────────────
  ('TORRES X',              'oz',   23.6698,  12.2519,  0, true),  -- 700 ml / $290
  ('TORRES V',              'oz',   23.6698,   9.7170,  0, true),  -- 700 ml / $230
  ('AZTECA DE ORO',         'oz',   23.6698,   7.8159,  0, true),  -- 700 ml / $185
  ('DON PEDRO',             'oz',   23.6698,   6.9287,  0, true),  -- 700 ml / $164

  -- ── Cognac ──────────────────────────────────────────────────────────────
  ('MARTELL VSOP',          'oz',   23.6698,  33.3759,  0, true),  -- 700 ml / $790
  ('HENESSY VS',            'oz',   23.6698,  31.6859,  0, true),  -- 700 ml / $750

  -- ── Ginebra ─────────────────────────────────────────────────────────────
  ('Diega Amarilla',        'oz',   32.1233,  13.0746,  0, true),  -- 950 ml / $420
  ('BEEFEATER London',      'oz',   25.3605,  15.7726,  0, true),  -- 750 ml / $400
  ('BOMBAY Zaphire',        'oz',   25.3605,  15.7726,  0, true),  -- 750 ml / $400

  -- ── Mezcal ──────────────────────────────────────────────────────────────
  ('MONTELOBOS Espadin',    'oz',   25.3605,  22.8702,  0, true),  -- 750 ml / $580
  ('400 CONEJOS Joven',     'oz',   25.3605,  18.1384,  0, true),  -- 750 ml / $460
  ('GUSANO ROJO Joven',     'oz',   25.3605,  12.2237,  0, true),  -- 750 ml / $310
  ('Huitzila Joven',        'oz',   33.8140,   3.5488,  0, true),  -- 1 lt   / $120

  -- ── Ron ─────────────────────────────────────────────────────────────────
  ('MATUSALEM Clasico',     'oz',   25.3605,  13.4067,  0, true),  -- 750 ml / $340
  ('APPLETON ESTATE',       'oz',   25.3605,  12.2237,  0, true),  -- 750 ml / $310
  ('BACARDI SOLERA',        'oz',   25.3605,  11.8294,  0, true),  -- 750 ml / $300
  ('BACARDI AÑEJO',         'oz',   25.3605,   8.2806,  0, true),  -- 750 ml / $210
  ('KRAKEN Black',          'oz',   25.3605,   8.2806,  0, true),  -- 750 ml / $210
  ('BACARDI BLANCO',        'oz',   23.6698,   8.2383,  0, true),  -- 700 ml / $195
  ('HAVANA CLUB 3',         'oz',   25.3605,   7.6891,  0, true),  -- 750 ml / $195
  ('CAPITAN MORGAN Spiced', 'oz',   23.6698,   8.0271,  0, true),  -- 700 ml / $190

  -- ── Tequila ─────────────────────────────────────────────────────────────
  ('DON JULIO 70',          'oz',   23.6698,  31.8972,  0, true),  -- 700 ml / $755
  ('1800 CRISTALINO',       'oz',   23.6698,  28.7286,  0, true),  -- 700 ml / $680
  ('DOBEL DIAMANTE',        'oz',   23.6698,  26.1937,  0, true),  -- 700 ml / $620
  ('Herradura Reposado',    'oz',   23.6698,  24.0813,  0, true),  -- 700 ml / $570
  ('7 LEGUAS BLANCO',       'oz',   25.3605,  22.2787,  0, true),  -- 750 ml / $565
  ('Herradura Plata',       'oz',   23.6698,  19.2228,  0, true),  -- 700 ml / $455
  ('CENTENARIO ULTRA',      'oz',   23.5007,  17.4463,  0, true),  -- 695 ml / $410
  ('TRADICIONAL PLATA',     'oz',   23.5007,  13.1911,  0, true),  -- 695 ml / $310
  ('30 30 BLANCO',          'oz',   23.6698,  12.6744,  0, true),  -- 700 ml / $300
  ('HACIENDA TEPA Cristalino','oz', 25.3605,  13.4067,  0, true),  -- 750 ml / $340
  ('GRAN MALO Tamarindo',   'oz',   25.3605,  11.4351,  0, true),  -- 750 ml / $290
  ('CENTENARIO PLATA',      'oz',   23.6698,  11.2802,  0, true),  -- 700 ml / $267
  ('CENTENARIO REPOSADO',   'oz',   23.6698,  11.0690,  0, true),  -- 700 ml / $262
  ('HORNITOS Reposado',     'oz',   25.3605,   9.8578,  0, true),  -- 750 ml / $250
  ('HACIENDA TEPA Blanco',  'oz',   25.3605,   9.4635,  0, true),  -- 750 ml / $240
  ('Centenario Azul',       'oz',   23.6698,   9.5058,  0, true),  -- 700 ml / $225

  -- ── Vodka ───────────────────────────────────────────────────────────────
  ('ABSOLUT MANDARINA',     'oz',   25.3605,   8.8721,  0, true),  -- 750 ml / $225
  ('ABSOLUT Natural',       'oz',   25.3605,   8.6749,  0, true),  -- 750 ml / $220
  ('SMIRNOFF',              'oz',   25.3605,   9.0692,  0, true),  -- 750 ml / $230
  ('SMIRNOFF Tamarindo',    'oz',   25.3605,   9.0692,  0, true),  -- 750 ml / $230
  ('OSO NEGRO Vodka',       'oz',   33.8140,   3.5488,  0, true),  -- 1 lt   / $120

  -- ── Whisky ──────────────────────────────────────────────────────────────
  ('BUCHANANS 18',          'oz',   25.3605,  78.8628,  0, true),  -- 750 ml / $2000
  ('BUCHANANS 12',          'oz',   25.3605,  27.2077,  0, true),  -- 750 ml / $690
  ('OLD PARR',              'oz',   25.3605,  27.6020,  0, true),  -- 750 ml / $700
  ('BLACK LABEL',           'oz',   25.3605,  23.6588,  0, true),  -- 750 ml / $600
  ('CHIVAS 12',             'oz',   25.3605,  22.0816,  0, true),  -- 750 ml / $560
  ('JACK DANIELS',          'oz',   23.6698,  17.7441,  0, true),  -- 700 ml / $420
  ('JACK DANIEL HONEY',     'oz',   23.6698,  17.7441,  0, true),  -- 700 ml / $420
  ('RED LABEL',             'oz',   25.3605,  12.2237,  0, true),  -- 750 ml / $310
  ('BLACK AND WHITE',       'oz',   23.6698,   9.2945,  0, true),  -- 700 ml / $220
  ('J&B',                   'oz',   23.6698,  12.8856,  0, true),  -- 700 ml / $305

  -- ── Mezclador alcohólico ─────────────────────────────────────────────────
  ('Arriero',               'oz',   59.1745,   2.1969,  0, true)   -- 1.75 lt / $130

ON CONFLICT (name) DO UPDATE SET
  unit_type    = EXCLUDED.unit_type,
  capacity_oz  = EXCLUDED.capacity_oz,
  unit_cost    = EXCLUDED.unit_cost,
  active       = true;
