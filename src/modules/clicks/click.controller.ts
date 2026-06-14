import type { Request, Response } from "express";

import {
  getUrlStats,
  type UrlStatsResult,
} from "./click.service.js";

export async function getUrlStatsController(
  request: Request<{ code: string }>,
  response: Response<UrlStatsResult>,
): Promise<void> {
  const result = await getUrlStats(request.params.code);

  response.status(200).json(result);
}
