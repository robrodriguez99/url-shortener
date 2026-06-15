import pino from "pino";

const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL ?? "info";

export const LOGGER_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.location",
];

const transport =
  nodeEnv === "development"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          singleLine: true,
          translateTime: "SYS:standard",
        },
      }
    : undefined;

export const logger = pino(
  {
    level: nodeEnv === "test" ? "silent" : logLevel,
    base: {
      service: "url-shortener",
      environment: nodeEnv,
    },
    redact: {
      paths: LOGGER_REDACT_PATHS,
      censor: "[REDACTED]",
    },
  },
  transport === undefined ? undefined : pino.transport(transport),
);
