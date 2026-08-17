# Render deployment for Telegram bot

This folder contains everything needed to run the Telegram bot on [Render](https://render.com) as a persistent web service.

## What you need

- A Render account (free tier works)
- Your Telegram bot token
- A Supabase project URL and service role key (the bot uses Supabase as database)

> ⚠️ **Important:** Lovable Cloud does not expose the `SUPABASE_SERVICE_ROLE_KEY`. If you want to keep using Lovable Cloud as the database, you will need to switch the bot to use the anon key and add the correct RLS policies. The easiest path for Render is to create your own Supabase project at [supabase.com](https://supabase.com) where you can copy the service role key from Settings → API.

## Files

- `Dockerfile` — builds the bot with Deno
- `README.md` — this file

## How to deploy

1. **Push this project to GitHub** (Render can deploy directly from a GitHub repo).

2. In Render, click **New → Web Service**.

3. Choose your GitHub repository and:
   - **Runtime:** Docker
   - **Branch:** main
   - **Region:** choose the closest one
   - **Plan:** Free

4. Add these environment variables in Render (Settings → Environment):

   | Variable | Value / where to get it |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | The token you got from @BotFather |
   | `SUPABASE_URL` | `https://your-project.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | From your Supabase project Settings → API → service_role key |
   | `WEBHOOK_URL` | `https://your-service-name.onrender.com` (after the first deploy you will see the URL) |
   | `WEBHOOK_ONLY` | `true` |

   > Tip: after the first deploy Render shows you the public URL. Copy it and add it as `WEBHOOK_URL`, then restart the service.

5. Click **Deploy**.

6. After the service is live, the bot will automatically register its webhook with Telegram. You can check the logs in Render to see `Set webhook result: { ok: true, ... }`.

7. Open Telegram and write `/start` to your bot to test it.

## Keep the database awake

If you are using the free Supabase tier, the database pauses after 7 days of inactivity. When that happens, the bot will respond with errors. You can prevent this by:
- Using a paid Supabase plan, or
- Pinging the bot every few days, or
- Setting up a cron job that calls the Render health endpoint.

## Switching from Lovable Cloud to your own Supabase

If you want to migrate the data:
1. Create a new Supabase project.
2. Run the SQL migrations from `supabase/migrations/` in your new project.
3. Copy the `bot_config`, `bot_services`, `telegram_bot_state`, `telegram_user_config`, and `telegram_user_state` tables.
4. Use the new `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Render.
