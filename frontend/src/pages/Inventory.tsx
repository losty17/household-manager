import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { productsApi, categoriesApi, shoppingListApi, Product, Category, ShoppingListItem } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { Plus, Search, Package, RefreshCw, ChevronRight, XCircle, AlertTriangle, ShoppingCart, MinusCircle, ArrowUpDown, ChevronDown, ChevronUp, X } from "lucide-react";
import ExpiringPanel from "@/components/ExpiringPanel";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import ThemeToggle from "@/components/ThemeToggle";

type GroupBy = "none" | "category" | "expiration" | "frequency";
type SortBy = "name" | "status" | "category" | "expiration" | "frequency" | "updated" | "stock";
type SortDir = "asc" | "desc";

const EXPIRATION_PERIOD_ORDER = ["Expired", "This Week", "This Month", "Next 3 Months", "Later", "No Expiry"];
const FREQUENCY_ORDER: Record<string, number> = { weekly: 0, "bi-weekly": 1, monthly: 2, none: 3 };
const FREQUENCY_LABELS: Record<string, string> = { weekly: "Weekly", "bi-weekly": "Bi-weekly", monthly: "Monthly", none: "No Recurrence" };
const STATUS_ORDER: Record<string, number> = { ended: 0, low_stock: 1, ok: 2 };

function getExpirationPeriod(expDate?: string): string {
  if (!expDate) return "No Expiry";
  const days = Math.ceil((new Date(expDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return "Expired";
  if (days <= 7) return "This Week";
  if (days <= 30) return "This Month";
  if (days <= 90) return "Next 3 Months";
  return "Later";
}

function sortProducts(products: Product[], sortBy: SortBy, sortDir: SortDir): Product[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...products].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "status":
        return dir * ((STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2));
      case "category":
        return dir * (a.category_name || "").localeCompare(b.category_name || "");
      case "expiration": {
        const aDate = a.expiration_date ? new Date(a.expiration_date).getTime() : Infinity;
        const bDate = b.expiration_date ? new Date(b.expiration_date).getTime() : Infinity;
        return dir * (aDate - bDate);
      }
      case "frequency":
        return dir * ((FREQUENCY_ORDER[a.buying_frequency] ?? 3) - (FREQUENCY_ORDER[b.buying_frequency] ?? 3));
      case "updated":
        return dir * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
      case "stock":
        return dir * (a.current_stock - b.current_stock);
      default:
        return 0;
    }
  });
}

function groupProducts(products: Product[], groupBy: GroupBy): [string, Product[]][] {
  if (groupBy === "none") return [["", products]];
  const map = new Map<string, Product[]>();
  const groupOrder = new Map<string, number>();
  for (const p of products) {
    const key =
      groupBy === "category" ? (p.category_name || "Uncategorized") :
      groupBy === "expiration" ? getExpirationPeriod(p.expiration_date) :
      FREQUENCY_LABELS[p.buying_frequency] ?? "Other";
    if (!map.has(key)) {
      map.set(key, []);
      groupOrder.set(key, groupOrder.size);
    }
    map.get(key)!.push(p);
  }
  const entries = Array.from(map.entries());
  if (groupBy === "expiration") {
    entries.sort(([a], [b]) => EXPIRATION_PERIOD_ORDER.indexOf(a) - EXPIRATION_PERIOD_ORDER.indexOf(b));
  } else if (groupBy === "frequency") {
    const freqLabelOrder = Object.keys(FREQUENCY_LABELS).map(k => FREQUENCY_LABELS[k]);
    entries.sort(([a], [b]) => freqLabelOrder.indexOf(a) - freqLabelOrder.indexOf(b));
  } else {
    // Sort groups by the position of their first item in the sorted list
    entries.sort(([a], [b]) => (groupOrder.get(a) ?? 0) - (groupOrder.get(b) ?? 0));
  }
  return entries;
}

interface ProductFormData {
  name: string;
  category_id: string;
  new_category_name: string;
  current_stock: string;
  min_threshold: string;
  unit: string;
  buying_frequency: string;
  expiration_date: string;
}

const defaultForm: ProductFormData = {
  name: "",
  category_id: "",
  new_category_name: "",
  current_stock: "0",
  min_threshold: "0",
  unit: "count",
  buying_frequency: "none",
  expiration_date: "",
};

const NEW_CATEGORY_VALUE = "__new__";

export default function Inventory() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState(() => searchParams.get("category") || "all");
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [sortBy, setSortBy] = useState<SortBy>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [showRestockDialog, setShowRestockDialog] = useState(false);
  const [showConsumeDialog, setShowConsumeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [restockQty, setRestockQty] = useState("0");
  const [consumeQty, setConsumeQty] = useState("1");
  const [form, setForm] = useState<ProductFormData>(defaultForm);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => productsApi.list() });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["categories"], queryFn: categoriesApi.list });
  const { data: shoppingList = [] } = useQuery<ShoppingListItem[]>({ queryKey: ["shopping-list"], queryFn: shoppingListApi.get });

  const selectedProduct = products.find(p => p.id === selectedProductId) ?? null;

  const lowStockCount = products.filter(p => p.status === "low_stock").length;
  const endedCount = products.filter(p => p.status === "ended").length;

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => categoriesApi.create({ name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Product>) => {
      let categoryId = data.category_id;
      if (!categoryId && form.new_category_name.trim()) {
        const newCat = await createCategoryMutation.mutateAsync(form.new_category_name.trim());
        categoryId = newCat.id;
      }
      return editingProduct
        ? productsApi.update(editingProduct.id, { ...data, category_id: categoryId })
        : productsApi.create({ ...data, category_id: categoryId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      setShowAddDialog(false);
      setForm(defaultForm);
      setEditingProduct(null);
    },
  });

  const restockMutation = useMutation({
    mutationFn: (id: number) => productsApi.restock(id, { new_stock: parseFloat(restockQty) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      setShowRestockDialog(false);
    },
  });

  const consumeMutation = useMutation({
    mutationFn: (id: number) => productsApi.consume(id, { quantity: parseFloat(consumeQty) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      setShowConsumeDialog(false);
    },
  });

  const markEndedMutation = useMutation({
    mutationFn: productsApi.markEnded,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedProductId(null);
    },
  });

  const normalize = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filtered = products.filter(p => {
    const matchSearch = normalize(p.name).includes(normalize(search));
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const matchCategory = filterCategory === "all" || String(p.category_id) === filterCategory;
    return matchSearch && matchStatus && matchCategory;
  });

  const sorted = sortProducts(filtered, sortBy, sortDir);
  const grouped = groupProducts(sorted, groupBy);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      category_id: String(product.category_id),
      new_category_name: "",
      current_stock: String(product.current_stock),
      min_threshold: String(product.min_threshold),
      unit: product.unit,
      buying_frequency: product.buying_frequency,
      expiration_date: product.expiration_date ? product.expiration_date.split("T")[0] : "",
    });
    setShowAddDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const categoryId = form.category_id === NEW_CATEGORY_VALUE ? undefined : parseInt(form.category_id);
    createMutation.mutate({
      name: form.name,
      category_id: categoryId,
      current_stock: parseFloat(form.current_stock),
      min_threshold: parseFloat(form.min_threshold),
      unit: form.unit,
      buying_frequency: form.buying_frequency as Product["buying_frequency"],
      expiration_date: form.expiration_date || undefined,
    });
  };

  const statusBadge = (status: string) => {
    if (status === "ended") return <Badge variant="destructive" className="text-xs">Ended</Badge>;
    if (status === "low_stock") return <Badge variant="warning" className="text-xs">Low Stock</Badge>;
    return <Badge variant="success" className="text-xs">OK</Badge>;
  };

  const categoryIcon = (cat?: Category) => cat?.icon ? <span className="mr-1">{cat.icon}</span> : null;

  const isFiltered = search !== "" || filterStatus !== "all" || filterCategory !== "all";

  const clearFilters = () => {
    setSearch("");
    setFilterStatus("all");
    setFilterCategory("all");
  };

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Home</h1>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</span>
          <span className="text-xs text-muted-foreground font-mono opacity-60">{__COMMIT_HASH__}</span>
          <PushNotificationToggle />
          <ThemeToggle />
        </div>
      </div>

      {/* Expiring Soon shortcut panel */}
      <ExpiringPanel />

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
          <CardContent className="p-3 flex flex-col items-center text-center">
            <Package className="h-4 w-4 text-blue-600 dark:text-blue-400 mb-1" />
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{products.length}</p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400">Items</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-800">
          <CardContent className="p-3 flex flex-col items-center text-center">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mb-1" />
            <p className="text-xl font-bold text-yellow-700 dark:text-yellow-300">{lowStockCount}</p>
            <p className="text-[10px] text-yellow-600 dark:text-yellow-400">Low Stock</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800">
          <CardContent className="p-3 flex flex-col items-center text-center">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mb-1" />
            <p className="text-xl font-bold text-red-700 dark:text-red-300">{endedCount}</p>
            <p className="text-[10px] text-red-600 dark:text-red-400">Ended</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800">
          <CardContent className="p-3 flex flex-col items-center text-center">
            <ShoppingCart className="h-4 w-4 text-green-600 dark:text-green-400 mb-1" />
            <p className="text-xl font-bold text-green-700 dark:text-green-300">{shoppingList.length}</p>
            <p className="text-[10px] text-green-600 dark:text-green-400">To Buy</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {isFiltered && (
          <Button
            variant="outline"
            size="sm"
            className="h-10 px-3 flex-shrink-0 text-muted-foreground"
            onClick={clearFilters}
            aria-label="Clear filters"
            title="Clear filters"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="flex-1 h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="low_stock">Low Stock</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="flex-1 h-9 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.icon && <span className="mr-1">{c.icon}</span>}{c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Group & Sort */}
      <div className="flex gap-2">
        <Select value={groupBy} onValueChange={v => { setGroupBy(v as GroupBy); setCollapsedGroups(new Set()); }}>
          <SelectTrigger className="flex-1 h-9 text-xs">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Grouping</SelectItem>
            <SelectItem value="category">By Category</SelectItem>
            <SelectItem value="expiration">By Expiry</SelectItem>
            <SelectItem value="frequency">By Recurrence</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
          <SelectTrigger className="flex-1 h-9 text-xs">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="category">Category</SelectItem>
            <SelectItem value="expiration">Expiry Date</SelectItem>
            <SelectItem value="frequency">Recurrence</SelectItem>
            <SelectItem value="updated">Last Updated</SelectItem>
            <SelectItem value="stock">Stock Level</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0 flex-shrink-0"
          onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
          aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}. Click to toggle.`}
          title={sortDir === "asc" ? "Ascending" : "Descending"}
        >
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Products List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
          No items found
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([groupKey, groupProducts]) => (
            <div key={groupKey || "__all__"} className="space-y-2">
              {groupBy !== "none" && (
                <button
                  onClick={() => toggleGroup(groupKey)}
                  aria-label={`${collapsedGroups.has(groupKey) ? "Expand" : "Collapse"} group: ${groupKey}`}
                  aria-expanded={!collapsedGroups.has(groupKey)}
                  className="w-full flex items-center justify-between px-1 py-0.5 text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  <span>{groupKey}</span>
                  <span className="flex items-center gap-1 normal-case font-normal">
                    <span className="text-xs">{groupProducts.length}</span>
                    {collapsedGroups.has(groupKey)
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronUp className="h-4 w-4" />}
                  </span>
                </button>
              )}
              {!collapsedGroups.has(groupKey) && groupProducts.map(product => {
                const cat = categories.find(c => c.id === product.category_id);
                return (
                  <Card
                    key={product.id}
                    className="cursor-pointer active:opacity-80 transition-opacity"
                    onClick={() => setSelectedProductId(product.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {categoryIcon(cat)}{product.category_name || "Uncategorized"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {statusBadge(product.status)}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                        <span>{product.current_stock} {product.unit} remaining</span>
                        <span>Min: {product.min_threshold} {product.unit}</span>
                      </div>
                      <Progress
                        value={Math.min((product.current_stock / Math.max(product.min_threshold, 1)) * 100, 100)}
                        className={`h-1.5 ${product.status === "ended" ? "[&>div]:bg-red-500" : product.status === "low_stock" ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                      />
                      {product.expiration_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Expires: {new Date(product.expiration_date).toLocaleDateString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => { setEditingProduct(null); setForm(defaultForm); setShowAddDialog(true); }}
        className="fixed bottom-24 right-4 h-14 w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform z-10"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Product Detail Drawer */}
      <Drawer open={!!selectedProduct && !showRestockDialog && !showConsumeDialog} onOpenChange={open => !open && setSelectedProductId(null)}>
        <DrawerContent>
          {selectedProduct && (
            <>
              <DrawerHeader>
                <DrawerTitle className="flex items-center gap-2">
                  {selectedProduct.name}
                  {statusBadge(selectedProduct.status)}
                </DrawerTitle>
              </DrawerHeader>
              <DrawerBody>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-muted rounded-md p-2">
                      <p className="text-xs text-muted-foreground">Current Stock</p>
                      <p className="font-semibold">{selectedProduct.current_stock} {selectedProduct.unit}</p>
                    </div>
                    <div className="bg-muted rounded-md p-2">
                      <p className="text-xs text-muted-foreground">Min Threshold</p>
                      <p className="font-semibold">{selectedProduct.min_threshold} {selectedProduct.unit}</p>
                    </div>
                    <div className="bg-muted rounded-md p-2">
                      <p className="text-xs text-muted-foreground">Frequency</p>
                      <p className="font-semibold capitalize">{selectedProduct.buying_frequency}</p>
                    </div>
                    <div className="bg-muted rounded-md p-2">
                      <p className="text-xs text-muted-foreground">Category</p>
                      <p className="font-semibold">
                        {(() => { const cat = categories.find(c => c.id === selectedProduct.category_id); return cat?.icon ? `${cat.icon} ` : ""; })()}
                        {selectedProduct.category_name}
                      </p>
                    </div>
                  </div>
                  {selectedProduct.next_purchase_date && (
                    <p className="text-xs text-muted-foreground">
                      Next purchase: {new Date(selectedProduct.next_purchase_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </DrawerBody>
              <DrawerFooter>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => { setRestockQty(String(selectedProduct.min_threshold * 2)); setShowRestockDialog(true); }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" /> Restock
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setConsumeQty("1"); setShowConsumeDialog(true); }}
                  >
                    <MinusCircle className="h-4 w-4 mr-2" /> Use
                  </Button>
                </div>
                {selectedProduct.status !== "ended" && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => markEndedMutation.mutate(selectedProduct.id)}
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Mark as Ended
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => openEdit(selectedProduct)}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-500"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    Delete
                  </Button>
                </div>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      {/* Restock Drawer */}
      <Drawer open={showRestockDialog} onOpenChange={setShowRestockDialog}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>Restock {selectedProduct?.name}</DrawerTitle></DrawerHeader>
          <DrawerBody>
            <div className="space-y-3">
              <Label>New Stock Quantity ({selectedProduct?.unit})</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={restockQty}
                onChange={e => setRestockQty(e.target.value.replaceAll(',', '.'))}
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === ' ') e.preventDefault(); }}
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowRestockDialog(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => selectedProduct && restockMutation.mutate(selectedProduct.id)}>
                Confirm Restock
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Consume Drawer */}
      <Drawer open={showConsumeDialog} onOpenChange={setShowConsumeDialog}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>Use {selectedProduct?.name}</DrawerTitle></DrawerHeader>
          <DrawerBody>
            <div className="space-y-3">
              <Label>Amount to remove ({selectedProduct?.unit})</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={consumeQty}
                onChange={e => setConsumeQty(e.target.value.replaceAll(',', '.'))}
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === ' ') e.preventDefault(); }}
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowConsumeDialog(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => selectedProduct && consumeMutation.mutate(selectedProduct.id)}>
                Confirm
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Add/Edit Product Drawer */}
      <Drawer open={showAddDialog} onOpenChange={open => { if (!open) { setShowAddDialog(false); setEditingProduct(null); } }}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <form id="product-form" onSubmit={handleSubmit} className="space-y-3 pb-2">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required placeholder="e.g. Olive Oil" />
              </div>
              <div>
                <Label>Category *</Label>
                <Select
                  value={form.category_id}
                  onValueChange={v => setForm({...form, category_id: v, new_category_name: v === NEW_CATEGORY_VALUE ? form.new_category_name : ""})}
                >
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.icon && <span className="mr-1">{c.icon}</span>}{c.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_CATEGORY_VALUE}>+ Create new category</SelectItem>
                  </SelectContent>
                </Select>
                {form.category_id === NEW_CATEGORY_VALUE && (
                  <Input
                    className="mt-2"
                    placeholder="New category name"
                    value={form.new_category_name}
                    onChange={e => setForm({...form, new_category_name: e.target.value})}
                    required
                  />
                )}
              </div>
              <div>
                <Label>Current Stock</Label>
                <Input type="text" inputMode="decimal" value={form.current_stock} onChange={e => setForm({...form, current_stock: e.target.value.replaceAll(',', '.')})} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === ' ') e.preventDefault(); }} />
              </div>
              <div>
                <Label>Min Threshold</Label>
                <Input type="text" inputMode="decimal" value={form.min_threshold} onChange={e => setForm({...form, min_threshold: e.target.value.replaceAll(',', '.')})} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === ' ') e.preventDefault(); }} />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={v => setForm({...form, unit: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">count</SelectItem>
                    <SelectItem value="grams">grams</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="liters">liters</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="pieces">pieces</SelectItem>
                    <SelectItem value="bottles">bottles</SelectItem>
                    <SelectItem value="boxes">boxes</SelectItem>
                    <SelectItem value="packs">packs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={form.buying_frequency} onValueChange={v => setForm({...form, buying_frequency: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="bi-weekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expiration Date (optional)</Label>
                <Input
                  type="date"
                  value={form.expiration_date}
                  onChange={e => setForm({...form, expiration_date: e.target.value})}
                />
              </div>
            </form>
          </DrawerBody>
          <DrawerFooter>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button type="submit" form="product-form" className="flex-1" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : editingProduct ? "Update" : "Add Product"}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation Drawer */}
      <Drawer open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Delete Item</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">"{selectedProduct?.name}"</span>? This action cannot be undone.
            </p>
          </DrawerBody>
          <DrawerFooter>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => { deleteMutation.mutate(selectedProduct!.id); setShowDeleteDialog(false); }}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
