
-- Table to track getUpdates offset (singleton)
CREATE TABLE public.telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0);

-- Table to track each user's state in the bot flow
CREATE TABLE public.telegram_user_state (
  chat_id bigint PRIMARY KEY,
  username text,
  first_name text,
  step text NOT NULL DEFAULT 'start',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_user_state ENABLE ROW LEVEL SECURITY;
