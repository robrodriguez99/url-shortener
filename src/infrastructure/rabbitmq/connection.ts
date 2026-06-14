import amqp, {
  type ChannelModel,
  type ConfirmChannel,
} from "amqplib";

import { TINY_URL_ACCESSED_EVENT_TYPE } from "../../modules/clicks/click.schemas.js";
import { logger } from "../../shared/logger/logger.js";
import { config } from "../config/env.js";

const rabbitMqLogger = logger.child({ module: "rabbitmq" });

let connection: ChannelModel | undefined;
let publisherChannel: ConfirmChannel | undefined;

export async function connectRabbitMq(): Promise<void> {
  if (connection !== undefined && publisherChannel !== undefined) {
    return;
  }

  const nextConnection = await amqp.connect(config.rabbitmqUrl);
  let nextChannel: ConfirmChannel;

  try {
    nextChannel = await nextConnection.createConfirmChannel();
    await nextChannel.assertExchange(config.rabbitmqExchange, "direct", {
      durable: true,
    });
    await nextChannel.assertQueue(config.rabbitmqAccessQueue, {
      durable: true,
    });
    await nextChannel.bindQueue(
      config.rabbitmqAccessQueue,
      config.rabbitmqExchange,
      TINY_URL_ACCESSED_EVENT_TYPE,
    );
  } catch (error) {
    await nextConnection.close().catch(() => undefined);
    throw error;
  }

  nextConnection.on("error", (error: Error) => {
    rabbitMqLogger.warn({ err: error }, "RabbitMQ connection error");
  });
  nextConnection.on("close", () => {
    if (connection === nextConnection) {
      connection = undefined;
      publisherChannel = undefined;
      rabbitMqLogger.warn("RabbitMQ connection closed unexpectedly");
    }
  });
  nextChannel.on("error", (error: Error) => {
    rabbitMqLogger.warn({ err: error }, "RabbitMQ channel error");
  });

  connection = nextConnection;
  publisherChannel = nextChannel;
  rabbitMqLogger.info("connected to RabbitMQ");
}

export function getRabbitMqPublisherChannel(): ConfirmChannel {
  if (publisherChannel === undefined) {
    throw new Error("RabbitMQ publisher channel is not available");
  }

  return publisherChannel;
}

export async function disconnectRabbitMq(): Promise<void> {
  const currentChannel = publisherChannel;
  const currentConnection = connection;

  publisherChannel = undefined;
  connection = undefined;

  await Promise.allSettled([
    currentChannel?.close(),
    currentConnection?.close(),
  ]);

  if (currentChannel !== undefined || currentConnection !== undefined) {
    rabbitMqLogger.info("disconnected from RabbitMQ");
  }
}
