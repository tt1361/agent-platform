import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env'), override: false });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  MINIMAX_API_KEY: z.string().min(1),
  MINIMAX_BASE_URL: z.string().url().default('https://api.minimax.chat'),
  MINIMAX_CHAT_PATH: z.string().default('/v1/text/chatcompletion_v2'),
  MINIMAX_MODEL: z.string().default('MiniMax-M2.5'),
  MINIMAX_TIMEOUT_MS: z.coerce.number().default(60000),
  QWEN_API_KEY: z.string().min(1),
  QWEN_BASE_URL: z.string().url().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  QWEN_MODEL: z.string().default('qwen-plus'),
  QWEN_TIMEOUT_MS: z.coerce.number().default(60000),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_BASE_URL: z.string().url().default('https://generativelanguage.googleapis.com'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_TIMEOUT_MS: z.coerce.number().default(60000),
});

export const env = envSchema.parse(process.env);
