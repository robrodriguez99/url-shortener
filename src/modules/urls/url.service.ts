import { randomBytes } from "node:crypto";

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
  findShortUrlByCode: (
    code: string,
  ) => Promise<{ originalUrl: string } | null>;
};

const defaultCreateUrlDependencies: CreateUrlDependencies = {
  createShortUrl,
  shortUrlCodeExists,
  generateCode: () => randomBytes(6).toString("base64url"),
};

const defaultResolveUrlDependencies: ResolveUrlDependencies = {
  findShortUrlByCode,
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
  dependencies: ResolveUrlDependencies = defaultResolveUrlDependencies,
): Promise<string> {
  const validatedCode = shortUrlCodeSchema.parse(code);
  const shortUrl = await dependencies.findShortUrlByCode(validatedCode);

  if (shortUrl === null) {
    throw new ShortUrlNotFoundError(validatedCode);
  }

  return shortUrl.originalUrl;
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
