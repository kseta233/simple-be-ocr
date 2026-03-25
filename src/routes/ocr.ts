import type { FastifyInstance } from "fastify";
import { ocrResponseSchema } from "../modules/ocr/schema.js";
import { processOCRDocument } from "../modules/ocr/service.js";
import { verifyBearerToken } from "../modules/auth/verify-token.js";

export async function registerOCRRoute(app: FastifyInstance) {
  app.post("/api/v1/ocr/process", async (request, reply) => {
    try {
      verifyBearerToken(request.headers.authorization);

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({
          error: {
            code: "INVALID_FILE",
            message: "A file upload is required"
          }
        });
      }

      // Read sourceType from query parameter
      const sourceType = (request.query as Record<string, unknown>)?.sourceType as string | undefined;

      const result = await processOCRDocument({
        fileName: file.filename,
        mimeType: file.mimetype,
        content: await file.toBuffer(),
        sourceType: sourceType as "receipt" | "bank-notification" | undefined
      });
      return ocrResponseSchema.parse(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process document";
      const code = message.includes("token") ? 401 : 500;

      request.log.error(
        {
          err: error,
          route: "/api/v1/ocr/process"
        },
        "OCR processing failed"
      );

      return reply.code(code).send({
        error: {
          code: code === 401 ? "UNAUTHORIZED" : "OCR_PROCESS_FAILED",
          message
        }
      });
    }
  });
}


