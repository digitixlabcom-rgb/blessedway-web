# Barcode Product Scanner & Excel Export

A mobile-first PWA for building a retail product master list by scanning
barcodes with the device camera, instead of typing product data by hand.

Scan a barcode → look up product info automatically → confirm/edit → save.
Repeat for hundreds or thousands of products, then export a clean `.xlsx`
file ready to import into a POS system.

## Run it locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173. For camera scanning, open it on a phone (or
desktop with a webcam) over HTTPS or localhost — browsers require a secure
context for camera access.

## Building the Android app (.apk)

The `android/` folder is a real, committed native Android project (via
[Capacitor](https://capacitorjs.com)) that wraps this web app — build it in
Android Studio to get an installable `.apk`, no web hosting required at all.

1. **Install prerequisites** (skip anything you already have): [Android
   Studio](https://developer.android.com/studio), which bundles the Android
   SDK.
2. **Pull this branch** and install dependencies:
   ```bash
   git clone https://github.com/digitixlabcom-rgb/blessedway-web.git
   cd blessedway-web
   git checkout claude/barcode-scanner-pos-export-xxedb7
   npm install
   ```
3. **Build the web app and sync it into the Android project** (re-run this
   any time you pull web-app changes and want them in the app):
   ```bash
   npm run android:sync
   ```
4. **Open the Android project**:
   ```bash
   npm run android:open
   ```
   This opens the `android/` folder in Android Studio (or open it manually:
   Android Studio → Open → select the `android` folder in this repo).
5. Let Gradle sync finish (Android Studio does this automatically on first
   open — can take a few minutes).
6. **Build the APK**: menu bar → **Build → Build App Bundle(s) / APK(s) →
   Build APK(s)**. When it finishes, click the **locate** link in the
   notification, or find it at
   `android/app/build/outputs/apk/debug/app-debug.apk`.
7. **Install it on your phone**: copy that `.apk` file to your phone (USB,
   email to yourself, cloud drive — anything) and open it there. Android
   will ask you to allow installs from that source the first time; approve
   it, then tap the file to install.

Camera permission is already declared in the Android manifest
(`android/app/src/main/AndroidManifest.xml`); Android will prompt for it the
first time the app opens the scanner, same as a website would.

The app's data (products, categories, Gemini key, etc.) is stored inside
this app's own local database on the phone — separate from whatever you
scanned earlier in the browser version, since it's a different origin.
Use **Export Backup** in one and **Restore from backup** in the other if you
want to move data across.

## Build

```bash
npm run build   # type-checks then builds to dist/
npm run preview # serve the production build locally
```

## How it's organized

```
src/
  types/        Domain model (Product, Category, ScanSession, Settings…)
  db/           IndexedDB setup (idb) — products, categories, sessions,
                lookup cache, settings all persist locally between sessions
  services/     All business logic, framework-agnostic:
                BarcodeService      — camera decoding (ZXing), format mapping
                ProductLookupService — provider-agnostic barcode lookup + cache
                ProductService      — CRUD, duplicate detection, validation
                CategoryService     — category CRUD
                SessionService      — scanning sessions + stats
                ExportService       — .xlsx export (barcodes forced to text),
                                       POS-format export, JSON backup/restore
  components/   Scanner camera UI, product form, modals, shared UI
  pages/        Dashboard, Scanner, Products, Categories, Sessions, Export,
                Settings — one per bottom-nav/top-nav destination
```

### Product lookup provider

Lookups go through `ProductLookupService`, which only talks to a small
`LookupProvider` interface — never to one vendor directly. V1 ships with
**Open Food Facts** (free, no API key, works from the browser). To add a
provider that needs a secret key, add a class implementing `LookupProvider`
that calls your own backend endpoint (see `BackendProxyProvider` in
`ProductLookupService.ts` for the shape) — the key stays server-side, never
in frontend code.

### Label OCR fallback

When a barcode isn't found (common for non-food items, since the default
lookup provider is Open Food Facts), the confirmation form offers **Scan
Product Label**: it opens the camera and reads the label to fill in
whatever of product name (with size, e.g. "200 ml", appended), brand, and
category are still empty. This is always a best-effort draft, not a lookup —
it's shown for review/edit before saving, never auto-saved, in either scan
mode.

Two readers, tried in order (`src/services/OcrService.ts`):

1. **Gemini** — a vision LLM reads the photo directly and suggests a
   category too (e.g. "Skin Care" for a cosmetic it doesn't recognize by
   name). Called directly from the browser using an API key entered on the
   **Settings** page (stored only in this device's local IndexedDB, sent
   only to Google — never bundled into the app or shared elsewhere). Get a
   free key at
   [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
   This app has exactly one user (whoever runs it on their own phone), so a
   client-held key is an intentional, scoped exception to routing keyed
   providers through a backend — do not reuse this pattern for a
   multi-tenant deployment.
2. **On-device OCR** (`tesseract.js`, WASM — the image never leaves the
   browser) — the automatic fallback whenever no key is set, the request
   fails, or Gemini can't identify the product. Cruder (a
   tallest-line-on-the-label heuristic for the brand), but needs no
   configuration and was verified against a real product photo.

Without a key set, label scanning still works end-to-end via the on-device
fallback alone — Gemini is a quality upgrade, not a requirement.

#### Free-tier limits when scanning many products

A free Gemini API key is capped by Google on both requests-per-minute and
requests-per-day (exact numbers vary by model and change over time — see
[ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits)).
Scanning a large batch of products back-to-back can hit that cap; when it
does, Gemini returns a 429 error, the app shows a plain-language "free-tier
limit reached" message, and falls back to the on-device Tesseract reader for
that scan so you're never blocked from saving a product. Options if this
happens often:

- **Wait it out.** The per-minute cap clears within a minute; the daily cap
  resets at midnight Pacific time.
- **Enable billing** on the Google AI Studio / Cloud project behind your key.
  Gemini's Flash models cost a small fraction of a cent per image, so
  scanning hundreds of products costs cents, and paid-tier rate/daily limits
  are far higher than the free tier's.

### Installing on a phone

This is a PWA, so on Android Chrome, opening the deployed URL and choosing
"Add to Home Screen" / "Install app" gives it its own home-screen icon and
a full-screen, no-browser-chrome window — the practical equivalent of a
native app without needing to build and sign an `.apk`.

### Barcodes are always text

Every place a barcode is written to Excel forces the cell type to text
(`numFmt: '@'` plus an explicit string cell type), so leading zeros are
never dropped and Excel never renders a barcode in scientific notation.
This was verified directly against the generated `.xlsx` XML with barcodes
like `0123456789012` at a 1,200-row scale.

## What's implemented (V1)

- Camera barcode scanning (EAN-13/8, UPC-A/E, Code 128/39, ITF, QR) via ZXing
- Automatic product lookup with manual edit before save (or Fast Scan mode
  for auto-save-and-continue)
- Duplicate barcode detection with view/update/cancel
- Manual barcode entry fallback, offline-safe scanning and saving
- Category manager, scanning sessions, dashboard stats
- Products list with search/filter/pagination/bulk delete
- Export: All / current session / filtered / manual-entries / POS-format,
  plus a pre-export validation report
- JSON backup export/restore (separate from the Excel export)
- Settings for lookup provider, scanner behavior, POS field mapping

## Known limitations / next steps

- Only one lookup provider ships by default (Open Food Facts); it covers
  groceries/food/beverages well, and legitimately returns "not found" for
  many non-food retail barcodes — that's expected, not a bug, and falls
  through to manual entry as designed.
- No native camera testing was possible in the build environment (no
  physical device); the scanning pipeline, UI states, and error handling
  were verified with a simulated camera stream and mocked lookup responses
  in a headless browser. Please test on an actual Android phone before
  relying on it for real inventory work, and report anything the camera UX
  needs tuned.
- Direct POS database integration is intentionally out of scope for V1 —
  the export pipeline is the hand-off point, matching the requested
  architecture for a future direct POS API integration.
