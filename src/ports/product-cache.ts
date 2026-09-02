import type { Product } from "../domain/product.js";

export interface ProductCache {
  get(id: string): Promise<Product | null>;
  set(id: string, product: Product): Promise<void>;
  delete(id: string): Promise<void>;
}
