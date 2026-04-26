export interface OutfitPlan {
  occasion: string;
  pieces: string[];
  description: string;
  imagePrompt: string;
  flatLayPrompt: string;
}

export interface ItemAnalysis {
  name: string;
  colorPalette: string[];
  styleTags: string[];
  patterns: string;
  styleTips: string[];
}

export async function analyzeItem(base64: string, mimeType: string): Promise<ItemAnalysis> {
  const endpoints = ["/api/gemini/analyze", "/api/analyze-item"];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed analysis at ${endpoint}`);
      }

      return await response.json();
    } catch (error) {
      console.warn(`Analysis failed at ${endpoint}:`, error);
      lastError = error;
    }
  }

  throw new Error("No pudimos analizar la imagen con ningún servicio. Reintenta.");
}

export async function planOutfits(analysis: ItemAnalysis, gender: 'men' | 'women', history?: any[], preferredOccasion?: string, ageRange?: string): Promise<OutfitPlan[]> {
  const genderInSpanish = gender === 'men' ? 'hombre' : 'mujer';
  const ageContext = ageRange ? `User Age Range: ${ageRange}.` : "";
  
  let occasionNarrative = "Categorías: Casual, Business, Night Out.";
  if (preferredOccasion === 'Casual') {
    occasionNarrative = "ESTILO: Quiet Luxury & Weekend Chic. Telas premium, cortes relajados pero pulcros.";
  } else if (preferredOccasion === 'Business') {
    occasionNarrative = "ESTILO: Executive Power Dressing. Sofisticado, autoritario, sastrería impecable.";
  } else if (preferredOccasion === 'Night Out') {
    occasionNarrative = "ESTILO: High-Glamour & Avant-garde. Atrevido, texturas lujosas, impacto visual.";
  }

  const prompt = `Como estilista de alta costura y director de arte, crea 6 outfits excepcionales para un ${genderInSpanish} en sus ${ageRange || 'años indeterminados'}.
  Basado en esta prenda principal: ${JSON.stringify(analysis)}.
  ${occasionNarrative} ${ageContext}
  
  REGLAS DE DISEÑO EDITORIAL:
  - Fidelidad absoluta a la textura, patrones específicos (ej: rayas verticales) y caída real de la tela.
  - El look debe ser cohesivo, lujoso y apropiado para el perfil demográfico.
  
  REGLAS DE RIGOR FOTOGRÁFICO ( MANDATORIO ):
  - IDENTIDAD: El 'imagePrompt' DEBE comenzar describiendo explícitamente al sujeto: "Full body photo of a ${gender === 'men' ? 'man' : 'woman'} in ${gender === 'men' ? 'his' : 'her'} ${ageRange || '40s'}, standing...". ESTO ES CRÍTICO PARA EVITAR ERRORES DE GÉNERO O EDAD.
  - SIMETRÍA TOTAL: CADA prenda y accesorio (reloj, gafas, bolso, bufanda) mencionado en el 'imagePrompt' DEBE estar descrito también en el 'flatLayPrompt'.
  - PATRONES: Si la prenda base tiene rayas, especifica siempre su orientación (ej: 'vertical stripes') en AMBOS prompts.
  - ENCUADRE EDITORIAL: El 'imagePrompt' es CUERPO COMPLETO, de pie, encuadrado de la cabeza a los pies.
  - DIRECCIÓN DE ARTE (imagePrompt): Fotografía de moda profesional, lente 85mm f/1.8, bokeh suave, locación premium coherente con la ocasión.
  
  Devuelve SOLO un array JSON [{}, ...] con llaves: occasion (debe ser exactamente uno de estos tres: "Casual", "Business" o "Night Out"), pieces (string[]), description, imagePrompt, flatLayPrompt. Todo en español excepto los prompts técnicos que deben ser en inglés para mejor calidad.`;

  const endpoints = [
    { url: "/api/gemini/plan", body: { prompt } },
    { url: "/api/plan-outfits", body: { analysis, gender, history, preferredOccasion, ageRange } }
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(endpoint.body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed planning at ${endpoint.url}`);
      }

      return await response.json();
    } catch (error) {
      console.warn(`Planning failed at ${endpoint.url}:`, error);
    }
  }

  throw new Error("Fallo al planear atuendos con todos los servicios. Reintenta.");
}

export async function generateOutfitImage(prompt: string): Promise<string | null> {
  try {
    const response = await fetch("/api/gemini/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error("Imagen generation failed at server");
    }

    const data = await response.json();
    return data.image || null;
  } catch (error) {
    console.error("Image generation fetch failed:", error);
    return null;
  }
}
