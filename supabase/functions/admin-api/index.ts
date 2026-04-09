import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { action, token } = body;

    // Verify admin token
    const { data: tokenConfig } = await supabase
      .from('bot_config')
      .select('value')
      .eq('key', 'admin_token')
      .single();

    const validToken = tokenConfig?.value;
    if (!token || token !== validToken) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Actions ---

    if (action === 'get_stats') {
      const { count: userCount } = await supabase
        .from('telegram_user_state')
        .select('*', { count: 'exact', head: true });

      const { data: configs } = await supabase
        .from('telegram_user_config')
        .select('successful_deals');

      const totalDeals = (configs || []).reduce((sum: number, c: any) => sum + (c.successful_deals || 0), 0);

      return jsonResponse({ users: userCount || 0, deals: totalDeals });
    }

    if (action === 'get_config') {
      const { data } = await supabase.from('bot_config').select('*');
      const config: Record<string, any> = {};
      (data || []).forEach((row: any) => { config[row.key] = row.value; });
      return jsonResponse(config);
    }

    if (action === 'update_config') {
      const { key, value } = body;
      if (!key) return jsonResponse({ error: 'key required' }, 400);
      // Don't allow editing admin payment data or token from panel
      const protectedKeys = ['admin_cup_card', 'admin_confirm_number', 'admin_mi_transfer', 'admin_usdt_wallet', 'admin_token', 'admin_password'];
      if (protectedKeys.includes(key)) {
        return jsonResponse({ error: 'No se puede editar esta configuración' }, 403);
      }
      await supabase.from('bot_config').upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      return jsonResponse({ ok: true });
    }

    if (action === 'get_services') {
      const { data } = await supabase
        .from('bot_services')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      return jsonResponse(data || []);
    }

    if (action === 'update_service') {
      const { id, name, cup, emoji, category, duration_months, sort_order } = body;
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      await supabase.from('bot_services').update({
        name, cup, emoji, category, duration_months, sort_order,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      return jsonResponse({ ok: true });
    }

    if (action === 'add_service') {
      const { id, name, cup, emoji, category, duration_months, sort_order } = body;
      if (!id || !name || !cup) return jsonResponse({ error: 'id, name, cup required' }, 400);
      await supabase.from('bot_services').insert({
        id, name, cup: parseInt(cup),
        emoji: emoji || '📦',
        category: category || 'service',
        duration_months: duration_months || null,
        sort_order: sort_order || 0,
      });
      return jsonResponse({ ok: true });
    }

    if (action === 'delete_service') {
      const { id } = body;
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      await supabase.from('bot_services').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
