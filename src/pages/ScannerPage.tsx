import { useCallback, useEffect, useRef, useState } from "react";
import { WifiOff, CheckCircle2 } from "lucide-react";
import { Scanner } from "../components/scanner/Scanner";
import { ManualBarcodeModal } from "../components/scanner/ManualBarcodeModal";
import { Modal } from "../components/common/Modal";
import { ProductForm, type ProductFormValues } from "../components/product/ProductForm";
import { DuplicateModal } from "../components/product/DuplicateModal";
import { productService } from "../services/ProductService";
import { productLookupService } from "../services/ProductLookupService";
import { categoryService } from "../services/CategoryService";
import type { BarcodeFormat, Category, LookupStatus, Product } from "../types";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useToast } from "../hooks/useToast";
import type { DecodedBarcode } from "../services/BarcodeService";
import type { AppSettings } from "../types";

interface ScannerPageProps {
  settings: AppSettings;
  onProductSaved: () => void;
  onOpenProduct: (product: Product) => void;
  onSettingsChange: (changes: Partial<AppSettings>) => void;
}

type FlowState =
  | { kind: "scanning" }
  | { kind: "looking_up"; barcode: string }
  | { kind: "duplicate"; existing: Product; scanned: DecodedBarcode }
  | {
      kind: "form";
      values: ProductFormValues;
      lookupStatus: LookupStatus;
      barcodeFormat?: BarcodeFormat;
      updateExistingId?: string;
    }
  | { kind: "manual_barcode" }
  | { kind: "fast_confirm"; product: Product };

const EMPTY_FORM: ProductFormValues = {
  barcode: "",
  productName: "",
  brandName: "",
  category: "",
  subcategory: "",
  notes: "",
};

export function ScannerPage({ settings, onProductSaved, onOpenProduct, onSettingsChange }: ScannerPageProps) {
  const [flow, setFlow] = useState<FlowState>({ kind: "scanning" });
  const [categories, setCategories] = useState<Category[]>([]);
  const processingRef = useRef(false);
  const online = useOnlineStatus();
  const { show } = useToast();

  const loadCategories = useCallback(() => {
    categoryService.getAll().then(setCategories);
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const resetToScanning = useCallback(() => {
    processingRef.current = false;
    setFlow({ kind: "scanning" });
  }, []);

  const runLookupAndOpenForm = useCallback(
    async (decoded: DecodedBarcode) => {
      const barcode = decoded.text.trim();

      if (!online || !settings.autoLookupEnabled) {
        if (!online) {
          show("Offline — barcode scanned, enter product info manually.", "info");
        }
        setFlow({
          kind: "form",
          values: { ...EMPTY_FORM, barcode },
          lookupStatus: "manual",
          barcodeFormat: decoded.format,
        });
        return;
      }

      setFlow({ kind: "looking_up", barcode });
      const result = await productLookupService.lookupProductByBarcode(
        barcode,
        settings.lookupProviderId
      );

      if (result.error === "timeout") {
        show("Product lookup timed out. Enter details manually or retry.", "error");
      } else if (result.error === "rate_limit") {
        show("Lookup service is rate-limited right now. Enter details manually.", "error");
      } else if (result.error === "network") {
        show("Could not reach the lookup service. Enter details manually.", "error");
      }

      if (result.found) {
        const values: ProductFormValues = {
          barcode,
          productName: result.productName ?? "",
          brandName: result.brandName ?? "",
          category: result.category ?? "",
          subcategory: result.subcategory ?? "",
          notes: "",
        };

        if (settings.scanMode === "fast" && values.productName) {
          const saved = await productService.create({
            barcode,
            barcodeFormat: decoded.format,
            productName: values.productName,
            brandName: values.brandName,
            category: values.category || "Other",
            subcategory: values.subcategory,
            lookupStatus: "found",
            sessionId: settings.activeSessionId,
          });
          onProductSaved();
          setFlow({ kind: "fast_confirm", product: saved });
          setTimeout(resetToScanning, 1400);
          return;
        }

        setFlow({ kind: "form", values, lookupStatus: "found", barcodeFormat: decoded.format });
        return;
      }

      setFlow({
        kind: "form",
        values: { ...EMPTY_FORM, barcode },
        lookupStatus: "not_found",
        barcodeFormat: decoded.format,
      });
    },
    [online, settings, show, onProductSaved, resetToScanning]
  );

  const handleDecode = useCallback(
    async (decoded: DecodedBarcode) => {
      if (processingRef.current) return;
      processingRef.current = true;

      const barcode = decoded.text.trim();
      if (!barcode) {
        show("Invalid barcode detected. Please scan again.", "error");
        processingRef.current = false;
        return;
      }

      const existing = await productService.findByBarcode(barcode);
      if (existing) {
        onSettingsChange({ duplicatesPrevented: settings.duplicatesPrevented + 1 });
        setFlow({ kind: "duplicate", existing, scanned: decoded });
        return;
      }

      await runLookupAndOpenForm(decoded);
    },
    [runLookupAndOpenForm, show, onSettingsChange, settings.duplicatesPrevented]
  );

  async function handleManualBarcode(barcode: string) {
    const existing = await productService.findByBarcode(barcode);
    processingRef.current = true;
    if (existing) {
      onSettingsChange({ duplicatesPrevented: settings.duplicatesPrevented + 1 });
      setFlow({ kind: "duplicate", existing, scanned: { text: barcode, format: "UNKNOWN" } });
      return;
    }
    await runLookupAndOpenForm({ text: barcode, format: "UNKNOWN" });
  }

  async function handleSaveForm(values: ProductFormValues) {
    if (flow.kind !== "form") return;

    if (flow.updateExistingId) {
      await productService.update(flow.updateExistingId, {
        ...values,
        lookupStatus: flow.lookupStatus,
      });
      show("Product updated.", "success");
    } else {
      await productService.create({
        ...values,
        barcodeFormat: flow.barcodeFormat,
        lookupStatus: flow.lookupStatus,
        sessionId: settings.activeSessionId,
      });
      show("Product saved.", "success");
    }
    onProductSaved();
    resetToScanning();
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
      {!online && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <WifiOff size={16} />
          Offline — scanning and saving still work; lookup is paused.
        </div>
      )}

      <Scanner
        active={flow.kind === "scanning" || flow.kind === "looking_up"}
        soundEnabled={settings.soundEnabled}
        vibrationEnabled={settings.vibrationEnabled}
        onDecode={handleDecode}
        onManualEntry={() => setFlow({ kind: "manual_barcode" })}
      />

      <p className="text-center text-xs text-slate-500">
        Mode: <span className="font-semibold">{settings.scanMode === "fast" ? "Fast Scan" : "Review Before Save"}</span>{" "}
        — change this in Settings.
      </p>

      {flow.kind === "looking_up" && (
        <div className="rounded-lg bg-slate-100 px-4 py-3 text-center text-sm text-slate-600">
          Looking up {flow.barcode}…
        </div>
      )}

      {flow.kind === "fast_confirm" && (
        <div className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-xl bg-emerald-600 p-4 text-white shadow-xl sm:bottom-6">
          <div className="flex items-center gap-2 font-mono text-sm">
            <CheckCircle2 size={18} />
            {flow.product.barcode}
          </div>
          <p className="mt-1 text-lg font-bold">{flow.product.productName}</p>
          <p className="text-sm text-emerald-100">
            {flow.product.brandName} · {flow.product.category}
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide">Saved — ready for next scan…</p>
        </div>
      )}

      {flow.kind === "manual_barcode" && (
        <ManualBarcodeModal
          onSubmit={(barcode) => {
            setFlow({ kind: "scanning" });
            handleManualBarcode(barcode);
          }}
          onClose={() => setFlow({ kind: "scanning" })}
        />
      )}

      {flow.kind === "duplicate" && (
        <DuplicateModal
          existing={flow.existing}
          onView={() => {
            onOpenProduct(flow.existing);
            resetToScanning();
          }}
          onUpdate={() => {
            setFlow({
              kind: "form",
              values: {
                barcode: flow.existing.barcode,
                productName: flow.existing.productName,
                brandName: flow.existing.brandName,
                category: flow.existing.category,
                subcategory: flow.existing.subcategory,
                notes: flow.existing.notes,
              },
              lookupStatus: flow.existing.lookupStatus,
              updateExistingId: flow.existing.id,
            });
          }}
          onCancel={resetToScanning}
        />
      )}

      {flow.kind === "form" && (
        <Modal title={flow.updateExistingId ? "Update Product" : "Confirm Product"} onClose={resetToScanning}>
          <ProductForm
            initial={flow.values}
            lookupStatus={flow.lookupStatus}
            categories={categories}
            saveLabel={flow.updateExistingId ? "Update Product" : "Save Product"}
            onSave={handleSaveForm}
            onCancel={resetToScanning}
            onCategoryAdded={loadCategories}
          />
        </Modal>
      )}
    </div>
  );
}
