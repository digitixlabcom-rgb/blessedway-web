import { getDB } from "../db/database";
import { newId } from "../utils/id";
import { normalizeBarcode, trimField } from "../utils/validation";
import type { Product, ProductFilters, ValidationReport } from "../types";

export interface ProductInput {
  barcode: string;
  barcodeFormat?: Product["barcodeFormat"];
  productName: string;
  brandName: string;
  category: string;
  subcategory?: string;
  lookupStatus: Product["lookupStatus"];
  notes?: string;
  sessionId: string | null;
}

export class ProductService {
  async findByBarcode(barcode: string): Promise<Product | undefined> {
    const db = await getDB();
    return db.getFromIndex("products", "barcode", normalizeBarcode(barcode));
  }

  async create(input: ProductInput): Promise<Product> {
    const db = await getDB();
    const now = new Date().toISOString();
    const product: Product = {
      id: newId(),
      barcode: normalizeBarcode(input.barcode),
      barcodeFormat: input.barcodeFormat,
      productName: trimField(input.productName),
      brandName: trimField(input.brandName),
      category: trimField(input.category),
      subcategory: trimField(input.subcategory ?? ""),
      lookupStatus: input.lookupStatus,
      notes: trimField(input.notes ?? ""),
      sessionId: input.sessionId,
      scanDate: now,
      createdAt: now,
      updatedAt: now,
    };
    await db.add("products", product);
    return product;
  }

  async update(id: string, changes: Partial<ProductInput>): Promise<Product> {
    const db = await getDB();
    const existing = await db.get("products", id);
    if (!existing) throw new Error("Product not found");

    const updated: Product = {
      ...existing,
      ...changes,
      barcode: changes.barcode ? normalizeBarcode(changes.barcode) : existing.barcode,
      productName:
        changes.productName !== undefined ? trimField(changes.productName) : existing.productName,
      brandName: changes.brandName !== undefined ? trimField(changes.brandName) : existing.brandName,
      category: changes.category !== undefined ? trimField(changes.category) : existing.category,
      subcategory:
        changes.subcategory !== undefined ? trimField(changes.subcategory) : existing.subcategory,
      notes: changes.notes !== undefined ? trimField(changes.notes) : existing.notes,
      updatedAt: new Date().toISOString(),
    };
    await db.put("products", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("products", id);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("products", "readwrite");
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  }

  async getAll(): Promise<Product[]> {
    const db = await getDB();
    return db.getAll("products");
  }

  async count(): Promise<number> {
    const db = await getDB();
    return db.count("products");
  }

  async filter(products: Product[], filters: ProductFilters): Promise<Product[]> {
    let result = products;

    if (filters.category && filters.category !== "all") {
      result = result.filter((p) => p.category === filters.category);
    }
    if (filters.lookupStatus && filters.lookupStatus !== "all") {
      result = result.filter((p) => p.lookupStatus === filters.lookupStatus);
    }
    if (filters.sessionId && filters.sessionId !== "all") {
      result = result.filter((p) => p.sessionId === filters.sessionId);
    }
    if (filters.query) {
      const q = filters.query.trim().toLowerCase();
      if (q) {
        result = result.filter(
          (p) =>
            p.barcode.toLowerCase().includes(q) ||
            p.productName.toLowerCase().includes(q) ||
            p.brandName.toLowerCase().includes(q)
        );
      }
    }
    return result;
  }

  buildValidationReport(products: Product[]): ValidationReport {
    const seenBarcodes = new Map<string, number>();
    for (const p of products) {
      seenBarcodes.set(p.barcode, (seenBarcodes.get(p.barcode) ?? 0) + 1);
    }

    const issues: ValidationReport["issues"] = [];
    let validBarcodes = 0;
    let missingNames = 0;
    let missingCategories = 0;
    let duplicateBarcodes = 0;

    for (const p of products) {
      const isDuplicate = (seenBarcodes.get(p.barcode) ?? 0) > 1;
      if (p.barcode && !isDuplicate) validBarcodes++;
      if (isDuplicate) {
        duplicateBarcodes++;
        issues.push({ productId: p.id, barcode: p.barcode, reason: "Duplicate barcode" });
      }
      if (!p.productName) {
        missingNames++;
        issues.push({ productId: p.id, barcode: p.barcode, reason: "Missing product name" });
      }
      if (!p.category) {
        missingCategories++;
        issues.push({ productId: p.id, barcode: p.barcode, reason: "Missing category" });
      }
    }

    return {
      total: products.length,
      validBarcodes,
      missingNames,
      missingCategories,
      duplicateBarcodes,
      issues,
    };
  }
}

export const productService = new ProductService();
