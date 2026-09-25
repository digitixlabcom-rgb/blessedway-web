import { useState } from "react";
import { Modal } from "../common/Modal";
import { isValidBarcode } from "../../utils/validation";

interface ManualBarcodeModalProps {
  onSubmit: (barcode: string) => void;
  onClose: () => void;
}

export function ManualBarcodeModal({ onSubmit, onClose }: ManualBarcodeModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!isValidBarcode(value)) {
      setError("Enter a valid barcode.");
      return;
    }
    onSubmit(value.trim());
  }

  return (
    <Modal title="Enter Barcode Manually" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        Use this if the camera can't read the barcode — for example a damaged or reflective label.
      </p>
      <input
        autoFocus
        type="text"
        inputMode="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="e.g. 0123456789012"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        className="mt-4 w-full rounded-lg bg-brand-600 py-3 text-base font-semibold text-white hover:bg-brand-700"
      >
        Continue
      </button>
    </Modal>
  );
}
