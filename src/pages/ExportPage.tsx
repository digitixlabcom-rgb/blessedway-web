import { useEffect, useMemo, useState } from "react";
import { Download, ShieldAlert, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { productService } from "../services/ProductService";
import { categoryService } from "../services/CategoryService";
import { exportService } from "../services/ExportService";
import type { AppSettings, Category, LookupStatus, Product } from "../types";
import { useToast } from "../hooks/useToast";

interface ExportPageProps {
  settings: AppSettings;
}

export function ExportPage({ settings }: ExportPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState<LookupStatus | "all">("all");
  const { show } = useToast();

  useEffect(() => {
    productService.getAll().then(setProducts);
    categoryService.getAll().then(setCategories);
  }, []);

  const report = useMemo(() => productService.buildValidationReport(products), [products]);
  const hasCriticalIssues = report.missingNames > 0 || report.missingCategories > 0 || report.duplicateBarcodes > 0;

  const filteredProducts = useMemo(() => {
    let result = products;
    if (filterCategory !== "all") result = result.filter((p) => p.category === filterCategory);
    if (filterStatus !== "all") result = result.filter((p) => p.lookupStatus === filterStatus);
    return result;
  }, [products, filterCategory, filterStatus]);

  function confirmIfIssues(): boolean {
    if (!hasCriticalIssues) return true;
    return confirm(
      `This export has ${report.issues.length} issue(s) (missing names, categories, or duplicate barcodes). Export anyway?`
    );
  }

  async function exportAll() {
    if (products.length === 0) return show("No products to export yet.", "info");
    if (!confirmIfIssues()) return;
    await exportService.exportProducts(products, "all-products");
    show("Export ready.", "success");
  }

  async function exportCurrentSession() {
    if (!settings.activeSessionId) return show("No active session. Start one in Sessions.", "info");
    const filtered = products.filter((p) => p.sessionId === settings.activeSessionId);
    if (filtered.length === 0) return show("The active session has no products yet.", "info");
    await exportService.exportProducts(filtered, "current-session");
    show("Export ready.", "success");
  }

  async function exportFiltered() {
    if (filteredProducts.length === 0) return show("No products match this filter.", "info");
    await exportService.exportProducts(filteredProducts, "filtered-products");
    show("Export ready.", "success");
  }

  async function exportManualEntries() {
    const manual = products.filter((p) => p.lookupStatus === "manual" || p.lookupStatus === "not_found");
    if (manual.length === 0) return show("No manual entries to export.", "info");
    await exportService.exportProducts(manual, "manual-entries");
    show("Export ready.", "success");
  }

  async function exportPos() {
    if (products.length === 0) return show("No products to export yet.", "info");
    if (!confirmIfIssues()) return;
    await exportService.exportPosFormat(products, settings.posExportFields, "pos-import");
    show("POS import file ready.", "success");
  }

  async function exportBackup() {
    await exportService.exportBackup();
    show("Backup file downloaded.", "success");
  }

  return (
    <div className="space-y-5 px-4 py-5">
      <h1 className="text-2xl font-bold text-slate-900">Export</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          {hasCriticalIssues ? (
            <ShieldAlert className="text-amber-500" size={20} />
          ) : (
            <ShieldCheck className="text-emerald-500" size={20} />
          )}
          <h2 className="font-semibold text-slate-900">Export Validation</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">Total Products: {report.total}</p>
        <ul className="mt-3 space-y-1 text-sm">
          <li className="text-emerald-700">✓ Valid barcodes: {report.validBarcodes}</li>
          <li className={report.missingNames ? "text-amber-700" : "text-slate-400"}>
            ⚠ Missing product names: {report.missingNames}
          </li>
          <li className={report.missingCategories ? "text-amber-700" : "text-slate-400"}>
            ⚠ Missing categories: {report.missingCategories}
          </li>
          <li className={report.duplicateBarcodes ? "text-amber-700" : "text-slate-400"}>
            ⚠ Duplicate barcodes: {report.duplicateBarcodes}
          </li>
        </ul>
        {report.issues.length > 0 && (
          <button
            onClick={() => setShowIssues((v) => !v)}
            className="mt-3 flex items-center gap-1 text-sm font-medium text-brand-600"
          >
            {showIssues ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Review Issues
          </button>
        )}
        {showIssues && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-2 text-xs">
            {report.issues.map((issue, i) => (
              <div key={i} className="border-b border-slate-100 py-1 last:border-0">
                <span className="font-mono">{issue.barcode || "(no barcode)"}</span> — {issue.reason}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Export Options</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <ExportButton label="Export All" sub={`${products.length} products`} onClick={exportAll} />
          <ExportButton
            label="Export Current Session"
            sub={settings.activeSessionId ? "Active session only" : "No active session"}
            onClick={exportCurrentSession}
          />
          <ExportButton
            label="Export Manual Entries"
            sub="Needs review / lookup failed"
            onClick={exportManualEntries}
          />
          <ExportButton label="Export POS Import File" sub="Configured fields only" onClick={exportPos} />
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Export Filtered Products</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
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
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as LookupStatus | "all")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="found">Found</option>
              <option value="manual">Manual</option>
              <option value="not_found">Not Found</option>
            </select>
            <button
              onClick={exportFiltered}
              className="flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Download size={14} /> Export ({filteredProducts.length})
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Backup</h2>
        <p className="mt-1 text-sm text-slate-500">
          Download a complete JSON backup of every product, category, and session — separate from the Excel
          export, meant for restoring your data if this device is lost. Restore a backup from Settings.
        </p>
        <button
          onClick={exportBackup}
          className="mt-3 flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          <Download size={14} /> Export Backup
        </button>
      </div>
    </div>
  );
}

function ExportButton({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-brand-400 hover:bg-brand-50"
    >
      <span className="text-sm font-semibold text-slate-900">{label}</span>
      <span className="text-xs text-slate-500">{sub}</span>
    </button>
  );
}
