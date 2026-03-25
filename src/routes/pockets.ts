import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { verifyBearerToken } from "../modules/auth/verify-token.js";
import {
  acceptPocketSchema,
  addTransactionSchema,
  archivePocketSchema,
  createPocketSchema,
  deleteTransactionSchema,
  editTransactionSchema,
  getPocketQuerySchema,
  sharePocketSchema
} from "../modules/pockets/schema.js";
import {
  acceptPocket,
  addTransaction,
  archivePocket,
  createPocket,
  deleteTransaction,
  editTransaction,
  getPocket,
  leavePocket,
  PocketServiceError,
  sharePocket
} from "../modules/pockets/service.js";

function getActorUserId(request: FastifyRequest) {
  const auth = verifyBearerToken(request.headers.authorization);
  return auth.sub;
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: {
        code: "BAD_REQUEST",
        message: error.issues[0]?.message ?? "Invalid request payload"
      }
    });
  }

  if (error instanceof PocketServiceError) {
    return reply.code(error.status).send({
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return reply.code(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message
    }
  });
}

export async function registerPocketsRoute(app: FastifyInstance) {
  app.post("/api/v1/pockets", async (request, reply) => {
    try {
      const actorUserId = getActorUserId(request);
      const payload = createPocketSchema.parse(request.body);
      const data = await createPocket(actorUserId, payload);
      return reply.code(201).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/v1/pockets/:pocketId", async (request, reply) => {
    try {
      const actorUserId = getActorUserId(request);
      const params = request.params as { pocketId: string };
      const query = getPocketQuerySchema.parse(request.query);
      const data = await getPocket(actorUserId, params.pocketId, query);
      return reply.code(200).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/pockets/:pocketId/archive", async (request, reply) => {
    try {
      const actorUserId = getActorUserId(request);
      const params = request.params as { pocketId: string };
      const payload = archivePocketSchema.parse({ pocketId: params.pocketId });
      const data = await archivePocket(actorUserId, payload);
      return reply.code(200).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/pockets/:pocketId/share-links", async (request, reply) => {
    try {
      const actorUserId = getActorUserId(request);
      const params = request.params as { pocketId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      const payload = sharePocketSchema.parse({
        pocketId: params.pocketId,
        expiresAt: body.expiresAt,
        maxUses: body.maxUses
      });
      const data = await sharePocket(actorUserId, payload);
      return reply.code(201).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/pocket-links/accept", async (request, reply) => {
    try {
      const actorUserId = getActorUserId(request);
      const payload = acceptPocketSchema.parse(request.body);
      const data = await acceptPocket(actorUserId, payload);
      return reply.code(200).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/pockets/:pocketId/leave", async (request, reply) => {
    try {
      const actorUserId = getActorUserId(request);
      const params = request.params as { pocketId: string };
      const data = await leavePocket(actorUserId, { pocketId: params.pocketId });
      return reply.code(200).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/v1/pockets/:pocketId/transactions", async (request, reply) => {
    try {
      const actorUserId = getActorUserId(request);
      const params = request.params as { pocketId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      const payload = addTransactionSchema.parse({
        pocketId: params.pocketId,
        ...body
      });
      const data = await addTransaction(actorUserId, payload);
      return reply.code(201).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.put("/api/v1/pockets/:pocketId/transactions/:transactionId", async (request, reply) => {
    try {
      const actorUserId = getActorUserId(request);
      const params = request.params as { pocketId: string; transactionId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      const payload = editTransactionSchema.parse({
        pocketId: params.pocketId,
        transactionId: params.transactionId,
        ...body
      });
      const data = await editTransaction(actorUserId, payload);
      return reply.code(200).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/api/v1/pockets/:pocketId/transactions/:transactionId", async (request, reply) => {
    try {
      const actorUserId = getActorUserId(request);
      const params = request.params as { pocketId: string; transactionId: string };
      const payload = deleteTransactionSchema.parse({
        pocketId: params.pocketId,
        transactionId: params.transactionId
      });
      const data = await deleteTransaction(actorUserId, payload);
      return reply.code(200).send(data);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
