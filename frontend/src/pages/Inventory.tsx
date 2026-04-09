import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  productsApi,
  categoriesApi,
  shoppingListApi,
  Product,
  Category,
  ShoppingListItem,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Package,
  RefreshCw,
  ChevronRight,
  XCircle,
  AlertTriangle,
  ShoppingCart,
  MinusCircle,
} from "lucide-react";
import { translateUnit, translateFrequency, isoToBR, brToISO } from "@/lib/utils";

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
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showRestockDialog, setShowRestockDialog] = useState(false);
  const [showConsumeDialog, setShowConsumeDialog] = useState(false);
  const [restockQty, setRestockQty] = useState("0");
  const [consumeQty, setConsumeQty] = useState("1");
  const [form, setForm] = useState<ProductFormData>(defaultForm);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => productsApi.list(),
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
  });
  const { data: shoppingList = [] } = useQuery<ShoppingListItem[]>({
    queryKey: ["shopping-list"],
    queryFn: shoppingListApi.get,
  });

  const lowStockCount = products.filter((p) => p.status === "low_stock").length;
  const endedCount = products.filter((p) => p.status === "ended").length;

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => categoriesApi.create({ name }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Product>) => {
      let categoryId = data.category_id;
      if (!categoryId && form.new_category_name.trim()) {
        const newCat = await createCategoryMutation.mutateAsync(
          form.new_category_name.trim(),
        );
        categoryId = newCat.id;
      }
      return editingProduct
        ? productsApi.update(editingProduct.id, {
          ...data,
          category_id: categoryId,
        })
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
    mutationFn: (id: number) =>
      productsApi.restock(id, { new_stock: parseFloat(restockQty) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      setShowRestockDialog(false);
      setSelectedProduct(null);
    },
  });

  const consumeMutation = useMutation({
    mutationFn: (id: number) =>
      productsApi.consume(id, { quantity: parseFloat(consumeQty) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["shopping-list"] });
      setShowConsumeDialog(false);
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

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const matchCategory =
      filterCategory === "all" || String(p.category_id) === filterCategory;
    return matchSearch && matchStatus && matchCategory;
  });

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
      expiration_date: product.expiration_date
        ? isoToBR(product.expiration_date.split("T")[0])
        : "",
    });
    setShowAddDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const categoryId =
      form.category_id === NEW_CATEGORY_VALUE
        ? undefined
        : parseInt(form.category_id);
    createMutation.mutate({
      name: form.name,
      category_id: categoryId,
      current_stock: parseFloat(form.current_stock),
      min_threshold: parseFloat(form.min_threshold),
      unit: form.unit,
      buying_frequency: form.buying_frequency as Product["buying_frequency"],
      expiration_date: form.expiration_date ? (brToISO(form.expiration_date) || undefined) : undefined,
    });
  };

  const statusBadge = (status: string) => {
    if (status === "ended")
      return (
        <Badge variant="destructive" className="text-xs">
          Esgotado
        </Badge>
      );
    if (status === "low_stock")
      return (
        <Badge variant="warning" className="text-xs">
          Estoque Baixo
        </Badge>
      );
    return (
      <Badge variant="success" className="text-xs">
        OK
      </Badge>
    );
  };

  const categoryIcon = (cat?: Category) =>
    cat?.icon ? <span className="mr-1">{cat.icon}</span> : null;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Início</h1>
        <span className="text-sm text-muted-foreground mr-10">
          {new Date().toLocaleDateString("pt-BR")}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
          <CardContent className="p-3 flex flex-col items-center text-center">
            <Package className="h-4 w-4 text-blue-600 dark:text-blue-400 mb-1" />
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
              {products.length}
            </p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400">
              Itens
            </p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-800">
          <CardContent className="p-3 flex flex-col items-center text-center">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mb-1" />
            <p className="text-xl font-bold text-yellow-700 dark:text-yellow-300">
              {lowStockCount}
            </p>
            <p className="text-[10px] text-yellow-600 dark:text-yellow-400">
              Baixo
            </p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800">
          <CardContent className="p-3 flex flex-col items-center text-center">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mb-1" />
            <p className="text-xl font-bold text-red-700 dark:text-red-300">
              {endedCount}
            </p>
            <p className="text-[10px] text-red-600 dark:text-red-400">
              Esgotado
            </p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800">
          <CardContent className="p-3 flex flex-col items-center text-center">
            <ShoppingCart className="h-4 w-4 text-green-600 dark:text-green-400 mb-1" />
            <p className="text-xl font-bold text-green-700 dark:text-green-300">
              {shoppingList.length}
            </p>
            <p className="text-[10px] text-green-600 dark:text-green-400">
              Comprar
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar itens..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="low_stock">Estoque Baixo</SelectItem>
            <SelectItem value="ended">Esgotado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="flex-1 h-9 text-xs">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.icon && <span className="mr-1">{c.icon}</span>}
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Products List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
          Nenhum item encontrado
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((product) => {
            const cat = categories.find((c) => c.id === product.category_id);
            return (
              <Card
                key={product.id}
                className="cursor-pointer active:opacity-80 transition-opacity"
                onClick={() => setSelectedProduct(product)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {categoryIcon(cat)}
                        {product.category_name || "Sem categoria"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {statusBadge(product.status)}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>
                      {product.current_stock} {translateUnit(product.unit)} restante
                    </span>
                    <span>
                      Mín: {product.min_threshold} {translateUnit(product.unit)}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(
                      (product.current_stock /
                        Math.max(product.min_threshold, 1)) *
                      100,
                      100,
                    )}
                    className={`h-1.5 ${product.status === "ended" ? "[&>div]:bg-red-500" : product.status === "low_stock" ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                  />
                  {product.expiration_date && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Vence:{" "}
                      {new Date(product.expiration_date).toLocaleDateString(
                        "pt-BR",
                      )}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => {
          setEditingProduct(null);
          setForm(defaultForm);
          setShowAddDialog(true);
        }}
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform z-10"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Product Detail Dialog */}
      <Dialog
        open={!!selectedProduct && !showRestockDialog && !showConsumeDialog}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
      >
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
                    <p className="text-xs text-muted-foreground">
                      Estoque Atual
                    </p>
                    <p className="font-semibold">
                      {selectedProduct.current_stock} {translateUnit(selectedProduct.unit)}
                    </p>
                  </div>
                  <div className="bg-muted rounded-md p-2">
                    <p className="text-xs text-muted-foreground">Mínimo</p>
                    <p className="font-semibold">
                      {selectedProduct.min_threshold} {translateUnit(selectedProduct.unit)}
                    </p>
                  </div>
                  <div className="bg-muted rounded-md p-2">
                    <p className="text-xs text-muted-foreground">Frequência</p>
                    <p className="font-semibold capitalize">
                      {translateFrequency(selectedProduct.buying_frequency)}
                    </p>
                  </div>
                  <div className="bg-muted rounded-md p-2">
                    <p className="text-xs text-muted-foreground">Categoria</p>
                    <p className="font-semibold">
                      {(() => {
                        const cat = categories.find(
                          (c) => c.id === selectedProduct.category_id,
                        );
                        return cat?.icon ? `${cat.icon} ` : "";
                      })()}
                      {selectedProduct.category_name}
                    </p>
                  </div>
                </div>
                {selectedProduct.next_purchase_date && (
                  <p className="text-xs text-muted-foreground">
                    Próxima compra:{" "}
                    {new Date(
                      selectedProduct.next_purchase_date,
                    ).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
              <DialogFooter className="flex-col gap-2">
                <div className="flex gap-2 w-full">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setRestockQty(String(selectedProduct.min_threshold * 2));
                      setShowRestockDialog(true);
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" /> Repor
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setConsumeQty("1");
                      setShowConsumeDialog(true);
                    }}
                  >
                    <MinusCircle className="h-4 w-4 mr-2" /> Usar
                  </Button>
                </div>
                {selectedProduct.status !== "ended" && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => markEndedMutation.mutate(selectedProduct.id)}
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Marcar como Esgotado
                  </Button>
                )}
                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => openEdit(selectedProduct)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-500"
                    onClick={() => {
                      if (confirm("Excluir este item?"))
                        deleteMutation.mutate(selectedProduct.id);
                    }}
                  >
                    Excluir
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
          <DialogHeader>
            <DialogTitle>Repor {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Nova Quantidade em Estoque ({translateUnit(selectedProduct?.unit ?? "")})</Label>
            <Input
              type="number"
              value={restockQty}
              onChange={(e) => setRestockQty(e.target.value)}
              min="0"
              step="0.1"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRestockDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                selectedProduct && restockMutation.mutate(selectedProduct.id)
              }
            >
              Confirmar Reposição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Consume Dialog */}
      <Dialog open={showConsumeDialog} onOpenChange={setShowConsumeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Usar {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Quantidade a remover ({translateUnit(selectedProduct?.unit ?? "")})</Label>
            <Input
              type="number"
              value={consumeQty}
              onChange={(e) => setConsumeQty(e.target.value)}
              min="0.1"
              step="0.1"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConsumeDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                selectedProduct && consumeMutation.mutate(selectedProduct.id)
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Product Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingProduct(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Editar Produto" : "Novo Produto"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="ex: Azeite"
              />
            </div>
            <div>
              <Label>Categoria *</Label>
              <Select
                value={form.category_id}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    category_id: v,
                    new_category_name:
                      v === NEW_CATEGORY_VALUE ? form.new_category_name : "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.icon && <span className="mr-1">{c.icon}</span>}
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_CATEGORY_VALUE}>
                    + Criar nova categoria
                  </SelectItem>
                </SelectContent>
              </Select>
              {form.category_id === NEW_CATEGORY_VALUE && (
                <Input
                  className="mt-2"
                  placeholder="Nome da nova categoria"
                  value={form.new_category_name}
                  onChange={(e) =>
                    setForm({ ...form, new_category_name: e.target.value })
                  }
                  required
                />
              )}
            </div>
            <div>
              <Label>Estoque Atual</Label>
              <Input
                type="number"
                value={form.current_stock}
                onChange={(e) =>
                  setForm({ ...form, current_stock: e.target.value })
                }
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <Label>Mínimo</Label>
              <Input
                type="number"
                value={form.min_threshold}
                onChange={(e) =>
                  setForm({ ...form, min_threshold: e.target.value })
                }
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select
                value={form.unit}
                onValueChange={(v) => setForm({ ...form, unit: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">unidade</SelectItem>
                  <SelectItem value="grams">gramas</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="liters">litros</SelectItem>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="pieces">peças</SelectItem>
                  <SelectItem value="bottles">garrafas</SelectItem>
                  <SelectItem value="boxes">caixas</SelectItem>
                  <SelectItem value="packs">pacotes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Frequência</Label>
              <Select
                value={form.buying_frequency}
                onValueChange={(v) => setForm({ ...form, buying_frequency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="bi-weekly">Quinzenal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de Validade (opcional)</Label>
              <Input
                type="text"
                value={form.expiration_date}
                onChange={(e) =>
                  setForm({ ...form, expiration_date: e.target.value })
                }
                placeholder="DD/MM/AAAA"
                pattern="\d{2}/\d{2}/\d{4}"
                maxLength={10}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? "Salvando..."
                  : editingProduct
                    ? "Atualizar"
                    : "Adicionar Produto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
