import { useEffect, useMemo, useState } from "react";
import { Search, Trash2, Pencil, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { productService } from "../services/ProductService";
import { productLookupService } from "../services/ProductLookupService";
import { categoryService } from "../services/CategoryService";
import { Modal } from "../components/common/Modal";
import { ProductForm, type ProductFormValues } from "../components/product/ProductForm";
import type { AppSettings, Category, LookupStatus, Product } from "../types";
import { useToast } from "../hooks/useToast";

interface ProductsPageProps {
  settings: AppSettings;
  highlightProductId: string | null;
  onHighlightHandled: () => void;
}

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<LookupStatus, string> = {
  found: "Found",
  not_found: "Not Found",
  manual: "Manual",
};

export function ProductsPage({ settings, highlightProductId, onHighlightHandled }: ProductsPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<LookupStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Product | null>(null);
  const [retrying, setRetrying] = useState(false);
  const { show } = useToast();

  function reload() {
    productService.getAll().then(setProducts);
    categoryService.getAll().then(setCategories);
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (highlightProductId && products.length) {
      const found = products.find((p) => p.id === highlightProductId);
      if (found) {
        setEditing(found);
        onHighlightHandled();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightProductId, products]);

  const filtered = useMemo(() => {
    let result = [...products].sort((a, b) => (a.scanDate < b.scanDate ? 1 : -1));
    if (categoryFilter !== "all") result = result.filter((p) => p.category === categoryFilter);
    if (statusFilter !== "all") result = result.filter((p) => p.lookupStatus === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.barcode.toLowerCase().includes(q) ||
          p.productName.toLowerCase().includes(q) ||
          p.brandName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, categoryFilter, statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected product(s)? This cannot be undone.`)) return;
    await productService.bulkDelete(Array.from(selected));
    setSelected(new Set());
    reload();
    show("Selected products deleted.", "success");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    await productService.delete(id);
    reload();
  }

  async function handleEditSave(values: ProductFormValues) {
    if (!editing) return;
    if (values.barcode !== editing.barcode) {
      const clash = await productService.findByBarcode(values.barcode);
      if (clash && clash.id !== editing.id) {
        show("Another product already uses that barcode.", "error");
        return;
      }
    }
    await productService.update(editing.id, values);
    setEditing(null);
    reload();
    show("Product updated.", "success");
  }

  async function retryNotFoundLookups() {
    setRetrying(true);
    const targets = products.filter((p) => p.lookupStatus === "not_found");
    let updated = 0;
    for (const product of targets) {
      const result = await productLookupService.lookupProductByBarcode(product.barcode, "openfoodfacts");
      if (result.found) {
        await productService.update(product.id, {
          productName: result.productName ?? product.productName,
          brandName: result.brandName ?? product.brandName,
          category: result.category ?? product.category,
          subcategory: result.subcategory ?? product.subcategory,
          lookupStatus: "found",
        });
        updated++;
      }
    }
    setRetrying(false);
    reload();
    show(`Retried ${targets.length} product(s), ${updated} newly found.`, "success");
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Products</h1>
        <span className="text-sm text-slate-500">{filtered.length} of {products.length} total</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search barcode, name, or brand"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as LookupStatus | "all");
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="found">Found</option>
          <option value="manual">Manual</option>
          <option value="not_found">Not Found</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleBulkDelete}
          disabled={selected.size === 0}
          className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-30"
        >
          <Trash2 size={14} /> Delete Selected ({selected.size})
        </button>
        <button
          onClick={retryNotFoundLookups}
          disabled={retrying}
          className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50"
        >
          <RefreshCw size={14} className={retrying ? "animate-spin" : ""} /> Retry Not-Found Lookups
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Barcode</th>
              <th className="px-3 py-2">Product Name</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((p, idx) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                </td>
                <td className="px-3 py-2 text-slate-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                <td className="px-3 py-2 font-mono">{p.barcode}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{p.productName || "—"}</td>
                <td className="px-3 py-2">{p.brandName || "—"}</td>
                <td className="px-3 py-2">{p.category || "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.lookupStatus === "found"
                        ? "bg-emerald-100 text-emerald-700"
                        : p.lookupStatus === "manual"
                        ? "bg-slate-200 text-slate-600"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {STATUS_LABEL[p.lookupStatus]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(p)} className="text-slate-500 hover:text-brand-600">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="text-slate-500 hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                  No products match your filters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-slate-600">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          Page {page} of {totalPages}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {editing && (
        <Modal title="Edit Product" onClose={() => setEditing(null)}>
          <ProductForm
            initial={{
              barcode: editing.barcode,
              productName: editing.productName,
              brandName: editing.brandName,
              category: editing.category,
              subcategory: editing.subcategory,
              notes: editing.notes,
            }}
            lookupStatus={editing.lookupStatus}
            categories={categories}
            geminiApiKey={settings.geminiApiKey}
            barcodeEditable
            saveLabel="Update Product"
            onSave={handleEditSave}
            onCancel={() => setEditing(null)}
            onCategoryAdded={reload}
          />
        </Modal>
      )}
    </div>
  );
}
