import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { productsApi, Product } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle } from "lucide-react";

function daysLabel(date: string): { label: string; urgent: boolean } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(date);
  exp.setHours(0, 0, 0, 0);
  const diff = Math.round((exp.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { label: `Expired ${Math.abs(diff)}d ago`, urgent: true };
  if (diff === 0) return { label: "Expires today", urgent: true };
  if (diff === 1) return { label: "Expires tomorrow", urgent: true };
  return { label: `Expires in ${diff}d`, urgent: false };
}

export default function ExpiringPanel() {
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => productsApi.list(),
  });

  const now = new Date();

  // Items expiring within 3 days (with stock) or already expired with stock
  const expiringItems = products
    .filter(p => {
      if (!p.expiration_date || p.current_stock <= 0) return false;
      const exp = new Date(p.expiration_date);
      const diffDays = Math.round((exp.getTime() - now.getTime()) / 86400000);
      return diffDays <= 3;
    })
    .sort((a, b) => {
      return new Date(a.expiration_date!).getTime() - new Date(b.expiration_date!).getTime();
    });

  if (expiringItems.length === 0) return null;

  return (
    <Link to="/?filter=expiring" className="block">
      <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-800 hover:shadow-md transition-shadow">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">
              Expiring Soon
            </span>
            <Badge className="ml-auto bg-orange-500 text-white text-[10px] h-5">
              {expiringItems.length}
            </Badge>
          </div>
          <div className="space-y-1">
            {expiringItems.slice(0, 4).map(p => {
              const { label, urgent } = daysLabel(p.expiration_date!);
              return (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="text-orange-800 dark:text-orange-200 font-medium truncate max-w-[60%]">
                    {p.name}
                  </span>
                  <span className={`flex items-center gap-0.5 ${urgent ? "text-red-600 dark:text-red-400 font-semibold" : "text-orange-600 dark:text-orange-400"}`}>
                    {urgent && <AlertCircle className="h-3 w-3" />}
                    {label}
                  </span>
                </div>
              );
            })}
            {expiringItems.length > 4 && (
              <p className="text-[10px] text-orange-600 dark:text-orange-400 text-right">
                +{expiringItems.length - 4} more
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
