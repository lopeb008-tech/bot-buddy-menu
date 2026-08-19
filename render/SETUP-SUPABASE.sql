-- =====================================================================
--  BOT DE TELEGRAM — Script completo de base de datos
--  Pégalo COMPLETO en:  Supabase → SQL Editor → New query → Run
--  Crea las 5 tablas + datos iniciales (precios y servicios).
-- =====================================================================

-- 1) Estado interno del bot (offset de getUpdates) --------------------
CREATE TABLE IF NOT EXISTS public.telegram_bot_state (
  id            int PRIMARY KEY CHECK (id = 1),
  update_offset bigint      NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_bot_state (id, update_offset)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- 2) Estado de cada usuario dentro del flujo del bot -------------------
CREATE TABLE IF NOT EXISTS public.telegram_user_state (
  chat_id    bigint PRIMARY KEY,
  username   text,
  first_name text,
  step       text        NOT NULL DEFAULT 'start',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Perfil / datos de pago del usuario --------------------------------
CREATE TABLE IF NOT EXISTS public.telegram_user_config (
  chat_id          bigint PRIMARY KEY,
  cup_card         text,
  confirm_number   text,
  mi_transfer      text,
  successful_deals integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 4) Configuración del bot (tasas, datos del admin, paquetes SM) -------
CREATE TABLE IF NOT EXISTS public.bot_config (
  key        text PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bot_config (key, value) VALUES
  ('buy_rate',             '600'),                                              -- 1 USDT = 600 CUP (compra de moneda)
  ('sell_rate',            '640'),                                              -- 1 USDT = 640 CUP (venta de moneda)
  ('sm_buy_rate',          '2.5'),                                              -- 1 SM = 2.5 CUP (compra de saldo)
  ('admin_cup_card',       '"9204-0699-9692-9675"'),
  ('admin_confirm_number', '"58613666"'),
  ('admin_mi_transfer',    '"58613666"'),
  ('admin_usdt_wallet',    '"0xD64Ea37111d1926C1015091a6D241996946A29B0"'),
  ('admin_chat_id',        '5127721601'),
  ('sm_packages',          '[{"sm":120,"cup":400},{"sm":240,"cup":1000},{"sm":370,"cup":1300}]')
ON CONFLICT (key) DO NOTHING;

-- 5) Servicios y Telegram Premium --------------------------------------
CREATE TABLE IF NOT EXISTS public.bot_services (
  id              text PRIMARY KEY,
  name            text        NOT NULL,
  cup             integer     NOT NULL,
  emoji           text        NOT NULL DEFAULT '📦',
  category        text        NOT NULL DEFAULT 'service',
  duration_months integer,
  sort_order      integer     NOT NULL DEFAULT 0,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bot_services (id, name, cup, emoji, category, sort_order) VALUES
  ('netflix_srv', 'Servicio Netflix',        2000, '🎬', 'service', 1),
  ('netflix_acc', 'Cuenta Netflix (Mes)',    6200, '🎬', 'service', 2),
  ('deportes',    'Transmisión Deportiva',   2500, '⚽', 'service', 3),
  ('tv_intl',     'TV Internacional (Mes)',  4000, '📺', 'service', 4),
  ('peliculas',   'Películas y Series',      2500, '🎥', 'service', 5),
  ('tiktok',      'Instalación de TikTok',   1500, '📱', 'service', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.bot_services (id, name, cup, emoji, category, duration_months, sort_order) VALUES
  ('tgp_3',  '3 meses',  7800,  '✨', 'telegram_premium', 3,  10),
  ('tgp_6',  '6 meses',  10000, '✨', 'telegram_premium', 6,  11),
  ('tgp_12', '12 meses', 18000, '✨', 'telegram_premium', 12, 12)
ON CONFLICT (id) DO NOTHING;

-- 6) Seguridad ---------------------------------------------------------
-- El bot usa la SERVICE ROLE KEY, que ignora RLS.
-- Activamos RLS sin políticas públicas => nadie más puede leer/escribir.
ALTER TABLE public.telegram_bot_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_user_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_user_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_services         ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.telegram_bot_state   TO service_role;
GRANT ALL ON public.telegram_user_state  TO service_role;
GRANT ALL ON public.telegram_user_config TO service_role;
GRANT ALL ON public.bot_config           TO service_role;
GRANT ALL ON public.bot_services         TO service_role;

-- Listo. Verifica con:
-- SELECT * FROM public.bot_config;
-- SELECT * FROM public.bot_services ORDER BY sort_order;
