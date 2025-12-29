import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 환경 변수 확인
const API_KEY = process.env.API_KEY || "";

// [수정 완료] GoogleGenAI 대신 GoogleGenerativeAI 사용
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * [수정 완료] Type.OBJECT 대신 SchemaType.OBJECT 사용
 */
const responseSchema = {
  description: "Workshop analysis schema",
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
        responseMimeType: "application/json"
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
