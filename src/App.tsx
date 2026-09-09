import { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ensureSeedData } from "./db/database";
import { settingsService } from "./services/SettingsService";
import type { AppSettings, Product } from "./types";
import { DashboardPage } from "./pages/DashboardPage";

// Code-split the heavier pages (camera/barcode library, spreadsheet export)
// so the initial dashboard load stays light on mobile.
const ScannerPage = lazy(() => import("./pages/ScannerPage").then((m) => ({ default: m.ScannerPage })));
const ProductsPage = lazy(() => import("./pages/ProductsPage").then((m) => ({ default: m.ProductsPage })));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage").then((m) => ({ default: m.CategoriesPage })));
const SessionsPage = lazy(() => import("./pages/SessionsPage").then((m) => ({ default: m.SessionsPage })));
const ExportPage = lazy(() => import("./pages/ExportPage").then((m) => ({ default: m.ExportPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

function PageFallback() {
  return <div className="px-4 py-10 text-center text-sm text-slate-400">Loading…</div>;
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [highlightProductId, setHighlightProductId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    ensureSeedData().then(() => {
      settingsService.get().then(setSettings);
    });
  }, []);

  async function updateSettings(changes: Partial<AppSettings>) {
    const updated = await settingsService.update(changes);
    setSettings(updated);
  }

  function openProduct(product: Product) {
    setHighlightProductId(product.id);
    navigate("/products");
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage settings={settings} />} />
          <Route
            path="scanner"
            element={
              <ScannerPage
                settings={settings}
                onProductSaved={() => {}}
                onOpenProduct={openProduct}
                onSettingsChange={updateSettings}
              />
            }
          />
          <Route
            path="products"
            element={
              <ProductsPage
                settings={settings}
                highlightProductId={highlightProductId}
                onHighlightHandled={() => setHighlightProductId(null)}
              />
            }
          />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="sessions" element={<SessionsPage settings={settings} onSettingsChange={updateSettings} />} />
          <Route path="export" element={<ExportPage settings={settings} />} />
          <Route path="settings" element={<SettingsPage settings={settings} onChange={updateSettings} />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
