import { createClient } from "redis";

import { logger } from "../../shared/logger/logger.js";
import { config } from "../config/env.js";

const redisLogger = logger.child({ module: "redis" });

export const redisClient = createClient({
  url: config.redisUrl,
  socket: {
    connectTimeout: 5_000,
    reconnectStrategy: (retries) => {
      if (retries >= 3) {
        return new Error("Redis reconnect attempts exhausted");
      }

      return Math.min(100 * 2 ** retries, 1_000);
    },
  },
});

redisClient.on("error", (error: Error) => {
  redisLogger.warn({ err: error }, "Redis client error");
});

export async function connectRedis(): Promise<void> {
  if (redisClient.isOpen) {
    return;
  }

  await redisClient.connect();
  redisLogger.info("connected to Redis");
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    return;
  }

  await redisClient.close();
  redisLogger.info("disconnected from Redis");
}
