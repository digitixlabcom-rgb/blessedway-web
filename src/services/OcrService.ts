// Label OCR: a fallback for when barcode lookup finds nothing. Reads the
// product's printed label (name, size, brand) directly from a photo instead
// of leaving every field blank for the user to type from scratch. Runs
// entirely on-device (tesseract.js, WASM) — no image or text ever leaves
// the browser, so it works for the same privacy/offline reasons the rest of
// the app avoids a backend.
//
// This is inherently a best-effort guess, not a lookup: labels are printed
// in all kinds of layouts, fonts, and languages, and OCR misreads are
// common on curved/glossy packaging. The result is always presented as an
// editable draft the user reviews before saving — never auto-saved, even in
// Fast Scan mode.

const SIZE_REGEX = /\b\d+(?:\.\d+)?\s?(?:ml|mL|ML|l|L|g|G|kg|Kg|KG|oz|OZ|fl\.?\s?oz|FL\.?\s?OZ)\b/;

export interface LabelOcrResult {
  rawText: string;
  guessedProductName: string;
  guessedBrand: string;
  guessedSize: string;
  guessedCategory?: string;
  confidence: number;
  source: "gemini" | "tesseract";
}

export interface OcrLine {
  text: string;
  confidence: number;
  height: number;
}

// tesseract.js is a large dependency (WASM core + downloaded language data),
// only needed if the user actually taps "Scan Label" — loaded on demand.
async function recognize(image: HTMLCanvasElement): Promise<{
  text: string;
  confidence: number;
  lines: OcrLine[];
}> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(image);
    const lines: OcrLine[] = (data.lines ?? [])
      .map((line) => ({
        text: line.text.trim(),
        confidence: line.confidence,
        height: line.bbox.y1 - line.bbox.y0,
      }))
      .filter((line) => line.text.length > 0);
    return { text: data.text, confidence: data.confidence, lines };
  } finally {
    await worker.terminate();
  }
}

function looksLikeJustASize(text: string): boolean {
  const stripped = text.replace(SIZE_REGEX, "").trim();
  return stripped.length === 0;
}

function cleanLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Pure heuristic, split out from the actual OCR call so it can be exercised
// directly in tests against a known set of recognized lines.
export function deriveLabelGuesses(
  text: string,
  lines: OcrLine[]
): Pick<LabelOcrResult, "rawText" | "guessedProductName" | "guessedBrand" | "guessedSize"> {
  const sizeMatch = text.match(SIZE_REGEX);
  const guessedSize = sizeMatch ? sizeMatch[0].replace(/\s+/g, " ").trim() : "";

  // Heuristic: on most retail labels the brand is printed in the largest
  // type on the pack. Rank lines by their OCR bounding-box height (a proxy
  // for font size) and treat the tallest substantive line as the brand.
  const candidateLines = lines
    .filter((l) => l.text.length >= 2 && l.confidence >= 30 && !looksLikeJustASize(l.text))
    .sort((a, b) => b.height - a.height);

  const brandLine = candidateLines[0];
  const guessedBrand = brandLine ? cleanLine(brandLine.text) : "";

  // Product name: the next most prominent lines (excluding the brand line
  // and pure barcode/size text), in their original reading order, joined.
  const brandIndex = brandLine
    ? lines.findIndex((l) => l.text === brandLine.text && l.height === brandLine.height)
    : -1;

  const nameLines = candidateLines
    .filter((_, i) => candidateLines[i] !== brandLine)
    .slice(0, 3)
    .map((l) => lines.indexOf(l))
    .filter((i) => i !== brandIndex)
    .sort((a, b) => a - b)
    .map((i) => cleanLine(lines[i].text));

  let guessedProductName = nameLines.join(" ").trim();
  if (guessedSize && !guessedProductName.includes(guessedSize)) {
    guessedProductName = guessedProductName ? `${guessedProductName} ${guessedSize}` : guessedSize;
  }

  return {
    rawText: text.trim(),
    guessedProductName,
    guessedBrand,
    guessedSize,
  };
}

export async function recognizeProductLabel(image: HTMLCanvasElement): Promise<LabelOcrResult> {
  const { text, confidence, lines } = await recognize(image);
  return { ...deriveLabelGuesses(text, lines), confidence, source: "tesseract" };
}

// ---- Gemini-backed path -----------------------------------------------
//
// A vision LLM reads the label far more reliably than the line-height
// heuristic above, and can sensibly name a category too (e.g. "Skin Care"),
// but it needs a server-side API key — so this calls our own same-origin
// backend function, which is the only thing that ever holds the Gemini key.
// Never call the Gemini API directly from the browser.

const GEMINI_TIMEOUT_MS = 20000;

interface GeminiApiResponse {
  found: boolean;
  productName: string;
  brandName: string;
  category: string;
  confidence: number;
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL("image/jpeg", quality);
}

async function recognizeLabelWithGemini(
  image: HTMLCanvasElement,
  categories: string[]
): Promise<LabelOcrResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch("/api/label-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: canvasToJpegDataUrl(image), categories }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || `Gemini proxy returned ${response.status}`);
    }

    const data = (await response.json()) as GeminiApiResponse;
    if (!data.found) {
      throw new Error("Gemini could not identify the product in the photo.");
    }

    return {
      rawText: "",
      guessedProductName: data.productName,
      guessedBrand: data.brandName,
      guessedSize: "",
      guessedCategory: data.category || undefined,
      confidence: data.confidence,
      source: "gemini",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Tries Gemini first (best accuracy, needs internet + a configured backend
// key); falls back to the fully on-device Tesseract heuristic on any
// failure — missing/invalid API key, network error, timeout, or Gemini
// simply not recognizing the product — so label scanning still works
// without any backend configured at all, just with a cruder guess.
export async function recognizeLabelSmart(
  image: HTMLCanvasElement,
  categories: string[]
): Promise<LabelOcrResult> {
  try {
    return await recognizeLabelWithGemini(image, categories);
  } catch {
    return recognizeProductLabel(image);
  }
}
