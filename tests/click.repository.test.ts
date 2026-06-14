import { mongo } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClickEventModel } from "../src/modules/clicks/click.model.js";
import {
  countClicksByCode,
  findLatestClickByCode,
  saveClickEvent,
} from "../src/modules/clicks/click.repository.js";
import {
  TINY_URL_ACCESSED_EVENT_TYPE,
  type TinyUrlAccessedEvent,
} from "../src/modules/clicks/click.schemas.js";

const event: TinyUrlAccessedEvent = {
  eventId: "a9df919d-8e2a-44d6-84d6-63304c86267f",
  type: TINY_URL_ACCESSED_EVENT_TYPE,
  occurredAt: "2026-06-14T12:00:00.000Z",
  data: {
    code: "example",
    ip: "127.0.0.1",
    userAgent: "curl/8.7.1",
  },
};

describe("saveClickEvent repository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps an access event to the click model", async () => {
    const create = vi
      .spyOn(ClickEventModel, "create")
      .mockResolvedValueOnce({} as never);

    const result = await saveClickEvent(event);

    expect(create).toHaveBeenCalledWith({
      eventId: event.eventId,
      code: "example",
      occurredAt: new Date("2026-06-14T12:00:00.000Z"),
      ip: "127.0.0.1",
      userAgent: "curl/8.7.1",
    });
    expect(result).toBe("created");
  });

  it("treats a duplicate event ID as already processed", async () => {
    const duplicateKeyError = new mongo.MongoServerError({
      code: 11_000,
      message: "E11000 duplicate key error",
    });

    vi.spyOn(ClickEventModel, "create").mockRejectedValueOnce(
      duplicateKeyError,
    );

    await expect(saveClickEvent(event)).resolves.toBe("duplicate");
  });

  it("rethrows unexpected persistence errors", async () => {
    const error = new Error("MongoDB unavailable");

    vi.spyOn(ClickEventModel, "create").mockRejectedValueOnce(error);

    await expect(saveClickEvent(event)).rejects.toBe(error);
  });
});

describe("click statistics repository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts click events by code", async () => {
    const exec = vi.fn().mockResolvedValue(12);
    const countDocuments = vi
      .spyOn(ClickEventModel, "countDocuments")
      .mockReturnValue({ exec } as never);

    await expect(countClicksByCode("example")).resolves.toBe(12);

    expect(countDocuments).toHaveBeenCalledWith({ code: "example" });
  });

  it("finds the latest click by occurredAt", async () => {
    const latestClick = {
      occurredAt: new Date("2026-06-14T19:00:00.000Z"),
    };
    const exec = vi.fn().mockResolvedValue(latestClick);
    const lean = vi.fn().mockReturnValue({ exec });
    const select = vi.fn().mockReturnValue({ lean });
    const sort = vi.fn().mockReturnValue({ select });
    const findOne = vi
      .spyOn(ClickEventModel, "findOne")
      .mockReturnValue({ sort } as never);

    await expect(findLatestClickByCode("example")).resolves.toEqual(
      latestClick,
    );

    expect(findOne).toHaveBeenCalledWith({ code: "example" });
    expect(sort).toHaveBeenCalledWith({ occurredAt: -1 });
    expect(select).toHaveBeenCalledWith({ occurredAt: 1, _id: 0 });
  });
});
