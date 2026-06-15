# Tiny URL - Design Document

## 1. Objetivo

Construir un servicio de URLs cortas que permita:

- crear una URL corta, con código generado o alias personalizado;
- resolver el código y redirigir a la URL original;
- usar Redis como caché durante la resolución;
- publicar cada acceso como un evento;
- procesar y persistir esos eventos de forma asincrónica;
- consultar estadísticas básicas por código.

El foco es demostrar diseño backend, separación de responsabilidades, validación,
manejo de errores y uso correcto de MongoDB, Redis y una cola de mensajes. Se incluye
un frontend mínimo para operar los flujos principales.

## 2. Alcance

### Incluido

- API HTTP en Node.js y TypeScript.
- MongoDB como fuente de verdad.
- Redis con estrategia cache-aside.
- RabbitMQ como message broker.
- Worker separado para persistir eventos.
- Frontend React para crear, abrir y consultar estadísticas.
- Docker Compose para levantar todo el entorno.
- Tests sobre los flujos principales.
- Documentación de ejecución y decisiones.

### Fuera de alcance

- Usuarios, autenticación y autorización.
- Edición o eliminación de URLs.
- Dashboard o frontend elaborado.
- Métricas avanzadas por país, dispositivo o período.
- Alta disponibilidad o despliegue productivo.
- Garantía transaccional estricta entre MongoDB y RabbitMQ.

No se modelan usuarios porque el challenge no los requiere. Agregarlos aumentaría el
alcance sin mejorar los flujos evaluados.

## 3. Decisiones principales

| Área | Decisión | Motivo |
| --- | --- | --- |
| Runtime | Node.js + TypeScript | Requisito del challenge y tipado del dominio |
| HTTP | Express | Framework conocido, simple y suficiente para el alcance |
| Frontend | React + Vite + Tailwind CSS | UI pequeña, build rápido y estilos sin componentes externos |
| Validación | Zod | Validación runtime e inferencia de tipos TypeScript |
| Logging | Pino + pino-http | Logs estructurados, request IDs y bajo overhead |
| Base de datos | MongoDB + Mongoose | Modelo documental simple e índices fáciles de expresar |
| Caché | Redis | Lookup rápido `code -> originalUrl` |
| Mensajería | RabbitMQ + `amqplib` | Broker explícito, acknowledgements, reentrega y colas durables |
| Procesos | Una API y un worker | Separa request/response del procesamiento asincrónico |
| Contenedores | Un Dockerfile, tres comandos | Frontend, API y worker comparten instalación e imagen base |

RabbitMQ se elige sobre BullMQ o Redis Streams para mantener separados los roles de
caché y mensajería y demostrar los conceptos pedidos por el assessment. La topología
se mantiene pequeña: un exchange, una cola y un tipo de consumidor, aunque pueden
ejecutarse varias instancias del worker.

## 4. Arquitectura

```text
Browser
  |
  v
React frontend
  |
  v
API (Express)
  |---- Redis (resolución cacheada)
  |---- MongoDB (URLs y lectura de estadísticas)
  `---- RabbitMQ exchange
             |
             v
    tinyurl.accessed.persist
             |
             v
          Worker
             |
             v
      MongoDB (click_events)
```

La API y el worker son procesos distintos, pero viven en el mismo repositorio y
comparten configuración, contratos de eventos y acceso a datos.

El frontend vive en `frontend/`. En desarrollo, Vite sirve la interfaz en `5173` y
proxyfía `/api` hacia Express. En producción, Express sirve el build estático de
`frontend/dist`.

## 5. Modelo de datos

### `shorturls`

```ts
type ShortUrl = {
  _id: ObjectId;
  code: string;
  originalUrl: string;
  createdAt: Date;
  updatedAt: Date;
};
```

Índices:

- índice único en `code`;
- no se requiere índice en `originalUrl`, porque diferentes códigos pueden apuntar a
  la misma URL.

Mongoose deriva la colección `shorturls` desde el modelo `ShortUrl`. `code` contiene
tanto códigos generados como alias personalizados. Esto evita mantener dos caminos de
resolución.

### `click_events`

```ts
type ClickEvent = {
  _id: ObjectId;
  eventId: string;
  code: string;
  occurredAt: Date;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
};
```

Índices:

- índice único en `eventId`, para hacer idempotente el consumidor;
- índice compuesto `{ code: 1, occurredAt: -1 }`, para estadísticas.

Cada acceso se guarda como un documento independiente. Para este challenge, el
endpoint de estadísticas usa `countDocuments({ code })` y busca el evento con el
`occurredAt` más reciente. Esta decisión prioriza simplicidad y mantiene
`click_events` como historial detallado.

La API espera la inicialización de `ShortUrlModel` y `ClickEventModel` antes de abrir
el puerto HTTP. El worker espera `ClickEventModel.init()` antes de consumir mensajes.
Así, los índices que sostienen unicidad e idempotencia existen antes de recibir
trabajo.

Esta estrategia no escala bien para consultas frecuentes sobre un volumen grande,
porque calcular `totalClicks` requiere contar eventos en cada request. En un sistema
real, el worker mantendría además un documento agregado por código en una colección
como `click_stats`:

```ts
type ClickStats = {
  code: string;
  totalClicks: number;
  lastClick: Date;
};
```

El worker lo actualizaría atómicamente con `$inc` para `totalClicks` y `$max` para
`lastClick`. El endpoint consultaría ese único documento por URL. Los eventos
individuales podrían conservarse para auditoría o análisis detallado, pero no serían
recorridos ni contados para responder cada consulta de estadísticas.

## 6. Redis

Formato de clave:

```text
short-url:{code} -> originalUrl
```

TTL inicial: 24 horas, configurable por variable de entorno.

Se usa cache-aside:

1. Buscar el código en Redis.
2. Si existe, usar la URL cacheada.
3. Si no existe, buscar en MongoDB.
4. Si MongoDB devuelve una URL, guardarla en Redis con TTL.
5. Redirigir al destino.

MongoDB sigue siendo la fuente de verdad. Un error de Redis no debe impedir resolver
una URL: la API registra el error y consulta MongoDB.

No se implementa negative caching inicialmente. Puede agregarse un TTL corto para
códigos inexistentes si fuera necesario proteger MongoDB.

## 7. API HTTP

### Crear URL corta

```http
POST /api/urls
Content-Type: application/json

{
  "originalUrl": "https://www.google.com/search?q=nodejs",
  "alias": "mi-alias"
}
```

Respuesta `201 Created`:

```json
{
  "code": "mi-alias",
  "originalUrl": "https://www.google.com/search?q=nodejs",
  "shortUrl": "http://localhost:3000/mi-alias"
}
```

Reglas:

- `originalUrl` es obligatoria y debe usar `http` o `https`;
- `alias` es opcional;
- códigos y aliases aceptan caracteres alfanuméricos, `-` y `_`;
- códigos y aliases tienen entre 3 y 50 caracteres;
- `health` se reserva para la ruta operativa y no puede usarse como alias,
  independientemente de mayúsculas y minúsculas;
- un alias existente responde `409 Conflict`;
- si no hay alias, se genera un código base64url de 8 caracteres con
  `randomBytes(6)`;
- una colisión de código generado se reintenta hasta 5 veces.

### Resolver URL

```http
GET /:code
```

Comportamiento:

1. Validar que `code` tenga entre 3 y 50 caracteres y solo contenga caracteres
   alfanuméricos, `-` o `_`.
2. Buscar el código en Redis.
3. Ante un cache miss o error de Redis, buscar el código en MongoDB.
4. Si MongoDB devuelve una URL, guardarla en Redis con el TTL configurado.
5. Si no existe, responder `404 Not Found` con
   `SHORT_URL_NOT_FOUND`.
6. Publicar `tinyurl.accessed.v1`.
7. Responder con redirect temporal `302 Found` a la URL original.

MongoDB sigue siendo la fuente de verdad. Los fallos de lectura o escritura en Redis
se registran, pero no impiden resolver mediante MongoDB ni responder un redirect
válido.

Después de una resolución exitosa, la API publica `tinyurl.accessed.v1`. La
publicación usa un canal de confirmación con un timeout configurable. Cualquier fallo
o timeout se registra y no cambia el redirect válido.

Se usa `302` para evitar que clientes o navegadores conviertan la redirección en una
decisión permanente y dejen de llegar accesos a la aplicación.

### Consultar estadísticas

```http
GET /api/stats/:code
```

Respuesta `200 OK`:

```json
{
  "code": "AbC123",
  "totalClicks": 125,
  "lastClick": "2026-06-10T18:20:15.000Z"
}
```

Si la URL existe pero no tiene accesos, `totalClicks` es `0` y `lastClick` es `null`.
Si el código no existe en `urls`, se responde `404 Not Found`.

Implementación actual:

```text
click.routes -> click.controller -> click.service
  -> url.repository para verificar existencia
  -> click.repository para total y último acceso
```

### Operación

```http
GET /health
```

Devuelve `200 OK` con `{ "status": "ok" }` para indicar que el proceso HTTP responde.
No realiza un chequeo profundo de MongoDB, Redis o RabbitMQ. La API no abre el puerto
si falla la conexión inicial a MongoDB; Redis y RabbitMQ son dependencias degradables.

## 8. Eventos y cola

No todos los endpoints emiten eventos. El único evento requerido es el acceso a una
TinyURL, porque su persistencia no debe retrasar la redirección.

Nombre lógico:

```text
tinyurl.accessed.v1
```

Payload:

```ts
type TinyUrlAccessedV1 = {
  eventId: string;
  type: "tinyurl.accessed.v1";
  occurredAt: string;
  data: {
    code: string;
    ip?: string;
    userAgent?: string;
  };
};
```

Topología RabbitMQ:

- exchange durable: `tinyurl.events`;
- tipo de exchange: `direct`;
- routing key: `tinyurl.accessed.v1`;
- cola durable: `tinyurl.accessed.persist`;
- mensajes publicados como persistent;
- un worker consumidor con acknowledgements manuales.

Flujo del worker:

1. Recibir y parsear el mensaje.
2. Validar el contrato.
3. Insertar el evento en `click_events`.
4. Enviar `ack` únicamente después de persistirlo.
5. Si `eventId` ya existe, tratarlo como procesado y enviar `ack`.
6. Ante un error transitorio de MongoDB, usar `nack` con requeue.
7. Ante un mensaje inválido, registrarlo y descartarlo sin requeue para evitar un loop.

El worker usa `prefetch(10)` para limitar mensajes en vuelo por proceso. Cada proceso
mantiene su propia conexión y canal; no existe un singleton distribuido entre
instancias. Se pueden ejecutar múltiples workers sobre la misma cola y RabbitMQ
reparte los mensajes entre ellos.

RabbitMQ entrega normalmente en FIFO, pero el sistema no depende de un orden estricto.
Las reentregas y múltiples consumidores pueden alterar el orden observado. Las
estadísticas usan `occurredAt`, no el orden de inserción.

La combinación de reentrega e índice único en `eventId` da un procesamiento
efectivamente idempotente frente a duplicados.

La validación con Zod verifica el contrato, no la identidad del productor. En esta
versión, la autenticidad depende de credenciales y permisos de RabbitMQ y del
aislamiento de red. Firmas HMAC y rotación de secretos quedan como endurecimiento
futuro si el modelo de amenazas incluye productores internos no confiables.

### Límite de consistencia

Publicar el evento y responder el redirect no forman una transacción distribuida. En
esta versión, una caída del broker durante el acceso puede hacer perder una métrica.
La redirección debe seguir funcionando y el error se registra.

Una solución productiva con garantía más fuerte usaría un transactional outbox, pero
queda explícitamente fuera de alcance por el tiempo y complejidad del challenge.

## 9. Organización propuesta

```text
src/
  api/
    app.ts
    server.ts
  worker/
    worker.ts
  modules/
    urls/
      url.routes.ts
      url.controller.ts
      url.service.ts
      url.repository.ts
      url.cache.ts
      url.model.ts
      url.schemas.ts
      url.errors.ts
    clicks/
      click.routes.ts
      click.controller.ts
      click.service.ts
      click.repository.ts
      click.publisher.ts
      click.consumer.ts
      click.model.ts
      click.schemas.ts
  infrastructure/
    config/
    mongo/
    redis/
    rabbitmq/
  shared/
    errors/
    logger/
tests/
```

Responsabilidades:

- routes: declaran el método y path HTTP y delegan en un controller;
- controllers: traducen HTTP, invocan el caso de uso y serializan la respuesta;
- services: validan entradas runtime, implementan casos de uso y reglas;
- repositories: acceso a MongoDB y traducción de errores específicos del proveedor;
- infrastructure: conexiones con servicios externos;
- worker/consumers: validación, persistencia y ack/nack de mensajes.

Cada módulo HTTP mantiene juntas sus rutas, controller, service y repository. `app.ts`
registra los routers de los módulos. No se crean carpetas o capas vacías antes de que
tengan una responsabilidad real.

Los services permiten inyectar dependencias en tests, pero usan repositories reales
por defecto. Esto permite probar reglas de negocio sin levantar MongoDB.

## 10. Docker Compose

Servicios objetivo:

- `frontend`;
- `api`;
- `worker`;
- `mongo`;
- `redis`;
- `rabbitmq` con management UI.

`frontend`, `api` y `worker` se construyen desde el mismo Dockerfile y cambian
únicamente el comando de inicio. Compose incluye:

- red interna por defecto;
- volúmenes para MongoDB, Redis y RabbitMQ;
- healthchecks;
- `depends_on` basado en salud cuando sea útil;
- puertos públicos solo para API y herramientas de desarrollo;
- variables desde `.env`.

Estado actual: Compose incluye `frontend`, `api`, `worker`, `mongo`, `redis` y
`rabbitmq`. Los tres procesos de aplicación usan volúmenes `node_modules` separados
durante desarrollo.

Puertos locales sugeridos:

- API: `3000`;
- Frontend Vite: `5173`;
- MongoDB: `27017`;
- Redis: `6379`;
- RabbitMQ AMQP: `5672`;
- RabbitMQ Management: `15672`.

## 11. Configuración

Variables iniciales:

```text
NODE_ENV
PORT
APP_BASE_URL
VITE_API_ORIGIN
VITE_API_PROXY_TARGET
MONGODB_URI
REDIS_URL
REDIS_CACHE_TTL_SECONDS
RABBITMQ_URL
RABBITMQ_EXCHANGE
RABBITMQ_ACCESS_QUEUE
RABBITMQ_PUBLISH_TIMEOUT_MS
LOG_LEVEL
```

La configuración se valida al iniciar. El proceso debe fallar rápidamente si falta una
variable obligatoria. `.env.example` documenta valores de desarrollo y `.env` no se
versiona.

## 12. Manejo de errores

- `400`: body, JSON o parámetros inválidos;
- `404`: código o ruta inexistente;
- `409`: alias en uso;
- `413`: body mayor al límite del parser;
- `500`: error interno inesperado.

Los errores internos se registran con contexto, pero la API no expone stacks ni
detalles de infraestructura.

Todas las respuestas HTTP de error usan:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable message",
    "details": []
  }
}
```

`details` es opcional. `AppError` representa errores esperados de aplicación y el
middleware global `errorHandler` es el único responsable de serializarlos. Los errores
de Zod se convierten en `400 VALIDATION_ERROR`, JSON malformado en `400 INVALID_JSON`,
bodies demasiado grandes en `413 PAYLOAD_TOO_LARGE` y rutas no registradas en
`404 ROUTE_NOT_FOUND`. Los errores desconocidos se convierten en
`500 INTERNAL_ERROR`.

`errorHandler` se registra después de todas las rutas. En Express 5, si un controller
asincrónico o un service rechaza su promesa, Express envía el error al middleware:

```text
route -> controller -> service throws -> errorHandler -> HTTP response
```

Por eso los controllers no agregan `try/catch` únicamente para repetir la
serialización de errores.

La entrada no confiable se valida con Zod dentro del service. Se exigen strings para
URL y alias, se rechazan protocolos distintos de HTTP/HTTPS y Mongoose recibe queries
estructuradas. Esto evita que objetos con operadores MongoDB lleguen desde estos
campos. XSS se controla en el boundary que renderiza HTML; actualmente la API devuelve
JSON y no interpola estos valores en templates.

### Logging

Pino escribe logs estructurados a stdout. `pino-http` genera un request ID, lo devuelve
en `x-request-id` y registra método, path, status y duración. Los services usan child
loggers con un campo `module` estable para eventos relevantes.

No se registran URLs originales porque sus query params pueden contener datos
sensibles. Headers de autorización y cookies se redactan. Los errores inesperados se
registran una sola vez en el boundary HTTP o del proceso; los `4xx` esperados quedan
representados por el log de finalización del request.

Los detalles de infraestructura se traducen en su boundary. Por ejemplo, el repository
de URLs convierte el error MongoDB duplicate-key `11000` en
`DuplicateShortUrlCodeError`. El service no inspecciona códigos de error de MongoDB:
convierte esa colisión en conflicto para un alias o reintenta si el código fue
generado.

Consideraciones específicas:

- Redis tiene fallback a MongoDB.
- Un error al publicar métricas no cancela una redirección válida.
- MongoDB es indispensable para crear URLs, resolver cache misses y consultar stats.
- El worker no hace `ack` antes de persistir.

## 13. Tests prioritarios

1. Crear una URL con código generado.
2. Crear una URL con alias.
3. Rechazar URL inválida y alias duplicado.
4. Resolver desde Redis.
5. Resolver cache miss desde MongoDB y poblar Redis.
6. Responder `404` para código inexistente.
7. Publicar un evento al resolver.
8. Persistir un evento y hacer `ack`.
9. Ignorar de forma idempotente un `eventId` duplicado.
10. Devolver `totalClicks` y `lastClick`.

Los tests automatizados cubren schemas, repositories, services, controllers, rutas
HTTP, publisher y consumer. Además, los flujos Redis/RabbitMQ/worker/estadísticas se
verificaron manualmente contra la infraestructura Dockerizada.

## 14. Estado de implementación

Completado:

1. TypeScript, linting, testing y build.
2. Configuración validada y logging estructurado.
3. Dockerfile y Docker Compose.
4. Conexiones y apagado ordenado.
5. Creación y resolución de URLs.
6. Cache-aside con Redis.
7. Publicación de eventos.
8. Worker y persistencia idempotente de clicks.
9. Endpoint de estadísticas.
10. Frontend mínimo con creación, resolución y estadísticas.

## 15. Decisiones para revisar durante la implementación

- Definir si el healthcheck profundo debe afectar el estado del contenedor.
- Evaluar una dead-letter queue solo si queda tiempo después del flujo principal.
