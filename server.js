// server.js
// npm i express cors body-parser axios cheerio dotenv @google/generative-ai

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const cheerio = require("cheerio");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public")); // serve your index.html from /public

// ====== CONFIG ======
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "AIzaSyAYPxRpFFETaaCsl76cg62c0d_5QTTUOMg"; //*Put your api key here*//
// Use PRO for longer outputs. If your account lacks access, switch to flash.
const MODEL_NAME = "gemini-2.5-pro";

// Approx speaking speed (words per second) by language
const WPS_BY_LANG = {
  English: 2.7,
  Hindi: 2.4,
  Bengali: 2.4,
  Marathi: 2.4,
  Tamil: 2.3,
  Telugu: 2.3,
  Gujarati: 2.3,
  Kannada: 2.3,
  Malayalam: 2.2,
  Punjabi: 2.4,
  Odia: 2.3,
  Assamese: 2.3,
  Nepali: 2.3,
  Urdu: 2.4,
  Sindhi: 2.3,
  Bodo: 2.2,
  Manipuri: 2.2,
  Sanskrit: 2.1,
  Gurmukhi: 2.4,
  Konkani: 2.3,
  Marwari: 2.3,
};

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ====== UTIL: Scrape article text ======
async function scrapeArticle(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        // Helps some sites return readable HTML
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      },
      timeout: 15000,
    });
    const $ = cheerio.load(data);
    // Pull main text quickly
    let text = "";
    $("article p, main p, p").each((_, el) => {
      const t = $(el).text().trim();
      if (t) text += t + "\n";
    });
    // Cap context to keep request manageable
    return text.slice(0, 8000) || "No text extracted.";
  } catch (e) {
    return "Failed to fetch the article content. Use what you can from the link.";
  }
}

// ====== UTIL: duration -> target words ======
function getTargetWords(durationSec, language = "English") {
  const d = parseInt(durationSec, 10);
  const wps = WPS_BY_LANG[language] || 2.5;
  // Slight buffer so it doesn't under-shoot
  const words = Math.round(d * wps * 1.05);
  // Keep within sane bounds
  return Math.max(60, Math.min(words, 450));
}

// ====== API ======
app.post("/generate-script", async (req, res) => {
  try {
    const { url, emotion, language, stance, duration, extraInfo } = req.body;

    // 1) Scrape
    const articleText = url ? await scrapeArticle(url) : "No URL provided.";

    // 2) Duration -> words
    const targetWords = getTargetWords(duration || 60, language || "English");

    // 3) Build prompt that strongly enforces length & structure
    const prompt = `
You are a viral short-form video scriptwriter.

Write a ${
      duration || 60
    }-second script (~${targetWords} words) based on the article content below.
Do NOT return fewer than ${Math.floor(targetWords * 0.9)} words.
If you must be concise, compress ideas—but keep the length target.

--- INPUTS ---
Language: ${language || "English"}
Emotion/Tone: ${emotion || "Excited"}
Stance: ${stance || "Neutral"}
Extra Info: ${extraInfo || "None"}
Source Article (raw text excerpt):
${articleText}

--- STYLE & FORMAT (MUST FOLLOW) ---
Output ONLY this structure, in ${language || "English"}:

[HOOK]
(1–2 killer lines. Pattern interrupt. Question or bold claim.)

[BODY]
(5–8 short lines. Conversational. No line > 12 words.
Summarize the key points from the article.
Weave in the chosen emotion and stance explicitly.
Use simple, punchy sentences.)

[VISUAL CUES]
- 3–5 bullet ideas: split-screen, B-roll, phone-in-hand, overlays, emojis.

[ENDING]
(2–3 lines. Satisfying punchline or CTA.)

--- RULES ---
- Aim ~${targetWords} words total across sections (≥ ${Math.floor(
      targetWords * 0.9
    )}).
- Keep it video-ready: creator can read line-by-line.
- Avoid fluff; prefer concrete facts/details from the article.
- Keep names/numbers accurate if present.`;

    // 4) Call Gemini
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      // You can also pass systemInstruction if you want even stronger control
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 1200, // 🔥 allow long outputs
        temperature: 0.9,
        topP: 0.95,
      },
    });

    const script =
      result?.response?.text?.() ||
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ No script generated.";

    res.json({ script, meta: { targetWords, duration } });
  } catch (err) {
    console.error("Gemini error:", err?.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate script" });
  }
});

// ====== START ======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
