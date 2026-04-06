import { useState, useRef, useEffect } from "react";
import { Bot, Send, CheckCircle2, Hash, Loader2 } from "lucide-react";
import ChatBubble from "@/components/ChatBubble";
import MenuButtons from "@/components/MenuButtons";
import { supabase } from "@/integrations/supabase/client";

type Step = "start" | "channel-input" | "joining" | "verify" | "verifying" | "menu";

interface Message {
  text: string;
  isBot: boolean;
}

const Index = () => {
  const [step, setStep] = useState<Step>("start");
  const [channelInput, setChannelInput] = useState("");
  const [channelName, setChannelName] = useState("");
  const [botName, setBotName] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { text: "¡Hola! 👋 Soy tu panel de configuración del bot de Telegram. Presiona Start para comenzar.", isBot: true },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, step]);

  const addMessage = (text: string, isBot: boolean) => {
    setMessages((prev) => [...prev, { text, isBot }]);
  };

  const callTelegramBot = async (action: string, extra: Record<string, string> = {}) => {
    const { data, error } = await supabase.functions.invoke("telegram-bot", {
      body: { action, ...extra },
    });
    if (error) throw new Error(error.message);
    return data;
  };

  const handleStart = async () => {
    addMessage("▶️ Start", false);
    setLoading(true);
    try {
      const data = await callTelegramBot("getMe");
      if (data.ok) {
        const bot = data.result;
        setBotName(bot.first_name || bot.username);
        addMessage(`✅ Bot conectado: @${bot.username} (${bot.first_name})`, true);
        addMessage("Ahora ingresa el nombre de usuario del canal al que quieres unir el bot (ej: mi_canal).", true);
        setStep("channel-input");
      } else {
        addMessage(`❌ Error: ${data.description || "No se pudo conectar al bot. Verifica el token."}`, true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      addMessage(`❌ Error de conexión: ${msg}`, true);
    } finally {
      setLoading(false);
    }
  };

  const handleChannelSubmit = () => {
    if (!channelInput.trim()) return;
    const name = channelInput.trim().replace(/^@/, "");
    setChannelName(name);
    addMessage(`Canal: @${name}`, false);
    addMessage(`📢 Para unir el bot al canal @${name}, agrégalo como administrador desde Telegram. Luego presiona "Verificar" para confirmar.`, true);
    setStep("verify");
    setChannelInput("");
  };

  const handleVerify = async () => {
    addMessage("🔍 Verificar conexión al canal", false);
    setStep("verifying");
    setLoading(true);
    try {
      const data = await callTelegramBot("getChatMember", { channel_username: channelName });
      if (data.ok) {
        const status = data.result.status;
        if (["administrator", "creator", "member"].includes(status)) {
          addMessage(`✅ ¡El bot es ${status === "administrator" ? "administrador" : "miembro"} del canal @${channelName}!`, true);

          // Set bot commands
          const cmdData = await callTelegramBot("setMyCommands");
          if (cmdData.ok) {
            addMessage("✅ Comandos del menú configurados (/start, /tienda, /cuenta, /soporte).", true);
          }

          addMessage("🎉 ¡Todo listo! Aquí tienes el menú principal.", true);
          setStep("menu");
        } else {
          addMessage(`⚠️ El bot está en el canal pero con estado "${status}". Asegúrate de que sea administrador.`, true);
          setStep("verify");
        }
      } else {
        addMessage(`❌ ${data.description || "El bot no está en ese canal. Agrégalo como administrador primero."}`, true);
        setStep("verify");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      addMessage(`❌ Error: ${msg}`, true);
      setStep("verify");
    } finally {
      setLoading(false);
    }
  };

  const handleMenuSelect = (option: string) => {
    const labels: Record<string, string> = {
      tienda: "🛍️ Tienda",
      cuenta: "👤 Cuenta",
      soporte: "🎧 Soporte",
    };
    addMessage(labels[option], false);
    setTimeout(() => {
      const responses: Record<string, string> = {
        tienda: "🛒 Bienvenido a la Tienda. Aquí podrás ver productos, ofertas y realizar compras. (Próximamente)",
        cuenta: "👤 Sección de Cuenta. Aquí podrás ver tu perfil, saldo y configuración. (Próximamente)",
        soporte: "🎧 Soporte técnico. Describe tu problema y te ayudaremos lo antes posible. (Próximamente)",
      };
      addMessage(responses[option], true);
    }, 500);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-primary shadow-md">
        <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
          <Bot className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-primary-foreground font-semibold text-base">
            {botName ? `@${botName}` : "Bot Telegram"}
          </h1>
          <p className="text-primary-foreground/70 text-xs">
            {step === "menu" ? "Configurado ✓" : "Configuración"}
          </p>
        </div>
      </header>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg.text} isBot={msg.isBot} />
        ))}

        {/* Loading spinner */}
        {loading && (
          <div className="flex justify-center py-3 animate-fade-in">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {/* Verify button */}
        {step === "verify" && !loading && (
          <div className="flex justify-center py-3 animate-fade-in">
            <button
              onClick={handleVerify}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-foreground
                font-medium border border-primary/20 hover:bg-primary hover:text-primary-foreground
                active:scale-95 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              Verificar que el bot está en @{channelName}
            </button>
          </div>
        )}
      </div>

      {/* Bottom input / menu area */}
      <div className="border-t border-border bg-card px-3 py-3">
        {step === "start" ? (
          <div className="flex justify-center">
            <button
              onClick={handleStart}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground
                font-semibold shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "▶️ Start"}
            </button>
          </div>
        ) : step === "channel-input" ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChannelSubmit()}
              placeholder="Nombre del canal (ej: mi_canal)"
              className="flex-1 px-4 py-3 rounded-xl bg-muted text-foreground text-sm
                placeholder:text-muted-foreground border border-border
                focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleChannelSubmit}
              disabled={!channelInput.trim()}
              className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center
                disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        ) : step === "menu" ? (
          <MenuButtons onSelect={handleMenuSelect} />
        ) : (
          <div className="text-center text-muted-foreground text-sm py-2">
            {loading ? "Conectando con Telegram..." : "Sigue las instrucciones del bot..."}
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
