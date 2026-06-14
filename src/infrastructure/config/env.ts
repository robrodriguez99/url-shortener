import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  REDIS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  RABBITMQ_URL: z.string().min(1, "RABBITMQ_URL is required"),
  RABBITMQ_EXCHANGE: z.string().min(1).default("tinyurl.events"),
  RABBITMQ_ACCESS_QUEUE: z.string().min(1).default("tinyurl.accessed.persist"),
  RABBITMQ_PUBLISH_TIMEOUT_MS: z.coerce.number().int().positive().default(1_000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment configuration:");
  console.error(z.prettifyError(parsedEnv.error));
  throw new Error("Invalid environment configuration");
}

export const config = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  port: parsedEnv.data.PORT,
  baseUrl: parsedEnv.data.APP_BASE_URL,
  mongodbUri: parsedEnv.data.MONGODB_URI,
  redisUrl: parsedEnv.data.REDIS_URL,
  redisCacheTtlSeconds: parsedEnv.data.REDIS_CACHE_TTL_SECONDS,
  rabbitmqUrl: parsedEnv.data.RABBITMQ_URL,
  rabbitmqExchange: parsedEnv.data.RABBITMQ_EXCHANGE,
  rabbitmqAccessQueue: parsedEnv.data.RABBITMQ_ACCESS_QUEUE,
  rabbitmqPublishTimeoutMs: parsedEnv.data.RABBITMQ_PUBLISH_TIMEOUT_MS,
  logLevel: parsedEnv.data.LOG_LEVEL,
} as const;
