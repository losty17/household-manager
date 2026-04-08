import { useQuery } from "@tanstack/react-query";
import { productsApi, shoppingListApi, Product, ShoppingListItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShoppingCart, Package, AlertTriangle, XCircle, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => productsApi.list() });
  const { data: shoppingList = [] } = useQuery<ShoppingListItem[]>({ queryKey: ["shopping-list"], queryFn: shoppingListApi.get });

  const lowStockCount = products.filter(p => p.status === "low_stock").length;
  const endedCount = products.filter(p => p.status === "ended").length;
  const lowStockItems = products.filter(p => p.status === "low_stock").slice(0, 5);

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <span className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-full"><Package className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-2xl font-bold text-blue-700">{products.length}</p>
              <p className="text-xs text-blue-600">Total Items</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-full"><AlertTriangle className="h-5 w-5 text-yellow-600" /></div>
            <div>
              <p className="text-2xl font-bold text-yellow-700">{lowStockCount}</p>
              <p className="text-xs text-yellow-600">Low Stock</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-full"><XCircle className="h-5 w-5 text-red-600" /></div>
            <div>
              <p className="text-2xl font-bold text-red-700">{endedCount}</p>
              <p className="text-xs text-red-600">Ended</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-full"><ShoppingCart className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-2xl font-bold text-green-700">{shoppingList.length}</p>
              <p className="text-xs text-green-600">Need to Buy</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shopping List Preview */}
      {shoppingList.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" /> Shopping List
              </CardTitle>
              <Link to="/shopping-list">
                <Button variant="ghost" size="sm" className="text-xs">View All →</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {shoppingList.slice(0, 4).map(item => (
              <div key={item.product_id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.category_name}</p>
                </div>
                <Badge variant={item.priority === 1 ? "destructive" : item.priority === 2 ? "warning" : "secondary"} className="text-xs">
                  {item.priority === 1 ? "Urgent" : item.priority === 2 ? "Low" : "Due"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Low Stock Items */}
      {lowStockItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-yellow-500" /> Stock Levels
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {lowStockItems.map(p => (
              <div key={p.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">{p.current_stock}/{p.min_threshold} {p.unit}</span>
                </div>
                <Progress value={Math.min((p.current_stock / p.min_threshold) * 100, 100)} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {products.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No items yet. Start by adding products to your inventory.</p>
            <Link to="/inventory">
              <Button>Add First Item</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
