// Core domain model. Kept intentionally small (barcode + name + brand + category)
// per V1 scope, but every store is designed to accept extra optional fields later
// (SKU, prices, stock, supplier, etc.) without a schema rewrite.

export type LookupStatus = "found" | "not_found" | "manual";

export type BarcodeFormat =
  | "EAN_13"
  | "EAN_8"
  | "UPC_A"
  | "UPC_E"
  | "CODE_128"
  | "CODE_39"
  | "ITF"
  | "QR_CODE"
  | "UNKNOWN";

export interface Product {
  id: string;
  barcode: string; // always a string, always exactly as scanned/typed
  barcodeFormat?: BarcodeFormat;
  productName: string;
  brandName: string;
  category: string;
  subcategory: string;
  lookupStatus: LookupStatus;
  notes: string;
  sessionId: string | null;
  scanDate: string; // ISO timestamp of first scan
  createdAt: string;
  updatedAt: string;
  // Reserved for future POS fields (sku, costPrice, retailPrice, wholesalePrice,
  // vipPrice, stockQuantity, unit, tax, supplier, reorderLevel) — intentionally
  // left off the type until those fields are actually needed.
}

export interface Category {
  id: string;
  name: string;
  isBuiltIn: boolean;
  createdAt: string;
}

export type SessionStatus = "active" | "paused" | "completed";

export interface ScanSession {
  id: string;
  name: string;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
}

export interface LookupCacheEntry {
  barcode: string;
  result: ProductLookupResult;
  cachedAt: string;
}

export interface ProductLookupResult {
  found: boolean;
  productName?: string;
  brandName?: string;
  category?: string;
  subcategory?: string;
  source?: string;
  error?: "timeout" | "rate_limit" | "network" | "invalid" | "unknown";
}

export type ScanFeedbackMode = "fast" | "review";

export interface AppSettings {
  id: "app";
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  flashDefaultOn: boolean;
  continuousScanning: boolean;
  autoLookupEnabled: boolean;
  scanMode: ScanFeedbackMode;
  lookupProviderId: string;
  posExportFields: string[];
  activeSessionId: string | null;
  duplicatesPrevented: number;
  geminiApiKey: string;
  geminiModel: string;
}

export const DEFAULT_CATEGORIES = [
  "Grocery",
  "Beverages",
  "Dairy",
  "Bakery",
  "Snacks",
  "Confectionery",
  "Personal Care",
  "Household",
  "Cosmetics",
  "Stationery",
  "Electronics",
  "Clothing",
  "Medicines",
  "Other",
];

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app",
  soundEnabled: true,
  vibrationEnabled: true,
  flashDefaultOn: false,
  continuousScanning: true,
  autoLookupEnabled: true,
  scanMode: "review",
  lookupProviderId: "openfoodfacts",
  posExportFields: ["barcode", "product_name", "brand_name", "category"],
  activeSessionId: null,
  duplicatesPrevented: 0,
  geminiApiKey: "",
  geminiModel: "gemini-3.8-flash",
};

export interface ProductFilters {
  query?: string;
  category?: string;
  lookupStatus?: LookupStatus | "all";
  sessionId?: string | "all";
}

export interface ValidationReport {
  total: number;
  validBarcodes: number;
  missingNames: number;
  missingCategories: number;
  duplicateBarcodes: number;
  issues: { productId: string; barcode: string; reason: string }[];
}
