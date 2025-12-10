import { GoogleGenAI, Type } from "@google/genai";

export const extractCardData = async (base64Image: string): Promise<any> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are an expert OCR assistant specialized in parsing business cards, especially Korean and International formats.
    Extract the information accurately.
    - If a field is missing, use an empty string.
    - Format phone numbers cleanly (e.g., 010-1234-5678).
    - If there are multiple phone numbers, prefer the mobile number.
    - Ensure 'name' captures the full name.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image,
            },
          },
          {
            text: "Extract data from this business card.",
          },
        ],
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            jobTitle: { type: Type.STRING },
            company: { type: Type.STRING },
            phone: { type: Type.STRING },
            email: { type: Type.STRING },
            address: { type: Type.STRING },
            website: { type: Type.STRING },
          },
          required: ["name", "phone", "company"],
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text);
    } else {
      throw new Error("No data extracted");
    }
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    throw error;
  }
};