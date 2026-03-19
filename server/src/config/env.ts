import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  MINIMAX_API_KEY: z.string().min(1),
  MINIMAX_BASE_URL: z.string().url().default('https://api.minimax.chat'),
  MINIMAX_CHAT_PATH: z.string().default('/v1/text/chatcompletion_v2'),
  MINIMAX_MODEL: z.string().default('MiniMax-M2.5'),
  MINIMAX_TIMEOUT_MS: z.coerce.number().default(60000),
});

export const env = envSchema.parse(process.env);
