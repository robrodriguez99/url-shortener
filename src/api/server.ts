import { createApp } from "./app.js";
import { config } from "../infrastructure/config/env.js";
import {
  connectMongo,
  disconnectMongo,
} from "../infrastructure/mongo/connection.js";
import {
  connectRedis,
  disconnectRedis,
} from "../infrastructure/redis/connection.js";
import { logger } from "../shared/logger/logger.js";

async function startServer(): Promise<void> {
  await connectMongo();

  try {
    await connectRedis();
  } catch (error) {
    logger.warn(
      { err: error },
      "Redis unavailable at startup; continuing without cache",
    );
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, baseUrl: config.baseUrl }, "server started");
  });

  let isShuttingDown = false;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "server shutting down");

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await Promise.all([disconnectRedis(), disconnectMongo()]);
    } catch (error) {
      logger.error({ err: error }, "failed to shut down cleanly");
      process.exitCode = 1;
    }
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

startServer().catch((error: unknown) => {
  logger.fatal({ err: error }, "failed to start server");
  process.exitCode = 1;
});
