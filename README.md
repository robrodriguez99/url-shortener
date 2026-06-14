# URL Shortener

Tiny URL backend built with Node.js, TypeScript, Express, MongoDB, Redis, RabbitMQ,
and Docker Compose.

The architecture and current implementation status are documented in:

- `docs/design-doc.md`
- `docs/resumen-diseno.md`
- `docs/entrega-tecnica.md`
- `docs/session-handoff.md`
- `AGENTS.md`

## Requirements

- Node.js 22 or newer.
- npm.
- Docker with Docker Compose.

## Setup

```bash
cp .env.example .env
npm install
npm run docker:up
```

The API is available at:

```text
http://localhost:3000
```

RabbitMQ Management is available at:

```text
http://localhost:15672
```

Use the `RABBITMQ_USER` and `RABBITMQ_PASSWORD` values from your local `.env`.
Compose refuses to start if either variable is missing.

## Commands

```bash
npm run dev
npm run worker:dev
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
npm run docker:ps
npm run docker:down
```

### Runtime operations

Check container status and health:

```bash
npm run docker:ps
```

Follow all service logs, API logs, or worker logs:

```bash
npm run docker:logs
npm run docker:logs:api
npm run docker:logs:worker
```

Open MongoDB and Redis shells:

```bash
npm run docker:mongo
npm run docker:redis
```

Inspect RabbitMQ queue message counts:

```bash
npm run docker:rabbitmq
```

When `package.json` or `package-lock.json` changes while Compose is already running,
update the persistent API and worker `node_modules` volumes and restart both services:

```bash
docker compose run --rm api npm ci
docker compose run --rm worker npm ci
docker compose restart api worker
```

Rebuilding the image alone does not update the mounted `api_node_modules` and
`worker_node_modules` volumes.

## Creating URLs

Generated code:

```bash
curl -X POST http://localhost:3000/api/urls \
  -H "Content-Type: application/json" \
  -d '{"originalUrl":"https://example.com"}'
```

Custom alias:

```bash
curl -X POST http://localhost:3000/api/urls \
  -H "Content-Type: application/json" \
  -d '{"originalUrl":"https://example.com","alias":"example"}'
```

`health` is reserved for the operational endpoint and cannot be used as an alias.

Resolve a URL without following the redirect:

```bash
curl -i http://localhost:3000/example
```

Get statistics for an existing code:

```bash
curl -i http://localhost:3000/api/stats/example
```

Response:

```json
{
  "code": "example",
  "totalClicks": 2,
  "lastClick": "2026-06-14T19:00:00.000Z"
}
```

URLs without accesses return `totalClicks: 0` and `lastClick: null`.

## Logging

The application uses:

- `pino`: shared structured application logger.
- `pino-http`: Express middleware for HTTP request logs.
- `pino-pretty`: readable development output. Production output remains JSON.

Logs are written to stdout. With Docker:

```bash
npm run docker:logs:api
```

### Automatic HTTP logs

`pino-http` logs completed requests with:

- request ID;
- method and path;
- status code;
- response time;
- request and response metadata.

Every request receives an `x-request-id` response header. If the client sends its own
`x-request-id`, the application preserves it. `/health` is excluded from automatic
logging to reduce noise.

HTTP log levels are:

```text
2xx/3xx -> info
4xx     -> warn
5xx     -> error
```

Authorization and cookie headers are redacted. Request bodies are not logged.

### Application logs

Use the shared logger:

```ts
import { logger } from "./shared/logger/logger.js";

logger.info({ code }, "short URL created");
logger.error({ err: error }, "operation failed");
```

Modules should use child loggers:

```ts
const moduleLogger = logger.child({ module: "url-service" });
```

This adds the `module` field to every related record.

Avoid logging:

- original destination URLs, because query strings may contain secrets;
- passwords, tokens, cookies, or authorization headers;
- the same error at multiple layers.

Control the minimum level with `.env`:

```text
LOG_LEVEL=debug
```

Available levels, from most to least severe:

```text
fatal, error, warn, info, debug, trace
```

Setting `info` includes `info`, `warn`, `error`, and `fatal`, but excludes `debug` and
`trace`.

Logging configuration lives in:

- `src/shared/logger/logger.ts`
- `src/shared/logger/http-logger.ts`

## MongoDB

This connection string:

```text
mongodb://localhost:27017/url_shortener
```

means:

```text
mongodb://       MongoDB protocol
localhost        server running on this machine
27017            MongoDB port
url_shortener    database name
```

Docker exposes the MongoDB container's port `27017` on the local machine, so tools
outside Docker can use `localhost`.

Inside Docker Compose, the API uses:

```text
mongodb://mongo:27017/url_shortener
```

`mongo` is the Compose service name and acts as the hostname inside the Docker network.

### Using mongosh

Open a shell connected to the project database:

```bash
npm run docker:mongo
```

Useful commands:

```javascript
show collections

db.shorturls.find().sort({ createdAt: -1 }).pretty()

db.shorturls.findOne({ code: "example" })

db.shorturls.countDocuments()

db.click_events.find().sort({ occurredAt: -1 }).pretty()

db.click_events.countDocuments()

exit
```

Mongoose pluralizes the model name `ShortUrl` into the collection name `shorturls`.
The click collection is explicitly named `click_events`.

### Using MongoDB Compass

Open MongoDB Compass and connect with:

```text
mongodb://localhost:27017
```

Then select:

```text
database:   url_shortener
collection: shorturls
```

## Redis

Redis caches resolved destination URLs using:

```text
short-url:{code} -> originalUrl
```

Entries expire after `REDIS_CACHE_TTL_SECONDS`, which defaults to 86400 seconds
(24 hours). MongoDB remains the source of truth. Cache read and write failures are
logged and do not prevent a valid redirect.

Docker exposes Redis on `localhost:6379`. Inspect a cached URL with:

```bash
docker compose exec redis redis-cli GET short-url:example
```

Check its remaining TTL with:

```bash
docker compose exec redis redis-cli TTL short-url:example
```

## RabbitMQ

Every successful `GET /:code` publishes a `tinyurl.accessed.v1` event. The API
declares this durable topology when it connects:

```text
direct exchange: tinyurl.events
routing key:     tinyurl.accessed.v1
durable queue:   tinyurl.accessed.persist
```

Messages are JSON, marked persistent, and published through a confirmation channel.
The API waits at most `RABBITMQ_PUBLISH_TIMEOUT_MS`, which defaults to 1000 ms, for
the broker confirmation. Publishing failures or timeouts are logged but do not
prevent a valid `302` redirect.

The worker consumes `tinyurl.accessed.persist` with manual acknowledgements:

- valid events are persisted in MongoDB before `ack`;
- duplicate `eventId` values are treated as already processed and acknowledged;
- transient persistence failures use `nack` with requeue;
- malformed messages are rejected without requeue.

Inspect queue message counts from the terminal:

```bash
npm run docker:rabbitmq
```

The RabbitMQ Management UI is available at `http://localhost:15672`. Use the
`RABBITMQ_USER` and `RABBITMQ_PASSWORD` values from `.env`. With the worker running,
ready messages are normally consumed quickly and persisted in `click_events`.

### Testing the worker

Resolve an existing code and inspect its latest persisted event:

```bash
curl -i http://localhost:3000/example

docker compose exec -T mongo mongosh --quiet url_shortener --eval \
  'db.click_events.find({code:"example"}).sort({occurredAt:-1}).limit(1).toArray()'
```

To test two concurrent messages, first create a dedicated URL:

```bash
curl -X POST http://localhost:3000/api/urls \
  -H "Content-Type: application/json" \
  -d '{"originalUrl":"https://example.com","alias":"worker-concurrency-test"}'
```

Check its current event count:

```bash
docker compose exec -T mongo mongosh --quiet url_shortener --eval \
  'db.click_events.countDocuments({code:"worker-concurrency-test"})'
```

Send two requests concurrently:

```bash
printf '1\n2\n' | xargs -P2 -I{} \
  curl -s -o /dev/null -w "request {}: %{http_code}\n" \
  http://localhost:3000/worker-concurrency-test
```

Run the count command again. It should increase by `2`. You can also confirm that the
queue has been drained and inspect worker logs:

```bash
npm run docker:rabbitmq
npm run docker:logs:worker
```

## Main Libraries

| Library | Purpose |
| --- | --- |
| `express` | HTTP server, routes, and middleware |
| `mongoose` | MongoDB models, indexes, queries, and connection |
| `redis` | Redis client and URL resolution cache |
| `amqplib` | RabbitMQ connection, topology, publishing, and consumption |
| `zod` | Runtime validation and TypeScript type inference |
| `dotenv` | Loads local `.env` variables |
| `pino` | Structured application logging |
| `pino-http` | HTTP request logging and request IDs |
| `pino-pretty` | Readable development logs |
| `vitest` | Test runner |
| `supertest` | HTTP integration tests |
| `tsx` | Runs TypeScript directly during development |
| `typescript-eslint` | TypeScript-aware linting |
