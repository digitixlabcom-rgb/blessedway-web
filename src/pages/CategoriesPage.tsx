import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { categoryService } from "../services/CategoryService";
import { productService } from "../services/ProductService";
import type { Category } from "../types";
import { useToast } from "../hooks/useToast";

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const { show } = useToast();

  function reload() {
    categoryService.getAll().then(setCategories);
    productService.getAll().then((products) => {
      const map: Record<string, number> = {};
      for (const p of products) map[p.category] = (map[p.category] ?? 0) + 1;
      setCounts(map);
    });
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleAdd() {
    if (!newName.trim()) return;
    await categoryService.add(newName);
    setNewName("");
    reload();
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return;
    await categoryService.rename(id, editingName);
    setEditingId(null);
    reload();
    show("Category renamed.", "success");
  }

  async function handleDelete(category: Category) {
    const inUse = await categoryService.isInUse(category.name);
    if (inUse) {
      show(`"${category.name}" is used by ${counts[category.name] ?? 0} product(s). Reassign them first.`, "error");
      return;
    }
    if (!confirm(`Delete category "${category.name}"?`)) return;
    await categoryService.remove(category.id);
    reload();
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
      <p className="text-sm text-slate-500">
        Manage the category list used when saving products. Categories in use by products can't be deleted
        until reassigned.
      </p>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="New category name"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-4 py-3">
            {editingId === c.id ? (
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                autoFocus
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            ) : (
              <div>
                <p className="font-medium text-slate-900">{c.name}</p>
                <p className="text-xs text-slate-500">{counts[c.name] ?? 0} product(s)</p>
              </div>
            )}
            <div className="flex gap-2">
              {editingId === c.id ? (
                <>
                  <button onClick={() => handleRename(c.id)} className="text-emerald-600">
                    <Check size={18} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400">
                    <X size={18} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditingName(c.name);
                    }}
                    className="text-slate-500 hover:text-brand-600"
                  >
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(c)} className="text-slate-500 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
