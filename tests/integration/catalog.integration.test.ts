import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { productCacheKey } from "../../src/adapters/cache-keys.js";
import type { Product } from "../../src/domain/product.js";
import {
  startCatalogHarness,
  type CatalogHarness,
} from "./harness.js";

describe("catálogo de productos (PostgreSQL + Redis)", () => {
  let harness: CatalogHarness;

  beforeAll(async () => {
    harness = await startCatalogHarness();
  });

  beforeEach(async () => {
    await harness.resetData();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it("al crear un producto, el registro queda persistido en PostgreSQL", async () => {
    const payload = sampleProduct();

    const response = await harness.app.inject({
      method: "POST",
      url: "/products",
      payload,
    });

    expect(response.statusCode).toBe(201);
    const created = response.json<Product>();
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const persisted = await harness.pool.query<{
      sku: string;
      name: string;
      description: string | null;
      price: string;
    }>(
      "SELECT sku, name, description, price::text AS price FROM products WHERE id = $1",
      [created.id],
    );

    expect(persisted.rowCount).toBe(1);
    expect(persisted.rows[0]).toEqual({
      sku: payload.sku,
      name: payload.name,
      description: payload.description,
      price: payload.price.toFixed(2),
    });
  });

  it("al consultar con la caché vacía, la respuesta proviene de PostgreSQL y deja una entrada válida en Redis", async () => {
    const created = await createProduct(harness, sampleProduct("cache-miss"));
    const cacheKey = productCacheKey(created.id);

    expect(await harness.redis.exists(cacheKey)).toBe(0);

    const response = await harness.app.inject({
      method: "GET",
      url: `/products/${created.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-data-source"]).toBe("database");
    expect(response.json()).toMatchObject({
      source: "database",
      product: {
        id: created.id,
        sku: created.sku,
        name: created.name,
        price: created.price,
      },
    });

    const cached = await harness.redis.get(cacheKey);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string)).toMatchObject({
      id: created.id,
      name: created.name,
    });

    const ttl = await harness.redis.ttl(cacheKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(harness.cacheTtlSeconds);
  });

  it("al consultar de nuevo el mismo producto, la respuesta proviene de la caché", async () => {
    const created = await createProduct(harness, sampleProduct("cache-hit"));

    const miss = await harness.app.inject({
      method: "GET",
      url: `/products/${created.id}`,
    });
    expect(miss.statusCode).toBe(200);
    expect(miss.json<{ source: string }>().source).toBe("database");

    await harness.pool.query("UPDATE products SET name = $1 WHERE id = $2", [
      "nombre mutado solo en PostgreSQL",
      created.id,
    ]);

    const hit = await harness.app.inject({
      method: "GET",
      url: `/products/${created.id}`,
    });

    expect(hit.statusCode).toBe(200);
    expect(hit.headers["x-data-source"]).toBe("cache");
    const body = hit.json<{ source: string; product: Product }>();
    expect(body.source).toBe("cache");
    expect(body.product.name).toBe(created.name);
    expect(body.product.name).not.toBe("nombre mutado solo en PostgreSQL");
  });

  it("al actualizar un producto, no se sirve información obsoleta desde Redis", async () => {
    const created = await createProduct(harness, sampleProduct("stale-cache"));

    const primed = await harness.app.inject({
      method: "GET",
      url: `/products/${created.id}`,
    });
    expect(primed.json<{ source: string }>().source).toBe("database");
    expect(await harness.redis.exists(productCacheKey(created.id))).toBe(1);

    const updatedName = "Teclado mecánico revisado";
    const updatedPrice = 149.9;
    const update = await harness.app.inject({
      method: "PATCH",
      url: `/products/${created.id}`,
      payload: { name: updatedName, price: updatedPrice },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json<Product>()).toMatchObject({
      id: created.id,
      name: updatedName,
      price: updatedPrice,
    });
    expect(await harness.redis.exists(productCacheKey(created.id))).toBe(0);

    const afterUpdate = await harness.app.inject({
      method: "GET",
      url: `/products/${created.id}`,
    });

    expect(afterUpdate.statusCode).toBe(200);
    expect(afterUpdate.json()).toMatchObject({
      source: "database",
      product: {
        id: created.id,
        name: updatedName,
        price: updatedPrice,
      },
    });

    const recached = await harness.redis.get(productCacheKey(created.id));
    expect(recached).not.toBeNull();
    expect(JSON.parse(recached as string)).toMatchObject({
      name: updatedName,
      price: updatedPrice,
    });
  });

  it("al consultar un identificador inexistente, la API responde 404 de forma consistente", async () => {
    const missingId = randomUUID();

    const first = await harness.app.inject({
      method: "GET",
      url: `/products/${missingId}`,
    });
    const second = await harness.app.inject({
      method: "GET",
      url: `/products/${missingId}`,
    });

    for (const response of [first, second]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: "PRODUCT_NOT_FOUND",
        message: `No existe un producto con id ${missingId}`,
      });
    }

    expect(await harness.redis.exists(productCacheKey(missingId))).toBe(0);
  });
});

function sampleProduct(suffix = "create"): {
  sku: string;
  name: string;
  description: string;
  price: number;
} {
  return {
    sku: `SKU-${suffix}-${randomUUID().slice(0, 8)}`,
    name: "Teclado mecánico",
    description: "Switch táctil",
    price: 129.5,
  };
}

async function createProduct(
  harness: CatalogHarness,
  payload: ReturnType<typeof sampleProduct>,
): Promise<Product> {
  const response = await harness.app.inject({
    method: "POST",
    url: "/products",
    payload,
  });

  expect(response.statusCode).toBe(201);
  return response.json<Product>();
}
