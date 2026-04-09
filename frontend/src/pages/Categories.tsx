import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoriesApi, Category } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter } from "@/components/ui/drawer";
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
  const [deleteTarget, setDeleteTarget] = useState<{ category: Category; hasProducts: boolean } | null>(null);

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
      <h1 className="text-2xl font-bold">Categories</h1>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Tag className="h-10 w-10 mx-auto mb-2 opacity-50" />
          No categories yet
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
                      {cat.product_count} {cat.product_count === 1 ? "item" : "items"}
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
                    onClick={() => setDeleteTarget({ category: cat, hasProducts: cat.product_count > 0 })}
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
        className="fixed bottom-24 right-4 h-14 w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform z-10"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Add/Edit Drawer */}
      <Drawer open={showDialog} onOpenChange={open => { if (!open) { setShowDialog(false); setEditingCategory(null); } }}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{editingCategory ? "Edit Category" : "New Category"}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <form id="category-form" onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="e.g. Dairy"
                />
              </div>
              <div>
                <Label>Icon (emoji)</Label>
                <Input
                  value={form.icon}
                  onChange={e => setForm({ ...form, icon: e.target.value })}
                  placeholder="e.g. 🥛"
                  maxLength={4}
                />
              </div>
              <div>
                <Label>Color (hex or CSS color)</Label>
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
            </form>
          </DrawerBody>
          <DrawerFooter>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" form="category-form" className="flex-1" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingCategory ? "Update" : "Create"}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation Drawer */}
      <Drawer open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {deleteTarget?.hasProducts ? "Cannot Delete Category" : "Delete Category"}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            {deleteTarget?.hasProducts ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">"{deleteTarget.category.name}"</span> cannot be deleted because it has products assigned to it. Reassign or delete those products first.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete <span className="font-medium text-foreground">"{deleteTarget?.category.name}"</span>? This action cannot be undone.
              </p>
            )}
          </DrawerBody>
          <DrawerFooter>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
                {deleteTarget?.hasProducts ? "OK" : "Cancel"}
              </Button>
              {!deleteTarget?.hasProducts && (
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => { deleteMutation.mutate(deleteTarget!.category.id); setDeleteTarget(null); }}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </Button>
              )}
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
