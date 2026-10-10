// Minimal single-user OAuth 2.1 (PKCE + dynamic client registration) so chat apps such as
// claude.ai can add the brain as a custom MCP connector. Stateless: codes and tokens are
// HMAC-signed with a key derived from BRAIN_TOKEN, so rotating BRAIN_TOKEN revokes everything.
import crypto from 'node:crypto';

const ALLOWED_REDIRECTS = [
  /^https:\/\/(claude\.ai|claude\.com)\/api\/mcp\/auth_callback$/,
  /^https:\/\/chatgpt\.com\/connector_platform_oauth_redirect$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//,
];
const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function createOAuth(TOKEN) {
  const key = crypto.createHash('sha256').update(`brain-oauth:${TOKEN}`).digest();
  const sign = (payload) => {
    const body = b64(JSON.stringify(payload));
    return `${body}.${b64(crypto.createHmac('sha256', key).update(body).digest())}`;
  };
  const verify = (token, typ) => {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const want = b64(crypto.createHmac('sha256', key).update(body).digest());
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.typ === typ && p.exp > Date.now() ? p : null;
  };
  const isAccessToken = (t) => Boolean(verify(t, 'access'));
  const tokens = () => ({
    access_token: sign({ typ: 'access', exp: Date.now() + 30 * 864e5 }),
    refresh_token: sign({ typ: 'refresh', exp: Date.now() + 365 * 864e5 }),
    token_type: 'Bearer',
    expires_in: 30 * 86400,
  });

  function mount(app) {
    const origin = (c) => `${c.req.header('x-forwarded-proto') || new URL(c.req.url).protocol.replace(':', '')}://${c.req.header('x-forwarded-host') || c.req.header('host')}`;

    app.get('/.well-known/oauth-protected-resource*', (c) => c.json({ resource: `${origin(c)}/mcp`, authorization_servers: [origin(c)], bearer_methods_supported: ['header'] }));
    app.get('/.well-known/oauth-authorization-server*', (c) => {
      const o = origin(c);
      return c.json({
        issuer: o,
        authorization_endpoint: `${o}/oauth/authorize`,
        token_endpoint: `${o}/oauth/token`,
        registration_endpoint: `${o}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: ['brain'],
      });
    });

    app.post('/oauth/register', async (c) => {
      const b = await c.req.json().catch(() => ({}));
      return c.json({ client_id: `brain-${crypto.randomBytes(8).toString('hex')}`, client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: b.redirect_uris || [], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_name: b.client_name }, 201);
    });

    const page = (q, error = '') => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect to Brain</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0b10;color:#ece9f3;font:15px/1.5 -apple-system,Inter,sans-serif;padding:16px}form{width:min(400px,100%);background:#15141b;border:1px solid #2a2733;border-radius:16px;padding:24px}h1{font:400 28px Georgia,serif;margin:0 0 6px}p{color:#9a95a8;margin:0 0 16px}input{width:100%;box-sizing:border-box;background:#0c0b10;color:inherit;border:1px solid #2a2733;border-radius:10px;padding:12px;margin-bottom:12px}button{width:100%;border:0;border-radius:10px;padding:12px;background:#6d4dff;color:#fff;font-weight:600;cursor:pointer}.e{color:#ef4444}</style></head>
<body><form method="post" action="/oauth/authorize"><h1>Connect to your brain</h1><p><b>${escape(q.client || 'An app')}</b> wants to read and write your second brain. Paste your brain token to allow it.</p>${error ? `<p class="e">${escape(error)}</p>` : ''}
${['response_type', 'client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope'].map((k) => `<input type="hidden" name="${k}" value="${escape(q[k] || '')}">`).join('')}
<input name="token" type="password" placeholder="brn_…" autofocus autocomplete="current-password"><button>Allow</button></form></body></html>`;

    app.get('/oauth/authorize', (c) => {
      const q = c.req.query();
      if (!ALLOWED_REDIRECTS.some((re) => re.test(q.redirect_uri || ''))) return c.text('redirect_uri not allowed', 400);
      if (q.code_challenge_method !== 'S256' || !q.code_challenge) return c.text('PKCE S256 required', 400);
      return c.html(page(q));
    });

    app.post('/oauth/authorize', async (c) => {
      const q = Object.fromEntries(Object.entries(await c.req.parseBody()).map(([k, v]) => [k, String(v)]));
      if (!ALLOWED_REDIRECTS.some((re) => re.test(q.redirect_uri || '')) || !q.code_challenge) return c.text('bad request', 400);
      const given = Buffer.from(q.token || '');
      const want = Buffer.from(TOKEN);
      if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return c.html(page(q, 'That token didn’t work.'), 401);
      const code = sign({ typ: 'code', cc: q.code_challenge, ru: q.redirect_uri, exp: Date.now() + 5 * 60e3 });
      const to = new URL(q.redirect_uri);
      to.searchParams.set('code', code);
      if (q.state) to.searchParams.set('state', q.state);
      return c.redirect(to.toString(), 302);
    });

    app.post('/oauth/token', async (c) => {
      const ct = c.req.header('content-type') || '';
      const b = ct.includes('json') ? await c.req.json() : Object.fromEntries(Object.entries(await c.req.parseBody()).map(([k, v]) => [k, String(v)]));
      if (b.grant_type === 'authorization_code') {
        const p = verify(b.code, 'code');
        const challenge = b64(crypto.createHash('sha256').update(String(b.code_verifier || '')).digest());
        if (!p || p.cc !== challenge || (b.redirect_uri && b.redirect_uri !== p.ru)) return c.json({ error: 'invalid_grant' }, 400);
        return c.json(tokens());
      }
      if (b.grant_type === 'refresh_token') {
        if (!verify(b.refresh_token, 'refresh')) return c.json({ error: 'invalid_grant' }, 400);
        return c.json(tokens());
      }
      return c.json({ error: 'unsupported_grant_type' }, 400);
    });
  }

  return { mount, isAccessToken };
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
