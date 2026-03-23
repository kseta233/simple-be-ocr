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

  const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header), such as server-to-server requests.
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.includes(origin));
    }
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

