// Vercel entry: every /api, /mcp, /share and /connector request lands here; web/ is served as static files.
import { app } from '../server/index.js';

const handle = (request) => app.fetch(request);
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
