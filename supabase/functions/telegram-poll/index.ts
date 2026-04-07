import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

const REQUIRED_CHANNEL_LINK = 'https://t.me/+KsLnyjMV579jM2Ix';

// Payment config
const ADMIN_CUP_CARD = '9204-0699-9692-9675';
const ADMIN_CONFIRM_NUMBER = '58613666';
const ADMIN_MI_TRANSFER = '58613666';
const ADMIN_USDT_WALLET = '0xD64Ea37111d1926C1015091a6D241996946A29B0';

const SM_PACKAGES = [
  { sm: 120, cup: 400 },
  { sm: 240, cup: 1000 },
  { sm: 370, cup: 1300 },
];

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
        [{ text: '📦 Servicios' }, { text: '💵 Venta de SM' }],
        [{ text: '💰 Venta de moneda' }, { text: '🪙 Compra de moneda' }],
        [{ text: '🔙 Volver' }],
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
      `Para continuar, únete a nuestro grupo:\n` +
      `👉 ${REQUIRED_CHANNEL_LINK}\n\n` +
      `Después de unirte, presiona el botón <b>"✅ Verificar"</b> para confirmar.`;

    await sendMessage(botToken, chatId, welcomeText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Unirse al Grupo', url: REQUIRED_CHANNEL_LINK }],
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

  // --- Photo handler for screenshot steps ---
  if (message.photo && (step === 'sm_waiting_screenshot' || step === 'compra_waiting_screenshot' || step === 'venta_waiting_screenshot')) {
    await upsertUserState(supabase, chatId, username, firstName, 'tienda_menu');
    await sendTiendaMenu(botToken, chatId,
      '✅ <b>¡Captura recibida!</b>\n\n' +
      'Tu solicitud ha sido enviada al administrador para verificación. Te notificaremos cuando sea procesada.\n\n' +
      'Selecciona una opción:'
    );
    return;
  }

  // --- Tienda configuration steps ---

  if (step === 'tienda_cup') {
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

  // --- Compra de moneda: user sends amount ---
  if (step === 'compra_amount') {
    const amount = text.trim();
    await upsertUserState(supabase, chatId, username, firstName, 'compra_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `🪙 <b>Compra de Moneda</b>\n\n` +
      `Monto a comprar: <b>${amount} USDT</b>\n` +
      `Debes pagar: <b>${parseFloat(amount || '0') * 600} CUP</b>\n\n` +
      `📤 Envía los USDT a la siguiente wallet:\n` +
      `<code>${ADMIN_USDT_WALLET}</code>\n\n` +
      `📸 Después de enviar, manda una <b>captura de pantalla</b> de la transferencia.`
    );
    return;
  }

  // --- Venta de moneda: user sends CUP amount ---
  if (step === 'venta_amount') {
    const usdtAmount = parseFloat(text.trim() || '0');
    const cupAmount = usdtAmount * 640;
    await upsertUserState(supabase, chatId, username, firstName, 'venta_payment_method');
    await sendMessage(botToken, chatId,
      `💰 <b>Venta de Moneda</b>\n\n` +
      `Monto: <b>${usdtAmount} USDT</b> = <b>${cupAmount} CUP</b>\n` +
      `(Tasa: 1 USDT = 640 CUP)\n\n` +
      `Debes pagar <b>${cupAmount} CUP</b> al método que elijas.\n\n` +
      `¿Cómo deseas pagar?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Tarjeta CUP', callback_data: 'venta_pay_card' }],
            [{ text: '📲 Bolsa Mi Transfer', callback_data: 'venta_pay_transfer' }],
          ],
        },
      }
    );
    return;
  }

  // --- Venta de moneda: waiting for screenshot ---
  if (step === 'venta_waiting_screenshot') {
    // If they send text instead of photo
    if (!message.photo) {
      await sendMessage(botToken, chatId, '📸 Por favor envía una <b>captura de pantalla</b> de la transferencia.');
      return;
    }
  }

  // --- SM: waiting for screenshot ---
  if (step === 'sm_waiting_screenshot') {
    if (!message.photo) {
      await sendMessage(botToken, chatId, '📸 Por favor envía una <b>captura de pantalla</b> de la transferencia.');
      return;
    }
  }

  // --- Compra: waiting for screenshot ---
  if (step === 'compra_waiting_screenshot') {
    if (!message.photo) {
      await sendMessage(botToken, chatId, '📸 Por favor envía una <b>captura de pantalla</b> de la transferencia.');
      return;
    }
  }

  // --- Menu navigation ---

  if (step === 'menu') {
    if (text === '🛍️ Tienda') {
      const { data: config } = await supabase
        .from('telegram_user_config')
        .select('cup_card, confirm_number, mi_transfer')
        .eq('chat_id', chatId)
        .single();

      const isConfigured = config?.cup_card && config?.confirm_number && config?.mi_transfer;

      if (isConfigured) {
        await upsertUserState(supabase, chatId, username, firstName, 'tienda_menu');
        await sendTiendaMenu(botToken, chatId, '🛍️ <b>Tienda</b>\n\nSelecciona una opción:');
      } else {
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
      const { data: config } = await supabase
        .from('telegram_user_config')
        .select('cup_card, confirm_number, mi_transfer, successful_deals')
        .eq('chat_id', chatId)
        .single();

      const cup = config?.cup_card ?? '❌ No configurada';
      const confirm = config?.confirm_number ?? '❌ No configurado';
      const transfer = config?.mi_transfer ?? '❌ No configurado';
      const deals = config?.successful_deals ?? 0;

      await sendMessage(botToken, chatId,
        `👤 <b>Mi Cuenta</b>\n\n` +
        `💳 <b>Tarjeta CUP:</b> ${cup}\n` +
        `📱 <b>Número a confirmar:</b> ${confirm}\n` +
        `🪙 <b>Monedero Mi Transfer:</b> ${transfer}\n\n` +
        `✅ <b>Negocios exitosos:</b> ${deals}`
      );
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

    if (text === '💵 Venta de SM') {
      const packagesText = SM_PACKAGES.map((p, i) => `${i + 1}. <b>${p.sm} SM</b> x <b>${p.cup} CUP</b>`).join('\n');
      await sendMessage(botToken, chatId,
        `💵 <b>Venta de Saldo Móvil</b>\n\n` +
        `Elige un paquete:\n\n${packagesText}`,
        {
          reply_markup: {
            inline_keyboard: SM_PACKAGES.map((p) => [
              { text: `📱 ${p.sm} SM - ${p.cup} CUP`, callback_data: `sm_pkg_${p.sm}` },
            ]),
          },
        }
      );
      return;
    }

    if (text === '💰 Venta de moneda') {
      await sendMessage(botToken, chatId,
        `💰 <b>Venta de Moneda</b>\n\n` +
        `El administrador vende:\n` +
        `<b>1 USDT = 640 CUP</b>\n\n` +
        `📝 Envía la cantidad de <b>USDT</b> que deseas comprar:`,
        { reply_markup: { remove_keyboard: true } }
      );
      await upsertUserState(supabase, chatId, username, firstName, 'venta_amount');
      return;
    }

    if (text === '🪙 Compra de moneda') {
      await sendMessage(botToken, chatId,
        `🪙 <b>Compra de Moneda</b>\n\n` +
        `Compramos:\n` +
        `<b>1 USDT = 600 CUP</b>\n\n` +
        `📝 Envía la cantidad de <b>USDT</b> que deseas vender:`,
        { reply_markup: { remove_keyboard: true } }
      );
      await upsertUserState(supabase, chatId, username, firstName, 'compra_amount');
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

  // --- Verify channel ---
  if (callbackData === 'verify_channel') {
    await answerCallbackQuery(botToken, callbackQuery.id, '✅ ¡Verificación exitosa!');
    await upsertUserState(supabase, chatId, username, firstName, 'menu');
    await sendMainMenu(botToken, chatId,
      '🎉 <b>¡Verificación exitosa!</b>\n\nBienvenido al menú principal. Usa los botones de abajo para navegar.'
    );
    return;
  }

  // --- SM package selection ---
  if (callbackData?.startsWith('sm_pkg_')) {
    const smAmount = parseInt(callbackData.replace('sm_pkg_', ''));
    const pkg = SM_PACKAGES.find(p => p.sm === smAmount);
    if (!pkg) {
      await answerCallbackQuery(botToken, callbackQuery.id, '❌ Paquete no encontrado');
      return;
    }

    await answerCallbackQuery(botToken, callbackQuery.id, `📱 ${pkg.sm} SM seleccionado`);
    await sendMessage(botToken, chatId,
      `📱 <b>Paquete seleccionado:</b> ${pkg.sm} SM x ${pkg.cup} CUP\n\n` +
      `¿Cómo deseas pagar?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Tarjeta CUP', callback_data: `sm_pay_card_${pkg.sm}` }],
            [{ text: '📲 Bolsa Mi Transfer', callback_data: `sm_pay_transfer_${pkg.sm}` }],
          ],
        },
      }
    );
    return;
  }

  // --- SM payment by card ---
  if (callbackData?.startsWith('sm_pay_card_')) {
    const smAmount = parseInt(callbackData.replace('sm_pay_card_', ''));
    const pkg = SM_PACKAGES.find(p => p.sm === smAmount);
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'sm_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `💳 <b>Pago por Tarjeta CUP</b>\n\n` +
      `Paquete: <b>${pkg?.sm} SM - ${pkg?.cup} CUP</b>\n\n` +
      `Envía <b>${pkg?.cup} CUP</b> a la tarjeta:\n` +
      `<code>${ADMIN_CUP_CARD}</code>\n\n` +
      `⚠️ <b>Por favor confirma al número: ${ADMIN_CONFIRM_NUMBER}</b>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { remove_keyboard: true } }
    );
    return;
  }

  // --- SM payment by Mi Transfer ---
  if (callbackData?.startsWith('sm_pay_transfer_')) {
    const smAmount = parseInt(callbackData.replace('sm_pay_transfer_', ''));
    const pkg = SM_PACKAGES.find(p => p.sm === smAmount);
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'sm_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `📲 <b>Pago por Bolsa Mi Transfer</b>\n\n` +
      `Paquete: <b>${pkg?.sm} SM - ${pkg?.cup} CUP</b>\n\n` +
      `Envía <b>${pkg?.cup} CUP</b> a Mi Transfer:\n` +
      `<code>${ADMIN_MI_TRANSFER}</code>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { remove_keyboard: true } }
    );
    return;
  }

  // --- Venta de moneda: payment method ---
  if (callbackData === 'venta_pay_card') {
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'venta_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `💳 <b>Pago por Tarjeta CUP</b>\n\n` +
      `Envía los CUP a la tarjeta:\n` +
      `<code>${ADMIN_CUP_CARD}</code>\n\n` +
      `⚠️ <b>Por favor confirma al número: ${ADMIN_CONFIRM_NUMBER}</b>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`
    );
    return;
  }

  if (callbackData === 'venta_pay_transfer') {
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'venta_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `📲 <b>Pago por Bolsa Mi Transfer</b>\n\n` +
      `Envía los CUP a Mi Transfer:\n` +
      `<code>${ADMIN_MI_TRANSFER}</code>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`
    );
    return;
  }

  // --- Pago realizado (generic) ---
  if (callbackData === 'payment_done') {
    await answerCallbackQuery(botToken, callbackQuery.id, '📸 Envía la captura');
    await sendMessage(botToken, chatId, '📸 Por favor envía una <b>captura de pantalla</b> de la transferencia.');
    return;
  }

  await answerCallbackQuery(botToken, callbackQuery.id);
}
