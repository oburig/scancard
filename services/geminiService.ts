import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 환경 변수에서 API 키를 가져옵니다.
const API_KEY = process.env.API_KEY || "";

// GoogleGenerativeAI 인스턴스 생성
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * AI 응답을 위한 스키마 정의 (JSON 출력을 강제하기 위함)
 */
const responseSchema = {
  description: "Workshop output schema",
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING },
    content: { type: SchemaType.STRING },
    steps: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    }
  }
};

/**
 * Gemini 모델을 사용하여 분석을 수행하는 함수
 */
export const analyzeWithGemini = async (prompt: string) => {
  try {
    // 모델 설정 (gemini-1.5-flash 또는 pro)
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
