import type {
  CreateProductInput,
  Product,
  UpdateProductInput,
} from "../domain/product.js";

export interface ProductRepository {
  create(input: CreateProductInput): Promise<Product>;
  findById(id: string): Promise<Product | null>;
  update(id: string, input: UpdateProductInput): Promise<Product | null>;
}
