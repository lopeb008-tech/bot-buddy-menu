import { Store, User, Headphones } from "lucide-react";

interface MenuButtonsProps {
  onSelect: (option: string) => void;
}

const menuItems = [
  { label: "🛍️ Tienda", value: "tienda", icon: Store },
  { label: "👤 Cuenta", value: "cuenta", icon: User },
  { label: "🎧 Soporte", value: "soporte", icon: Headphones },
];

const MenuButtons = ({ onSelect }: MenuButtonsProps) => {
  return (
    <div className="flex gap-2 w-full px-2">
      {menuItems.map((item) => (
        <button
          key={item.value}
          onClick={() => onSelect(item.value)}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl
            bg-menu-button text-menu-button-foreground border border-menu-button-border
            hover:bg-menu-button-hover hover:border-primary/30
            transition-all duration-200 text-sm font-medium shadow-sm
            active:scale-95"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default MenuButtons;
