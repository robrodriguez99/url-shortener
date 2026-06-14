import type { Channel } from "amqplib";

import {
  connectMongo,
  disconnectMongo,
} from "../infrastructure/mongo/connection.js";
import {
  connectRabbitMq,
  disconnectRabbitMq,
} from "../infrastructure/rabbitmq/connection.js";
import { startClickConsumer } from "../modules/clicks/click.consumer.js";
import { ClickEventModel } from "../modules/clicks/click.model.js";
import { logger } from "../shared/logger/logger.js";

async function startWorker(): Promise<void> {
  await connectMongo();

  try {
    await ClickEventModel.init();
  } catch (error) {
    await disconnectMongo();
    throw error;
  }

  let consumerChannel: Channel | undefined;

  try {
    await connectRabbitMq();
    consumerChannel = await startClickConsumer();
  } catch (error) {
    await Promise.allSettled([
      disconnectRabbitMq(),
      disconnectMongo(),
    ]);
    throw error;
  }

  let isShuttingDown = false;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ signal }, "worker shutting down");

    try {
      await consumerChannel?.close().catch((error: unknown) => {
        logger.warn(
          { err: error },
          "failed to close click consumer channel",
        );
      });
      consumerChannel = undefined;
      await Promise.all([disconnectRabbitMq(), disconnectMongo()]);
    } catch (error) {
      logger.error({ err: error }, "failed to shut down worker cleanly");
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

startWorker().catch((error: unknown) => {
  logger.fatal({ err: error }, "failed to start worker");
  process.exitCode = 1;
});
