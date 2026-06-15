# AGENTS.md

## Project

This repository implements a Tiny URL backend assessment using Node.js, TypeScript,
Express, MongoDB, Redis, RabbitMQ, and Docker Compose.

Read these files before making architectural changes:

- `README.md`: setup, commands, libraries, logs, and local service access.
- `docs/design-doc.md`: target architecture and technical decisions.
- `docs/entrega-tecnica.md`: implementation and delivery overview.
- `docs/Challenge Técnico – Backend Node.pdf`: original assessment.

Keep the assessment intentionally small. Do not add authentication, users, URL editing,
advanced analytics, microservices, or production infrastructure unless explicitly
requested.

## Architecture

Code is organized by feature, not by technical layer:

```text
src/
  api/
  infrastructure/
  modules/
    urls/
    clicks/
  shared/
```

Within an HTTP feature, use this dependency direction:

```text
route -> controller -> service -> repository -> model -> MongoDB
```

- Routes declare HTTP method/path and delegate.
- Controllers translate HTTP requests and responses. Keep them thin.
- Services implement use cases and business rules.
- Repositories isolate persistence and translate database-specific errors.
- Models define MongoDB persistence.
- Zod schemas validate runtime input and infer TypeScript types.
- Infrastructure modules own external connections and lifecycle.

Do not import Express types into services or repositories. Do not expose Mongoose
errors or documents beyond the persistence boundary when a plain type is sufficient.

## Data And Caching

- MongoDB is the source of truth.
- Redis is a cache only and must not decide whether an alias is available.
- URL resolution will use cache-aside:
  Redis -> MongoDB on miss -> populate Redis.
- A Redis failure must fall back to MongoDB for resolution.
- RabbitMQ is only for asynchronous access events, not URL creation.
- RabbitMQ credentials are mandatory Compose variables. Never add password defaults
  or real credentials to Compose, `.env.example`, docs, or source code.

## URL Rules

- `originalUrl` must be a valid HTTP or HTTPS URL.
- A custom alias is optional.
- Codes and aliases must be 3-50 characters.
- Allowed code characters: letters, numbers, `-`, and `_`.
- Generated codes use `randomBytes(6).toString("base64url")`.
- Generated-code collisions are retried at most five times.
- MongoDB has a unique index on `urls.code`.

## Error Handling

Public HTTP errors use this shape:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable message",
    "details": []
  }
}
```

`details` is optional. Use:

- `AppError` for expected application errors with an HTTP status.
- `ZodError` for invalid runtime input; the global middleware maps it to
  `400 VALIDATION_ERROR`.
- The global `errorHandler` for final HTTP serialization.
- `500 INTERNAL_ERROR` for unknown errors without exposing stacks or infrastructure.

Register `errorHandler` after every route. Express 5 forwards rejected async route
handlers automatically:

```text
controller/service throws
  -> Express catches the rejected promise
  -> errorHandler classifies the error
  -> one consistent HTTP error response
```

Controllers must not duplicate `try/catch` blocks only to serialize errors.

Repositories may know provider-specific errors. For example, the URL repository maps
MongoDB duplicate-key error `11000` to `DuplicateShortUrlCodeError`. Services must not
inspect MongoDB error codes.

Expected URL errors:

- `SHORT_URL_CODE_CONFLICT` -> HTTP 409.
- `SHORT_URL_CODE_GENERATION_FAILED` -> HTTP 500.

Avoid logging and rethrowing the same error at every layer. Log unexpected failures at
the process or HTTP boundary.

## Logging

- Use the shared Pino logger; do not add new runtime `console.log` calls.
- `pino-http` logs completed requests and assigns/propagates `x-request-id`.
- `/health` is excluded from automatic request logs to reduce noise.
- Create child loggers with a stable `module` field for service-level events.
- Log structured fields, not interpolated blobs.
- Do not log destination URLs because query strings may contain sensitive data.
- Do not log authorization or cookie headers; they are redacted globally.
- Log expected 4xx responses through HTTP completion logs, not at every layer.
- Log unexpected errors once at the HTTP or process boundary.
- Bootstrap configuration errors may use `console.error` because logging may not be
  initialized yet.

## Input Security

- Services validate untrusted runtime input with Zod before persistence.
- Controllers pass the raw request body to the service and remain thin.
- MongoDB operations use Mongoose query objects, not dynamically constructed query
  strings.
- Zod enforces strings for URL and alias fields, preventing objects such as
  `{ "$ne": null }` from reaching repository filters.
- Only HTTP and HTTPS destination URLs are accepted; schemes such as `javascript:` are
  rejected.
- XSS escaping belongs at an HTML rendering boundary. The API currently returns JSON
  and redirects to validated HTTP/HTTPS URLs; it does not render user input as HTML.
- Do not claim that validation alone prevents every injection class. Keep database
  queries parameterized/structured and encode output for its destination context.

## Events

The only required event is `tinyurl.accessed.v1`, emitted after resolving a valid
short URL. It contains:

- `eventId` UUID;
- ISO `occurredAt`;
- URL `code`;
- optional `ip`;
- optional `userAgent`.

The worker will validate the event, persist it in `click_events`, and acknowledge the
message only after persistence. `click_events.eventId` is unique for idempotency.

## Development

Use ESM imports with `.js` suffixes in TypeScript source files.

Common commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run docker:up
npm run docker:down
```

Before finishing a code change, run typecheck, lint, tests, and build. Supertest opens
a local ephemeral port, so sandboxed environments may need permission for `npm test`.

Do not create empty architecture folders or placeholder layers. Add files when they
have a concrete responsibility.

When adding or replacing a library:

1. Add it through npm so `package.json` and `package-lock.json` stay aligned.
2. Document its purpose in the `README.md` Main Libraries section.
3. Document user-facing setup, commands, ports, or environment variables.
4. Update `docs/design-doc.md` when it changes an architectural decision.
5. Run `npm audit --audit-level=high` and the standard project checks.
