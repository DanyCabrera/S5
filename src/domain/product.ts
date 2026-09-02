export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateProductInput = {
  sku: string;
  name: string;
  description?: string | null;
  price: number;
};

export type UpdateProductInput = {
  sku?: string;
  name?: string;
  description?: string | null;
  price?: number;
};

export type ProductLookupSource = "cache" | "database";

export type ProductLookup = {
  product: Product;
  source: ProductLookupSource;
};
