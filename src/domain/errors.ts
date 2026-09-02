export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}

export class ProductNotFoundError extends AppError {
  constructor(id: string) {
    super("PRODUCT_NOT_FOUND", `No existe un producto con id ${id}`, 404);
  }
}

export class DuplicateSkuError extends AppError {
  constructor(sku: string) {
    super("DUPLICATE_SKU", `Ya existe un producto con sku ${sku}`, 409);
  }
}
