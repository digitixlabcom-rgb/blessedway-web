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
  geminiError?: string;
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
// heuristic above, and can sensibly name a category too (e.g. "Skin Care").
//
// This calls Google's Gemini API directly from the browser using an API key
// the user enters in Settings and that is stored only in this device's local
// database — never bundled into the app or sent anywhere but Google. That is
// a deliberate departure from routing keyed providers through a backend: this
// app has exactly one user (the shop owner running it on their own phone),
// so there is no key to leak to other users the way there would be for a
// multi-tenant public app. Don't reuse this pattern for a shared deployment.

const GEMINI_TIMEOUT_MS = 20000;
const GEMINI_MODEL = "gemini-2.0-flash";

interface GeminiApiResponse {
  found: boolean;
  productName: string;
  brandName: string;
  category: string;
  confidence: number;
}

interface GeminiRawResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

function buildLabelPrompt(categories: string[]): string {
  const categoryGuidance = categories.length
    ? `Prefer one of these existing categories if it reasonably fits: ${categories.join(
        ", "
      )}. If none fit well, propose a short, common retail category name instead.`
    : 'Propose a short, common retail category name (e.g. "Skin Care", "Snacks", "Beverages").';

  return [
    "You are reading a photograph of a single retail product's label or packaging for a point-of-sale inventory system.",
    "Identify:",
    '- the product\'s full commercial name, including its printed size or weight if visible (e.g. "2 in 1 Cleanser & Toner 200ml")',
    "- the brand name",
    "- the single best-fitting product category",
    categoryGuidance,
    "If you cannot identify the product from the image at all, set found to false and leave the other fields as empty strings.",
    "Respond only with JSON matching this shape: " +
      '{"found": boolean, "product_name": string, "brand": string, "category": string, "confidence": number between 0 and 1}.',
  ].join(" ");
}

// Phone rear cameras routinely ignore a getUserMedia "ideal" resolution
// hint and hand back their native resolution instead (often well above
// 4000px on the long edge on modern hardware). A vision LLM gains nothing
// from that — it downsamples internally regardless — but the resulting
// multi-megabyte base64 payload can exceed a serverless function's request
// body size limit, which fails as an opaque platform-level 500 before our
// own error handling ever runs. Downscale before sending to Gemini.
const GEMINI_MAX_DIMENSION = 1600;

function toGeminiJpegDataUrl(canvas: HTMLCanvasElement, quality = 0.82): string {
  const longestEdge = Math.max(canvas.width, canvas.height);
  if (longestEdge <= GEMINI_MAX_DIMENSION) {
    return canvas.toDataURL("image/jpeg", quality);
  }

  const scale = GEMINI_MAX_DIMENSION / longestEdge;
  const resized = document.createElement("canvas");
  resized.width = Math.round(canvas.width * scale);
  resized.height = Math.round(canvas.height * scale);
  const ctx = resized.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/jpeg", quality);
  ctx.drawImage(canvas, 0, 0, resized.width, resized.height);
  return resized.toDataURL("image/jpeg", quality);
}

async function recognizeLabelWithGemini(
  image: HTMLCanvasElement,
  categories: string[],
  apiKey: string
): Promise<LabelOcrResult> {
  const dataUrl = toGeminiJpegDataUrl(image);
  const commaIndex = dataUrl.indexOf(",");
  const base64Data = dataUrl.slice(commaIndex + 1);
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg";

  const requestBody = {
    contents: [
      {
        parts: [
          { text: buildLabelPrompt(categories) },
          { inline_data: { mime_type: mimeType, data: base64Data } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          found: { type: "BOOLEAN" },
          product_name: { type: "STRING" },
          brand: { type: "STRING" },
          category: { type: "STRING" },
          confidence: { type: "NUMBER" },
        },
        required: ["found", "product_name", "brand", "category", "confidence"],
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Gemini request failed (${response.status}): ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as GeminiRawResponse;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof rawText !== "string") {
      throw new Error("Gemini returned no readable content.");
    }

    let parsed: {
      found?: boolean;
      product_name?: string;
      brand?: string;
      category?: string;
      confidence?: number;
    };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new Error("Could not parse Gemini's response as JSON.");
    }

    const result: GeminiApiResponse = {
      found: Boolean(parsed.found),
      productName: typeof parsed.product_name === "string" ? parsed.product_name.trim() : "",
      brandName: typeof parsed.brand === "string" ? parsed.brand.trim() : "",
      category: typeof parsed.category === "string" ? parsed.category.trim() : "",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };

    if (!result.found) {
      throw new Error("Gemini could not identify the product in the photo.");
    }

    return {
      rawText: "",
      guessedProductName: result.productName,
      guessedBrand: result.brandName,
      guessedSize: "",
      guessedCategory: result.category || undefined,
      confidence: result.confidence,
      source: "gemini",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Tries Gemini first (best accuracy — needs internet and an API key entered
// in Settings); falls back to the fully on-device Tesseract heuristic on any
// failure — no key set, network error, timeout, or Gemini simply not
// recognizing the product — so label scanning still works with zero
// configuration at all, just with a cruder guess.
export async function recognizeLabelSmart(
  image: HTMLCanvasElement,
  categories: string[],
  geminiApiKey: string
): Promise<LabelOcrResult> {
  if (!geminiApiKey.trim()) {
    const fallback = await recognizeProductLabel(image);
    fallback.geminiError = "No Gemini API key set — add one in Settings for AI-powered reading.";
    return fallback;
  }

  try {
    return await recognizeLabelWithGemini(image, categories, geminiApiKey.trim());
  } catch (err) {
    const fallback = await recognizeProductLabel(image);
    // Surfaced in the UI so a real misconfiguration (bad key, wrong model,
    // etc.) is visible instead of silently and indistinguishably degrading
    // to the cruder on-device reading.
    fallback.geminiError = err instanceof Error ? err.message : "Unknown error calling Gemini.";
    return fallback;
  }
}
