import { AppError } from "../../shared/errors/app-error.js";

export class DuplicateShortUrlCodeError extends Error {
  constructor(code: string) {
    super(`Short URL code "${code}" already exists in persistence`);
    this.name = "DuplicateShortUrlCodeError";
  }
}

export class ShortUrlCodeConflictError extends AppError {
  constructor(code: string) {
    super({
      code: "SHORT_URL_CODE_CONFLICT",
      message: `Short URL code "${code}" is already in use`,
      statusCode: 409,
    });
    this.name = "ShortUrlCodeConflictError";
  }
}

export class ShortUrlCodeGenerationError extends AppError {
  constructor() {
    super({
      code: "SHORT_URL_CODE_GENERATION_FAILED",
      message: "Unable to create a short URL",
      statusCode: 500,
    });
    this.name = "ShortUrlCodeGenerationError";
  }
}

export class ShortUrlNotFoundError extends AppError {
  constructor(code: string) {
    super({
      code: "SHORT_URL_NOT_FOUND",
      message: `Short URL code "${code}" was not found`,
      statusCode: 404,
    });
    this.name = "ShortUrlNotFoundError";
  }
}
