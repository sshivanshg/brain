# Brain Chrome extension — privacy policy

_Last updated: 2026-11-10_

Brain is open-source software (AGPL-3.0, <https://github.com/sshivanshg/brain>) that you run
yourself. The Chrome extension is a client for **your own** Brain server.

## The short version
- Everything the extension collects is sent **only to the Brain URL you enter** in its settings.
- Nothing is sent to the Brain authors, to us, or to any third party. There is no analytics,
  telemetry, advertising or tracking of any kind.
- We do not operate a server that receives your data. We cannot see, sell or share it.

## What the extension handles, and when
| Data | When | Where it goes |
|---|---|---|
| Page URL, title, description and readable text | Only if you turn on **Page capture**, and only after ~20 s of focused reading (configurable) or when you copy text on the page | Your Brain URL |
| Text you copy (over 20 characters) | Same as above | Your Brain URL |
| A page, selection or link you save by hand (right-click menu, Alt+Shift+B, popup) | When you choose to save it | Your Brain URL |
| ChatGPT, Claude.ai and Gemini conversation text | While you have a conversation open on those sites | Your Brain URL |
| What you type in those chats, when you press the 🧠 button | Only when you press it, to look up relevant memories | Your Brain URL |
| Brain URL, access token, settings, a short queue of pages waiting to sync | Always | Stored locally in your Chrome profile (`chrome.storage.local`) |

## What is never collected
- **Incognito** windows and tabs.
- Sites on the blocklist, which by default includes email, banking, payment and password-manager
  sites. You can edit it in the extension settings.
- Anything while capture is **paused** from the toolbar popup.
- Form fields, passwords, cookies, or browsing on pages you leave before the reading threshold.

## Permissions
The extension asks for access to all sites only when you click **Allow page capture**, and you can
turn it off at any time in its settings or at `chrome://extensions`. Access to your Brain server's
address is requested when you test the connection. See
[chrome-web-store.md](chrome-web-store.md#permission-justifications) for why each permission is needed.

## Your control
Data in your Brain lives in the database you run; delete or export it there. Removing the
extension deletes its local storage. Questions: open an issue at
<https://github.com/sshivanshg/brain/issues>.
