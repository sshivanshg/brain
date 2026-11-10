// Pure helpers shared by the service worker and options page (and the node tests).
export const DEFAULT_BLOCKLIST = [
  'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com', 'mail.proton.me', 'app.fastmail.com',
  'accounts.google.com', 'web.whatsapp.com', 'messages.google.com',
  'paypal.com', 'venmo.com', 'wise.com', '*.bank', '*bank*', 'chase.com', 'wellsfargo.com', 'bankofamerica.com', 'capitalone.com', 'americanexpress.com',
  '1password.com', 'bitwarden.com', 'lastpass.com', 'dashlane.com', 'keepersecurity.com',
  'dashboard.stripe.com', 'console.aws.amazon.com',
];

export const CHAT_HOSTS = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com'];

// Chrome match patterns cannot carry a port, so the origin collapses to scheme + host.
export function originPattern(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch { return null; }
}

export function blocked(url, list) {
  let host;
  try { host = new URL(url).hostname; } catch { return true; }
  return list.some((raw) => {
    const pattern = raw.trim();
    if (!pattern) return false;
    const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
    return re.test(host) || host.endsWith(`.${pattern}`);
  });
}

export const normalizeUrl = (url) => String(url || '').trim().replace(/\/+$/, '');
