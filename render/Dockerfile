FROM denoland/deno:1.46.3

WORKDIR /app

# Copy the Supabase Edge Function into the container as the main bot entrypoint
COPY supabase/functions/telegram-poll/index.ts ./bot.ts

# Render provides the PORT env var automatically. We default to 8000 locally.
ENV WEBHOOK_ONLY=true
ENV PORT=8000
EXPOSE 8000

# Run the bot in webhook-only mode (Render will send Telegram webhooks to this service)
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "bot.ts"]
