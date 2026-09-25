import { useEffect, useState } from "react";
import { Plus, Pause, Play, Pencil, Trash2, Download, Check, X } from "lucide-react";
import { sessionService } from "../services/SessionService";
import { productService } from "../services/ProductService";
import { exportService } from "../services/ExportService";
import type { AppSettings, Product, ScanSession } from "../types";
import { useToast } from "../hooks/useToast";

interface SessionsPageProps {
  settings: AppSettings;
  onSettingsChange: (changes: Partial<AppSettings>) => void;
}

export function SessionsPage({ settings, onSettingsChange }: SessionsPageProps) {
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const { show } = useToast();

  function reload() {
    sessionService.getAll().then(setSessions);
    productService.getAll().then(setProducts);
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleStart() {
    const name = newName.trim() || `Session ${new Date().toLocaleDateString()}`;
    if (settings.activeSessionId) {
      await sessionService.setStatus(settings.activeSessionId, "paused");
    }
    const session = await sessionService.start(name);
    onSettingsChange({ activeSessionId: session.id });
    setNewName("");
    reload();
  }

  async function handleResume(id: string) {
    if (settings.activeSessionId && settings.activeSessionId !== id) {
      await sessionService.setStatus(settings.activeSessionId, "paused");
    }
    await sessionService.setStatus(id, "active");
    onSettingsChange({ activeSessionId: id });
    reload();
  }

  async function handlePause(id: string) {
    await sessionService.setStatus(id, "paused");
    if (settings.activeSessionId === id) onSettingsChange({ activeSessionId: null });
    reload();
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return;
    await sessionService.rename(id, editingName);
    setEditingId(null);
    reload();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this session? Products already scanned in it are kept but unassigned.")) return;
    await sessionService.remove(id);
    if (settings.activeSessionId === id) onSettingsChange({ activeSessionId: null });
    reload();
  }

  async function handleExportSession(session: ScanSession) {
    const filtered = products.filter((p) => p.sessionId === session.id);
    if (filtered.length === 0) {
      show("This session has no products yet.", "info");
      return;
    }
    await exportService.exportProducts(filtered, `session-${session.name.replace(/\s+/g, "-")}`);
  }

  async function handleExportAll() {
    if (products.length === 0) {
      show("No products to export yet.", "info");
      return;
    }
    await exportService.exportProducts(products, "all-products");
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Sessions</h1>
        <button
          onClick={handleExportAll}
          className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600"
        >
          <Download size={14} /> Export All Products
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Group scans from a single scanning batch (e.g. a store visit or inventory day). New scans are
        attached to whichever session is currently active.
      </p>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleStart()}
          placeholder="e.g. Inventory Batch - September 2026"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={handleStart}
          className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} /> Start Session
        </button>
      </div>

      <div className="space-y-3">
        {sessions.map((s) => {
          const stats = sessionService.computeStats(products, s.id);
          const isActive = settings.activeSessionId === s.id;
          return (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  {editingId === s.id ? (
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <p className="font-semibold text-slate-900">
                      {s.name} {isActive && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    Started {new Date(s.startedAt).toLocaleString()} · Status: {s.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  {editingId === s.id ? (
                    <>
                      <button onClick={() => handleRename(s.id)} className="text-emerald-600">
                        <Check size={18} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-slate-400">
                        <X size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      {isActive ? (
                        <button onClick={() => handlePause(s.id)} title="Pause" className="text-slate-500 hover:text-amber-600">
                          <Pause size={16} />
                        </button>
                      ) : (
                        <button onClick={() => handleResume(s.id)} title="Resume" className="text-slate-500 hover:text-emerald-600">
                          <Play size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingId(s.id);
                          setEditingName(s.name);
                        }}
                        className="text-slate-500 hover:text-brand-600"
                      >
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => handleExportSession(s)} className="text-slate-500 hover:text-brand-600">
                        <Download size={16} />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="text-slate-500 hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <Stat label="Scanned" value={stats.scanned} />
                <Stat label="Found" value={stats.found} />
                <Stat label="Manual" value={stats.manual} />
                <Stat label="Not Found" value={stats.notFound} />
              </div>
            </div>
          );
        })}
        {sessions.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
            No sessions yet. Start one to group your scans.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 py-2">
      <p className="font-bold text-slate-900">{value}</p>
      <p className="text-slate-500">{label}</p>
    </div>
  );
}
