import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const API_KEY = process.env.API_KEY || "";
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
  }
};

export const analyzeWithGemini = async (prompt: string) => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text());
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
