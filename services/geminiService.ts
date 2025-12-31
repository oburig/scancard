import { GoogleGenAI, Type } from "@google/genai";

export const extractCardData = async (base64Image: string): Promise<any> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are a professional Business Card OCR Expert. 
    Analyze the provided image and extract information into a clean JSON format.
    
    Guidelines:
    1. Language: Support both Korean and English.
    2. Name: Identify the person's name (not the company name).
    3. JobTitle: Extract the position (e.g., 대표이사, 팀장, Manager).
    4. Company: Extract the full company name.
    5. Phone: Standardize numbers to '010-XXXX-XXXX' format. If there are multiple numbers, prioritize the mobile phone.
    6. Email: Ensure it's a valid email address found on the card.
    7. Website: Extract URLs (e.g., www.company.com).
    8. Address: Extract the full physical address.
    
    Return ONLY the JSON object. If a piece of information is not present, use an empty string "".
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image,
            },
          },
          {
            text: "Please read this business card and extract all contact details into JSON.",
          },
        ],
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Full name of the person" },
            jobTitle: { type: Type.STRING, description: "Professional title or position" },
            company: { type: Type.STRING, description: "Company or organization name" },
            phone: { type: Type.STRING, description: "Mobile or office phone number" },
            email: { type: Type.STRING, description: "Email address" },
            address: { type: Type.STRING, description: "Physical office address" },
            website: { type: Type.STRING, description: "Company website URL" },
            notes: { type: Type.STRING, description: "Any other visible important text" }
          },
          required: ["name", "phone", "company"],
        },
      },
    });

    if (response.text) {
      const parsedData = JSON.parse(response.text);
      console.log("OCR Extracted Data:", parsedData);
      return parsedData;
    } else {
      throw new Error("AI failed to return text content.");
    }
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    throw error;
  }
};