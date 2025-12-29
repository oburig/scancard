import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 1. 환경 변수에서 API 키를 가져옵니다.
const API_KEY = process.env.API_KEY || "";

// 2. GoogleGenerativeAI 인스턴스 생성 (GoogleGenAI 아님)
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * 3. AI 응답을 위한 스키마 정의
 * Type.STRING 대신 SchemaType.STRING을 사용해야 합니다.
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

/**
 * Gemini 모델을 사용하여 분석을 수행하는 함수
 */
export const analyzeWithGemini = async (prompt: string) => {
  try {
    // 모델 설정 (gemini-1.5-flash 사용 권장)
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
