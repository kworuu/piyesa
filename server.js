// server.js
// Piyesa backend - Express app.
// Routes:
//   GET  /api/health
//   POST /api/parse-image   { imageBase64, mimeType }              -> { items: [...] }
//   POST /api/parse-url     { url }                                 -> { items: [...] }
//   POST /api/resolve-cart  { items: [...], budget? }                -> resolved cart
//   POST /api/explain       { cartSummary, question }                -> { answer }
//   GET  /api/templates                                             -> hardcoded project templates

require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const { extractFromImage, extractFromText, explainCart } = require("./gemini");
const { resolveCart } = require("./cartEngine");
const templates = require("./templates.json");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "15mb" })); // allow base64 images in request body
app.use(express.static("public"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "piyesa", time: new Date().toISOString() });
});

app.post("/api/parse-image", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }
    const items = await extractFromImage(imageBase64, mimeType);
    res.json({ items });
  } catch (err) {
    console.error("parse-image error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/parse-url", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "url is required" });
    }

    let pageText;
    try {
      const pageResp = await fetch(url, { timeout: 10000 });
      const html = await pageResp.text();
      // Strip tags crudely - Gemini handles messy text fine, and this avoids
      // pulling in a heavy HTML-parsing dependency for a hackathon timeline.
      pageText = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    } catch (fetchErr) {
      return res.status(400).json({ error: `Could not fetch URL: ${fetchErr.message}` });
    }

    const items = await extractFromText(pageText);
    res.json({ items });
  } catch (err) {
    console.error("parse-url error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/resolve-cart", (req, res) => {
  try {
    const { items, budget } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }
    const cart = resolveCart(items, budget);
    res.json(cart);
  } catch (err) {
    console.error("resolve-cart error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/explain", async (req, res) => {
  try {
    const { cartSummary, question } = req.body;
    if (!cartSummary || !question) {
      return res.status(400).json({ error: "cartSummary and question are required" });
    }
    const answer = await explainCart(cartSummary, question);
    res.json({ answer });
  } catch (err) {
    console.error("explain error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/templates", (req, res) => {
  res.json({ templates });
});

app.listen(PORT, () => {
  console.log(`Piyesa server running at http://localhost:${PORT}`);
});
