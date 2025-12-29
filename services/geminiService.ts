import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// 1. 환경 변수에서 API 키를 가져옵니다.
const API_KEY = process.env.API_KEY || "";

// 2. 클래스명을 GoogleGenerativeAI로 정확히 수정합니다.
const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * 3. Schema 정의 시 'Type' 대신 'SchemaType'을 사용해야 합니다.
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
    // 모델 설정 (gemini-1.5-flash 사용 권장)
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        // 필요한 경우 responseSchema를 여기에 연결할 수 있습니다.
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
