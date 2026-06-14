import type { Request, Response } from "express";

import { config } from "../../infrastructure/config/env.js";
import {
  createUrl,
  resolveUrl,
  type CreateUrlResult,
} from "./url.service.js";

export async function createUrlController(
  request: Request,
  response: Response<CreateUrlResult>,
): Promise<void> {
  const result = await createUrl(request.body, config.baseUrl);

  response.status(201).json(result);
}

export async function resolveUrlController(
  request: Request<{ code: string }>,
  response: Response,
): Promise<void> {
  const originalUrl = await resolveUrl(request.params.code);

  response.redirect(302, originalUrl);
}
