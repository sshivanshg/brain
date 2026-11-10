// Public demo mode (BRAIN_DEMO=1): an in-memory database seeded with fictional data,
// reset on every cold start. It never touches DATABASE_URL, storage, push or auth services.
export const DEMO = process.env.BRAIN_DEMO === '1';
export const DEMO_TOKEN = process.env.BRAIN_TOKEN || 'demo';
