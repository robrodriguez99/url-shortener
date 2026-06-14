import { type HydratedDocument, mongo } from "mongoose";

import { DuplicateShortUrlCodeError } from "./url.errors.js";
import { type ShortUrl, ShortUrlModel } from "./url.model.js";

export type CreateShortUrlData = {
  code: string;
  originalUrl: string;
};

export async function createShortUrl(
  data: CreateShortUrlData,
): Promise<HydratedDocument<ShortUrl>> {
  try {
    return await ShortUrlModel.create(data);
  } catch (error) {
    if (error instanceof mongo.MongoServerError && error.code === 11_000) {
      throw new DuplicateShortUrlCodeError(data.code);
    }

    throw error;
  }
}

export async function findShortUrlByCode(
  code: string,
): Promise<ShortUrl | null> {
  return ShortUrlModel.findOne({ code }).lean<ShortUrl>().exec();
}

export async function shortUrlCodeExists(code: string): Promise<boolean> {
  const existingUrl = await ShortUrlModel.exists({ code });

  return existingUrl !== null;
}
