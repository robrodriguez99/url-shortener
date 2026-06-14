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
  - worker;
  - MongoDB;
  - Redis;
  - RabbitMQ with Management UI.
- `README.md` documents setup, commands, logging, MongoDB access, and library roles.
- `docs/entrega-tecnica.md` provides the Spanish technical delivery document.
- `docs/resumen-diseno.md` provides a concise Spanish design summary and messaging
  technology comparison.

### Infrastructure

- Environment variables are loaded with dotenv and validated with Zod.
- Mongoose connection and disconnection are implemented.
- The Redis client uses the official `redis` package.
- Redis connection and disconnection are integrated into the API lifecycle.
- Redis startup failure is non-fatal; the API continues using MongoDB.
- RabbitMQ uses `amqplib` with a durable direct exchange and queue.
- RabbitMQ connection and disconnection are integrated into the API and worker
  lifecycles.
- RabbitMQ startup failure is non-fatal; redirects continue without publishing.
- The API connects to MongoDB before opening its HTTP port.
- API and worker wait for the MongoDB indexes required by their models before serving
  traffic or consuming messages.
- `SIGINT` and `SIGTERM` trigger graceful HTTP/MongoDB/Redis/RabbitMQ shutdown.
- `GET /health` returns `{ "status": "ok" }`.

### URL module

Implemented:

- `url.schemas.ts`
  - HTTP/HTTPS URL validation;
  - optional alias;
  - reserved `health` alias rejection;
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
- `url.cache.ts`
  - reads and writes `short-url:{code}`;
  - applies the configured Redis TTL;
  - isolates Redis-specific cache operations.
- `url.service.ts`
  - validates input with Zod;
  - creates with a custom alias;
  - generates an eight-character base64url code;
  - retries generated-code collisions up to five times;
  - resolves validated codes with Redis cache-aside and MongoDB fallback;
  - treats Redis read and write failures as non-fatal;
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

The creation and resolution flows are implemented end to end:

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
  -> Redis cache
  -> findShortUrlByCode repository on miss
  -> MongoDB fallback
  -> populate Redis
  -> publish tinyurl.accessed.v1
  -> 302 redirect
```

Publishing occurs for both cache hits and MongoDB resolutions. Events contain a UUID,
an ISO timestamp, the code, and optional request IP and user agent. Publication
failure is logged and does not block the redirect.

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
- `click.publisher.ts`:
  - validates events with Zod;
  - publishes persistent JSON messages;
  - waits for broker confirmation with a configurable timeout;
- `click.repository.ts`:
  - persists access events in `click_events`;
  - maps duplicate `eventId` errors to an idempotent `duplicate` result;
- `click.consumer.ts`:
  - validates and parses messages;
  - acknowledges created and duplicate events;
  - requeues transient persistence failures;
  - rejects invalid messages without requeue;
  - limits in-flight messages with `prefetch(10)`;
- `click.service.ts`:
  - validates statistics codes;
  - verifies the URL exists;
  - returns `totalClicks` and the latest `occurredAt`;
- `click.controller.ts` and `click.routes.ts`:
  - expose `GET /api/stats/:code`;
  - are registered before the catch-all `GET /:code`;
- unique index on `eventId`;
- compound index `{ code: 1, occurredAt: -1 }`.

The worker entrypoint connects to MongoDB and RabbitMQ, starts the consumer, and
handles graceful shutdown. The worker is registered in Docker Compose.

The complete flow has been verified against the Dockerized services:

```text
GET /:code
  -> RabbitMQ
  -> worker
  -> click_events
  -> ack
```

Two concurrent GET requests produced two persisted events, and the queue returned to
zero ready and unacknowledged messages.

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
- malformed JSON -> `400 INVALID_JSON`;
- oversized body -> `413 PAYLOAD_TOO_LARGE`;
- unknown route -> `404 ROUTE_NOT_FOUND`;
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
  `npm run docker:logs:api` and `npm run docker:logs:worker`.

## Tests

At this handoff:

- 15 test files;
- 61 tests;
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
- URL cache keys and TTL;
- cache hit, cache miss, Redis read failure, and Redis write failure;
- event payload, persistent publishing, and broker confirmation;
- publisher confirmation timeout;
- event publication success and non-fatal failure;
- click persistence and duplicate event idempotency;
- consumer acknowledgement, rejection, and requeue policies;
- click statistics service, controller, repository queries, and HTTP route;
- URL redirect and resolution HTTP behavior;
- MongoDB duplicate-key translation;
- HTTP error serialization.
- malformed JSON, oversized payload, and unknown-route serialization.

## Next Task

Add the minimal frontend after reviewing the remaining assessment requirements.

The backend now supports URL creation, resolution with cache-aside, asynchronous click
persistence, and statistics. Before starting the frontend, compare the implemented
HTTP contract and operational behavior against the original assessment PDF.

## Known Pending Work

- Minimal frontend.

## Commands

```bash
npm run typecheck
npm run lint
npm test
npm run build

npm run docker:up
npm run docker:logs
npm run docker:logs:api
npm run docker:logs:worker
npm run docker:mongo
npm run docker:redis
npm run docker:rabbitmq
npm run docker:down
```

RabbitMQ Management UI:

```text
http://localhost:15672
```

Credentials come from the ignored local `.env`. `RABBITMQ_USER` and
`RABBITMQ_PASSWORD` are mandatory in Compose and have no repository defaults.
