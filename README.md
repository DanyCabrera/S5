# API de catálogo de productos

Aplicación TypeScript que persiste productos en PostgreSQL y usa Redis como caché. Las fronteras reales entre la API, el controlador de PostgreSQL y el cliente de Redis se comprueban con pruebas de integración de Vitest 4 y Testcontainers: cada ejecución levanta contenedores desechables, aplica el esquema y limpia los datos entre casos.

## Arquitectura

```
HTTP (Fastify)
    └── ProductService
            ├── ProductRepository  →  PostgresProductRepository (pg)
            └── ProductCache       →  RedisProductCache (node-redis)
```

| Capa | Responsabilidad |
| --- | --- |
| `src/http/create-app.ts` | Rutas HTTP y mapeo de errores a estados (`201`, `200`, `400`, `404`, `409`) |
| `src/app/product-service.ts` | Validación, orquestación y política de caché |
| `src/adapters/postgres-product-repository.ts` | Lectura y escritura en PostgreSQL |
| `src/adapters/redis-product-cache.ts` | Get/set/delete con TTL configurable |
| `src/db/schema.sql` | Esquema aplicado al arranque de la app y de la suite |

Flujo de consulta por ID (cache-aside):

1. Se busca `product:{id}` en Redis.
2. Si no hay entrada, se lee PostgreSQL.
3. Si el producto existe, se guarda en Redis con `CACHE_TTL_SECONDS` y la respuesta indica `source: "database"`.
4. Si la entrada existe, se responde con `source: "cache"` sin consultar PostgreSQL.
5. Crear o actualizar invalida la clave en Redis para no servir datos obsoletos.

## Requisitos

- Node.js 20 o superior
- npm
- Docker en ejecución y accesible para Testcontainers (Linux, macOS, Windows con Docker Desktop o motor compatible)

Las pruebas **no** sustituyen PostgreSQL ni Redis por mocks y **no** se conectan a instancias compartidas. Host, puerto mapeado y credenciales salen de `PostgreSqlContainer` y `RedisContainer`.

## Instalación

```bash
npm install
```

Para ejecutar la API de forma local (opcional), copie `.env.example` a `.env`, arranque PostgreSQL y Redis por su cuenta y exporte las variables. Las pruebas ignoran `.env` y no requieren ese paso.

```bash
# PowerShell
$env:DATABASE_URL="postgres://catalog:catalog@127.0.0.1:5432/catalog"
$env:REDIS_URL="redis://127.0.0.1:6379"
$env:CACHE_TTL_SECONDS="60"
$env:PORT="3000"
npm start
```

## API

### Crear producto

`POST /products`

```json
{
  "sku": "KB-001",
  "name": "Teclado mecánico",
  "description": "Switch táctil",
  "price": 129.5
}
```

Respuesta `201` con el producto persistido. Invalida cualquier clave previa en Redis para ese ID.

### Consultar producto

`GET /products/:id`

- `200` con `{ "product": { ... }, "source": "database" | "cache" }`
- Cabecera `x-data-source` con el mismo origen
- `404` si el identificador no existe (`error: "PRODUCT_NOT_FOUND"`)

### Actualizar producto

`PATCH /products/:id`

Actualiza PostgreSQL e invalida la entrada de caché. La siguiente consulta vuelve a leer la base de datos y recachea el valor actual.

## Pruebas de integración

La suite (`tests/integration/`) hace lo siguiente al iniciar:

1. Arranca un `PostgreSqlContainer` (`postgres:16-alpine`) y un `RedisContainer` (`redis:7-alpine`).
2. Construye las URLs de conexión con `getHost()` y `getMappedPort(...)` (puertos de host aleatorios).
3. Aplica `src/db/schema.sql`.
4. Vacía PostgreSQL (`TRUNCATE`) y Redis (`FLUSHDB`) antes de cada caso.
5. Cierra la app, el pool, el cliente Redis y ambos contenedores al finalizar.

Casos cubiertos:

- Crear un producto y comprobar la fila directamente en PostgreSQL.
- Consultar con caché vacía: origen `database` y entrada Redis con TTL válido.
- Segunda consulta: origen `cache` (incluso si PostgreSQL se muta por fuera de la API).
- Actualizar e invalidar: no se sirve el nombre anterior desde Redis.
- Identificador inexistente: `404` estable, sin escribir en caché.

Los nombres describen comportamiento observable. Los casos no dependen del orden ni de datos residuales; la suite puede ejecutarse varias veces seguidas.

```bash
npm test
npm run typecheck
```

La primera ejecución puede tardar mientras Docker descarga las imágenes. Las siguientes reutilizan la caché local de imágenes.

## Estructura

```
src/
  adapters/     PostgreSQL y Redis
  app/          reglas de catálogo y caché
  db/           esquema y migración
  domain/       tipos y errores
  http/         Fastify
  ports/        contratos del repositorio y de la caché
tests/
  integration/  Testcontainers + Vitest
```
