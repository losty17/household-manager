import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1",
  headers: { "Content-Type": "application/json" },
});

// Types matching backend schemas
export interface Category {
  id: number;
  name: string;
  icon?: string;
  color?: string;
  product_count: number;
}

export interface Product {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  current_stock: number;
  min_threshold: number;
  unit: string;
  buying_frequency: "weekly" | "bi-weekly" | "monthly" | "none";
  last_purchased?: string;
  next_purchase_date?: string;
  expiration_date?: string;
  status: "ok" | "low_stock" | "ended";
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShoppingListItem {
  product_id: number;
  name: string;
  category_name: string;
  unit: string;
  current_stock: number;
  min_threshold: number;
  priority: 1 | 2 | 3;
  reason: string;
  suggested_quantity: number;
}

export interface InventoryLog {
  id: number;
  product_id: number;
  action: "restock" | "consumed" | "ended" | "created";
  quantity_change: number;
  notes?: string;
  created_at: string;
}

// API functions
export const categoriesApi = {
  list: () => api.get<Category[]>("/categories/").then(r => r.data),
  create: (data: Partial<Category>) => api.post<Category>("/categories/", data).then(r => r.data),
  update: (id: number, data: Partial<Category>) => api.put<Category>(`/categories/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/categories/${id}`),
};

export const productsApi = {
  list: (params?: { category_id?: number; status?: string }) =>
    api.get<Product[]>("/products/", { params }).then(r => r.data),
  create: (data: Partial<Product>) => api.post<Product>("/products/", data).then(r => r.data),
  update: (id: number, data: Partial<Product>) => api.put<Product>(`/products/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/products/${id}`),
  restock: (id: number, data: { new_stock: number; notes?: string }) =>
    api.post<Product>(`/products/${id}/restock`, data).then(r => r.data),
  consume: (id: number, data: { quantity: number; notes?: string }) =>
    api.post<Product>(`/products/${id}/consume`, null, { params: data }).then(r => r.data),
  markEnded: (id: number) => api.post<Product>(`/products/${id}/mark-ended`).then(r => r.data),
  getConsumptionRate: (id: number) => api.get(`/products/${id}/consumption-rate`).then(r => r.data),
};

export const shoppingListApi = {
  get: () => api.get<ShoppingListItem[]>("/shopping-list/").then(r => r.data),
  bulkBuy: (productIds: number[]) =>
    api.post("/shopping-list/bulk-buy", { product_ids: productIds }).then(r => r.data),
};
