import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shoppingListApi, productsApi, ShoppingListItem, PredictedShoppingListItem } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Check, CheckSquare, Square, RefreshCw, Package, TrendingUp, Calendar } from "lucide-react";

const PREDICT_PERIODS = [
  { label: "1 Week", days: 7 },
  { label: "2 Weeks", days: 14 },
  { label: "1 Month", days: 30 },
];

export default function ShoppingList() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [boughtItems, setBoughtItems] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"current" | "predict">("current");
  const [predictDays, setPredictDays] = useState(7);

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["shopping-list"],
    queryFn: shoppingListApi.get,
    enabled: mode === "current",
  });

  const { data: predictedItems = [], isLoading: isPredictLoading, refetch: refetchPredict } = useQuery({
    queryKey: ["shopping-list-predict", predictDays],
    queryFn: () => shoppingListApi.predict(predictDays),
    enabled: mode === "predict",
  });

  const bulkBuyMutation = useMutation({
    mutationFn: shoppingListApi.bulkBuy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      setSelected(new Set());
      setBoughtItems(new Set());
    },
  });

  const singleBuyMutation = useMutation({
    mutationFn: async (item: ShoppingListItem) => {
      await productsApi.restock(item.product_id, { new_stock: item.suggested_quantity });
      return item;
    },
    onSuccess: (item) => {
      setBoughtItems(prev => new Set([...prev, item.product_id]));
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
    },
  });

  const urgentItems = items.filter(i => i.priority === 1);
  const lowStockItems = items.filter(i => i.priority === 2);
  const dueSoonItems = items.filter(i => i.priority === 3);

  const predictedUrgent = predictedItems.filter(i => i.priority === 1);
  const predictedLowStock = predictedItems.filter(i => i.priority === 2);
  const predictedDueSoon = predictedItems.filter(i => i.priority === 3);
  const predictedFuture = predictedItems.filter(i => i.priority === 4);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.product_id)));
  };

  const priorityConfig = {
    1: { label: "Urgent", color: "destructive" as const, bg: "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800" },
    2: { label: "Low Stock", color: "warning" as const, bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-800" },
    3: { label: "Due Soon", color: "secondary" as const, bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800" },
    4: { label: "Predicted", color: "outline" as const, bg: "bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:border-purple-800" },
  };

  const renderSection = (sectionItems: ShoppingListItem[], priority: 1 | 2 | 3) => {
    if (sectionItems.length === 0) return null;
    const config = priorityConfig[priority];
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Badge variant={config.color}>{config.label}</Badge>
          <span>{sectionItems.length} item{sectionItems.length !== 1 ? 's' : ''}</span>
        </h3>
        {sectionItems.map(item => (
          <Card
            key={item.product_id}
            className={`${config.bg} transition-opacity ${boughtItems.has(item.product_id) ? 'opacity-50' : ''}`}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <button
                onClick={() => toggleSelect(item.product_id)}
                className="flex-shrink-0 text-muted-foreground"
              >
                {selected.has(item.product_id)
                  ? <CheckSquare className="h-5 w-5 text-primary" />
                  : <Square className="h-5 w-5" />
                }
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.category_name} • {item.reason}</p>
                <p className="text-xs font-medium mt-0.5">
                  Suggested: <span className="text-primary">{item.suggested_quantity} {item.unit}</span>
                  {item.current_stock > 0 && (
                    <span className="text-muted-foreground ml-1">(have {item.current_stock})</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => singleBuyMutation.mutate(item)}
                disabled={singleBuyMutation.isPending || boughtItems.has(item.product_id)}
                className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
                  boughtItems.has(item.product_id)
                    ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400'
                    : 'bg-background border-2 border-green-500 text-green-600 active:bg-green-50 dark:text-green-400 dark:border-green-600'
                }`}
              >
                <Check className="h-5 w-5" />
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderPredictSection = (sectionItems: PredictedShoppingListItem[], priority: 1 | 2 | 3 | 4) => {
    if (sectionItems.length === 0) return null;
    const config = priorityConfig[priority];
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Badge variant={config.color}>{config.label}</Badge>
          <span>{sectionItems.length} item{sectionItems.length !== 1 ? 's' : ''}</span>
        </h3>
        {sectionItems.map(item => (
          <Card key={item.product_id} className={config.bg}>
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <span className="inline-flex items-center gap-1 text-xs bg-background border rounded-full px-2 py-0.5 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {item.days_until_needed < 1
                        ? "today"
                        : `in ${Math.round(item.days_until_needed)}d`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.category_name} • {item.reason}</p>
                  <p className="text-xs font-medium mt-0.5">
                    Suggested: <span className="text-primary">{item.suggested_quantity} {item.unit}</span>
                    {item.current_stock > 0 && (
                      <span className="text-muted-foreground ml-1">(have {item.current_stock})</span>
                    )}
                    <span className="text-muted-foreground ml-1">• by {item.predicted_date}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const loading = mode === "current" ? isLoading : isPredictLoading;
  const displayItems = mode === "current" ? items : predictedItems;

  return (
    <div className="p-4 pb-28 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" /> Shopping List
        </h1>
        <Button variant="ghost" size="sm" onClick={() => mode === "current" ? refetch() : refetchPredict()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg border overflow-hidden">
        <button
          onClick={() => setMode("current")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
            mode === "current" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Current
        </button>
        <button
          onClick={() => setMode("predict")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
            mode === "predict" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Predict
        </button>
      </div>

      {/* Period selector (predict mode only) */}
      {mode === "predict" && (
        <div className="flex gap-2">
          {PREDICT_PERIODS.map(period => (
            <button
              key={period.days}
              onClick={() => setPredictDays(period.days)}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                predictDays === period.days
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : displayItems.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {mode === "current"
                ? "All stocked up! Nothing to buy right now."
                : `Nothing predicted to be needed in the next ${predictDays} days.`}
            </p>
          </CardContent>
        </Card>
      ) : mode === "current" ? (
        <>
          {/* Select All / Bulk Buy Bar */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <button onClick={selectAll} className="flex items-center gap-2 text-sm font-medium">
              {selected.size === items.length
                ? <CheckSquare className="h-5 w-5 text-primary" />
                : <Square className="h-5 w-5 text-muted-foreground" />
              }
              {selected.size > 0 ? `${selected.size} selected` : "Select All"}
            </button>
            {selected.size > 0 && (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => bulkBuyMutation.mutate(Array.from(selected))}
                disabled={bulkBuyMutation.isPending}
              >
                {bulkBuyMutation.isPending ? "Processing..." : `Buy ${selected.size} Items`}
              </Button>
            )}
          </div>

          {renderSection(urgentItems, 1)}
          {renderSection(lowStockItems, 2)}
          {renderSection(dueSoonItems, 3)}
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Showing items predicted to be needed within the next {predictDays} days.
          </p>
          {renderPredictSection(predictedUrgent, 1)}
          {renderPredictSection(predictedLowStock, 2)}
          {renderPredictSection(predictedDueSoon, 3)}
          {renderPredictSection(predictedFuture, 4)}
        </>
      )}
    </div>
  );
}
