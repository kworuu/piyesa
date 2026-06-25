// cartEngine.js
// Pure JS, no AI calls here. Takes extracted item names + optional budget,
// matches them against catalog.json, computes pack quantities, flags
// out-of-stock items, and (if a budget is given) swaps in cheaper compatible
// substitutes to try to hit the budget.

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "catalog.json");
const MATCH_THRESHOLD = 0.2; // below this, an item is considered "unmatched"

function loadCatalog() {
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  return JSON.parse(raw);
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Simple token-overlap similarity score between two strings (0..1).
function similarity(a, b) {
  const tokensA = new Set(normalize(a));
  const tokensB = new Set(normalize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  // Normalize by the smaller token set so short queries aren't unfairly penalized.
  const denom = Math.min(tokensA.size, tokensB.size);
  return overlap / denom;
}

function findBestMatch(itemName, catalog) {
  let best = null;
  let bestScore = 0;
  for (const product of catalog) {
    const score = similarity(itemName, product.name);
    if (score > bestScore) {
      bestScore = score;
      best = product;
    }
  }
  return { product: best, score: bestScore };
}

function findCatalogProduct(sku, catalog) {
  return catalog.find((p) => p.sku === sku) || null;
}

// Given a matched product and a desired quantity (units), compute how many
// packs are needed and the resulting cost.
function computePackMath(product, desiredQty) {
  const packSize = product.packSize || 1;
  const packsNeeded = Math.max(1, Math.ceil(desiredQty / packSize));
  const cost = packsNeeded * product.packPrice;
  return { packsNeeded, cost, unitsProvided: packsNeeded * packSize };
}

// Resolve a list of extracted items (each { name, quantity }) into a cart.
function resolveCart(items, budget) {
  const catalog = loadCatalog();

  const lines = items.map((item) => {
    const desiredQty = Math.max(1, parseInt(item.quantity, 10) || 1);
    const { product, score } = findBestMatch(item.name, catalog);

    if (!product || score < MATCH_THRESHOLD) {
      return {
        requestedName: item.name,
        requestedQty: desiredQty,
        matched: false,
        matchScore: score,
        sku: null,
        product: null,
        status: "unmatched",
      };
    }

    const { packsNeeded, cost, unitsProvided } = computePackMath(product, desiredQty);
    const inStock = product.stock > 0;
    const enoughStock = product.stock >= packsNeeded;

    return {
      requestedName: item.name,
      requestedQty: desiredQty,
      matched: true,
      matchScore: score,
      sku: product.sku,
      product,
      packsNeeded,
      unitsProvided,
      cost,
      status: !inStock ? "out_of_stock" : !enoughStock ? "low_stock" : "in_stock",
    };
  });

  let total = lines.reduce((sum, l) => sum + (l.cost || 0), 0);

  let budgetApplied = false;
  let budgetSwaps = [];

  if (budget && Number(budget) > 0 && total > Number(budget)) {
    const result = optimizeForBudget(lines, catalog, Number(budget));
    budgetApplied = true;
    budgetSwaps = result.swaps;
    total = result.newTotal;
  }

  const unmatchedCount = lines.filter((l) => !l.matched).length;
  const outOfStockCount = lines.filter((l) => l.status === "out_of_stock").length;

  return {
    lines,
    total,
    itemCount: lines.reduce((n, l) => n + (l.packsNeeded || 0), 0),
    unmatchedCount,
    outOfStockCount,
    budget: budget ? Number(budget) : null,
    budgetApplied,
    budgetSwaps,
    withinBudget: budget ? total <= Number(budget) : null,
  };
}

// Swap in the cheapest compatible in-stock alternative for lines that have
// substitutes, largest savings first, until budget is met or no more swaps help.
function optimizeForBudget(lines, catalog, budget) {
  const swaps = [];

  // Build a list of candidate swaps: { lineIndex, fromSku, toProduct, savingsPerUnit, totalSavings }
  function buildCandidates() {
    const candidates = [];
    lines.forEach((line, idx) => {
      if (!line.matched || !line.product) return;
      const compatibleSkus = line.product.compatibleWith || [];
      for (const subSku of compatibleSkus) {
        const subProduct = findCatalogProduct(subSku, catalog);
        if (!subProduct) continue;
        if (subProduct.packPrice >= line.product.packPrice) continue; // only consider cheaper subs
        const desiredQty = line.requestedQty;
        const { packsNeeded, cost } = computePackMath(subProduct, desiredQty);
        if (subProduct.stock < packsNeeded) continue; // sub must actually be available
        const savings = (line.cost || 0) - cost;
        if (savings <= 0) continue;
        candidates.push({
          lineIndex: idx,
          fromSku: line.sku,
          fromName: line.product.name,
          toSku: subProduct.sku,
          toName: subProduct.name,
          toProduct: subProduct,
          newPacksNeeded: packsNeeded,
          newCost: cost,
          savings,
        });
      }
    });
    // Largest savings first
    candidates.sort((a, b) => b.savings - a.savings);
    return candidates;
  }

  let total = lines.reduce((sum, l) => sum + (l.cost || 0), 0);
  const swappedLineIndices = new Set();

  while (total > budget) {
    const candidates = buildCandidates().filter((c) => !swappedLineIndices.has(c.lineIndex));
    if (candidates.length === 0) break; // no more swaps available

    const best = candidates[0];
    const line = lines[best.lineIndex];

    // Apply the swap
    const inStock = best.toProduct.stock > 0;
    line.sku = best.toSku;
    line.product = best.toProduct;
    line.packsNeeded = best.newPacksNeeded;
    line.unitsProvided = best.newPacksNeeded * (best.toProduct.packSize || 1);
    line.cost = best.newCost;
    line.status = !inStock ? "out_of_stock" : best.toProduct.stock >= best.newPacksNeeded ? "in_stock" : "low_stock";
    line.substituted = true;
    line.substitutedFrom = { sku: best.fromSku, name: best.fromName };

    swaps.push({
      lineIndex: best.lineIndex,
      fromSku: best.fromSku,
      fromName: best.fromName,
      toSku: best.toSku,
      toName: best.toName,
      savings: best.savings,
    });

    swappedLineIndices.add(best.lineIndex);
    total = lines.reduce((sum, l) => sum + (l.cost || 0), 0);
  }

  return { newTotal: total, swaps };
}

module.exports = {
  resolveCart,
  loadCatalog,
  similarity, // exported for testing
  MATCH_THRESHOLD,
};
