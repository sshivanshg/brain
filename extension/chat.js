// Web AI chats (ChatGPT, Claude.ai, Gemini): a "brain" button that drops relevant memories into
// your prompt, and conversation saving so web chats land in the brain like Claude Code sessions.
(() => {
  if (window.__brainChat) return;
  window.__brainChat = true;

  const SITES = {
    'chatgpt.com': { agent: 'chatgpt', input: '#prompt-textarea, div[contenteditable="true"]', thread: 'main' },
    'chat.openai.com': { agent: 'chatgpt', input: '#prompt-textarea, div[contenteditable="true"]', thread: 'main' },
    'claude.ai': { agent: 'claude-web', input: 'div[contenteditable="true"].ProseMirror, div[contenteditable="true"]', thread: 'main' },
    'gemini.google.com': { agent: 'gemini', input: 'rich-textarea .ql-editor, div[contenteditable="true"]', thread: 'main' },
  };
  const site = SITES[location.hostname];
  if (!site) return;
  const send = (msg) => new Promise((resolve) => { try { chrome.runtime.sendMessage(msg, resolve); } catch { resolve(null); } });

  // --- brief-me button -------------------------------------------------------
  const btn = document.createElement('button');
  btn.textContent = '🧠';
  btn.title = 'Add context from your brain (Alt+B)';
  Object.assign(btn.style, {
    position: 'fixed', right: '18px', bottom: '96px', zIndex: 2147483647, width: '40px', height: '40px', borderRadius: '12px',
    border: '1px solid rgba(157,134,255,.5)', background: '#15141b', color: '#fff', fontSize: '18px', cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(109,77,255,.35)',
  });
  document.documentElement.append(btn);

  async function briefMe() {
    const box = document.querySelector(site.input);
    const typed = (box?.innerText || box?.value || '').trim();
    btn.textContent = '…';
    const res = await send({ type: 'chat-context', query: typed });
    btn.textContent = '🧠';
    if (!res?.ok) { alert(res?.error || 'Brain not reachable — check the extension settings.'); return; }
    const block = `\n\n---\nContext from my second brain (use if relevant):\n${res.context}\n---\n`;
    if (!box) { await navigator.clipboard.writeText(block); alert('Copied brain context — paste it into the chat.'); return; }
    box.focus();
    const sel = getSelection();
    sel.selectAllChildren(box);
    sel.collapseToEnd();
    if (!document.execCommand('insertText', false, block)) { box.value = (box.value || '') + block; box.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  btn.addEventListener('click', briefMe);
  addEventListener('keydown', (e) => { if (e.altKey && e.code === 'KeyB') { e.preventDefault(); briefMe(); } });

  // --- save the conversation ---------------------------------------------------
  let lastLen = 0;
  async function save() {
    const id = location.pathname.match(/\/(c|chat|app)\/([\w-]{8,})/)?.[2];
    if (!id) return;
    const text = (document.querySelector(site.thread)?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 200 || Math.abs(text.length - lastLen) < 200) return;
    lastLen = text.length;
    await send({ type: 'chat-save', session_id: `${site.agent}:${id}`, agent: site.agent, title: document.title, url: location.href, transcript: text.slice(-24000) });
  }
  setInterval(save, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
})();
