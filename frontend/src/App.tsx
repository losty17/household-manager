import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import BottomNav from "@/components/layout/BottomNav";
import ThemeToggle from "@/components/ThemeToggle";
import Inventory from "@/pages/Inventory";
import Categories from "@/pages/Categories";
import ShoppingList from "@/pages/ShoppingList";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <div className="min-h-screen bg-background max-w-lg mx-auto relative">
            <div className="fixed top-3 right-4 z-30">
              <ThemeToggle />
            </div>
            <Routes>
              <Route path="/" element={<Inventory />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/shopping-list" element={<ShoppingList />} />
            </Routes>
            <BottomNav />
          </div>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
