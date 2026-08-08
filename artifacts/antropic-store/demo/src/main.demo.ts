// Entry point for the static demo build.
//
// Import order is load-bearing: `api-shim` patches window.fetch as a side effect and has
// to run before the storefront's own entry mounts React and fires its first query.
// Static imports are evaluated in source order, so this stays correct.

import "./api-shim";
import { mountDemoBadge } from "./demo-badge";
import "../../src/main";

mountDemoBadge();
