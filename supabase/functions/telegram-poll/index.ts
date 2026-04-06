import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

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

  const { data: state, error: stateErr } = await supabase
    .from('telegram_bot_state')
    .select('update_offset')
    .eq('id', 1)
    .single();

  if (stateErr) {
    return new Response(JSON.stringify({ error: stateErr.message }), { status: 500 });
  }

  let currentOffset = state.update_offset;

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

async function sendMainMenu(botToken: string, chatId: number, text: string) {
  await sendMessage(botToken, chatId, text, {
    reply_markup: {
      keyboard: [
        [{ text: '🛍️ Tienda' }, { text: '👤 Cuenta' }],
        [{ text: '🎧 Soporte' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
}

async function sendTiendaMenu(botToken: string, chatId: number, text: string) {
  await sendMessage(botToken, chatId, text, {
    reply_markup: {
      keyboard: [
        [{ text: '📦 Servicios' }, { text: '💰 Venta de moneda' }],
        [{ text: '🪙 Compra de moneda' }, { text: '🔙 Volver' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  });
}

// --- Handlers ---

async function handleMessage(botToken: string, supabase: any, message: any) {
  const chatId = message.chat.id;
  const text = message.text ?? '';
  const username = message.from?.username;
  const firstName = message.from?.first_name;

  if (text === '/start') {
    await upsertUserState(supabase, chatId, username, firstName, 'awaiting_join');

    const welcomeText =
      `👋 <b>¡Bienvenido${firstName ? ', ' + firstName : ''}!</b>\n\n` +
      `Para continuar, únete a nuestro canal:\n` +
      `👉 https://t.me/${REQUIRED_CHANNEL.replace('@', '')}\n\n` +
      `Después de unirte, presiona el botón <b>"✅ Verificar"</b> para confirmar.`;

    await sendMessage(botToken, chatId, welcomeText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Unirse al Canal', url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }],
          [{ text: '✅ Verificar', callback_data: 'verify_channel' }],
        ],
      },
    });
    return;
  }

  // Get user state
  const { data: userState } = await supabase
    .from('telegram_user_state')
    .select('step')
    .eq('chat_id', chatId)
    .single();

  const step = userState?.step;

  // --- Tienda configuration steps ---

  if (step === 'tienda_cup') {
    // User is sending their CUP card number
    await supabase.from('telegram_user_config').upsert({
      chat_id: chatId,
      cup_card: text.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' });

    await upsertUserState(supabase, chatId, username, firstName, 'tienda_confirm_number');
    await sendMessage(botToken, chatId, '✅ Tarjeta CUP guardada.\n\n📱 Ahora envía el <b>número a confirmar</b>:');
    return;
  }

  if (step === 'tienda_confirm_number') {
    await supabase.from('telegram_user_config').upsert({
      chat_id: chatId,
      confirm_number: text.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' });

    await upsertUserState(supabase, chatId, username, firstName, 'tienda_transfer');
    await sendMessage(botToken, chatId, '✅ Número a confirmar guardado.\n\n💳 Ahora envía tu <b>monedero Mi Transfer</b>:');
    return;
  }

  if (step === 'tienda_transfer') {
    await supabase.from('telegram_user_config').upsert({
      chat_id: chatId,
      mi_transfer: text.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' });

    await upsertUserState(supabase, chatId, username, firstName, 'tienda_menu');
    await sendTiendaMenu(botToken, chatId,
      '✅ Monedero Mi Transfer guardado.\n\n' +
      '🎉 <b>¡Configuración completada!</b>\n\n' +
      'Usa los botones del menú para navegar por la tienda. 👇'
    );
    return;
  }

  // --- Menu navigation ---

  if (step === 'menu') {
    if (text === '🛍️ Tienda') {
      // Check if user already has config
      const { data: config } = await supabase
        .from('telegram_user_config')
        .select('cup_card, confirm_number, mi_transfer')
        .eq('chat_id', chatId)
        .single();

      const isConfigured = config?.cup_card && config?.confirm_number && config?.mi_transfer;

      if (isConfigured) {
        // Already configured, go directly to tienda menu
        await upsertUserState(supabase, chatId, username, firstName, 'tienda_menu');
        await sendTiendaMenu(botToken, chatId, '🛍️ <b>Tienda</b>\n\nSelecciona una opción:');
      } else {
        // Start configuration flow
        await upsertUserState(supabase, chatId, username, firstName, 'tienda_cup');
        await sendMessage(botToken, chatId,
          '🛍️ <b>Configuración de Tienda</b>\n\n' +
          'Antes de empezar necesitas configurar tus datos de pago.\n\n' +
          '💳 Envía tu <b>número de tarjeta CUP</b>:',
          { reply_markup: { remove_keyboard: true } }
        );
      }
      return;
    }

    if (text === '👤 Cuenta') {
      await sendMessage(botToken, chatId, '👤 <b>Mi Cuenta</b>\n\nAquí podrás ver tu perfil, saldo y configuración. (Próximamente)');
      return;
    }

    if (text === '🎧 Soporte') {
      await sendMessage(botToken, chatId, '🎧 <b>Soporte Técnico</b>\n\nDescribe tu problema y te ayudaremos lo antes posible. (Próximamente)');
      return;
    }

    await sendMessage(botToken, chatId, 'Usa los botones del menú para navegar. 👇');
    return;
  }

  // --- Tienda sub-menu ---

  if (step === 'tienda_menu') {
    if (text === '📦 Servicios') {
      await sendMessage(botToken, chatId, '📦 <b>Servicios</b>\n\nPróximamente podrás acceder a nuestros servicios aquí.');
      return;
    }
    if (text === '💰 Venta de moneda') {
      await sendMessage(botToken, chatId, '💰 <b>Venta de moneda</b>\n\nPróximamente podrás vender moneda aquí.');
      return;
    }
    if (text === '🪙 Compra de moneda') {
      await sendMessage(botToken, chatId, '🪙 <b>Compra de moneda</b>\n\nPróximamente podrás comprar moneda aquí.');
      return;
    }
    if (text === '🔙 Volver') {
      await upsertUserState(supabase, chatId, username, firstName, 'menu');
      await sendMainMenu(botToken, chatId, '🏠 <b>Menú Principal</b>\n\nSelecciona una opción:');
      return;
    }

    await sendMessage(botToken, chatId, 'Usa los botones del menú para navegar. 👇');
    return;
  }

  // Default
  await sendMessage(botToken, chatId, 'Escribe /start para comenzar.');
}

async function handleCallbackQuery(botToken: string, supabase: any, callbackQuery: any) {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;
  const username = callbackQuery.from?.username;
  const firstName = callbackQuery.from?.first_name;

  if (callbackData === 'verify_channel') {
    await answerCallbackQuery(botToken, callbackQuery.id, '✅ ¡Verificación exitosa!');
    await upsertUserState(supabase, chatId, username, firstName, 'menu');

    await sendMainMenu(botToken, chatId,
      '🎉 <b>¡Verificación exitosa!</b>\n\nBienvenido al menú principal. Usa los botones de abajo para navegar.'
    );
    return;
  }

  await answerCallbackQuery(botToken, callbackQuery.id);
}
