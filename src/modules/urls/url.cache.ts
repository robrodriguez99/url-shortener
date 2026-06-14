import { config } from "../../infrastructure/config/env.js";
import { redisClient } from "../../infrastructure/redis/connection.js";

type RedisCacheClient = {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { EX: number },
  ): Promise<unknown>;
};

export async function getCachedOriginalUrl(
  code: string,
  client: RedisCacheClient = redisClient,
): Promise<string | null> {
  return client.get(toCacheKey(code));
}

export async function cacheOriginalUrl(
  code: string,
  originalUrl: string,
  client: RedisCacheClient = redisClient,
): Promise<void> {
  await client.set(toCacheKey(code), originalUrl, {
    EX: config.redisCacheTtlSeconds,
  });
}

function toCacheKey(code: string): string {
  return `short-url:${code}`;
}
