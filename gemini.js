// gemini.js
// Wraps Google Gemini calls for Piyesa:
//  - extractFromImage(base64, mimeType): photo/schematic of parts -> structured item list
//  - extractFromText(pageText): tutorial page text -> structured item list
//  - explainCart(cartSummary, question): chat Q&A about a resolved cart

const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL_NAME = "gemini-2.5-flash";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key from https://aistudio.google.com/app/apikey and add it to .env"
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

const EXTRACTION_INSTRUCTIONS = `You are a parts-list extraction engine for an electronics maker tool called Piyesa.
Given the input (an image of a parts list/schematic/tutorial photo, OR plain text from a tutorial page),
extract every distinct electronic component, part, or material mentioned or visibly identifiable.

Rules:
- Output ONLY a JSON array. No markdown fences, no preamble, no explanation, no trailing text.
- Each array element must be an object: {"name": string, "quantity": number}
- "name" should be a clear, generic component name (e.g. "Arduino Uno", "220 ohm resistor", "HC-SR04 ultrasonic sensor").
  Do not include brand-specific marketing language, just the functional part name.
- "quantity" should be your best-guess integer count. If not specified, default to 1.
- Merge duplicate mentions of the same part into a single entry with summed quantity.
- Ignore tools (screwdrivers, soldering irons), generic hardware store items unrelated to electronics, and any
  text that is not actually a component (page navigation, ads, unrelated prose).
- If you cannot identify any components at all, output an empty array: []

Output ONLY the JSON array.`;

function stripMarkdownFences(text) {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function extractJsonArray(text) {
  const cleaned = stripMarkdownFences(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // fall through to regex fallback
  }
  // Fallback: find the first [...] block in the text and try to parse that.
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // give up
    }
  }
  return [];
}

function sanitizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .filter((item) => item && typeof item.name === "string" && item.name.trim().length > 0)
    .map((item) => ({
      name: item.name.trim(),
      quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    }));
}

async function extractFromImage(base64, mimeType) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL_NAME });

  const result = await model.generateContent([
    EXTRACTION_INSTRUCTIONS,
    {
      inlineData: {
        data: base64,
        mimeType: mimeType || "image/jpeg",
      },
    },
  ]);

  const text = result.response.text();
  const items = extractJsonArray(text);
  return sanitizeItems(items);
}

async function extractFromText(pageText) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL_NAME });

  // Cap input length defensively - tutorial pages can be huge.
  const trimmed = String(pageText || "").slice(0, 20000);

  const result = await model.generateContent(
    `${EXTRACTION_INSTRUCTIONS}\n\nHere is the tutorial page text:\n\n${trimmed}`
  );

  const text = result.response.text();
  const items = extractJsonArray(text);
  return sanitizeItems(items);
}

async function explainCart(cartSummary, question) {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are Piyesa's cart assistant, a friendly helper for makers/hobbyists buying electronics components.
You will be given a JSON summary of the user's currently resolved cart (matched parts, substitutions, stock status,
budget swaps, and total cost) and a question from the user. Answer concisely and conversationally, referencing
specific parts/prices/substitutions from the cart data when relevant. If something was substituted due to budget
or stock constraints, explain why. If you don't have enough information in the cart data to answer, say so honestly.
Keep responses to a few sentences unless the user asks for more detail.

CART SUMMARY (JSON):
${JSON.stringify(cartSummary)}

USER QUESTION:
${question}`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

module.exports = {
  extractFromImage,
  extractFromText,
  explainCart,
};
