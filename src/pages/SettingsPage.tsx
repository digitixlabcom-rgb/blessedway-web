import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { productLookupService, LOOKUP_PROVIDERS } from "../services/ProductLookupService";
import { exportService } from "../services/ExportService";
import { getDB, ensureSeedData } from "../db/database";
import { DEFAULT_SETTINGS } from "../types";
import type { AppSettings } from "../types";
import { useToast } from "../hooks/useToast";

interface SettingsPageProps {
  settings: AppSettings;
  onChange: (changes: Partial<AppSettings>) => void;
}

const KNOWN_TEST_BARCODE = "3017620422003"; // widely stocked product, used only to verify connectivity

export function SettingsPage({ settings, onChange }: SettingsPageProps) {
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [geminiTestStatus, setGeminiTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { show } = useToast();

  async function testGeminiKey() {
    const key = settings.geminiApiKey.trim();
    if (!key) {
      show("Enter a Gemini API key first.", "info");
      return;
    }
    setGeminiTestStatus("testing");
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
      );
      setGeminiTestStatus(response.ok ? "ok" : "fail");
    } catch {
      setGeminiTestStatus("fail");
    }
  }

  async function testConnection() {
    setTestStatus("testing");
    try {
      const result = await productLookupService.lookupProductByBarcode(KNOWN_TEST_BARCODE, settings.lookupProviderId);
      setTestStatus(result.error ? "fail" : "ok");
    } catch {
      setTestStatus("fail");
    }
  }

  async function handleRestoreFile(file: File) {
    try {
      const result = await exportService.importBackup(file);
      show(`Restored ${result.productsImported} product(s), skipped ${result.skipped} existing.`, "success");
    } catch {
      show("Could not read that backup file.", "error");
    }
  }

  async function handleClearAll() {
    const first = confirm(
      "This permanently deletes every scanned product, category, session, and cached lookup on this device. This cannot be undone. Continue?"
    );
    if (!first) return;
    const second = confirm("Are you absolutely sure? Export a backup first if you're not certain.");
    if (!second) return;

    const db = await getDB();
    await Promise.all([
      db.clear("products"),
      db.clear("categories"),
      db.clear("sessions"),
      db.clear("lookupCache"),
    ]);
    await db.put("settings", DEFAULT_SETTINGS);
    await ensureSeedData();
    onChange(DEFAULT_SETTINGS);
    show("All local data cleared.", "success");
  }

  return (
    <div className="space-y-5 px-4 py-5">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <Section title="Product Lookup">
        <Row label="Provider">
          <select
            value={settings.lookupProviderId}
            onChange={(e) => onChange({ lookupProviderId: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            {LOOKUP_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Automatic lookup on scan">
          <Toggle checked={settings.autoLookupEnabled} onChange={(v) => onChange({ autoLookupEnabled: v })} />
        </Row>
        <Row label="Connection status">
          <button
            onClick={testConnection}
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600"
          >
            {testStatus === "testing" && <Loader2 size={14} className="animate-spin" />}
            {testStatus === "ok" && <CheckCircle2 size={14} className="text-emerald-600" />}
            {testStatus === "fail" && <XCircle size={14} className="text-red-600" />}
            Test Connection
          </button>
        </Row>
      </Section>

      <Section title="AI Label Reader">
        <p className="text-sm text-slate-500">
          Optional. When set, "Scan Product Label" uses Google Gemini to read the product name, brand,
          and category from a photo — far more accurate than the built-in offline reader it falls back
          to otherwise. The key is saved only on this device and sent only to Google, never anywhere
          else.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showGeminiKey ? "text" : "password"}
              value={settings.geminiApiKey}
              onChange={(e) => onChange({ geminiApiKey: e.target.value })}
              placeholder="Paste your Gemini API key"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            >
              {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            onClick={testGeminiKey}
            className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600"
          >
            {geminiTestStatus === "testing" && <Loader2 size={14} className="animate-spin" />}
            {geminiTestStatus === "ok" && <CheckCircle2 size={14} className="text-emerald-600" />}
            {geminiTestStatus === "fail" && <XCircle size={14} className="text-red-600" />}
            Test Key
          </button>
        </div>
        <a
          href="https://aistudio.google.com/app/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-brand-600"
        >
          Get a free key at aistudio.google.com/app/apikey →
        </a>
      </Section>

      <Section title="Scanner">
        <Row label="Sound on detect">
          <Toggle checked={settings.soundEnabled} onChange={(v) => onChange({ soundEnabled: v })} />
        </Row>
        <Row label="Vibration on detect">
          <Toggle checked={settings.vibrationEnabled} onChange={(v) => onChange({ vibrationEnabled: v })} />
        </Row>
        <Row label="Flash on by default">
          <Toggle checked={settings.flashDefaultOn} onChange={(v) => onChange({ flashDefaultOn: v })} />
        </Row>
        <Row label="Continuous scanning">
          <Toggle checked={settings.continuousScanning} onChange={(v) => onChange({ continuousScanning: v })} />
        </Row>
        <Row label="Scan mode">
          <select
            value={settings.scanMode}
            onChange={(e) => onChange({ scanMode: e.target.value as AppSettings["scanMode"] })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="review">Review Before Save</option>
            <option value="fast">Fast Scan Mode</option>
          </select>
        </Row>
      </Section>

      <Section title="Categories">
        <Link to="/categories" className="text-sm font-medium text-brand-600">
          Manage categories →
        </Link>
      </Section>

      <Section title="Export">
        <p className="text-sm text-slate-500">POS import file includes these fields, in order:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["barcode", "product_name", "brand_name", "category", "subcategory"].map((field) => {
            const active = settings.posExportFields.includes(field);
            return (
              <button
                key={field}
                onClick={() => {
                  const next = active
                    ? settings.posExportFields.filter((f) => f !== field)
                    : [...settings.posExportFields, field];
                  onChange({ posExportFields: next });
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {field}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Data">
        <Row label="Backup data">
          <Link to="/export" className="text-sm font-medium text-brand-600">
            Go to Export →
          </Link>
        </Row>
        <Row label="Restore from backup">
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleRestoreFile(e.target.files[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600"
            >
              Choose File…
            </button>
          </>
        </Row>
        <Row label="Clear all local data">
          <button
            onClick={handleClearAll}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600"
          >
            Clear Data
          </button>
        </Row>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-700">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-slate-300"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
