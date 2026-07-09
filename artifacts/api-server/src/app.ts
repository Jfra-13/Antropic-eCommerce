import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// 2mb ceiling: the CSV inventory import (admin-gated) is the largest payload; the default
// 100kb is too small for a real product upload. Everything else is tiny.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Unknown route → structured 404 in the same {code,message} shape the routes use.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ code: "NOT_FOUND", message: "Route not found" });
});

// Central error handler. Express 5 auto-forwards rejected async route handlers here,
// so every thrown/rejected error lands in one place. Log the detail server-side and
// return an opaque 500 — never leak stack traces or internals to the client.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "unhandled request error");
  if (res.headersSent) return;
  res.status(500).json({ code: "INTERNAL", message: "Internal server error" });
});

export default app;
