import type { createClient } from "redis";
import type { Product } from "../domain/product.js";
import type { ProductCache } from "../ports/product-cache.js";
import { productCacheKey } from "./cache-keys.js";

export type RedisConnection = ReturnType<typeof createClient>;

export type RedisProductCacheOptions = {
  ttlSeconds: number;
};

export class RedisProductCache implements ProductCache {
  constructor(
    private readonly client: RedisConnection,
    private readonly options: RedisProductCacheOptions,
  ) {}

  async get(id: string): Promise<Product | null> {
    const raw = await this.client.get(productCacheKey(id));
    if (raw === null) {
      return null;
    }

    return JSON.parse(raw) as Product;
  }

  async set(id: string, product: Product): Promise<void> {
    await this.client.set(productCacheKey(id), JSON.stringify(product), {
      expiration: { type: "EX", value: this.options.ttlSeconds },
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.del(productCacheKey(id));
  }
}
