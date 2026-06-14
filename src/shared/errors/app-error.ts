export type ErrorDetails = ReadonlyArray<{
  path?: string;
  message: string;
}>;

type AppErrorOptions = {
  code: string;
  message: string;
  statusCode: number;
  details?: ErrorDetails;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: ErrorDetails | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}
