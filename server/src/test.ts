import { ChatMiniMax } from "./core/llm/langchain-minimax.js";
export class Test extends ChatMiniMax {
  bindTools(tools: any[]): this {
    return this;
  }
}
