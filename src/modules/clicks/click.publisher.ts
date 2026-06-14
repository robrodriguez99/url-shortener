import { config } from "../../infrastructure/config/env.js";
import { getRabbitMqPublisherChannel } from "../../infrastructure/rabbitmq/connection.js";
import {
  TINY_URL_ACCESSED_EVENT_TYPE,
  tinyUrlAccessedEventSchema,
  type TinyUrlAccessedEvent,
} from "./click.schemas.js";

async function waitForPublisherConfirmation(
  confirmation: Promise<void>,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      confirmation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("RabbitMQ publisher confirmation timed out"));
        }, config.rabbitmqPublishTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export async function publishTinyUrlAccessedEvent(
  event: TinyUrlAccessedEvent,
): Promise<void> {
  const validatedEvent = tinyUrlAccessedEventSchema.parse(event);
  const channel = getRabbitMqPublisherChannel();

  channel.publish(
    config.rabbitmqExchange,
    TINY_URL_ACCESSED_EVENT_TYPE,
    Buffer.from(JSON.stringify(validatedEvent)),
    {
      persistent: true,
      contentType: "application/json",
      type: validatedEvent.type,
      messageId: validatedEvent.eventId,
    },
  );

  await waitForPublisherConfirmation(channel.waitForConfirms());
}
