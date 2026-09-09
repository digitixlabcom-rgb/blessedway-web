import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ScanLine, CheckCircle2, PenLine, Tags, ShieldCheck } from "lucide-react";
import { StatCard } from "../components/common/StatCard";
import { productService } from "../services/ProductService";
import { categoryService } from "../services/CategoryService";
import type { AppSettings, Product } from "../types";

interface DashboardPageProps {
  settings: AppSettings;
}

export function DashboardPage({ settings }: DashboardPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryCount, setCategoryCount] = useState(0);

  useEffect(() => {
    productService.getAll().then(setProducts);
    categoryService.getAll().then((cats) => setCategoryCount(cats.length));
  }, []);

  const found = products.filter((p) => p.lookupStatus === "found").length;
  const manual = products.filter((p) => p.lookupStatus === "manual" || p.lookupStatus === "not_found").length;

  return (
    <div className="space-y-6 px-4 py-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview of your scanning progress.</p>
      </div>

      <Link
        to="/scanner"
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 py-5 text-lg font-semibold text-white shadow-lg hover:bg-brand-700"
      >
        <ScanLine size={24} />
        Start Scanning
      </Link>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Products Scanned" value={products.length} icon={ScanLine} />
        <StatCard label="Found Automatically" value={found} icon={CheckCircle2} tone="success" />
        <StatCard label="Manual Entries" value={manual} icon={PenLine} tone="warning" />
        <StatCard label="Categories" value={categoryCount} icon={Tags} />
        <StatCard label="Duplicates Prevented" value={settings.duplicatesPrevented} icon={ShieldCheck} />
      </div>
    </div>
  );
}
