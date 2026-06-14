import {
  countClicksByCode,
  findLatestClickByCode,
} from "./click.repository.js";
import { findShortUrlByCode } from "../urls/url.repository.js";
import { ShortUrlNotFoundError } from "../urls/url.errors.js";
import { shortUrlCodeSchema } from "../urls/url.schemas.js";

export type UrlStatsResult = {
  code: string;
  totalClicks: number;
  lastClick: string | null;
};

type GetUrlStatsDependencies = {
  findShortUrlByCode: (
    code: string,
  ) => Promise<{ code: string } | null>;
  countClicksByCode: (code: string) => Promise<number>;
  findLatestClickByCode: (
    code: string,
  ) => Promise<{ occurredAt: Date } | null>;
};

const defaultDependencies: GetUrlStatsDependencies = {
  findShortUrlByCode,
  countClicksByCode,
  findLatestClickByCode,
};

export async function getUrlStats(
  code: unknown,
  dependencies: GetUrlStatsDependencies = defaultDependencies,
): Promise<UrlStatsResult> {
  const validatedCode = shortUrlCodeSchema.parse(code);
  const shortUrl = await dependencies.findShortUrlByCode(validatedCode);

  if (shortUrl === null) {
    throw new ShortUrlNotFoundError(validatedCode);
  }

  const [totalClicks, latestClick] = await Promise.all([
    dependencies.countClicksByCode(validatedCode),
    dependencies.findLatestClickByCode(validatedCode),
  ]);

  return {
    code: validatedCode,
    totalClicks,
    lastClick: latestClick?.occurredAt.toISOString() ?? null,
  };
}
