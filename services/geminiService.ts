import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const API_KEY = process.env.API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * App.tsx에서 'extractCardData'라는 이름으로 호출하고 있으므로 
 * 이름을 맞춰서 export 합니다.
 */
export const extractCardData = async (prompt: string) => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
