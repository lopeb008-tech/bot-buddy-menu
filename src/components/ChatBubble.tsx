interface ChatBubbleProps {
  message: string;
  isBot?: boolean;
}

const ChatBubble = ({ message, isBot = true }: ChatBubbleProps) => {
  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"} mb-3 animate-fade-in`}>
      {isBot && (
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center mr-2 flex-shrink-0 mt-1">
          <span className="text-primary-foreground text-sm font-bold">🤖</span>
        </div>
      )}
      <div
        className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isBot
            ? "bg-bot-bubble text-bot-bubble-foreground rounded-tl-md"
            : "bg-user-bubble text-user-bubble-foreground rounded-tr-md"
        }`}
      >
        {message}
      </div>
    </div>
  );
};

export default ChatBubble;
