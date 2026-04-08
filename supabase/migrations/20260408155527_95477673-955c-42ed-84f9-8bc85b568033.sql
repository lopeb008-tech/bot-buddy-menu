
-- Bot configuration (key-value for rates, admin payment info, etc.)
CREATE TABLE public.bot_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read bot config"
ON public.bot_config FOR SELECT USING (true);

-- Insert default config values
INSERT INTO public.bot_config (key, value) VALUES
  ('buy_rate', '600'),
  ('sell_rate', '640'),
  ('admin_cup_card', '"9204-0699-9692-9675"'),
  ('admin_confirm_number', '"58613666"'),
  ('admin_mi_transfer', '"58613666"'),
  ('admin_usdt_wallet', '"0xD64Ea37111d1926C1015091a6D241996946A29B0"'),
  ('admin_chat_id', '5127721601'),
  ('admin_password', '"admin123"'),
  ('sm_packages', '[{"sm":120,"cup":400},{"sm":240,"cup":1000},{"sm":370,"cup":1300}]');

-- Bot services table
CREATE TABLE public.bot_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cup INTEGER NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📦',
  category TEXT NOT NULL DEFAULT 'service',
  duration_months INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read bot services"
ON public.bot_services FOR SELECT USING (true);

-- Insert default services
INSERT INTO public.bot_services (id, name, cup, emoji, category, sort_order) VALUES
  ('netflix_srv', 'Servicio Netflix', 2000, '🎬', 'service', 1),
  ('netflix_acc', 'Cuenta Netflix (Mes)', 6200, '🎬', 'service', 2),
  ('deportes', 'Transmisión Deportiva', 2500, '⚽', 'service', 3),
  ('tv_intl', 'TV Internacional (Mes)', 4000, '📺', 'service', 4),
  ('peliculas', 'Películas y Series', 2500, '🎥', 'service', 5),
  ('tiktok', 'Instalación de TikTok', 1500, '📱', 'service', 6);

-- Insert Telegram Premium options
INSERT INTO public.bot_services (id, name, cup, emoji, category, duration_months, sort_order) VALUES
  ('tgp_3', '3 meses', 7800, '✨', 'telegram_premium', 3, 10),
  ('tgp_6', '6 meses', 10000, '✨', 'telegram_premium', 6, 11),
  ('tgp_12', '12 meses', 18000, '✨', 'telegram_premium', 12, 12);
