import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "../config/env.js";

export interface GeminiChatInput {
  model?: string;
  temperature?: number;
}

export class ChatGemini extends ChatGoogleGenerativeAI {
  constructor(fields?: GeminiChatInput) {
    super({
      ...fields,
      model: fields?.model ?? env.GEMINI_MODEL,
      temperature: fields?.temperature ?? 0.2,
      apiKey: env.GEMINI_API_KEY,
      baseUrl: env.GEMINI_BASE_URL,
      maxRetries: 1,
    });
  }
}
