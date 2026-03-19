import { ChatMiniMax } from "./core/llm/langchain-minimax.js";
const model = new ChatMiniMax();
model.bindTools = function(tools: any[]): typeof model {
  return this;
};
