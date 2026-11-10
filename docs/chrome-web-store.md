# Chrome Web Store listing

Package with `npm run pack:extension` → `dist/brain-extension-<version>.zip`, then upload that file.
Privacy policy URL: <https://github.com/sshivanshg/brain/blob/main/docs/privacy.md>

## Name
Brain — your second brain

## Short description (≤132 chars, matches `manifest.json`)
Feeds your own self-hosted Brain: pages you actually read, what you copy, and your web AI chats.

## Long description
Brain is one memory for every AI agent you use — and this extension feeds it from your browser.
It works with a Brain server you run yourself (open source, https://github.com/sshivanshg/brain).
Nothing is sent to us: everything goes only to your own Brain URL.

What it does
• Remembers what you actually read. A page is kept only after real, focused reading time (20 s by default) or when you copy from it — not every tab you open.
• Saves on purpose. Right-click to save a page, selection or link, or press Alt+Shift+B. Add a note and a kind (bookmark, todo, decision, lesson) from the toolbar.
• Brings your memory into web chats. On ChatGPT, Claude.ai and Gemini, the 🧠 button (or Alt+B) drops relevant memories into your prompt, and conversations are saved to your Brain like any other agent session.
• Search your Brain from the toolbar.

Private by design
• Banking, email, payment and password-manager sites are blocked by default; edit the list any time.
• Incognito is never captured.
• Pause capture with one click.
• Page capture is opt-in: Chrome asks before the extension can read pages.
• No analytics, no tracking, no third parties.

Setup takes a minute: enter your Brain URL and an access token, test the connection, and choose whether to turn on page capture.

## Category / language
Productivity · English

## Single purpose
Send the pages, selections and AI-chat conversations the user chooses to their own self-hosted Brain memory server, and bring relevant memories back into AI chats.

## Permission justifications
| Permission | Justification |
|---|---|
| `storage` | Stores the user's Brain URL, access token, preferences, blocklist and a short queue of pages waiting to sync. |
| `contextMenus` | "Save page / selection / link to Brain" items in the right-click menu. |
| `alarms` | Sends queued pages to the user's Brain once a minute so pages are batched instead of sent on every visit. |
| `activeTab` | Reads the current page only when the user explicitly saves it (popup, context menu, Alt+Shift+B) without needing access to all sites. |
| `scripting` | Injects the page reader for an explicit save (with `activeTab`), and registers the reading-time script only after the user grants optional page capture. |
| `tabGroups` | Recognises tabs in a group named "Claude"/"agent" so pages a browser AI agent opens are labelled as the agent's work. |
| Host: `chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com` | Adds the 🧠 context button and saves conversations on these AI chat sites — the extension's core feature there. |
| Optional host: `<all_urls>` | Requested at setup only if the user turns on page capture, with a plain-language explanation; also covers the user's own Brain server address, which can be any domain. Never required; can be revoked in settings. |
| Remote code | None. All code ships in the package. |

## Data usage disclosures (Privacy practices tab)
- Collects: web history, website content (only with page capture on), user activity (copy events). Used only for the single purpose above.
- Not sold, not used for unrelated purposes, not used for creditworthiness. Transferred only to the server the user configures.

## Screenshots needed (1280×800 PNG, up to 5)
1. Welcome/setup page with a successful "Connected — N memories" state (light theme).
2. Toolbar popup: today's stats, "Save this page" with a note, search results.
3. ChatGPT or Claude.ai with the 🧠 button and inserted "Context from my second brain" block.
4. Settings: page-capture explanation and the editable blocklist (dark theme).
5. The Brain web app showing captured pages folded into a daily digest.

Also: 128×128 icon (`extension/icons/icon-128.png`), 440×280 small promo tile.

## Release checklist
1. Bump `version` in `extension/manifest.json`.
2. `npm run check && npm run pack:extension`.
3. Attach `dist/brain-extension-<version>.zip` to a GitHub Release; upload the same file to the Web Store.
