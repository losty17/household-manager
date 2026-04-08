import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi, categoriesApi, Product, Category } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Package, RefreshCw, ChevronRight, XCircle } from "lucide-react";

interface ProductFormData {
  name: string;
  category_id: string;
  current_stock: string;
  min_threshold: string;
  unit: string;
  buying_frequency: string;
  expiration_date: string;
}

const defaultForm: ProductFormData = {
  name: "",
  category_id: "",
  current_stock: "0",
  min_threshold: "0",
  unit: "count",
  buying_frequency: "none",
  expiration_date: "",
};

export default function Inventory() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showRestockDialog, setShowRestockDialog] = useState(false);
  const [restockQty, setRestockQty] = useState("0");
  const [form, setForm] = useState<ProductFormData>(defaultForm);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => productsApi.list() });
  const { data: categories = [] } = useQuery<Category[]>({ queryKey: ["categories"], queryFn: categoriesApi.list });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Product>) =>
      editingProduct ? productsApi.update(editingProduct.id, data) : productsApi.create(data),
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
      setSelectedProduct(null);
    },
  });

  const markEndedMutation = useMutation({
    mutationFn: productsApi.markEnded,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      setSelectedProduct(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedProduct(null);
    },
  });

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const matchCategory = filterCategory === "all" || String(p.category_id) === filterCategory;
    return matchSearch && matchStatus && matchCategory;
  });

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      category_id: String(product.category_id),
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
    createMutation.mutate({
      name: form.name,
      category_id: parseInt(form.category_id),
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

  return (
    <div className="p-4 pb-24 space-y-4">
      <h1 className="text-2xl font-bold">Inventory</h1>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
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
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <div className="space-y-2">
          {filtered.map(product => (
            <Card
              key={product.id}
              className="cursor-pointer active:opacity-80 transition-opacity"
              onClick={() => setSelectedProduct(product)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.category_name || "Uncategorized"}</p>
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
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => { setEditingProduct(null); setForm(defaultForm); setShowAddDialog(true); }}
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform z-10"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Product Detail Dialog */}
      <Dialog open={!!selectedProduct && !showRestockDialog} onOpenChange={open => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-sm">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedProduct.name}
                  {statusBadge(selectedProduct.status)}
                </DialogTitle>
              </DialogHeader>
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
                    <p className="font-semibold">{selectedProduct.category_name}</p>
                  </div>
                </div>
                {selectedProduct.next_purchase_date && (
                  <p className="text-xs text-muted-foreground">
                    Next purchase: {new Date(selectedProduct.next_purchase_date).toLocaleDateString()}
                  </p>
                )}
              </div>
              <DialogFooter className="flex-col gap-2">
                <Button
                  className="w-full"
                  onClick={() => { setRestockQty(String(selectedProduct.min_threshold * 2)); setShowRestockDialog(true); }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Restock
                </Button>
                {selectedProduct.status !== "ended" && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => markEndedMutation.mutate(selectedProduct.id)}
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Mark as Ended
                  </Button>
                )}
                <div className="flex gap-2 w-full">
                  <Button variant="outline" className="flex-1" onClick={() => openEdit(selectedProduct)}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-500"
                    onClick={() => { if (confirm("Delete this item?")) deleteMutation.mutate(selectedProduct.id); }}
                  >
                    Delete
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Restock Dialog */}
      <Dialog open={showRestockDialog} onOpenChange={setShowRestockDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Restock {selectedProduct?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>New Stock Quantity ({selectedProduct?.unit})</Label>
            <Input
              type="number"
              value={restockQty}
              onChange={e => setRestockQty(e.target.value)}
              min="0"
              step="0.1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRestockDialog(false)}>Cancel</Button>
            <Button onClick={() => selectedProduct && restockMutation.mutate(selectedProduct.id)}>
              Confirm Restock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Product Dialog */}
      <Dialog open={showAddDialog} onOpenChange={open => { if (!open) { setShowAddDialog(false); setEditingProduct(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required placeholder="e.g. Olive Oil" />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={form.category_id} onValueChange={v => setForm({...form, category_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Current Stock</Label>
                <Input type="number" value={form.current_stock} onChange={e => setForm({...form, current_stock: e.target.value})} min="0" step="0.1" />
              </div>
              <div>
                <Label>Min Threshold</Label>
                <Input type="number" value={form.min_threshold} onChange={e => setForm({...form, min_threshold: e.target.value})} min="0" step="0.1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <div>
              <Label>Expiration Date (optional)</Label>
              <Input type="date" value={form.expiration_date} onChange={e => setForm({...form, expiration_date: e.target.value})} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : editingProduct ? "Update" : "Add Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
