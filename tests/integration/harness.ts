import { createClient } from "redis";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import {
  RedisContainer,
  type StartedRedisContainer,
} from "@testcontainers/redis";
import { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import { RedisProductCache } from "../../src/adapters/redis-product-cache.js";
import { PostgresProductRepository } from "../../src/adapters/postgres-product-repository.js";
import { ProductService } from "../../src/app/product-service.js";
import { applySchema } from "../../src/db/migrate.js";
import { createApp } from "../../src/http/create-app.js";

export const TEST_CACHE_TTL_SECONDS = 30;

export type CatalogHarness = {
  app: FastifyInstance;
  pool: Pool;
  redis: ReturnType<typeof createClient>;
  cacheTtlSeconds: number;
  resetData: () => Promise<void>;
  stop: () => Promise<void>;
};

export async function startCatalogHarness(): Promise<CatalogHarness> {
  const postgresContainer: StartedPostgreSqlContainer =
    await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("catalog_test")
      .withUsername("catalog")
      .withPassword("catalog")
      .start();

  const redisContainer: StartedRedisContainer = await new RedisContainer(
    "redis:7-alpine",
  ).start();

  const postgresPort = postgresContainer.getMappedPort(5432);
  const redisPort = redisContainer.getMappedPort(6379);
  const postgresUrl = `postgresql://${postgresContainer.getUsername()}:${postgresContainer.getPassword()}@${postgresContainer.getHost()}:${postgresPort}/${postgresContainer.getDatabase()}`;
  const redisUrl = `redis://${redisContainer.getHost()}:${redisPort}`;

  const pool = new Pool({ connectionString: postgresUrl });
  const redis = createClient({ url: redisUrl });
  await redis.connect();
  await applySchema(pool);

  const app = await createApp(
    new ProductService(
      new PostgresProductRepository(pool),
      new RedisProductCache(redis, { ttlSeconds: TEST_CACHE_TTL_SECONDS }),
    ),
  );

  return {
    app,
    pool,
    redis,
    cacheTtlSeconds: TEST_CACHE_TTL_SECONDS,
    resetData: async () => {
      await pool.query("TRUNCATE TABLE products");
      await redis.flushDb();
    },
    stop: async () => {
      await app.close();
      await redis.quit();
      await pool.end();
      await redisContainer.stop();
      await postgresContainer.stop();
    },
  };
}
