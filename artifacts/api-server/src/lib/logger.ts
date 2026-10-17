import pino from "pino";
import { env } from "./env";

const isProduction = env.isProduction;

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    // A guest order's access token is as good as a session for that order.
    'req.headers["x-order-token"]',
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
