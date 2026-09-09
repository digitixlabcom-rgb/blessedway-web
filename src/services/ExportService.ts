import type ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getDB } from "../db/database";
import { productService } from "./ProductService";
import type { Product, LookupStatus, Category, ScanSession, AppSettings } from "../types";

const STATUS_LABEL: Record<LookupStatus, string> = {
  found: "Found",
  not_found: "Not Found",
  manual: "Manually Entered",
};

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// exceljs is a large dependency (needed only when the user actually exports),
// so it is loaded on demand rather than bundled into every page that merely
// references ExportService.
async function loadExcelJS(): Promise<typeof ExcelJS> {
  const mod = await import("exceljs");
  return mod.default;
}

// Sets a column's cell type explicitly to text so Excel never reinterprets a
// barcode as a number (which is what causes scientific notation / dropped
// leading zeros). We assign string values AND force the '@' text number
// format as a belt-and-suspenders measure.
function forceTextColumn(column: ExcelJS.Column): void {
  column.numFmt = "@";
}

function autosizeColumns(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach((column) => {
    let maxLength = (column.header ? String(column.header).length : 10) + 2;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const length = cell.value ? String(cell.value).length : 0;
      if (length > maxLength) maxLength = length;
    });
    column.width = Math.min(Math.max(maxLength, 10), 60);
  });
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, filename);
}

export class ExportService {
  async exportProducts(products: Product[], filenamePrefix = "products"): Promise<void> {
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Barcode Product Scanner";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Products", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = [
      { header: "Barcode", key: "barcode" },
      { header: "Product Name", key: "productName" },
      { header: "Brand Name", key: "brandName" },
      { header: "Category", key: "category" },
      { header: "Subcategory", key: "subcategory" },
      { header: "Lookup Status", key: "lookupStatus" },
      { header: "Notes", key: "notes" },
      { header: "Created At", key: "createdAt" },
    ];

    forceTextColumn(sheet.getColumn("barcode"));

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };

    for (const product of products) {
      const row = sheet.addRow({
        barcode: product.barcode,
        productName: product.productName,
        brandName: product.brandName,
        category: product.category,
        subcategory: product.subcategory,
        lookupStatus: STATUS_LABEL[product.lookupStatus],
        notes: product.notes,
        createdAt: new Date(product.createdAt).toLocaleString(),
      });
      // Belt-and-suspenders: force the cell type itself, not just the
      // column format, so a barcode value is never re-inferred as numeric.
      row.getCell("barcode").value = product.barcode;
      row.getCell("barcode").numFmt = "@";
    }

    autosizeColumns(sheet);

    await downloadWorkbook(workbook, `${filenamePrefix}-${timestampSuffix()}.xlsx`);
  }

  async exportPosFormat(
    products: Product[],
    fields: string[],
    filenamePrefix = "pos-import"
  ): Promise<void> {
    const FIELD_LABELS: Record<string, string> = {
      barcode: "barcode",
      product_name: "product_name",
      brand_name: "brand_name",
      category: "category",
      subcategory: "subcategory",
    };
    const FIELD_GETTERS: Record<string, (p: Product) => string> = {
      barcode: (p) => p.barcode,
      product_name: (p) => p.productName,
      brand_name: (p) => p.brandName,
      category: (p) => p.category,
      subcategory: (p) => p.subcategory,
    };

    const activeFields = fields.filter((f) => FIELD_GETTERS[f]);

    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("POS Import", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = activeFields.map((f) => ({ header: FIELD_LABELS[f], key: f }));
    if (activeFields.includes("barcode")) forceTextColumn(sheet.getColumn("barcode"));
    sheet.getRow(1).font = { bold: true };

    for (const product of products) {
      const rowData: Record<string, string> = {};
      for (const f of activeFields) rowData[f] = FIELD_GETTERS[f](product);
      const row = sheet.addRow(rowData);
      if (activeFields.includes("barcode")) {
        row.getCell("barcode").value = product.barcode;
        row.getCell("barcode").numFmt = "@";
      }
    }

    autosizeColumns(sheet);
    await downloadWorkbook(workbook, `${filenamePrefix}-${timestampSuffix()}.xlsx`);
  }

  async exportBackup(): Promise<void> {
    const db = await getDB();
    const [products, categories, sessions, settings] = await Promise.all([
      db.getAll("products"),
      db.getAll("categories"),
      db.getAll("sessions"),
      db.get("settings", "app"),
    ]);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      products,
      categories,
      sessions,
      settings,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    saveAs(blob, `barcode-scanner-backup-${timestampSuffix()}.json`);
  }

  async importBackup(file: File): Promise<{ productsImported: number; skipped: number }> {
    const text = await file.text();
    const backup = JSON.parse(text) as {
      products?: Product[];
      categories?: Category[];
      sessions?: ScanSession[];
      settings?: AppSettings;
    };

    const db = await getDB();
    let productsImported = 0;
    let skipped = 0;

    if (backup.categories?.length) {
      const tx = db.transaction("categories", "readwrite");
      for (const category of backup.categories) {
        const existing = await tx.store.index("name").get(category.name);
        if (!existing) await tx.store.put(category);
      }
      await tx.done;
    }

    if (backup.sessions?.length) {
      const tx = db.transaction("sessions", "readwrite");
      for (const session of backup.sessions) {
        await tx.store.put(session);
      }
      await tx.done;
    }

    if (backup.products?.length) {
      for (const product of backup.products) {
        const existing = await productService.findByBarcode(product.barcode);
        if (existing) {
          skipped++;
          continue;
        }
        const db2 = await getDB();
        await db2.add("products", product);
        productsImported++;
      }
    }

    if (backup.settings) {
      await db.put("settings", backup.settings);
    }

    return { productsImported, skipped };
  }
}

export const exportService = new ExportService();
