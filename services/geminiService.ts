import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 1. 환경 변수에서 API 키를 가져옵니다.
const API_KEY = process.env.API_KEY || "";

// 2. [수정] GoogleGenAI -> GoogleGenerativeAI
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * 3. [수정] 'Type'이라는 이름은 존재하지 않습니다. 
 * SDK에서 제공하는 'SchemaType'을 사용해야 모든 오류가 사라집니다.
 */
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

/**
 * Gemini 모델을 사용하여 분석을 수행하는 함수
 */
export const analyzeWithGemini = async (prompt: string) => {
  try {
    // 4. 모델 설정 (최신 gemini-1.5-flash 권장)
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
