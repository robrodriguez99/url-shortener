import { randomBytes, randomUUID } from "node:crypto";

import { publishTinyUrlAccessedEvent } from "../clicks/click.publisher.js";
import {
  TINY_URL_ACCESSED_EVENT_TYPE,
  type TinyUrlAccessedEvent,
} from "../clicks/click.schemas.js";
import {
  cacheOriginalUrl,
  getCachedOriginalUrl,
} from "./url.cache.js";
import {
  DuplicateShortUrlCodeError,
  ShortUrlCodeConflictError,
  ShortUrlCodeGenerationError,
  ShortUrlNotFoundError,
} from "./url.errors.js";
import {
  createShortUrl,
  findShortUrlByCode,
  shortUrlCodeExists,
  type CreateShortUrlData,
} from "./url.repository.js";
import {
  createUrlSchema,
  shortUrlCodeSchema,
} from "./url.schemas.js";
import { logger } from "../../shared/logger/logger.js";

const MAX_CODE_GENERATION_ATTEMPTS = 5;
const urlServiceLogger = logger.child({ module: "url-service" });

export type CreateUrlResult = {
  code: string;
  originalUrl: string;
  shortUrl: string;
};

type CreateUrlDependencies = {
  createShortUrl: (
    data: CreateShortUrlData,
  ) => Promise<{ code: string; originalUrl: string }>;
  shortUrlCodeExists: (code: string) => Promise<boolean>;
  generateCode: () => string;
};

type ResolveUrlDependencies = {
  getCachedOriginalUrl: (code: string) => Promise<string | null>;
  findShortUrlByCode: (
    code: string,
  ) => Promise<{ originalUrl: string } | null>;
  cacheOriginalUrl: (
    code: string,
    originalUrl: string,
  ) => Promise<void>;
  publishTinyUrlAccessedEvent: (
    event: TinyUrlAccessedEvent,
  ) => Promise<void>;
  createEventId: () => string;
  getCurrentDate: () => Date;
};

export type ResolveUrlContext = {
  ip?: string;
  userAgent?: string;
};

const defaultCreateUrlDependencies: CreateUrlDependencies = {
  createShortUrl,
  shortUrlCodeExists,
  generateCode: () => randomBytes(6).toString("base64url"),
};

const defaultResolveUrlDependencies: ResolveUrlDependencies = {
  getCachedOriginalUrl,
  findShortUrlByCode,
  cacheOriginalUrl,
  publishTinyUrlAccessedEvent,
  createEventId: randomUUID,
  getCurrentDate: () => new Date(),
};

export async function createUrl(
  input: unknown,
  baseUrl: string,
  dependencies: CreateUrlDependencies = defaultCreateUrlDependencies,
): Promise<CreateUrlResult> {
  const validatedInput = createUrlSchema.parse(input);

  if (validatedInput.alias !== undefined) {
    const result = await createUrlWithAlias(
      validatedInput.originalUrl,
      validatedInput.alias,
      baseUrl,
      dependencies,
    );

    urlServiceLogger.info(
      { code: result.code, customAlias: true },
      "short URL created",
    );

    return result;
  }

  const result = await createUrlWithGeneratedCode(
    validatedInput.originalUrl,
    baseUrl,
    dependencies,
  );

  urlServiceLogger.info(
    { code: result.code, customAlias: false },
    "short URL created",
  );

  return result;
}

export async function resolveUrl(
  code: unknown,
  context: ResolveUrlContext = {},
  dependencies: ResolveUrlDependencies = defaultResolveUrlDependencies,
): Promise<string> {
  const validatedCode = shortUrlCodeSchema.parse(code);
  const cachedOriginalUrl = await readCachedOriginalUrl(
    validatedCode,
    dependencies,
  );

  if (cachedOriginalUrl !== null) {
    await publishAccessEvent(validatedCode, context, dependencies);
    return cachedOriginalUrl;
  }

  const shortUrl = await dependencies.findShortUrlByCode(validatedCode);

  if (shortUrl === null) {
    throw new ShortUrlNotFoundError(validatedCode);
  }

  await writeCachedOriginalUrl(
    validatedCode,
    shortUrl.originalUrl,
    dependencies,
  );
  await publishAccessEvent(validatedCode, context, dependencies);

  return shortUrl.originalUrl;
}

async function publishAccessEvent(
  code: string,
  context: ResolveUrlContext,
  dependencies: ResolveUrlDependencies,
): Promise<void> {
  try {
    await dependencies.publishTinyUrlAccessedEvent({
      eventId: dependencies.createEventId(),
      type: TINY_URL_ACCESSED_EVENT_TYPE,
      occurredAt: dependencies.getCurrentDate().toISOString(),
      data: {
        code,
        ...(context.ip === undefined ? {} : { ip: context.ip }),
        ...(context.userAgent === undefined
          ? {}
          : { userAgent: context.userAgent }),
      },
    });
  } catch (error) {
    urlServiceLogger.warn(
      { err: error, code },
      "failed to publish short URL access event",
    );
  }
}

async function readCachedOriginalUrl(
  code: string,
  dependencies: ResolveUrlDependencies,
): Promise<string | null> {
  try {
    return await dependencies.getCachedOriginalUrl(code);
  } catch (error) {
    urlServiceLogger.warn(
      { err: error, code },
      "failed to read short URL cache",
    );
    return null;
  }
}

async function writeCachedOriginalUrl(
  code: string,
  originalUrl: string,
  dependencies: ResolveUrlDependencies,
): Promise<void> {
  try {
    await dependencies.cacheOriginalUrl(code, originalUrl);
  } catch (error) {
    urlServiceLogger.warn(
      { err: error, code },
      "failed to write short URL cache",
    );
  }
}

async function createUrlWithAlias(
  originalUrl: string,
  alias: string,
  baseUrl: string,
  dependencies: CreateUrlDependencies,
): Promise<CreateUrlResult> {
  const codeExists = await dependencies.shortUrlCodeExists(alias);

  if (codeExists) {
    throw new ShortUrlCodeConflictError(alias);
  }

  try {
    const shortUrl = await dependencies.createShortUrl({
      code: alias,
      originalUrl,
    });

    return toCreateUrlResult(shortUrl, baseUrl);
  } catch (error) {
    if (error instanceof DuplicateShortUrlCodeError) {
      throw new ShortUrlCodeConflictError(alias);
    }

    throw error;
  }
}

async function createUrlWithGeneratedCode(
  originalUrl: string,
  baseUrl: string,
  dependencies: CreateUrlDependencies,
): Promise<CreateUrlResult> {
  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = shortUrlCodeSchema.parse(dependencies.generateCode());

    try {
      const shortUrl = await dependencies.createShortUrl({
        code,
        originalUrl,
      });

      return toCreateUrlResult(shortUrl, baseUrl);
    } catch (error) {
      if (!(error instanceof DuplicateShortUrlCodeError)) {
        throw error;
      }

      urlServiceLogger.debug(
        { code, attempt: attempt + 1 },
        "generated code collision",
      );
    }
  }

  throw new ShortUrlCodeGenerationError();
}

function toCreateUrlResult(
  shortUrl: { code: string; originalUrl: string },
  baseUrl: string,
): CreateUrlResult {
  return {
    code: shortUrl.code,
    originalUrl: shortUrl.originalUrl,
    shortUrl: `${baseUrl.replace(/\/$/, "")}/${shortUrl.code}`,
  };
}
