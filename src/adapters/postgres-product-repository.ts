import type { Pool } from "pg";
import { DuplicateSkuError } from "../domain/errors.js";
import type {
  CreateProductInput,
  Product,
  UpdateProductInput,
} from "../domain/product.js";
import type { ProductRepository } from "../ports/product-repository.js";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: string;
  created_at: Date;
  updated_at: Date;
};

const PRODUCT_COLUMNS = `
  id,
  sku,
  name,
  description,
  price::text AS price,
  created_at,
  updated_at
`;

export class PostgresProductRepository implements ProductRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateProductInput): Promise<Product> {
    try {
      const result = await this.pool.query<ProductRow>(
        `INSERT INTO products (sku, name, description, price)
         VALUES ($1, $2, $3, $4)
         RETURNING ${PRODUCT_COLUMNS}`,
        [input.sku, input.name, input.description ?? null, input.price],
      );

      return mapRow(mustRow(result.rows[0]));
    } catch (error) {
      throw mapUniqueViolation(error, input.sku);
    }
  }

  async findById(id: string): Promise<Product | null> {
    const result = await this.pool.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`,
      [id],
    );

    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async update(id: string, input: UpdateProductInput): Promise<Product | null> {
    const assignments: string[] = [];
    const values: unknown[] = [];

    const setField = (column: string, value: unknown): void => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (input.sku !== undefined) {
      setField("sku", input.sku);
    }
    if (input.name !== undefined) {
      setField("name", input.name);
    }
    if (input.description !== undefined) {
      setField("description", input.description);
    }
    if (input.price !== undefined) {
      setField("price", input.price);
    }

    if (assignments.length === 0) {
      return this.findById(id);
    }

    assignments.push("updated_at = now()");
    values.push(id);

    try {
      const result = await this.pool.query<ProductRow>(
        `UPDATE products
         SET ${assignments.join(", ")}
         WHERE id = $${values.length}
         RETURNING ${PRODUCT_COLUMNS}`,
        values,
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    } catch (error) {
      throw mapUniqueViolation(error, input.sku);
    }
  }
}

function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mustRow(row: ProductRow | undefined): ProductRow {
  if (!row) {
    throw new Error("PostgreSQL no devolvió la fila insertada");
  }

  return row;
}

function mapUniqueViolation(error: unknown, sku: string | undefined): unknown {
  if (
    isPgError(error) &&
    error.code === "23505" &&
    typeof sku === "string"
  ) {
    return new DuplicateSkuError(sku);
  }

  return error;
}

function isPgError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  );
}
