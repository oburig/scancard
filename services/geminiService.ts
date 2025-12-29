import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 환경 변수 설정
const API_KEY = process.env.API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * App.tsx에서 이 이름으로 가져다 쓰고 있으므로 이름을 정확히 맞춰줍니다.
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
    
    // JSON 문자열을 객체로 변환하여 반환
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
