import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.js";

export interface QwenChatInput {
  model?: string;
  temperature?: number;
}

export class ChatQwen extends ChatOpenAI {
  constructor(fields?: QwenChatInput) {
    super({
      ...fields,
      modelName: fields?.model ?? env.QWEN_MODEL,
      temperature: fields?.temperature ?? 0.2,
      apiKey: env.QWEN_API_KEY,
      configuration: {
        baseURL: env.QWEN_BASE_URL,
      },
      timeout: env.QWEN_TIMEOUT_MS,
    });
  }
}
