import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import * as GoogleGenerativeAIModule from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize AI clients
const GEMINI_KEY = (process.env.GEMINI_API_KEY || "").trim();
const ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();

if (GEMINI_KEY) {
  console.log(`Gemini Key detected (Len: ${GEMINI_KEY.length}, Starts: ${GEMINI_KEY.substring(0, 4)}...)`);
}
if (ANTHROPIC_KEY) {
  console.log(`Anthropic Key detected (Len: ${ANTHROPIC_KEY.length}, Starts: ${ANTHROPIC_KEY.substring(0, 4)}...)`);
}

const genAI = GEMINI_KEY ? new GoogleGenerativeAIModule.GoogleGenerativeAI(GEMINI_KEY) : null;
const genAINew = GEMINI_KEY ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;
const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

// Helper to normalize occasions on server before sending to client
function normalizeOccasion(occ: string): string {
  const o = (occ || '').toLowerCase().trim();
  if (o.includes('noche') || o.includes('night') || o.includes('velada') || o.includes('fiesta') || o.includes('party') || o.includes('evening')) return 'Night Out';
  if (o.includes('formal') || o.includes('business') || o.includes('negocio') || o.includes('trabajo') || o.includes('oficina') || o.includes('ejecutivo')) return 'Business';
  if (o.includes('casual') || o.includes('diario') || o.includes('relajado') || o.includes('informal') || o.includes('weekend')) return 'Casual';
  return 'Casual'; // Default to Casual if unknown
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("Service Configuration Status:");
  console.log("- Gemini Client:", genAI ? "Initialized" : "FAILED (No Key)");
  console.log("- Anthropic Client:", anthropic ? "Initialized" : "FAILED (No Key)");

  app.use(express.json({ limit: '20mb' }));

  // --- GEMINI ENDPOINTS ---

  app.post("/api/gemini/analyze", async (req, res) => {
    if (!genAI) return res.status(500).json({ error: "Gemini Key missing" });
    try {
      const { base64, mimeType } = req.body;
      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

      const result = await model.generateContent([
        "Analiza esta prenda para un estilista de lujo. Identifica detalles técnicos como la orientación de los patrones (ej: rayas verticales/horizontales). Devuelve SOLO JSON con: { 'name': string, 'colorPalette': string[], 'styleTags': string[], 'patterns': string, 'styleTips': string[] }. Todo en español.",
        { inlineData: { data: base64, mimeType } }
      ]);

      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, "").replace(/```/g, "").trim();
      res.json(JSON.parse(cleanJson));
    } catch (error: any) {
      console.error("Gemini Analysis Server Error:", error);
      res.status(500).json({ error: `Gemini Error: ${error.message}` });
    }
  });

  app.post("/api/gemini/plan", async (req, res) => {
    if (!genAI) return res.status(500).json({ error: "Gemini Key missing" });
    try {
      const { prompt } = req.body;
      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, "").replace(/```/g, "").trim();
      
      const rawPlans = JSON.parse(cleanJson);
      const plans = rawPlans.map((p: any) => ({
        ...p,
        occasion: normalizeOccasion(p.occasion)
      }));
      
      res.json(plans);
    } catch (error: any) {
      console.error("Gemini Planning Server Error:", error);
      res.status(500).json({ error: `Gemini Planning Error: ${error.message}` });
    }
  });

  app.post("/api/gemini/generate-image", async (req, res) => {
    if (!genAINew) return res.status(500).json({ error: "Gemini Key missing" });
    try {
      const { prompt } = req.body;
      const response = await genAINew.models.generateImages({
        model: "imagen-3.0-generate-002",
        prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: "1:1",
          outputMimeType: "image/jpeg",
        },
      });

      const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (imageBytes) {
        return res.json({ image: `data:image/jpeg;base64,${imageBytes}` });
      }
      res.status(404).json({ error: "No image returned by model" });
    } catch (error: any) {
      console.error("Image Gen Error:", error);
      res.status(500).json({ error: `Image Gen Error: ${error.message}` });
    }
  });

  // --- CLAUDE ENDPOINTS ---

  app.post("/api/analyze-item", async (req, res) => {
    if (!anthropic) return res.status(500).json({ error: "Anthropic Key missing" });
    try {
      const { base64, mimeType } = req.body;
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: "Eres un experto en moda de alta gama. Analiza la prenda y devuelve JSON puro en español con: name, colorPalette, styleTags, patterns, styleTips.",
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mimeType as any, data: base64 } }, { type: "text", text: "Analiza esta prenda." }] }]
      });
      const text = (response.content[0] as any).text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      res.json(JSON.parse(jsonMatch ? jsonMatch[0] : text));
    } catch (error: any) {
      console.error("Claude analysis failed:", error);
      res.status(500).json({ error: `Claude Error: ${error.message}` });
    }
  });

  app.post("/api/plan-outfits", async (req, res) => {
    if (!anthropic) return res.status(500).json({ error: "Anthropic Key missing" });
    try {
      const { analysis, gender, preferredOccasion, ageRange } = req.body;
      const genderSpanish = gender === 'men' ? 'hombre' : 'mujer';
      
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        system: `Eres un estilista personal de marcas de lujo para un ${genderSpanish} en sus ${ageRange || '30s'}. 
        DEBES RESPONDER ÚNICAMENTE CON UN ARRAY JSON.
        LLAVES: occasion (Casual, Business, Night Out), pieces, description, imagePrompt, flatLayPrompt.`,
        messages: [{ role: "user", content: `Genera 6 planes de atuendos para ${genderSpanish} basado en: ${JSON.stringify(analysis)}. Ocasión preferida: ${preferredOccasion}. Describe cada pieza y prompts de imagen en inglés.` }]
      });

      const text = (response.content[0] as any).text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Invalid output format");
      
      const plans = JSON.parse(jsonMatch[0]);
      const validatedPlans = plans.map((p: any) => ({
        ...p,
        occasion: normalizeOccasion(p.occasion),
        imagePrompt: (p.imagePrompt || "").replace(/^image prompt: /i, ""),
        flatLayPrompt: (p.flatLayPrompt || "").replace(/^flat lay prompt: /i, "")
      }));

      res.json(validatedPlans);
    } catch (error: any) {
      console.error("Claude planning failed:", error);
      res.status(500).json({ error: `Claude Error: ${error.message}` });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
