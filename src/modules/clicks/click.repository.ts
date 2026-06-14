import { mongo } from "mongoose";

import { ClickEventModel } from "./click.model.js";
import type { TinyUrlAccessedEvent } from "./click.schemas.js";

export type SaveClickEventResult = "created" | "duplicate";

export async function saveClickEvent(
  event: TinyUrlAccessedEvent,
): Promise<SaveClickEventResult> {
  try {
    await ClickEventModel.create({
      eventId: event.eventId,
      code: event.data.code,
      occurredAt: new Date(event.occurredAt),
      ...(event.data.ip === undefined ? {} : { ip: event.data.ip }),
      ...(event.data.userAgent === undefined
        ? {}
        : { userAgent: event.data.userAgent }),
    });

    return "created";
  } catch (error) {
    if (error instanceof mongo.MongoServerError && error.code === 11_000) {
      return "duplicate";
    }

    throw error;
  }
}

export async function countClicksByCode(code: string): Promise<number> {
  // The assessment counts raw events for simplicity. At scale, the worker
  // should maintain a per-code aggregate updated atomically.
  return ClickEventModel.countDocuments({ code }).exec();
}

export async function findLatestClickByCode(
  code: string,
): Promise<{ occurredAt: Date } | null> {
  return ClickEventModel.findOne({ code })
    .sort({ occurredAt: -1 })
    .select({ occurredAt: 1, _id: 0 })
    .lean<{ occurredAt: Date }>()
    .exec();
}
