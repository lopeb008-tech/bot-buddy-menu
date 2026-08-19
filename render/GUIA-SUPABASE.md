# Guía: crear tu propio Supabase y migrar las tablas del bot

## 1. Crear el proyecto

1. Entra a https://supabase.com y crea una cuenta (gratis, con GitHub o correo).
2. Botón **New project**.
   - **Name:** `bot-telegram`
   - **Database Password:** pon una y **guárdala** (no se puede ver después).
   - **Region:** elige la más cercana (ej. `East US`).
3. Clic en **Create new project** y espera ~2 minutos.

## 2. Crear las tablas (1 solo paso)

1. En el menú lateral: **SQL Editor** → **New query**.
2. Abre el archivo `render/SETUP-SUPABASE.sql` de este proyecto, **copia todo** y pégalo.
3. Clic en **Run** (o Ctrl+Enter). Debe decir *Success*.

Para verlas: menú lateral → **Table Editor**. Deben aparecer:

| Tabla | Para qué sirve |
|---|---|
| `telegram_bot_state` | Guarda el `offset` de Telegram para no repetir mensajes |
| `telegram_user_state` | En qué paso del menú está cada usuario (y la lista de usuarios para el broadcast) |
| `telegram_user_config` | Perfil del usuario: tarjeta CUP, número a confirmar, Mi Transfer, negocios exitosos |
| `bot_config` | Tasas (`buy_rate`, `sell_rate`, `sm_buy_rate`), datos del admin, paquetes SM |
| `bot_services` | Servicios (Netflix, TV, TikTok…) y Telegram Premium |

## 3. Copiar las llaves

Menú lateral → **Project Settings** (engranaje) → **API**:

- **Project URL** → esto es tu `SUPABASE_URL` (ej. `https://abcdxyz.supabase.co`)
- **service_role** (en *Project API keys*, clic en *Reveal*) → esto es tu `SUPABASE_SERVICE_ROLE_KEY`

⚠️ La `service_role` es una llave maestra: no la publiques en GitHub, solo va en las variables de entorno de Render.

## 4. Conectarlo a Render

En Render → tu Web Service → **Environment** → añade:

| Variable | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | el token de @BotFather |
| `SUPABASE_URL` | el Project URL del paso 3 |
| `SUPABASE_SERVICE_ROLE_KEY` | la service_role del paso 3 |
| `WEBHOOK_URL` | `https://tu-servicio.onrender.com` (te la da Render tras el primer deploy) |
| `WEBHOOK_ONLY` | `true` |

Guarda y haz **Manual Deploy → Deploy latest commit**. El bot registra el webhook solo al arrancar.

## 5. Probar

1. En Telegram, escribe `/start` a tu bot.
2. Si respondes bien, entra a **Table Editor → telegram_user_state**: debe aparecer tu `chat_id`.
3. Desde la cuenta admin (`5127721601` o `5075629326`) entra a **👤 Cuenta → Panel de administrador** y cambia una tasa. Verifica en `bot_config` que el valor cambió.

## Notas

- Cambiar precios desde el panel de Telegram escribe directo en `bot_config` / `bot_services`; también los puedes editar a mano en el Table Editor.
- El plan gratis de Supabase pausa el proyecto tras ~1 semana sin uso. Como el bot consulta la base constantemente, no se pausará.
- Si algún día quieres empezar de cero, vuelve a correr el SQL: usa `IF NOT EXISTS` y `ON CONFLICT`, así que no borra nada.
