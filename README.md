# Piyesa

**Piyesa** turns maker "inspiration" — a photo of a parts list, a tutorial URL, a typed description, or a pre-built project template — into a fully resolved, ready-to-checkout cart of in-stock electronics components. It handles catalog matching, pack-size math, budget-driven substitution, and includes an AI chat assistant that explains its decisions.

Built for Create & Conquer 2026 (FEU Tech). Team: TaO+.

## Tech stack

- **Backend:** Node.js + Express
- **Frontend:** Plain HTML/CSS/JS — no framework, no build step
- **AI:** Google Gemini (`gemini-2.5-flash`) for image/URL parts extraction and the cart chat assistant
- **Data:** `catalog.json` (mock electronics catalog). A SQLite schema (`schema.sql`) is designed for a future migration but not yet wired in.

## How to run it

```bash
npm install
cp .env.example .env
# Add a free Gemini key from https://aistudio.google.com/app/apikey into .env
npm start
# Open http://localhost:3000
```

The app works **without** a Gemini key for: the templates dashboard, the "Describe Project" text flow, cart resolution, budget optimization, and checkout UI. A Gemini key is only required for the **photo upload** and **tutorial URL** parsing flows, and for the **chat assistant**.

## How to use it

1. On the landing page, either:
   - Drop/upload a photo of a parts list or schematic, **or**
   - Paste a tutorial URL, **or**
   - Click "Describe Project" and type your parts list, **or**
   - Click one of the **Suggested Projects** template cards.
2. Optionally set a project budget when prompted.
3. Review the extracted/templated parts list — edit names/quantities as needed — then click **Resolve Cart**.
4. The resolved cart shows stock status (in stock / low stock / out of stock), any budget-driven substitutions, and a running total. Use the **help bot** chat panel to ask questions about the cart (substitutions, pricing, parts).
5. Click **Preview BOM** to see/download a CSV bill of materials.
6. Click **Checkout** to walk through the (UI-only, no real payment processing) checkout flow.

## Project structure

```
piyesa/
├── server.js          # Express app + API routes
├── gemini.js           # Gemini API wrapper (image/URL extraction, chat explain)
├── cartEngine.js        # Pure JS matching/substitution/budget logic (no AI)
├── catalog.json          # Mock electronics catalog
├── templates.json         # Hardcoded project templates for the dashboard
├── schema.sql              # Target SQLite schema (not yet wired in)
└── public/
    ├── index.html
    ├── app.js
    ├── style.css
    └── img/placeholder/      # Simple SVG category icons
```

## API routes

| Route | Method | Body | Description |
|---|---|---|---|
| `/api/health` | GET | — | Health check |
| `/api/parse-image` | POST | `{ imageBase64, mimeType }` | Extract parts list from a photo (Gemini) |
| `/api/parse-url` | POST | `{ url }` | Extract parts list from a tutorial page (Gemini) |
| `/api/resolve-cart` | POST | `{ items: [{name, quantity}], budget? }` | Match items to catalog, apply budget optimization |
| `/api/explain` | POST | `{ cartSummary, question }` | Chat with the cart assistant (Gemini) |
| `/api/templates` | GET | — | List hardcoded project templates |

## Known limitations

- Catalog matching uses simple token-overlap scoring (not semantic embeddings) — works well for clear names, can weakly mismatch ambiguous terms. Threshold is `0.2` in `cartEngine.js`.
- No automated tests — manual testing via the UI or `curl`/Postman is the practical approach given the timeline.
- Gemini extraction prompts have not been stress-tested against messy/unusual real-world photos — expect to tweak `EXTRACTION_INSTRUCTIONS` in `gemini.js`.
- No auth/login, no SQLite persistence, no real payment processing — checkout is UI-only and records nothing.
