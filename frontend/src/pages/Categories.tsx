import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoriesApi, Category } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { adaptColorForDark } from "@/lib/utils";

interface CategoryFormData {
  name: string;
  icon: string;
  color: string;
}

const defaultForm: CategoryFormData = { name: "", icon: "", color: "" };

export default function Categories() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [showDialog, setShowDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryFormData>(defaultForm);

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Category>) =>
      editingCategory
        ? categoriesApi.update(editingCategory.id, data)
        : categoriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowDialog(false);
      setForm(defaultForm);
      setEditingCategory(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => categoriesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setForm({ name: cat.name, icon: cat.icon ?? "", color: cat.color ?? "" });
    setShowDialog(true);
  };

  const openAdd = () => {
    setEditingCategory(null);
    setForm(defaultForm);
    setShowDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      name: form.name,
      icon: form.icon || undefined,
      color: form.color || undefined,
    });
  };

  return (
    <div className="p-4 pb-24 space-y-4">
      <h1 className="text-2xl font-bold">Categorias</h1>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Tag className="h-10 w-10 mx-auto mb-2 opacity-50" />
          Nenhuma categoria ainda
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map(cat => (
            <Card key={cat.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-xl"
                    style={{ backgroundColor: adaptColorForDark(cat.color || "#e5e7eb", isDark) }}
                  >
                    {cat.icon ? cat.icon : <Tag className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{cat.name}</p>
                    <Badge variant="secondary" className="text-xs mt-0.5">
                      {cat.product_count} {cat.product_count === 1 ? "item" : "itens"}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500"
                    onClick={() => {
                      if (cat.product_count > 0) {
                        alert("Não é possível excluir uma categoria que possui produtos associados.");
                        return;
                      }
                      if (confirm(`Excluir "${cat.name}"?`)) deleteMutation.mutate(cat.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={openAdd}
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform z-10"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={open => { if (!open) { setShowDialog(false); setEditingCategory(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                placeholder="ex: Laticínios"
              />
            </div>
            <div>
              <Label>Ícone (emoji)</Label>
              <Input
                value={form.icon}
                onChange={e => setForm({ ...form, icon: e.target.value })}
                placeholder="e.g. 🥛"
                maxLength={4}
              />
            </div>
            <div>
              <Label>Cor (hex ou CSS)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  value={form.color}
                  onChange={e => setForm({ ...form, color: e.target.value })}
                  placeholder="e.g. #fef3c7"
                />
                {form.color && (
                  <div
                    className="h-9 w-9 rounded-md border flex-shrink-0"
                    style={{ backgroundColor: form.color }}
                  />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : editingCategory ? "Atualizar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
