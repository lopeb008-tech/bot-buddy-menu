import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

// The channel users must join (simulated for now — change this to your real channel)
const REQUIRED_CHANNEL = '@tu_canal'; // Cambia esto por tu canal real

Deno.serve(async () => {
  const startTime = Date.now();

  const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }), { status: 500 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let totalProcessed = 0;

  // Read current offset
  const { data: state, error: stateErr } = await supabase
    .from('telegram_bot_state')
    .select('update_offset')
    .eq('id', 1)
    .single();

  if (stateErr) {
    return new Response(JSON.stringify({ error: stateErr.message }), { status: 500 });
  }

  let currentOffset = state.update_offset;

  // Poll loop
  while (true) {
    const elapsed = Date.now() - startTime;
    const remainingMs = MAX_RUNTIME_MS - elapsed;
    if (remainingMs < MIN_REMAINING_MS) break;

    const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    const response = await fetch(
      `${TELEGRAM_API}/bot${BOT_TOKEN}/getUpdates`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: currentOffset,
          timeout,
          allowed_updates: ['message', 'callback_query'],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return new Response(JSON.stringify({ error: data }), { status: 502 });
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    // Process each update
    for (const update of updates) {
      try {
        if (update.message) {
          await handleMessage(BOT_TOKEN, supabase, update.message);
        } else if (update.callback_query) {
          await handleCallbackQuery(BOT_TOKEN, supabase, update.callback_query);
        }
      } catch (e) {
        console.error('Error processing update:', e);
      }
      totalProcessed++;
    }

    // Advance offset
    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    await supabase
      .from('telegram_bot_state')
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq('id', 1);

    currentOffset = newOffset;
  }

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed }));
});

// --- Telegram helpers ---

async function sendMessage(botToken: string, chatId: number, text: string, extra: Record<string, any> = {}) {
  await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
  });
}

async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  await fetch(`${TELEGRAM_API}/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

async function upsertUserState(supabase: any, chatId: number, username: string | undefined, firstName: string | undefined, step: string) {
  await supabase.from('telegram_user_state').upsert({
    chat_id: chatId,
    username: username ?? null,
    first_name: firstName ?? null,
    step,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'chat_id' });
}

// --- Handlers ---

async function handleMessage(botToken: string, supabase: any, message: any) {
  const chatId = message.chat.id;
  const text = message.text ?? '';
  const username = message.from?.username;
  const firstName = message.from?.first_name;

  if (text === '/start') {
    // Save user state
    await upsertUserState(supabase, chatId, username, firstName, 'awaiting_join');

    // Send welcome message with channel link and verify button
    const welcomeText =
      `👋 <b>¡Bienvenido${firstName ? ', ' + firstName : ''}!</b>\n\n` +
      `Para continuar, únete a nuestro canal:\n` +
      `👉 https://t.me/${REQUIRED_CHANNEL.replace('@', '')}\n\n` +
      `Después de unirte, presiona el botón <b>"✅ Verificar"</b> para confirmar.`;

    await sendMessage(botToken, chatId, welcomeText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📢 Unirse al Canal', url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` },
          ],
          [
            { text: '✅ Verificar', callback_data: 'verify_channel' },
          ],
        ],
      },
    });
    return;
  }

  // If user is in menu state, handle menu text buttons
  const { data: userState } = await supabase
    .from('telegram_user_state')
    .select('step')
    .eq('chat_id', chatId)
    .single();

  if (userState?.step === 'menu') {
    if (text === '🛍️ Tienda') {
      await sendMessage(botToken, chatId, '🛒 <b>Bienvenido a la Tienda</b>\n\nAquí podrás ver productos, ofertas y realizar compras. (Próximamente)');
    } else if (text === '👤 Cuenta') {
      await sendMessage(botToken, chatId, '👤 <b>Mi Cuenta</b>\n\nAquí podrás ver tu perfil, saldo y configuración. (Próximamente)');
    } else if (text === '🎧 Soporte') {
      await sendMessage(botToken, chatId, '🎧 <b>Soporte Técnico</b>\n\nDescribe tu problema y te ayudaremos lo antes posible. (Próximamente)');
    } else {
      await sendMessage(botToken, chatId, 'Usa los botones del menú para navegar. 👇');
    }
    return;
  }

  // Default response for unknown commands
  await sendMessage(botToken, chatId, 'Escribe /start para comenzar.');
}

async function handleCallbackQuery(botToken: string, supabase: any, callbackQuery: any) {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;
  const username = callbackQuery.from?.username;
  const firstName = callbackQuery.from?.first_name;

  if (callbackData === 'verify_channel') {
    // For now, simulate verification as successful
    // In production, use getChatMember to check if user joined
    await answerCallbackQuery(botToken, callbackQuery.id, '✅ ¡Verificación exitosa!');

    // Update user state to menu
    await upsertUserState(supabase, chatId, username, firstName, 'menu');

    // Send menu with ReplyKeyboardMarkup (buttons in the input area)
    await sendMessage(botToken, chatId,
      '🎉 <b>¡Verificación exitosa!</b>\n\nBienvenido al menú principal. Usa los botones de abajo para navegar.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '🛍️ Tienda' }, { text: '👤 Cuenta' }],
            [{ text: '🎧 Soporte' }],
          ],
          resize_keyboard: true,
          is_persistent: true,
        },
      }
    );
    return;
  }

  await answerCallbackQuery(botToken, callbackQuery.id);
}
