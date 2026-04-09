import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

const REQUIRED_CHANNEL_LINK = 'https://t.me/+KsLnyjMV579jM2Ix';

// Steps that can be cancelled back to tienda menu
const CANCELLABLE_STEPS = [
  'tienda_cup', 'tienda_confirm_number', 'tienda_transfer',
  'compra_amount', 'compra_waiting_screenshot',
  'venta_amount', 'venta_payment_method', 'venta_waiting_screenshot',
  'sm_waiting_screenshot', 'svc_waiting_screenshot',
];

// Admin steps
const ADMIN_STEPS = [
  'admin_edit_buy_rate', 'admin_edit_sell_rate',
  'admin_add_svc_id', 'admin_add_svc_name', 'admin_add_svc_cup', 'admin_add_svc_emoji',
];

const ADMIN_CHAT_ID = 5127721601;
const ADMIN_IDS = [5075629326, 5127721601];

Deno.serve(async () => {
  const startTime = Date.now();

  const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }), { status: 500 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Load config from DB
  const { data: configRows } = await supabase.from('bot_config').select('*');
  const botConfig: Record<string, any> = {};
  (configRows || []).forEach((r: any) => { botConfig[r.key] = r.value; });

  const ADMIN_CUP_CARD = botConfig.admin_cup_card || '9204-0699-9692-9675';
  const ADMIN_CONFIRM_NUMBER = botConfig.admin_confirm_number || '58613666';
  const ADMIN_MI_TRANSFER = botConfig.admin_mi_transfer || '58613666';
  const ADMIN_USDT_WALLET = botConfig.admin_usdt_wallet || '0xD64Ea37111d1926C1015091a6D241996946A29B0';
  const BUY_RATE = botConfig.buy_rate || 600;
  const SELL_RATE = botConfig.sell_rate || 640;
  const SM_PACKAGES = botConfig.sm_packages || [
    { sm: 120, cup: 400 },
    { sm: 240, cup: 1000 },
    { sm: 370, cup: 1300 },
  ];

  // Load services from DB
  const { data: svcRows } = await supabase.from('bot_services').select('*').eq('active', true).order('sort_order');
  const SERVICES = (svcRows || []).filter((s: any) => s.category === 'service');
  const TELEGRAM_PREMIUM = (svcRows || []).filter((s: any) => s.category === 'telegram_premium');

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
          await handleMessage(BOT_TOKEN, supabase, update.message, {
            ADMIN_CUP_CARD, ADMIN_CONFIRM_NUMBER, ADMIN_MI_TRANSFER, ADMIN_USDT_WALLET,
            BUY_RATE, SELL_RATE, SM_PACKAGES, SERVICES, TELEGRAM_PREMIUM,
          });
        } else if (update.callback_query) {
          await handleCallbackQuery(BOT_TOKEN, supabase, update.callback_query, {
            ADMIN_CUP_CARD, ADMIN_CONFIRM_NUMBER, ADMIN_MI_TRANSFER, ADMIN_USDT_WALLET,
            BUY_RATE, SELL_RATE, SM_PACKAGES, SERVICES, TELEGRAM_PREMIUM,
          });
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

async function forwardPhotoToAdmin(botToken: string, fromChatId: number, messageId: number, caption: string) {
  // Send info message to admin first
  await sendMessage(botToken, ADMIN_CHAT_ID, caption);
  // Forward the actual photo
  await fetch(`${TELEGRAM_API}/bot${botToken}/forwardMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: ADMIN_CHAT_ID,
      from_chat_id: fromChatId,
      message_id: messageId,
    }),
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

async function handleMessage(botToken: string, supabase: any, message: any, cfg: any) {
  const chatId = message.chat.id;
  const text = message.text ?? '';
  const username = message.from?.username;
  const firstName = message.from?.first_name;

  const { ADMIN_CUP_CARD, ADMIN_CONFIRM_NUMBER, ADMIN_MI_TRANSFER, ADMIN_USDT_WALLET,
    BUY_RATE, SELL_RATE, SM_PACKAGES, SERVICES, TELEGRAM_PREMIUM } = cfg;

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

  // --- Global cancel ---
  if (text === '❌ Cancelar' && CANCELLABLE_STEPS.includes(step)) {
    await upsertUserState(supabase, chatId, username, firstName, 'tienda_menu');
    await sendTiendaMenu(botToken, chatId, '🚫 <b>Solicitud cancelada.</b>\n\nSelecciona una opción:');
    return;
  }

  // --- Admin text input handlers ---
  if (step?.startsWith('admin_edit_') || step?.startsWith('admin_add_svc_')) {
    if (!ADMIN_IDS.includes(chatId)) {
      await upsertUserState(supabase, chatId, username, firstName, 'menu');
      return;
    }
    await handleAdminTextInput(botToken, supabase, chatId, username, firstName, step, text);
    return;
  }

  // --- Photo handler for screenshot steps ---
  if (message.photo && (step === 'sm_waiting_screenshot' || step === 'compra_waiting_screenshot' || step === 'venta_waiting_screenshot' || step === 'svc_waiting_screenshot')) {
    // Forward to admin
    const userLabel = username ? `@${username}` : firstName || `Chat ${chatId}`;
    await forwardPhotoToAdmin(botToken, chatId, message.message_id,
      `📸 <b>Nueva captura de pago</b>\n\nDe: ${userLabel}\nPaso: ${step}\nChat ID: ${chatId}`
    );

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
    await sendMessage(botToken, chatId,
      '✅ Tarjeta CUP guardada.\n\n📱 Ahora envía el <b>número a confirmar</b>:',
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } });
    return;
  }

  if (step === 'tienda_confirm_number') {
    await supabase.from('telegram_user_config').upsert({
      chat_id: chatId,
      confirm_number: text.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' });

    await upsertUserState(supabase, chatId, username, firstName, 'tienda_transfer');
    await sendMessage(botToken, chatId,
      '✅ Número a confirmar guardado.\n\n💳 Ahora envía tu <b>monedero Mi Transfer</b>:',
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } });
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
      `Debes pagar: <b>${parseFloat(amount || '0') * BUY_RATE} CUP</b>\n\n` +
      `📤 Envía los USDT a la siguiente wallet:\n` +
      `<code>${ADMIN_USDT_WALLET}</code>\n\n` +
      `📸 Después de enviar, manda una <b>captura de pantalla</b> de la transferencia.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }],
          ],
        },
      }
    );
    return;
  }

  // --- Venta de moneda: user sends USDT amount ---
  if (step === 'venta_amount') {
    const usdtAmount = parseFloat(text.trim() || '0');
    const cupAmount = usdtAmount * SELL_RATE;
    await upsertUserState(supabase, chatId, username, firstName, 'venta_payment_method');
    await sendMessage(botToken, chatId,
      `💰 <b>Venta de Moneda</b>\n\n` +
      `Monto: <b>${usdtAmount} USDT</b> = <b>${cupAmount} CUP</b>\n` +
      `(Tasa: 1 USDT = ${SELL_RATE} CUP)\n\n` +
      `Debes pagar <b>${cupAmount} CUP</b> al método que elijas.\n\n` +
      `¿Cómo deseas pagar?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Tarjeta CUP', callback_data: 'venta_pay_card' }],
            [{ text: '📲 Bolsa Mi Transfer', callback_data: 'venta_pay_transfer' }],
            [{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }],
          ],
        },
      }
    );
    return;
  }

  // --- Waiting for screenshots (non-photo messages) ---
  if (step === 'venta_waiting_screenshot' || step === 'sm_waiting_screenshot' || step === 'compra_waiting_screenshot' || step === 'svc_waiting_screenshot') {
    if (!message.photo) {
      await sendMessage(botToken, chatId,
        '📸 Por favor envía una <b>captura de pantalla</b> de la transferencia.',
        { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } });
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
          { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
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

      const isAdmin = ADMIN_IDS.includes(chatId);

      if (isAdmin) {
        // Generate admin token
        const token = crypto.randomUUID();
        await supabase.from('bot_config').upsert({
          key: 'admin_token',
          value: token,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

        await sendMessage(botToken, chatId,
          `👤 <b>Mi Cuenta</b>\n\n` +
          `💳 <b>Tarjeta CUP:</b> ${cup}\n` +
          `📱 <b>Número a confirmar:</b> ${confirm}\n` +
          `🪙 <b>Monedero Mi Transfer:</b> ${transfer}\n\n` +
          `✅ <b>Negocios exitosos:</b> ${deals}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '⚙️ Panel de Administrador', callback_data: 'open_admin_panel' }],
              ],
            },
          }
        );
      } else {
        await sendMessage(botToken, chatId,
          `👤 <b>Mi Cuenta</b>\n\n` +
          `💳 <b>Tarjeta CUP:</b> ${cup}\n` +
          `📱 <b>Número a confirmar:</b> ${confirm}\n` +
          `🪙 <b>Monedero Mi Transfer:</b> ${transfer}\n\n` +
          `✅ <b>Negocios exitosos:</b> ${deals}`
        );
      }
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
      const svcList = SERVICES.map((s: any) => `${s.emoji} ${s.name}: <b>${s.cup} CUP</b>`).join('\n');
      const tgpList = TELEGRAM_PREMIUM.map((t: any) => `   • ${t.name}: <b>${t.cup} CUP</b>`).join('\n');
      await sendMessage(botToken, chatId,
        `⚠️ <b>Servicios Tecnológicos</b>\n\n${svcList}\n\n✨ <b>Telegram Premium:</b>\n${tgpList}\n\nElige un servicio:`,
        {
          reply_markup: {
            inline_keyboard: [
              ...SERVICES.map((s: any) => [{ text: `${s.emoji} ${s.name} - ${s.cup} CUP`, callback_data: `svc_${s.id}` }]),
              [{ text: '✨ Telegram Premium', callback_data: 'svc_tgp_menu' }],
              [{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }],
            ],
          },
        }
      );
      return;
    }

    if (text === '💵 Venta de SM') {
      const packagesText = SM_PACKAGES.map((p: any, i: number) => `${i + 1}. <b>${p.sm} SM</b> x <b>${p.cup} CUP</b>`).join('\n');
      await sendMessage(botToken, chatId,
        `💵 <b>Venta de Saldo Móvil</b>\n\n` +
        `Elige un paquete:\n\n${packagesText}`,
        {
          reply_markup: {
            inline_keyboard: [
              ...SM_PACKAGES.map((p: any) => [
                { text: `📱 ${p.sm} SM - ${p.cup} CUP`, callback_data: `sm_pkg_${p.sm}` },
              ]),
              [{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }],
            ],
          },
        }
      );
      return;
    }

    if (text === '💰 Venta de moneda') {
      await sendMessage(botToken, chatId,
        `💰 <b>Venta de Moneda</b>\n\n` +
        `El administrador vende:\n` +
        `<b>1 USDT = ${SELL_RATE} CUP</b>\n\n` +
        `📝 Envía la cantidad de <b>USDT</b> que deseas comprar:`,
        { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
      );
      await upsertUserState(supabase, chatId, username, firstName, 'venta_amount');
      return;
    }

    if (text === '🪙 Compra de moneda') {
      await sendMessage(botToken, chatId,
        `🪙 <b>Compra de Moneda</b>\n\n` +
        `Compramos:\n` +
        `<b>1 USDT = ${BUY_RATE} CUP</b>\n\n` +
        `📝 Envía la cantidad de <b>USDT</b> que deseas vender:`,
        { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
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

async function handleCallbackQuery(botToken: string, supabase: any, callbackQuery: any, cfg: any) {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;
  const username = callbackQuery.from?.username;
  const firstName = callbackQuery.from?.first_name;

  const { ADMIN_CUP_CARD, ADMIN_CONFIRM_NUMBER, ADMIN_MI_TRANSFER,
    SM_PACKAGES, SERVICES, TELEGRAM_PREMIUM } = cfg;

  // --- Cancel to tienda menu ---
  if (callbackData === 'cancel_to_tienda') {
    await answerCallbackQuery(botToken, callbackQuery.id, '🚫 Cancelado');
    await upsertUserState(supabase, chatId, username, firstName, 'tienda_menu');
    await sendTiendaMenu(botToken, chatId, '🚫 <b>Solicitud cancelada.</b>\n\nSelecciona una opción:');
    return;
  }

  // --- Verify channel ---
  if (callbackData === 'verify_channel') {
    await answerCallbackQuery(botToken, callbackQuery.id, '✅ ¡Verificación exitosa!');
    await upsertUserState(supabase, chatId, username, firstName, 'menu');
    await sendMainMenu(botToken, chatId,
      '🎉 <b>¡Verificación exitosa!</b>\n\nBienvenido al menú principal. Usa los botones de abajo para navegar.'
    );
    return;
  }

  // --- Admin panel ---
  if (callbackData === 'open_admin_panel') {
    if (!ADMIN_IDS.includes(chatId)) {
      await answerCallbackQuery(botToken, callbackQuery.id, '❌ No autorizado');
      return;
    }
    // Get the stored token
    const { data: tokenRow } = await supabase
      .from('bot_config')
      .select('value')
      .eq('key', 'admin_token')
      .single();
    
    const token = tokenRow?.value;
    // Use the published/preview URL
    const adminUrl = `https://id-preview--6cecd0e5-892d-48ed-8a9b-98d61ac2a96d.lovable.app/admin?token=${token}`;
    
    await answerCallbackQuery(botToken, callbackQuery.id);
    await sendMessage(botToken, chatId,
      `⚙️ <b>Panel de Administrador</b>\n\nHaz clic en el botón para acceder:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Abrir Panel Admin', url: adminUrl }],
          ],
        },
      }
    );
    return;
  }

  // --- SM package selection ---
  if (callbackData?.startsWith('sm_pkg_')) {
    const smAmount = parseInt(callbackData.replace('sm_pkg_', ''));
    const pkg = SM_PACKAGES.find((p: any) => p.sm === smAmount);
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
            [{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }],
          ],
        },
      }
    );
    return;
  }

  // --- SM payment by card ---
  if (callbackData?.startsWith('sm_pay_card_')) {
    const smAmount = parseInt(callbackData.replace('sm_pay_card_', ''));
    const pkg = SM_PACKAGES.find((p: any) => p.sm === smAmount);
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'sm_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `💳 <b>Pago por Tarjeta CUP</b>\n\n` +
      `Paquete: <b>${pkg?.sm} SM - ${pkg?.cup} CUP</b>\n\n` +
      `Envía <b>${pkg?.cup} CUP</b> a la tarjeta:\n` +
      `<code>${ADMIN_CUP_CARD}</code>\n\n` +
      `⚠️ <b>Por favor confirma al número: ${ADMIN_CONFIRM_NUMBER}</b>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
    );
    return;
  }

  // --- SM payment by Mi Transfer ---
  if (callbackData?.startsWith('sm_pay_transfer_')) {
    const smAmount = parseInt(callbackData.replace('sm_pay_transfer_', ''));
    const pkg = SM_PACKAGES.find((p: any) => p.sm === smAmount);
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'sm_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `📲 <b>Pago por Bolsa Mi Transfer</b>\n\n` +
      `Paquete: <b>${pkg?.sm} SM - ${pkg?.cup} CUP</b>\n\n` +
      `Envía <b>${pkg?.cup} CUP</b> a Mi Transfer:\n` +
      `<code>${ADMIN_MI_TRANSFER}</code>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
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
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
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
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
    );
    return;
  }

  // --- Service selection ---
  if (callbackData?.startsWith('svc_') && !callbackData.startsWith('svc_tgp') && !callbackData.startsWith('svc_pay_')) {
    const svcId = callbackData.replace('svc_', '');
    const svc = SERVICES.find((s: any) => s.id === svcId);
    if (!svc) { await answerCallbackQuery(botToken, callbackQuery.id, '❌ Servicio no encontrado'); return; }
    await answerCallbackQuery(botToken, callbackQuery.id, `${svc.emoji} ${svc.name}`);
    await sendMessage(botToken, chatId,
      `${svc.emoji} <b>${svc.name}</b>\n\nPrecio: <b>${svc.cup} CUP</b>\n\n¿Cómo deseas pagar?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Tarjeta CUP', callback_data: `svc_pay_card_${svc.id}` }],
            [{ text: '📲 Bolsa Mi Transfer', callback_data: `svc_pay_transfer_${svc.id}` }],
            [{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }],
          ],
        },
      }
    );
    return;
  }

  // --- Telegram Premium menu ---
  if (callbackData === 'svc_tgp_menu') {
    await answerCallbackQuery(botToken, callbackQuery.id);
    await sendMessage(botToken, chatId,
      `✨ <b>Telegram Premium</b>\n\nElige la duración:`,
      {
        reply_markup: {
          inline_keyboard: [
            ...TELEGRAM_PREMIUM.map((t: any) => [{ text: `${t.name} - ${t.cup} CUP`, callback_data: `svc_tgp_${t.id}` }]),
            [{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }],
          ],
        },
      }
    );
    return;
  }

  // --- Telegram Premium duration selected ---
  if (callbackData?.startsWith('svc_tgp_') && !callbackData.startsWith('svc_tgp_menu') && !callbackData.startsWith('svc_tgp_pay_')) {
    const tgpId = callbackData.replace('svc_tgp_', '');
    const pkg = TELEGRAM_PREMIUM.find((t: any) => t.id === tgpId);
    if (!pkg) { await answerCallbackQuery(botToken, callbackQuery.id, '❌ No encontrado'); return; }
    await answerCallbackQuery(botToken, callbackQuery.id, `✨ ${pkg.name}`);
    await sendMessage(botToken, chatId,
      `✨ <b>Telegram Premium - ${pkg.name}</b>\n\nPrecio: <b>${pkg.cup} CUP</b>\n\n¿Cómo deseas pagar?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Tarjeta CUP', callback_data: `svc_tgp_pay_card_${pkg.id}` }],
            [{ text: '📲 Bolsa Mi Transfer', callback_data: `svc_tgp_pay_transfer_${pkg.id}` }],
            [{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }],
          ],
        },
      }
    );
    return;
  }

  // --- Service payment by card ---
  if (callbackData?.startsWith('svc_pay_card_')) {
    const svcId = callbackData.replace('svc_pay_card_', '');
    const svc = SERVICES.find((s: any) => s.id === svcId);
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'svc_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `💳 <b>Pago por Tarjeta CUP</b>\n\n` +
      `Servicio: <b>${svc?.name} - ${svc?.cup} CUP</b>\n\n` +
      `Envía <b>${svc?.cup} CUP</b> a la tarjeta:\n` +
      `<code>${ADMIN_CUP_CARD}</code>\n\n` +
      `⚠️ <b>Por favor confirma al número: ${ADMIN_CONFIRM_NUMBER}</b>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
    );
    return;
  }

  // --- Service payment by Mi Transfer ---
  if (callbackData?.startsWith('svc_pay_transfer_')) {
    const svcId = callbackData.replace('svc_pay_transfer_', '');
    const svc = SERVICES.find((s: any) => s.id === svcId);
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'svc_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `📲 <b>Pago por Bolsa Mi Transfer</b>\n\n` +
      `Servicio: <b>${svc?.name} - ${svc?.cup} CUP</b>\n\n` +
      `Envía <b>${svc?.cup} CUP</b> a Mi Transfer:\n` +
      `<code>${ADMIN_MI_TRANSFER}</code>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
    );
    return;
  }

  // --- Telegram Premium payment by card ---
  if (callbackData?.startsWith('svc_tgp_pay_card_')) {
    const tgpId = callbackData.replace('svc_tgp_pay_card_', '');
    const pkg = TELEGRAM_PREMIUM.find((t: any) => t.id === tgpId);
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'svc_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `💳 <b>Pago por Tarjeta CUP</b>\n\n` +
      `Servicio: <b>Telegram Premium ${pkg?.name} - ${pkg?.cup} CUP</b>\n\n` +
      `Envía <b>${pkg?.cup} CUP</b> a la tarjeta:\n` +
      `<code>${ADMIN_CUP_CARD}</code>\n\n` +
      `⚠️ <b>Por favor confirma al número: ${ADMIN_CONFIRM_NUMBER}</b>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
    );
    return;
  }

  // --- Telegram Premium payment by Mi Transfer ---
  if (callbackData?.startsWith('svc_tgp_pay_transfer_')) {
    const tgpId = callbackData.replace('svc_tgp_pay_transfer_', '');
    const pkg = TELEGRAM_PREMIUM.find((t: any) => t.id === tgpId);
    await answerCallbackQuery(botToken, callbackQuery.id);
    await upsertUserState(supabase, chatId, username, firstName, 'svc_waiting_screenshot');
    await sendMessage(botToken, chatId,
      `📲 <b>Pago por Bolsa Mi Transfer</b>\n\n` +
      `Servicio: <b>Telegram Premium ${pkg?.name} - ${pkg?.cup} CUP</b>\n\n` +
      `Envía <b>${pkg?.cup} CUP</b> a Mi Transfer:\n` +
      `<code>${ADMIN_MI_TRANSFER}</code>\n\n` +
      `📸 Después de pagar, envía una <b>captura de pantalla</b> de la transferencia.`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'cancel_to_tienda' }]] } }
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
