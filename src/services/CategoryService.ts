import { getDB } from "../db/database";
import { newId } from "../utils/id";
import { trimField } from "../utils/validation";
import type { Category } from "../types";

export class CategoryService {
  async getAll(): Promise<Category[]> {
    const db = await getDB();
    const all = await db.getAll("categories");
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async add(name: string): Promise<Category> {
    const clean = trimField(name);
    if (!clean) throw new Error("Category name is required");

    const db = await getDB();
    const existing = await db.getFromIndex("categories", "name", clean);
    if (existing) return existing;

    const category: Category = {
      id: newId(),
      name: clean,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
    };
    await db.add("categories", category);
    return category;
  }

  async rename(id: string, name: string): Promise<void> {
    const db = await getDB();
    const category = await db.get("categories", id);
    if (!category) throw new Error("Category not found");
    const clean = trimField(name);
    if (!clean) throw new Error("Category name is required");

    const oldName = category.name;
    await db.put("categories", { ...category, name: clean });

    // Keep existing products pointed at the renamed category.
    const tx = db.transaction("products", "readwrite");
    let cursor = await tx.store.index("category").openCursor(oldName);
    while (cursor) {
      await cursor.update({ ...cursor.value, category: clean, updatedAt: new Date().toISOString() });
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async remove(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("categories", id);
  }

  async isInUse(name: string): Promise<boolean> {
    const db = await getDB();
    const count = await db.countFromIndex("products", "category", name);
    return count > 0;
  }
}

export const categoryService = new CategoryService();
