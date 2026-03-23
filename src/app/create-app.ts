import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerHealthRoute } from "../routes/health.js";
import { registerOCRRoute } from "../routes/ocr.js";

export async function createApp() {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : {
              target: "pino-pretty"
            }
    }
  });

  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3000"
  });

  await app.register(multipart, {
    limits: {
      fileSize: Number(process.env.MAX_FILE_SIZE_BYTES ?? 10 * 1024 * 1024)
    }
  });

  await registerHealthRoute(app);
  await registerOCRRoute(app);

  return app;
}

