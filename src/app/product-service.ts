import { ProductNotFoundError, ValidationError } from "../domain/errors.js";
import type {
  CreateProductInput,
  Product,
  ProductLookup,
  UpdateProductInput,
} from "../domain/product.js";
import type { ProductCache } from "../ports/product-cache.js";
import type { ProductRepository } from "../ports/product-repository.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly cache: ProductCache,
  ) {}

  async create(input: CreateProductInput): Promise<Product> {
    const product = await this.repository.create(validateCreate(input));
    await this.cache.delete(product.id);
    return product;
  }

  async getById(id: string): Promise<ProductLookup> {
    const productId = validateId(id);
    const cached = await this.cache.get(productId);

    if (cached) {
      return { product: cached, source: "cache" };
    }

    const product = await this.repository.findById(productId);
    if (!product) {
      throw new ProductNotFoundError(productId);
    }

    await this.cache.set(productId, product);
    return { product, source: "database" };
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const productId = validateId(id);
    const product = await this.repository.update(
      productId,
      validateUpdate(input),
    );

    if (!product) {
      throw new ProductNotFoundError(productId);
    }

    await this.cache.delete(productId);
    return product;
  }
}

function validateId(id: string): string {
  if (!UUID_PATTERN.test(id)) {
    throw new ValidationError("El id debe ser un UUID");
  }

  return id;
}

function validateCreate(input: CreateProductInput): CreateProductInput {
  return {
    sku: validateSku(input.sku),
    name: validateName(input.name),
    description: validateDescription(input.description),
    price: validatePrice(input.price),
  };
}

function validateUpdate(input: UpdateProductInput): UpdateProductInput {
  if (
    input.sku === undefined &&
    input.name === undefined &&
    input.description === undefined &&
    input.price === undefined
  ) {
    throw new ValidationError("Debe enviar al menos un campo para actualizar");
  }

  return {
    ...(input.sku !== undefined ? { sku: validateSku(input.sku) } : {}),
    ...(input.name !== undefined ? { name: validateName(input.name) } : {}),
    ...(input.description !== undefined
      ? { description: validateDescription(input.description) }
      : {}),
    ...(input.price !== undefined ? { price: validatePrice(input.price) } : {}),
  };
}

function validateSku(sku: unknown): string {
  if (typeof sku !== "string" || sku.trim().length === 0) {
    throw new ValidationError("El sku es obligatorio");
  }

  const normalized = sku.trim();
  if (normalized.length > 64) {
    throw new ValidationError("El sku no puede superar 64 caracteres");
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized)) {
    throw new ValidationError(
      "El sku solo admite letras, números, guiones y guiones bajos",
    );
  }

  return normalized;
}

function validateName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new ValidationError("El nombre es obligatorio");
  }

  const normalized = name.trim();
  if (normalized.length > 200) {
    throw new ValidationError("El nombre no puede superar 200 caracteres");
  }

  return normalized;
}

function validateDescription(description: unknown): string | null {
  if (description === undefined || description === null) {
    return null;
  }

  if (typeof description !== "string") {
    throw new ValidationError("La descripción debe ser texto");
  }

  const normalized = description.trim();
  if (normalized.length > 1000) {
    throw new ValidationError("La descripción no puede superar 1000 caracteres");
  }

  return normalized.length === 0 ? null : normalized;
}

function validatePrice(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new ValidationError("El precio debe ser un número");
  }

  if (price < 0) {
    throw new ValidationError("El precio no puede ser negativo");
  }

  return Number(price.toFixed(2));
}
