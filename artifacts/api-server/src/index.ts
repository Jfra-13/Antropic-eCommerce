// Imported first, and for its side effect: lib/env validates the whole environment at load,
// so a misconfigured deployment fails here with a full list of problems rather than further
// down when some module happens to read the variable it needs.
import { env } from "./lib/env";
import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const server = app.listen(env.PORT, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, "Server listening");
});

// Cloud Run sends SIGTERM before stopping an instance and SIGKILL 10s later. Node runs as
// PID 1 in the container, where a signal with no handler is ignored, so without this every
// scale-down waits the full 10s and then cuts whatever is still running.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, closing server");
  setTimeout(() => process.exit(1), 8_000).unref();
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
});
