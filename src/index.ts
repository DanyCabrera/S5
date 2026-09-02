import { createClient } from "redis";
import { Pool } from "pg";
import { RedisProductCache } from "./adapters/redis-product-cache.js";
import { PostgresProductRepository } from "./adapters/postgres-product-repository.js";
import { ProductService } from "./app/product-service.js";
import { loadConfig } from "./config.js";
import { applySchema } from "./db/migrate.js";
import { createApp } from "./http/create-app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const redis = createClient({ url: config.redisUrl });

  await redis.connect();
  await applySchema(pool);

  const service = new ProductService(
    new PostgresProductRepository(pool),
    new RedisProductCache(redis, { ttlSeconds: config.cacheTtlSeconds }),
  );
  const app = await createApp(service);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await redis.quit();
    await pool.end();
  };

  process.on("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
