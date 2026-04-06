CREATE TABLE public.telegram_user_config (
  chat_id BIGINT PRIMARY KEY,
  cup_card TEXT,
  confirm_number TEXT,
  mi_transfer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);