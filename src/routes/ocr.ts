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

      const result = await processOCRDocument({
        fileName: file.filename,
        mimeType: file.mimetype,
        content: await file.toBuffer()
      });
      return ocrResponseSchema.parse(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process document";
      const code = message.includes("token") ? 401 : 500;

      return reply.code(code).send({
        error: {
          code: code === 401 ? "UNAUTHORIZED" : "OCR_PROCESS_FAILED",
          message
        }
      });
    }
  });
}

