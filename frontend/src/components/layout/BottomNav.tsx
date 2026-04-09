import { Link, useLocation } from "react-router-dom";
import { Home, Tag, ShoppingCart } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { shoppingListApi } from "@/lib/api";

export default function BottomNav() {
  const location = useLocation();
  const { data: shoppingList = [] } = useQuery({
    queryKey: ["shopping-list"],
    queryFn: shoppingListApi.get,
    staleTime: 30000,
  });

  const tabs = [
    { path: "/", label: "Home", icon: Home },
    { path: "/categories", label: "Categories", icon: Tag },
    { path: "/shopping-list", label: "Shopping", icon: ShoppingCart, badge: shoppingList.length },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-20 pb-safe">
      <div className="flex max-w-lg mx-auto">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs font-medium transition-colors relative ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div className="relative">
                <Icon className={`h-6 w-6 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                )}
              </div>
              <span>{tab.label}</span>
              {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
