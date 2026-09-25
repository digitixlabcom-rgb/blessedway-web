import { getDB } from "../db/database";
import type { ProductLookupResult } from "../types";
import { normalizeBarcode } from "../utils/validation";

// ---- Provider abstraction -------------------------------------------------
//
// The app must never be hard-wired to one lookup provider. Every provider
// implements this interface; ProductLookupService only ever talks to the
// interface, so a new provider (a different free API, or a paid one behind
// a backend proxy) can be dropped in from Settings without touching any
// screen or component.

export interface LookupProvider {
  id: string;
  name: string;
  requiresBackend: boolean;
  lookup(barcode: string, signal: AbortSignal): Promise<ProductLookupResult>;
}

function titleCase(input: string): string {
  return input
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Open Food Facts: free, open, no API key required, works directly from the
// browser (CORS-enabled). Strongest for groceries/food/beverages; many
// non-food retail barcodes will legitimately come back "not found" and fall
// through to manual entry, which is expected per the spec.
export class OpenFoodFactsProvider implements LookupProvider {
  id = "openfoodfacts";
  name = "Open Food Facts";
  requiresBackend = false;

  async lookup(barcode: string, signal: AbortSignal): Promise<ProductLookupResult> {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
      barcode
    )}.json?fields=product_name,brands,categories_tags,categories`;

    const response = await fetch(url, { signal });

    if (response.status === 429) {
      return { found: false, error: "rate_limit" };
    }
    if (!response.ok) {
      return { found: false, error: "network" };
    }

    const data = await response.json();
    if (data.status !== 1 || !data.product) {
      return { found: false, source: this.id };
    }

    const product = data.product as {
      product_name?: string;
      brands?: string;
      categories_tags?: string[];
      categories?: string;
    };

    if (!product.product_name) {
      return { found: false, source: this.id };
    }

    const firstCategoryTag = product.categories_tags?.[0];
    const suggestedCategory = firstCategoryTag
      ? titleCase(firstCategoryTag.replace(/^[a-z]{2}:/, ""))
      : undefined;
    const secondCategoryTag = product.categories_tags?.[1];
    const suggestedSubcategory = secondCategoryTag
      ? titleCase(secondCategoryTag.replace(/^[a-z]{2}:/, ""))
      : undefined;

    return {
      found: true,
      productName: product.product_name,
      brandName: product.brands?.split(",")[0]?.trim(),
      category: suggestedCategory,
      subcategory: suggestedSubcategory,
      source: this.id,
    };
  }
}

// Placeholder for a provider that needs a secret API key. Per the security
// requirement, the key must live server-side; this calls a backend proxy
// endpoint (configurable in Settings) rather than the provider directly.
// Disabled until a backend base URL is configured.
export class BackendProxyProvider implements LookupProvider {
  id = "backend-proxy";
  name = "Custom Backend Provider";
  requiresBackend = true;

  constructor(private baseUrl: string) {}

  async lookup(barcode: string, signal: AbortSignal): Promise<ProductLookupResult> {
    if (!this.baseUrl) {
      return { found: false, error: "unknown" };
    }
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/lookup/${encodeURIComponent(barcode)}`,
      { signal }
    );
    if (response.status === 429) return { found: false, error: "rate_limit" };
    if (!response.ok) return { found: false, error: "network" };
    const data = await response.json();
    return data as ProductLookupResult;
  }
}

export const LOOKUP_PROVIDERS: LookupProvider[] = [new OpenFoodFactsProvider()];

export function getProviderById(id: string): LookupProvider {
  return LOOKUP_PROVIDERS.find((p) => p.id === id) ?? LOOKUP_PROVIDERS[0];
}

const LOOKUP_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface LookupOutcome extends ProductLookupResult {
  cached: boolean;
}

export class ProductLookupService {
  async lookupProductByBarcode(
    barcode: string,
    providerId: string
  ): Promise<LookupOutcome> {
    const normalized = normalizeBarcode(barcode);

    const cached = await this.getCached(normalized);
    if (cached) {
      return { ...cached, cached: true };
    }

    const provider = getProviderById(providerId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

    try {
      const result = await provider.lookup(normalized, controller.signal);
      if (result.found) {
        await this.setCached(normalized, result);
      }
      return { ...result, cached: false };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { found: false, error: "timeout", cached: false };
      }
      return { found: false, error: "network", cached: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getCached(barcode: string): Promise<ProductLookupResult | null> {
    const db = await getDB();
    const entry = await db.get("lookupCache", barcode);
    if (!entry) return null;
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return entry.result;
  }

  private async setCached(barcode: string, result: ProductLookupResult): Promise<void> {
    const db = await getDB();
    await db.put("lookupCache", {
      barcode,
      result,
      cachedAt: new Date().toISOString(),
    });
  }

  async clearCache(): Promise<void> {
    const db = await getDB();
    await db.clear("lookupCache");
  }
}

export const productLookupService = new ProductLookupService();
