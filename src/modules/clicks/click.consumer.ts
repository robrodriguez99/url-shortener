import type { Channel, ConsumeMessage } from "amqplib";

import { config } from "../../infrastructure/config/env.js";
import { createRabbitMqConsumerChannel } from "../../infrastructure/rabbitmq/connection.js";
import { logger } from "../../shared/logger/logger.js";
import {
  saveClickEvent,
  type SaveClickEventResult,
} from "./click.repository.js";
import {
  tinyUrlAccessedEventSchema,
  type TinyUrlAccessedEvent,
} from "./click.schemas.js";

const clickConsumerLogger = logger.child({ module: "click-consumer" });

type ClickConsumerDependencies = {
  saveClickEvent: (
    event: TinyUrlAccessedEvent,
  ) => Promise<SaveClickEventResult>;
};

export const CLICK_MESSAGE_RESULT = {
  ACK: "ack",
  REJECT: "reject",
  REQUEUE: "requeue",
} as const;

type ClickMessageResult =
  (typeof CLICK_MESSAGE_RESULT)[keyof typeof CLICK_MESSAGE_RESULT];

const defaultDependencies: ClickConsumerDependencies = {
  saveClickEvent,
};

export async function processClickMessage(
  content: Buffer,
  dependencies: ClickConsumerDependencies = defaultDependencies,
): Promise<ClickMessageResult> {
  let event: TinyUrlAccessedEvent;

  try {
    event = tinyUrlAccessedEventSchema.parse(
      JSON.parse(content.toString("utf8")),
    );
  } catch (error) {
    clickConsumerLogger.warn({ err: error }, "invalid click event rejected");
    return CLICK_MESSAGE_RESULT.REJECT;
  }

  try {
    const result = await dependencies.saveClickEvent(event);

    clickConsumerLogger.debug(
      { eventId: event.eventId, code: event.data.code, result },
      "click event processed",
    );
    return CLICK_MESSAGE_RESULT.ACK;
  } catch (error) {
    clickConsumerLogger.error(
      { err: error, eventId: event.eventId, code: event.data.code },
      "failed to persist click event",
    );
    return CLICK_MESSAGE_RESULT.REQUEUE;
  }
}

export async function startClickConsumer(): Promise<Channel> {
  const channel = await createRabbitMqConsumerChannel();

  channel.on("error", (error: Error) => {
    clickConsumerLogger.error(
      { err: error },
      "click consumer channel error",
    );
  });

  try {
    await channel.prefetch(10);
    await channel.consume(
      config.rabbitmqAccessQueue,
      (message) => {
        if (message !== null) {
          void handleDelivery(channel, message).catch((error: unknown) => {
            clickConsumerLogger.error(
              { err: error },
              "failed to acknowledge click event",
            );
          });
        }
      },
      { noAck: false },
    );
  } catch (error) {
    await channel.close().catch(() => undefined);
    throw error;
  }

  clickConsumerLogger.info(
    { queue: config.rabbitmqAccessQueue },
    "click consumer started",
  );

  return channel;
}

async function handleDelivery(
  channel: Channel,
  message: ConsumeMessage,
): Promise<void> {
  const result = await processClickMessage(message.content);

  switch (result) {
    case CLICK_MESSAGE_RESULT.ACK:
      channel.ack(message);
      return;
    case CLICK_MESSAGE_RESULT.REJECT:
      channel.reject(message, false);
      return;
    case CLICK_MESSAGE_RESULT.REQUEUE:
      channel.nack(message, false, true);
  }
}
