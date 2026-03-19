import { BaseChatModel, BaseChatModelParams } from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGeneration, ChatResult } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";

function normalizeUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface MiniMaxChatInput extends BaseChatModelParams {
  model?: string;
  temperature?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonBlock(text: string): any | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // ignore
    }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // ignore
    }
  }
  return null;
}

export class ChatMiniMax extends BaseChatModel {
  model: string;
  temperature: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  boundTools: any[] = [];

  constructor(fields?: MiniMaxChatInput) {
    super(fields ?? {});
    this.model = fields?.model ?? env.MINIMAX_MODEL;
    this.temperature = fields?.temperature ?? 0.2;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bindTools(tools: any[]): this {
    this.boundTools = tools;
    return this;
  }

  _llmType(): string {
    return "minimax";
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    let finalMessages = [...messages];

    // Inject tool instructions into the system prompt if there are bound tools
    if (this.boundTools && this.boundTools.length > 0) {
      const toolInstructions = `\n\n【系统提示：工具调用指南】
如果需要调用技能，请**必须**回复以下格式的 JSON 代码块（请勿包含额外内容）：
\`\`\`json
{
  "action": "技能名称（即skillKey）",
  "action_input": { "参数名": "参数值" }
}
\`\`\`
注意：你需要根据之前提供的可用技能列表进行调用。如果不需要调用技能，请直接用自然语言回答。`;

      const firstMessage = finalMessages[0];
      if (firstMessage._getType() === "system") {
        finalMessages[0] = new SystemMessage(`${firstMessage.content.toString()}${toolInstructions}`);
      } else {
        finalMessages = [new SystemMessage(`系统提示：${toolInstructions}`), ...finalMessages];
      }
    }

    const formattedMessages = finalMessages.map((m) => {
      let role: "system" | "user" | "assistant" = "user";
      const type = m._getType();
      if (type === "human") role = "user";
      else if (type === "ai") role = "assistant";
      else if (type === "system") role = "system";

      return {
        role,
        content: m.content.toString(),
      };
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.MINIMAX_TIMEOUT_MS);

    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        controller.abort();
      });
    }

    try {
      const response = await fetch(normalizeUrl(env.MINIMAX_BASE_URL, env.MINIMAX_CHAT_PATH), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: formattedMessages,
          temperature: this.temperature,
          ...(options?.stop ? { stop: options.stop } : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new HttpError(
          502,
          "PROVIDER_UNAVAILABLE",
          data?.message ?? "MiniMax request failed",
          data
        );
      }

      const content =
        data?.choices?.[0]?.message?.content ??
        data?.reply ??
        data?.output_text ??
        data?.text ??
        "";

      const promptTokens = data?.usage?.prompt_tokens ?? 0;
      const completionTokens = data?.usage?.completion_tokens ?? 0;
      const totalTokens = data?.usage?.total_tokens ?? 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tool_calls: any[] | undefined = undefined;

      // Parse JSON output to check if the model invoked an action
      if (this.boundTools && this.boundTools.length > 0) {
        const parsed = parseJsonBlock(content);
        if (parsed && parsed.action && typeof parsed.action === "string") {
          tool_calls = [
            {
              id: `call_${Math.random().toString(36).substring(2, 9)}`,
              name: parsed.action,
              args: parsed.action_input ?? {},
            },
          ];
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageArgs: any = {
        content,
        usage_metadata: {
          input_tokens: promptTokens,
          output_tokens: completionTokens,
          total_tokens: totalTokens,
        },
      };

      if (tool_calls && tool_calls.length > 0) {
        messageArgs.tool_calls = tool_calls;
      }

      const message = new AIMessage(messageArgs);

      const generation: ChatGeneration = {
        message,
        text: content,
      };

      return {
        generations: [generation],
        llmOutput: {
          tokenUsage: {
            promptTokens,
            completionTokens,
            totalTokens,
          },
        },
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new HttpError(504, "EXECUTION_TIMEOUT", "MiniMax request timed out");
      }
      throw new HttpError(
        502,
        "PROVIDER_UNAVAILABLE",
        error instanceof Error ? error.message : "MiniMax request failed"
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
