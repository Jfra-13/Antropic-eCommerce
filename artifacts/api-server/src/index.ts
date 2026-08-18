// Imported first, and for its side effect: lib/env validates the whole environment at load,
// so a misconfigured deployment fails here with a full list of problems rather than further
// down when some module happens to read the variable it needs.
import { env } from "./lib/env";
import app from "./app";
import { logger } from "./lib/logger";

app.listen(env.PORT, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, "Server listening");
});
