const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELEGRAM_API = 'https://api.telegram.org';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN no está configurado' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { action, channel_username } = await req.json();

    if (action === 'getMe') {
      const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/getMe`);
      const data = await res.json();
      if (!data.ok) throw new Error(`getMe failed: ${JSON.stringify(data)}`);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'getChatMember') {
      if (!channel_username) {
        return new Response(JSON.stringify({ error: 'channel_username requerido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // First get bot info
      const meRes = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/getMe`);
      const meData = await meRes.json();
      if (!meData.ok) throw new Error(`getMe failed: ${JSON.stringify(meData)}`);
      const botId = meData.result.id;

      // Check if bot is member of the channel
      const chatId = channel_username.startsWith('@') ? channel_username : `@${channel_username}`;
      const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/getChatMember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, user_id: botId }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'setMyCommands') {
      const commands = [
        { command: 'start', description: 'Iniciar el bot' },
        { command: 'tienda', description: '🛍️ Ver la tienda' },
        { command: 'cuenta', description: '👤 Mi cuenta' },
        { command: 'soporte', description: '🎧 Soporte técnico' },
      ];
      const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Acción no válida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Telegram bot error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
