import { useEffect, useState } from "react";
import { ScanText } from "lucide-react";
import type { Category, LookupStatus } from "../../types";
import { categoryService } from "../../services/CategoryService";
import { isValidBarcode } from "../../utils/validation";
import { LabelOcrCapture } from "../scanner/LabelOcrCapture";
import type { LabelOcrResult } from "../../services/OcrService";
import { useToast } from "../../hooks/useToast";

export interface ProductFormValues {
  barcode: string;
  productName: string;
  brandName: string;
  category: string;
  subcategory: string;
  notes: string;
}

interface ProductFormProps {
  initial: ProductFormValues;
  lookupStatus: LookupStatus;
  categories: Category[];
  barcodeEditable?: boolean;
  saveLabel?: string;
  onSave: (values: ProductFormValues) => void;
  onCancel: () => void;
  onCategoryAdded?: () => void;
  extraActions?: React.ReactNode;
}

const STATUS_BANNER: Record<LookupStatus, { text: string; className: string }> = {
  found: { text: "Product Found", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  not_found: {
    text: "Product not found — please enter details manually",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
  manual: { text: "Manual Entry", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

export function ProductForm({
  initial,
  lookupStatus,
  categories,
  barcodeEditable = false,
  saveLabel = "Save Product",
  onSave,
  onCancel,
  onCategoryAdded,
  extraActions,
}: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showLabelScanner, setShowLabelScanner] = useState(false);
  const [lastOcrText, setLastOcrText] = useState<string | null>(null);
  const { show } = useToast();

  // A lookup provider may suggest a category that isn't in the user's list
  // yet (e.g. "Confectioneries" from an external taxonomy). Register it so
  // it shows up as selected instead of silently falling back to blank.
  useEffect(() => {
    const suggested = initial.category.trim();
    if (!suggested) return;
    if (categories.some((c) => c.name === suggested)) return;
    categoryService.add(suggested).then(() => onCategoryAdded?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const banner = STATUS_BANNER[lookupStatus];

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    await categoryService.add(name);
    set("category", name);
    setNewCategoryName("");
    setAddingCategory(false);
    onCategoryAdded?.();
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!isValidBarcode(values.barcode)) next.barcode = "Enter a valid barcode.";
    if (!values.productName.trim()) next.productName = "Product name is required.";
    if (!values.category.trim()) next.category = "Select or add a category.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleLabelResult(result: LabelOcrResult) {
    setShowLabelScanner(false);
    setLastOcrText(result.rawText || null);

    // Compute what to fill from the current (closure) snapshot of values —
    // not inside the setValues updater. React doesn't guarantee a function
    // updater runs synchronously before the next line, so mutating outer
    // variables from inside one (as this used to do) reads back stale/empty
    // results here even though the state update itself lands correctly.
    const filled: string[] = [];
    const next = { ...values };
    if (!next.productName.trim() && result.guessedProductName) {
      next.productName = result.guessedProductName;
      filled.push("product name");
    }
    if (!next.brandName.trim() && result.guessedBrand) {
      next.brandName = result.guessedBrand;
      filled.push("brand");
    }
    let categoryToApply: string | null = null;
    if (!next.category.trim() && result.guessedCategory) {
      next.category = result.guessedCategory;
      categoryToApply = result.guessedCategory;
      filled.push("category");
    }
    setValues(next);

    if (categoryToApply && !categories.some((c) => c.name === categoryToApply)) {
      await categoryService.add(categoryToApply);
      onCategoryAdded?.();
    }

    if (!result.guessedProductName && !result.guessedBrand) {
      show("Couldn't make out the label clearly — see the scanned text below and fill in manually.", "info");
    } else if (filled.length === 0) {
      show("Those fields were already filled — see the scanned text below if you want to copy from it.", "info");
    } else {
      const sourceLabel = result.source === "gemini" ? "the label" : "the label (offline reading)";
      show(`Filled ${filled.join(", ")} from ${sourceLabel}. Please double-check before saving.`, "success");
    }
  }

  function handleSubmit() {
    if (!validate()) return;
    onSave({
      barcode: values.barcode.trim(),
      productName: values.productName.trim(),
      brandName: values.brandName.trim(),
      category: values.category.trim(),
      subcategory: values.subcategory.trim(),
      notes: values.notes.trim(),
    });
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${banner.className}`}>
        {banner.text}
      </div>

      {lookupStatus !== "found" && (
        <button
          type="button"
          onClick={() => setShowLabelScanner(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-300 bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
        >
          <ScanText size={16} />
          Scan Product Label (fill name, brand &amp; category from a photo)
        </button>
      )}

      {lastOcrText && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1 font-semibold uppercase text-slate-400">Text read from label</p>
          <p className="whitespace-pre-wrap">{lastOcrText}</p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500">Barcode</label>
        <input
          type="text"
          value={values.barcode}
          disabled={!barcodeEditable}
          onChange={(e) => set("barcode", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base disabled:bg-slate-100"
        />
        {errors.barcode && <p className="mt-1 text-xs text-red-600">{errors.barcode}</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500">Product Name</label>
        <input
          type="text"
          value={values.productName}
          onChange={(e) => set("productName", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          placeholder="e.g. Cooking Oil 1L"
        />
        {errors.productName && <p className="mt-1 text-xs text-red-600">{errors.productName}</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500">Brand</label>
        <input
          type="text"
          value={values.brandName}
          onChange={(e) => set("brandName", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          placeholder="e.g. ABC"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500">Category</label>
        {!addingCategory ? (
          <div className="mt-1 flex gap-2">
            <select
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAddingCategory(true)}
              className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              + New
            </button>
          </div>
        ) : (
          <div className="mt-1 flex gap-2">
            <input
              autoFocus
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="whitespace-nowrap rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAddingCategory(false)}
              className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-500"
            >
              Cancel
            </button>
          </div>
        )}
        {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category}</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500">Subcategory (optional)</label>
        <input
          type="text"
          value={values.subcategory}
          onChange={(e) => set("subcategory", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase text-slate-500">Notes (optional)</label>
        <textarea
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 rounded-lg bg-brand-600 py-3 text-base font-semibold text-white hover:bg-brand-700"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-3 text-base font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      {extraActions}

      {showLabelScanner && (
        <LabelOcrCapture
          categories={categories.map((c) => c.name)}
          onResult={handleLabelResult}
          onClose={() => setShowLabelScanner(false)}
        />
      )}
    </div>
  );
}
