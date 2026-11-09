// Neon Function entry: Brain's HTTP API + MCP server, running next to the database.
// DATABASE_URL, NEON_AUTH_*, NEON_REALTIME_* and AWS_* are injected by Neon at runtime.
import { app } from '../server/index.js';

export default app;
