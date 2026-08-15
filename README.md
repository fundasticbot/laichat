# Laichat v0.1.0

Laichat lets you orchestrate multiple AI assistants (ChatGPT, Claude, Gemini, DeepSeek, Kimi, MiniMax, Qwen, Grok) side‑by‑side, each with a defined role (CEO, PM, Programmer, etc.). Messages are routed between panels via Tampermonkey shared storage — no APIs, no iframes.

---

## Installation

1. **Tampermonkey** – Install the extension for your browser (Chrome/Edge/Firefox).
2. **Userscript** – Open the Tampermonkey dashboard, click **Create a new script**, replace the default content with the content of `laichat-bridge.user.js`, save and enable.
3. **Launch the hub** – Open `index.html` in a modern browser (Chrome/Edge/Firefox). No server is needed; the file works locally.

## Usage

1. Click **Add Panel** on the landing page.
2. Choose an AI provider (e.g., ChatGPT) and a role (e.g., *Programmer*).
3. Click **Open** – a new tab opens with the selected AI site.
4. On each AI page a draggable toolbar appears. Use the **Send** button to forward the latest assistant reply to another panel.
5. The receiving panel automatically fills the input field with the transferred text, ready to submit.

## Features

- Unlimited panels, each with its own AI and role.
- Role‑specific system prompts injected automatically.
- Point‑to‑point routing – you decide which panel receives the message.
- Works with any logged‑in web account – no API keys required.
- Simple HTML + vanilla JavaScript – easy to extend.

---

## Limitations

- DOM selectors are hard‑coded; UI changes on the AI sites may break the bridge and require a small update to `laichat-bridge.user.js`.
- Some sites may block synthetic clicks; you may need to press the native **Send** button after the toolbar populates the input.
- URL parameters can be stripped; the script stores role and panel ID in `sessionStorage` to survive redirects.

---

## License

This project is licensed under the MIT License – see the `LICENSE` file for details.

---

Enjoy orchestrating your AI workflows!
