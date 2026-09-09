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
