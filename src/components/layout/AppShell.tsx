import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ScanLine,
  Package,
  Tags,
  FolderClock,
  FileSpreadsheet,
  Settings as SettingsIcon,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/scanner", label: "Scanner", icon: ScanLine },
  { to: "/products", label: "Products", icon: Package },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/sessions", label: "Sessions", icon: FolderClock },
  { to: "/export", label: "Export", icon: FileSpreadsheet },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="hidden border-b border-slate-200 bg-white px-6 py-3 sm:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-lg font-bold text-slate-900">Barcode Product Scanner</span>
          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 pb-20 sm:pb-6">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-slate-200 bg-white py-1.5 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] sm:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-medium ${
                isActive ? "text-brand-600" : "text-slate-500"
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
