import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { AppError } from "../domain/errors.js";
import type { ProductService } from "../app/product-service.js";

type ProductParams = {
  id: string;
};

export async function createApp(service: ProductService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.post("/products", async (request, reply) => {
    const product = await service.create(
      request.body as {
        sku: string;
        name: string;
        description?: string | null;
        price: number;
      },
    );

    return reply.status(201).send(product);
  });

  app.get(
    "/products/:id",
    async (request: FastifyRequest<{ Params: ProductParams }>, reply) => {
      const lookup = await service.getById(request.params.id);
      reply.header("x-data-source", lookup.source);
      return reply.status(200).send(lookup);
    },
  );

  app.patch(
    "/products/:id",
    async (request: FastifyRequest<{ Params: ProductParams }>, reply) => {
      const product = await service.update(
        request.params.id,
        request.body as {
          sku?: string;
          name?: string;
          description?: string | null;
          price?: number;
        },
      );

      return reply.status(200).send(product);
    },
  );

  app.setErrorHandler(
    (error: Error, _request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({
          error: error.code,
          message: error.message,
        });
      }

      requestLog(error);
      return reply.status(500).send({
        error: "INTERNAL_ERROR",
        message: "Error interno del servidor",
      });
    },
  );

  await app.ready();
  return app;
}

function requestLog(error: Error): void {
  console.error(error);
}
