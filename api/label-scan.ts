import type { VercelRequest, VercelResponse } from "@vercel/node";

// Server-side proxy to Google Gemini for reading a product label photo.
// The Gemini API key lives only in this function's environment (GEMINI_API_KEY,
// set in the Vercel project's Environment Variables) — it must never be sent
// to or embedded in the frontend bundle. The frontend only ever talks to this
// same-origin endpoint.

const DEFAULT_MODEL = "gemini-2.0-flash";
const REQUEST_TIMEOUT_MS = 20000;

interface GeminiLabelJson {
  found?: boolean;
  product_name?: string;
  brand?: string;
  category?: string;
  confidence?: number;
}

function buildPrompt(categories: string[]): string {
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
  ].join(" ");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", message: "Use POST." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(501).json({
      error: "not_configured",
      message: "GEMINI_API_KEY is not set on the server.",
    });
    return;
  }

  const { image, categories } = (req.body ?? {}) as { image?: unknown; categories?: unknown };
  if (typeof image !== "string" || !image.startsWith("data:image/")) {
    res.status(400).json({ error: "invalid_request", message: "A base64 image data URL is required." });
    return;
  }

  const commaIndex = image.indexOf(",");
  const base64Data = image.slice(commaIndex + 1);
  const mimeType = image.slice(5, image.indexOf(";")) || "image/jpeg";
  const categoryList = Array.isArray(categories) ? categories.filter((c): c is string => typeof c === "string") : [];

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const requestBody = {
    contents: [
      {
        parts: [
          { text: buildPrompt(categoryList) },
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
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      res.status(502).json({
        error: "upstream_error",
        message: `Gemini request failed (${response.status}): ${text.slice(0, 300)}`,
      });
      return;
    }

    const data = await response.json();
    const rawText: unknown = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof rawText !== "string") {
      res.status(502).json({ error: "upstream_error", message: "Gemini returned no readable content." });
      return;
    }

    let parsed: GeminiLabelJson;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      res.status(502).json({ error: "parse_error", message: "Could not parse Gemini's response as JSON." });
      return;
    }

    res.status(200).json({
      found: Boolean(parsed.found),
      productName: typeof parsed.product_name === "string" ? parsed.product_name.trim() : "",
      brandName: typeof parsed.brand === "string" ? parsed.brand.trim() : "",
      category: typeof parsed.category === "string" ? parsed.category.trim() : "",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    res.status(504).json({
      error: aborted ? "timeout" : "network_error",
      message: err instanceof Error ? err.message : "Unknown error contacting Gemini.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
