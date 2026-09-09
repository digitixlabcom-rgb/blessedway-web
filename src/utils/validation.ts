// Barcode is treated as a plain string identifier everywhere in this app.
// Never coerce it to a number — that is exactly what causes Excel to show
// scientific notation and drop leading zeros.

export function normalizeBarcode(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

export function isValidBarcode(raw: string): boolean {
  const value = normalizeBarcode(raw);
  if (value.length < 3 || value.length > 48) return false;
  // Retail barcodes are digits; Code 39/128 can include letters and a few symbols.
  return /^[A-Za-z0-9\-._$/+% ]+$/.test(value);
}

export function trimField(value: string): string {
  return value.trim();
}
