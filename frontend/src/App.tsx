import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BottomNav from "@/components/layout/BottomNav";
import Inventory from "@/pages/Inventory";
import Categories from "@/pages/Categories";
import ShoppingList from "@/pages/ShoppingList";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background max-w-lg mx-auto relative">
          <Routes>
            <Route path="/" element={<Inventory />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/shopping-list" element={<ShoppingList />} />
          </Routes>
          <BottomNav />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
