# Revision de arquitectura y codigo

Fecha: 2026-06-14

## Alcance

Esta revision contrasta:

- la consigna original en `Challenge Tecnico - Backend Node.pdf`;
- `docs/design-doc.md`;
- `docs/entrega-tecnica.md`;
- `docs/resumen-diseno.md`;
- la implementacion actual y sus tests.

No se modifico codigo. La evaluacion considera que el proyecto es un assessment
deliberadamente pequeno, que el frontend todavia no fue implementado y que mecanismos
como outbox, DLQ, alta disponibilidad y analytics agregados quedaron fuera de alcance
de forma consciente.

## Estado posterior

Los findings F-01 a F-05 fueron corregidos después de esta revisión:

- API y worker esperan `Model.init()` antes de recibir trabajo;
- `health` es un alias reservado;
- la confirmación del publisher tiene un timeout configurable;
- JSON malformado y payloads excedidos conservan el envelope público;
- las rutas no registradas responden `404 ROUTE_NOT_FOUND`.

Las secciones siguientes conservan el análisis original como registro de los
problemas detectados.

## Resumen ejecutivo

La solucion cubre correctamente el nucleo backend pedido: creacion y resolucion de
URLs, cache-aside con Redis, eventos asincronicos con RabbitMQ, worker idempotente,
estadisticas, Docker Compose, validacion y una separacion de responsabilidades clara.

La estructura general es apropiada para el tamano del challenge. No justificaria
introducir microservicios, autenticacion, CQRS ni nuevas capas.

Sin embargo, encontre cinco defectos que conviene corregir antes de considerar la
entrega cerrada. Los mas importantes son el inicio sin esperar los indices unicos de
MongoDB, la posibilidad de crear un alias que nunca puede resolverse y el acoplamiento
sin timeout entre el redirect y la confirmacion de RabbitMQ.

## Findings

### F-01 - Alta - API y worker comienzan antes de garantizar los indices unicos

**Evidencia**

- `src/api/server.ts:18-39` conecta MongoDB y abre el puerto sin esperar
  `ShortUrlModel.init()` ni una inicializacion equivalente.
- `src/worker/worker.ts:15-21` comienza a consumir sin esperar
  `ClickEventModel.init()`.
- `src/modules/urls/url.model.ts:12-16` depende de un indice unico en `code`.
- `src/modules/clicks/click.model.ts:15-19` depende de un indice unico en `eventId`.

Mongoose crea indices de forma asincronica. `mongoose.connect()` confirma la conexion,
pero no garantiza que todos los indices declarados por los modelos ya esten listos.

**Impacto**

En una base nueva existe una ventana de arranque en la que:

- dos requests concurrentes pueden insertar el mismo alias;
- el consumidor puede persistir dos veces el mismo `eventId`;
- una construccion posterior del indice puede fallar por datos duplicados.

Esto afecta dos invariantes que el diseno presenta como garantizadas por MongoDB:
unicidad de codigos e idempotencia del worker.

**Recomendacion**

Antes de aceptar trafico o consumir mensajes, esperar explicitamente la inicializacion
de los modelos cuyos indices son invariantes del dominio. En un despliegue productivo
con migraciones administradas, crear/verificar indices fuera del proceso y desactivar
su creacion automatica.

### F-02 - Media - El alias `health` se acepta pero nunca puede resolverse

**Evidencia**

- `src/modules/urls/url.schemas.ts:3-10` permite `health`.
- `src/modules/urls/url.routes.ts:10-11` construye la URL publica como `/:code`.
- `src/api/app.ts:14-16` registra `GET /health` antes del router de URLs.

**Impacto**

`POST /api/urls` puede crear exitosamente el alias `health` y responder
`http://localhost:3000/health`, pero acceder a esa URL siempre devuelve el healthcheck
en lugar de redirigir. Es un codigo persistido y publicitado que no es utilizable.

**Recomendacion**

Reservar los segmentos usados por la aplicacion, al menos `health`, dentro de la regla
de aliases. Una alternativa mas robusta para futuras rutas es separar la resolucion
bajo un prefijo estable, aunque cambiar el contrato `GET /:code` no es necesario para
este challenge.

### F-03 - Media - RabbitMQ puede bloquear indefinidamente un redirect valido

**Evidencia**

- `src/modules/urls/url.service.ts:131-149` espera la publicacion antes de devolver la
  URL resuelta.
- `src/modules/clicks/click.publisher.ts:15-27` espera `waitForConfirms()` sin timeout.

El `try/catch` hace que un rechazo de RabbitMQ no cambie el redirect, pero no protege
contra una promesa que queda pendiente durante una particion de red o un broker que
no confirma.

**Impacto**

RabbitMQ esta documentado como dependencia degradable, pero una falla parcial puede
incrementar la latencia o dejar requests abiertos indefinidamente. En ese escenario la
persistencia sigue siendo asincronica, pero la disponibilidad del redirect queda
acoplada a la confirmacion del broker.

**Recomendacion**

Definir un presupuesto de tiempo corto para publicar/confirmar y continuar el redirect
cuando se exceda. Un outbox daria garantias mas fuertes, pero no es necesario para
resolver este finding dentro del alcance del assessment.

### F-04 - Media - El boundary HTTP convierte errores de parsing en `500`

**Evidencia**

- `src/api/app.ts:12` usa `express.json()`.
- `src/shared/errors/error-handler.ts:29-67` solo clasifica `ZodError` y `AppError`;
  cualquier error de Express/body-parser cae en `500 INTERNAL_ERROR`.

Un JSON malformado produce un error de parsing con status `400`. Un body demasiado
grande produce normalmente `413`. El middleware actual ignora esos status y los trata
como fallas internas.

**Impacto**

Requests incorrectos del cliente se reportan y registran como errores del servidor.
Esto contradice el contrato documentado de `400` para bodies invalidos, distorsiona
observabilidad y devuelve una semantica HTTP incorrecta.

**Recomendacion**

Traducir explicitamente los errores HTTP conocidos de Express antes del fallback
desconocido, manteniendo el mismo envelope publico y sin exponer detalles internos.
Agregar tests con JSON malformado y payload excedido.

### F-05 - Baja - Los `404` fuera de los casos de dominio no usan el envelope publico

**Evidencia**

- `src/api/app.ts:18-22` no registra un middleware final para rutas inexistentes.
- Express responde esos casos con su `404` por defecto, normalmente texto/HTML.
- La documentacion afirma que todas las respuestas HTTP de error usan el envelope
  `{ "error": { "code", "message" } }`.

**Impacto**

El contrato de errores es consistente para los endpoints conocidos, pero no para
métodos o rutas inexistentes, por ejemplo `POST /unknown`. Los clientes deben manejar
dos formatos de error.

**Recomendacion**

Agregar un handler de ruta no encontrada antes de `errorHandler` que produzca un
`AppError` o la respuesta JSON equivalente.

## Brecha conocida respecto de la consigna

La consigna pide una pantalla o endpoint para crear la TinyURL y aclara que el
frontend, aunque no se evalua visualmente, debe permitir probar facilmente la
creacion. Esta brecha quedó resuelta después de la revisión mediante un frontend
mínimo en React que permite crear URLs, abrir códigos y consultar estadísticas.

## Limitaciones deliberadas que no considero findings

- No existe transaccion entre redirect y publicacion del evento.
- No hay transactional outbox.
- No hay dead-letter queue ni politica de reintentos limitada.
- RabbitMQ no se reconecta despues de fallar al iniciar o perder la conexion. La API
  continua redirigiendo, pero pierde eventos hasta ser reiniciada.
- Redis no usa negative caching.
- Las estadisticas cuentan eventos en lugar de mantener un agregado.
- `totalClicks` y `lastClick` se obtienen con dos lecturas, por lo que no representan
  necesariamente el mismo snapshot si entra un click concurrente.
- `/health` es un liveness check superficial.
- No hay autenticacion, usuarios, edicion, eliminacion ni analytics avanzados.
- Los tests de infraestructura real son manuales y la suite automatizada usa mocks.

Estas decisiones son razonables para un challenge estimado en menos de tres horas,
siempre que se expliquen como trade-offs y no como comportamiento productivo completo.
La ausencia de DLQ implica que un error de persistencia permanente puede producir
reentregas infinitas; queda aceptado aqui porque ya esta declarado fuera de alcance.

## Consistencia y calidad general

Aspectos bien resueltos:

- organizacion por feature con dependencias claras;
- controllers delgados y services sin tipos de Express;
- validacion runtime antes de persistencia;
- MongoDB como autoridad de unicidad, no Redis;
- fallback de cache correctamente encapsulado;
- traduccion del error MongoDB `11000` en el repository de URLs;
- evento versionado y validado al publicar y consumir;
- `ack` posterior a persistencia e idempotencia basada en indice unico;
- logging estructurado sin registrar URLs destino;
- uso correcto de `302` para conservar el paso por la aplicacion;
- alcance tecnico proporcionado al assessment.

No encontre una razon arquitectonica para dividir el sistema en mas servicios ni para
agregar capas adicionales.

## Verificacion realizada

Resultados al 2026-06-14:

- `npm run typecheck`: pasa;
- `npm run lint`: pasa;
- `npm test`: 15 archivos, 56 tests, todos pasan;
- `npm run build`: pasa.

La suite actual no cubre F-01 a F-05. F-01 requiere una prueba de lifecycle o
integracion; F-02, F-04 y F-05 pueden cubrirse con tests HTTP relativamente pequenos.
