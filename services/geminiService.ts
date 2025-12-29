import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 1. 환경 변수에서 API 키를 가져옵니다.
const API_KEY = process.env.API_KEY || "";

// 2. 인스턴스 생성
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * [수정 포인트] 
 * App.tsx에서 'extractCardData'라는 이름으로 불러오고 있으므로 
 * 함수 이름을 동일하게 맞춰서 내보내야(export) 합니다.
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
    
    // JSON 문자열을 파싱하여 결과 반환
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
