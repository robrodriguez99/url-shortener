# Session Handoff

Last updated: 2026-06-14

## Goal

Complete the backend assessment in `docs/Challenge Técnico – Backend Node.pdf`.
The immediate priority is the API. The frontend will remain minimal and be added only
after the backend flows work.

## Current State

### Project foundation

- Node.js + TypeScript using ESM.
- Express 5.
- Strict TypeScript configuration.
- ESLint flat config.
- Vitest, Supertest, and V8 coverage.
- Development and production Dockerfile stages.
- Docker Compose services:
  - API;
  - MongoDB;
  - Redis;
  - RabbitMQ with Management UI.
- The worker is not yet in Compose because its entrypoint does not exist.
- `README.md` documents setup, commands, logging, MongoDB access, and library roles.

### Infrastructure

- Environment variables are loaded with dotenv and validated with Zod.
- Mongoose connection and disconnection are implemented.
- The API connects to MongoDB before opening its HTTP port.
- `SIGINT` and `SIGTERM` trigger graceful HTTP/MongoDB shutdown.
- `GET /health` returns `{ "status": "ok" }`.

### URL module

Implemented:

- `url.schemas.ts`
  - HTTP/HTTPS URL validation;
  - optional alias;
  - shared code validation: 3-50 characters, alphanumeric, `-`, `_`.
- `url.model.ts`
  - `code`;
  - `originalUrl`;
  - timestamps;
  - unique index on `code`.
- `url.repository.ts`
  - create URL;
  - find by code;
  - check code existence;
  - translate MongoDB duplicate-key `11000` into
    `DuplicateShortUrlCodeError`.
- `url.service.ts`
  - validates input with Zod;
  - creates with a custom alias;
  - generates an eight-character base64url code;
  - retries generated-code collisions up to five times;
  - resolves validated codes through MongoDB;
  - returns the original URL or throws `ShortUrlNotFoundError`;
  - builds the public short URL;
  - supports dependency injection for unit tests.
- `url.controller.ts`
  - passes the raw HTTP body to the service;
  - uses `config.baseUrl`;
  - returns `201 Created`;
  - redirects resolved codes with `302 Found`;
  - lets Express 5 forward async errors to the global error handler.
- `url.routes.ts`
  - registers `POST /api/urls`;
  - registers `GET /:code` after the API routes;
  - is mounted in `src/api/app.ts` before `errorHandler`.

The creation and basic resolution flows are implemented end to end:

```text
POST /api/urls
  -> url.routes.ts
  -> createUrlController
  -> createUrl service
  -> url.repository
  -> ShortUrlModel
  -> MongoDB
```

```text
GET /:code
  -> resolveUrlController
  -> resolveUrl service
  -> findShortUrlByCode repository
  -> MongoDB
  -> 302 redirect
```

Supported requests:

```json
{ "originalUrl": "https://example.com" }
```

```json
{
  "originalUrl": "https://example.com",
  "alias": "example"
}
```

Dependency injection detail:

```text
defaultDependencies.createShortUrl
  -> imported createShortUrl from url.repository.ts
  -> ShortUrlModel.create()
  -> MongoDB
```

Tests replace those defaults with mocks. This is why editor navigation from
`dependencies.createShortUrl` may lead to the dependency type rather than directly to
the repository function.

### Click module

Implemented:

- `click.schemas.ts` for `tinyurl.accessed.v1`;
- `click.model.ts`;
- unique index on `eventId`;
- compound index `{ code: 1, occurredAt: -1 }`.

RabbitMQ publishing, consumption, and click persistence repositories are not yet
implemented.

### Error handling

Implemented:

- shared `AppError`;
- global Express `errorHandler`;
- consistent public shape:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable message",
    "details": []
  }
}
```

`details` is optional and is primarily used for validation issues.

- Zod errors -> `400 VALIDATION_ERROR`;
- alias conflict -> `409 SHORT_URL_CODE_CONFLICT`;
- generated-code exhaustion -> `500 SHORT_URL_CODE_GENERATION_FAILED`;
- missing code -> `404 SHORT_URL_NOT_FOUND`;
- unknown errors -> `500 INTERNAL_ERROR`.

Database errors are translated in repositories. Services do not inspect MongoDB error
codes.

### Logging

- Pino provides the shared structured logger.
- pino-http records requests and adds `x-request-id`.
- `/health` is excluded from automatic request logs.
- URL creation logs `code` and whether it used a custom alias.
- Original destination URLs, authorization headers, and cookies are not logged.
- Runtime logs are written to stdout and are visible through
  `npm run docker:logs:api`.

## Tests

At this handoff:

- 8 test files;
- 24 tests;
- typecheck passes;
- lint passes;
- build passes;
- tests pass.

Covered areas:

- health endpoint;
- URL request schema;
- URL controller and HTTP route;
- click event schema;
- URL service behavior;
- URL resolution service behavior;
- URL redirect and resolution HTTP behavior;
- MongoDB duplicate-key translation;
- HTTP error serialization.

## Next Task

Implement URL resolution Stage 2: cache and asynchronous access event.

Extend the existing resolution flow:

```text
GET /:code
  -> Redis cache
  -> MongoDB fallback
  -> populate Redis
  -> publish tinyurl.accessed.v1
  -> 302 redirect
```

Tasks:

1. Add Redis client dependency and connection lifecycle.
2. Create `url.cache.ts` using key `short-url:{code}` and configured TTL.
3. Implement cache-aside with MongoDB fallback.
4. Treat Redis failures as non-fatal and continue with MongoDB.
5. Add RabbitMQ client and connection lifecycle.
6. Publish persistent `tinyurl.accessed.v1` events after successful resolution.
7. Do not block a valid redirect if event publication fails; log the failure.
8. Add cache hit, cache miss, Redis failure, and publisher tests.

Do not implement the worker in these two stages. The worker is the following vertical
flow after publishing works.

## Known Pending Work

- Redis connection and URL cache.
- RabbitMQ connection and publisher.
- Worker and RabbitMQ consumer.
- Click repository and statistics endpoint.
- Minimal frontend.
- Add the worker service to Compose after its entrypoint exists.

## Commands

```bash
npm run typecheck
npm run lint
npm test
npm run build

npm run docker:up
npm run docker:logs
npm run docker:logs:api
npm run docker:mongo
npm run docker:down
```

RabbitMQ Management UI:

```text
http://localhost:15672
username: app
password: app
```
