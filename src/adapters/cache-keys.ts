export const PRODUCT_CACHE_KEY_PREFIX = "product:";

export function productCacheKey(id: string): string {
  return `${PRODUCT_CACHE_KEY_PREFIX}${id}`;
}
