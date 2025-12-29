import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

const responseSchema = {
  description: "Workshop analysis result",
  type: SchemaType.OBJECT,
  properties: {
    analysis: { type: SchemaType.STRING },
    recommendations: { 
      type: SchemaType.ARRAY, 
      items: { type: SchemaType.STRING } 
    },
    status: { type: SchemaType.STRING }
  },
  required: ["analysis", "recommendations", "status"]
};

export const analyzeWithGemini = async (prompt: string) => {
  try {
    if (!API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
