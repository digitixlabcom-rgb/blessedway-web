import { Modal } from "../common/Modal";
import type { Product } from "../../types";

interface DuplicateModalProps {
  existing: Product;
  onView: () => void;
  onUpdate: () => void;
  onCancel: () => void;
}

export function DuplicateModal({ existing, onView, onUpdate, onCancel }: DuplicateModalProps) {
  return (
    <Modal title="Barcode Already Scanned" onClose={onCancel}>
      <p className="text-sm text-slate-600">This barcode already exists in your product list.</p>

      <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
        <Row label="Barcode" value={existing.barcode} mono />
        <Row label="Product" value={existing.productName || "—"} />
        <Row label="Brand" value={existing.brandName || "—"} />
        <Row label="Category" value={existing.category || "—"} />
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button
          onClick={onView}
          className="rounded-lg border border-slate-300 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          View Existing Product
        </button>
        <button
          onClick={onUpdate}
          className="rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Update Existing Product
        </button>
        <button onClick={onCancel} className="rounded-lg py-3 text-sm font-medium text-slate-500">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
