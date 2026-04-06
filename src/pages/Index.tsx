import { useState, useRef, useEffect } from "react";
import { Bot, Send, CheckCircle2, Hash } from "lucide-react";
import ChatBubble from "@/components/ChatBubble";
import MenuButtons from "@/components/MenuButtons";

type Step = "token" | "join-channel" | "verifying" | "verified" | "menu";

interface Message {
  text: string;
  isBot: boolean;
}

const Index = () => {
  const [step, setStep] = useState<Step>("token");
  const [token, setToken] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { text: "¡Hola! 👋 Soy tu bot asistente. Para comenzar, ingresa tu API Token.", isBot: true },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, step]);

  const addMessage = (text: string, isBot: boolean) => {
    setMessages((prev) => [...prev, { text, isBot }]);
  };

  const handleTokenSubmit = () => {
    if (!token.trim()) return;
    const masked = token.slice(0, 6) + "••••••" + token.slice(-4);
    addMessage(`Token: ${masked}`, false);
    setTimeout(() => {
      addMessage("✅ Token guardado correctamente. Ahora únete a un canal para continuar.", true);
      setStep("join-channel");
    }, 600);
    setToken("");
  };

  const handleJoinChannel = () => {
    addMessage("Unirme al canal #general", false);
    setStep("verifying");
    setTimeout(() => {
      addMessage("⏳ Uniéndote al canal #general...", true);
    }, 400);
    setTimeout(() => {
      addMessage("✅ ¡Te has unido al canal #general exitosamente!", true);
      setStep("verified");
    }, 2000);
  };

  const handleVerify = () => {
    addMessage("Verificar conexión", false);
    setTimeout(() => {
      addMessage("🔍 Verificando conexión al canal...", true);
    }, 300);
    setTimeout(() => {
      addMessage("✅ Conexión verificada. ¡Todo listo! Aquí tienes el menú principal.", true);
      setStep("menu");
    }, 1500);
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
          <h1 className="text-primary-foreground font-semibold text-base">Bot Asistente</h1>
          <p className="text-primary-foreground/70 text-xs">En línea</p>
        </div>
      </header>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg.text} isBot={msg.isBot} />
        ))}

        {/* Join channel buttons */}
        {step === "join-channel" && (
          <div className="flex justify-center py-3 animate-fade-in">
            <button
              onClick={handleJoinChannel}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground
                font-medium shadow-lg hover:opacity-90 active:scale-95 transition-all"
            >
              <Hash className="w-4 h-4" />
              Unirse a #general
            </button>
          </div>
        )}

        {/* Verifying spinner */}
        {step === "verifying" && (
          <div className="flex justify-center py-3 animate-fade-in">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Verify button */}
        {step === "verified" && (
          <div className="flex justify-center py-3 animate-fade-in">
            <button
              onClick={handleVerify}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-foreground
                font-medium border border-primary/20 hover:bg-primary hover:text-primary-foreground
                active:scale-95 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              Verificar conexión
            </button>
          </div>
        )}
      </div>

      {/* Bottom input / menu area */}
      <div className="border-t border-border bg-card px-3 py-3">
        {step === "token" ? (
          <div className="flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTokenSubmit()}
              placeholder="Ingresa tu API Token..."
              className="flex-1 px-4 py-3 rounded-xl bg-muted text-foreground text-sm
                placeholder:text-muted-foreground border border-border
                focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleTokenSubmit}
              disabled={!token.trim()}
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
            Sigue las instrucciones del bot...
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
