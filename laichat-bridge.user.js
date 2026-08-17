// ==UserScript==
// @name         Laichat Bridge
// @namespace    laichat
// @version      0.6.0
// @description  Full toolbar, compact, with single font-size variable.
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @match        https://gemini.google.com/*
// @match        https://aistudio.google.com/*
// @match        https://chat.deepseek.com/*
// @match        https://kimi.moonshot.cn/*
// @match        https://chat.minimaxi.com/*
// @match        https://chat.qwen.ai/*
// @match        https://grok.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
    'use strict';

    // ─── CONFIG ──────────────────────────────────────────────────────────

    const HOST = location.hostname;
    const AI =
        HOST.includes('chatgpt.com') ? 'chatgpt' :
        HOST.includes('claude.ai') ? 'claude' :
        HOST.includes('aistudio.google.com') ? 'gemini' :
        HOST.includes('deepseek.com') ? 'deepseek' :
        HOST.includes('kimi.moonshot.cn') ? 'kimi' :
        HOST.includes('chat.minimaxi.com') ? 'minimax' :
        HOST.includes('chat.qwen.ai') ? 'qwen' :
        HOST.includes('grok.com') ? 'grok' : 'unknown';

    const labels = {
        chatgpt: 'ChatGPT',
        claude: 'Claude',
        gemini: 'Gemini',
        deepseek: 'DeepSeek',
        kimi: 'Kimi',
        minimax: 'MiniMax',
        qwen: 'Qwen',
        grok: 'Grok'
    };

    // ─── TOOLBAR SIZE CONTROL ──────────────────────────────────────────
    // Change this one value to resize the entire toolbar
    const TOOLBAR_FONT_SIZE = '11px';      // e.g., '10px', '12px', '14px'
    const TOOLBAR_PADDING = '4px 8px';     // optional: adjust container padding
    const BUTTON_PADDING = '2px 8px';      // optional: adjust button padding

    // ─── DYNAMIC ROLE PROMPT (with consensus logic) ─────────────────────

    const DEFAULT_ROLES_DATA = [{
        name: 'Critical Reviewer',
        prompt: `You are the Critical Reviewer (Red Team). RULES: 1) Max 200 words. 2) ONLY list defects, edge cases, security flaws, performance bottlenecks. 3) DO NOT propose solutions or write code. 4) Stick EXACTLY to the provided code. 5) Flag only what is broken or missing. Format: Bullet points. No fluff.
After the Solution Architect proposes a fix plan, review it. If you agree with the plan, respond with: "AGREED – proceed with implementation." Only then can the Architect generate the final implementation task.`
    }, {
        name: 'Solution Architect',
        prompt: `You are the Solution Architect (Blue Team). RULES: 1) Max 200 words per reply. 2) Synthesize the Critical Reviewer's findings into a minimal step‑by‑step fix plan. 3) DO NOT write code. Only describe what to change, where, and why. 4) Do not add new features. 5) Prioritise the simplest path.
You may iterate with the Reviewer. Once the Reviewer explicitly says "AGREED", output a concise **Implementation Task Prompt** for the Precise Programmer. Prefix it with:
=== IMPLEMENTATION TASK PROMPT ===
Then list the exact steps (no code, just clear instructions). After that, you may stop replying.`
    }, {
        name: 'Precise Programmer',
        prompt: `You are the Precise Programmer. RULES: 1) Output ONLY the exact code changes (diff or full file). 2) Do NOT add extra features, comments, or tests unless asked. 3) Do NOT refactor unrelated code. 4) Strictly implement the plan provided by the Solution Architect.
If the incoming message does **not** contain the line "=== IMPLEMENTATION TASK PROMPT ===", respond with: "Please send the implementation prompt from the Solution Architect first." Otherwise, ignore everything before that marker and only code what follows.`
    }, {
        name: 'CEO',
        prompt: `You are the CEO. Set vision, make high‑level decisions, approve strategies. Communicate clearly and decisively. Max 200 words.`
    }, {
        name: 'Software PM',
        prompt: `You are the Software PM. Manage roadmap, prioritise features, coordinate teams. Ask clarifying questions. Max 200 words.`
    }, {
        name: 'Programmer',
        prompt: `You are the Programmer. Write clean, efficient code. Explain technical details and implement solutions. Practical and precise. Max 200 words.`
    }, {
        name: 'Reviewer',
        prompt: `You are the Reviewer. Critically evaluate code, designs, plans. Identify issues, suggest improvements. Max 200 words.`
    }, {
        name: 'QA',
        prompt: `You are the QA Engineer. Test thoroughly, find bugs, think about edge cases. Max 200 words.`
    }, {
        name: 'Designer',
        prompt: `You are the Designer. Focus on UX, visual design, usability. Propose mockups. Max 200 words.`
    }, {
        name: 'DevOps',
        prompt: `You are the DevOps Engineer. Manage infrastructure, CI/CD, deployment, monitoring. Ensure scalability, security. Max 200 words.`
    }];

    function loadRoleLibrary() {
        try {
            const stored = localStorage.getItem('laichat.roleLibrary');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length) return parsed;
            }
        } catch (_) {}
        return DEFAULT_ROLES_DATA;
    }

    function getRolePrompt(role) {
        const lib = loadRoleLibrary();
        const found = lib.find(r => r.name === role);
        if (found && found.prompt) return found.prompt;
        return `You are acting as the **${role}**. Be concise, direct, and only address what is explicitly asked. Do not add extra content. Max 200 words.`;
    }

    function getRoleOptions() {
        const lib = loadRoleLibrary();
        return lib.map(r => r.name);
    }

    // ─── PERSIST – with localStorage backup ──────────────────────────────

    const params = new URLSearchParams(location.search);
    let MY_ID = params.get('laichat-id');
    let MY_ROLE = params.get('laichat-role') || sessionStorage.getItem('laichat_role') || localStorage.getItem('laichat_role') || 'Critical Reviewer';

    if (MY_ID) {
        sessionStorage.setItem('laichat_id', MY_ID);
        localStorage.setItem('laichat_id', MY_ID);
    } else {
        MY_ID = sessionStorage.getItem('laichat_id') || localStorage.getItem('laichat_id');
        if (!MY_ID) {
            MY_ID = 'fallback-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            sessionStorage.setItem('laichat_id', MY_ID);
            localStorage.setItem('laichat_id', MY_ID);
            setTimeout(() => {
                toast('⚠️ Opened without Laichat ID – routing may fail. Re‑open from Hub.');
            }, 2000);
        } else {
            sessionStorage.setItem('laichat_id', MY_ID);
            console.log(`[Laichat] Restored ID from storage: ${MY_ID}`);
        }
    }

    if (params.get('laichat-role')) {
        sessionStorage.setItem('laichat_role', MY_ROLE);
        localStorage.setItem('laichat_role', MY_ROLE);
    } else {
        const storedRole = sessionStorage.getItem('laichat_role') || localStorage.getItem('laichat_role');
        if (storedRole) MY_ROLE = storedRole;
        sessionStorage.setItem('laichat_role', MY_ROLE);
        localStorage.setItem('laichat_role', MY_ROLE);
    }

    const MY_AI = params.get('laichat-ai') || AI;

    const REGISTRY_KEY = 'laichat.registry';
    const INBOX_PREFIX = 'laichat.inbox.';
    const SEEN_KEY = 'laichat.seen';

    console.log(`[Laichat] Final: ID=${MY_ID}, Role=${MY_ROLE}, AI=${MY_AI}`);

    let isFallback = !params.get('laichat-id');

    // ─── REGISTRATION ────────────────────────────────────────────────────

    function registerSelf() {
        const registry = JSON.parse(GM_getValue(REGISTRY_KEY, '{}'));
        registry[MY_ID] = {
            ai: MY_AI,
            role: MY_ROLE,
            timestamp: Date.now(),
            fallback: isFallback
        };
        GM_setValue(REGISTRY_KEY, JSON.stringify(registry));
        console.log(`[Laichat] Registered: ${MY_ID} (${MY_ROLE})`);
    }

    registerSelf();

    setInterval(() => {
        const registry = JSON.parse(GM_getValue(REGISTRY_KEY, '{}'));
        if (registry[MY_ID]) {
            registry[MY_ID].timestamp = Date.now();
            GM_setValue(REGISTRY_KEY, JSON.stringify(registry));
        } else {
            registerSelf();
        }
    }, 5000);

    setInterval(() => {
        const registry = JSON.parse(GM_getValue(REGISTRY_KEY, '{}'));
        let changed = false;
        for (const id in registry) {
            if (Date.now() - registry[id].timestamp > 15000) {
                delete registry[id];
                changed = true;
            }
        }
        if (changed) GM_setValue(REGISTRY_KEY, JSON.stringify(registry));
    }, 15000);

    function getRegistry() {
        return JSON.parse(GM_getValue(REGISTRY_KEY, '{}'));
    }

    // ─── SITE‑SPECIFIC INPUT SELECTORS ──────────────────────────────────

    function getInputSelectors() {
        const base = [
            'textarea',
            '[contenteditable="true"]',
            '[role="textbox"]',
            'textarea[data-testid]',
            '.ProseMirror',
            '[contenteditable=""]'
        ];

        if (AI === 'claude') {
            base.push('div[contenteditable="true"]');
            base.push('.ProseMirror');
            base.push('.ProseMirror[contenteditable="true"]');
        } else if (AI === 'kimi') {
            base.push('div[contenteditable="true"]');
            base.push('.chat-input-textarea');
        } else if (AI === 'gemini') {
            base.push('div[contenteditable="true"]');
            base.push('ql-editor');
        } else if (AI === 'chatgpt') {
            base.push('div[contenteditable="true"]');
            base.push('textarea[data-id]');
        } else if (AI === 'deepseek') {
            base.push('div[contenteditable="true"]');
            base.push('.chat-input-area');
        }

        return base;
    }

    function inputCandidates() {
        const selectors = getInputSelectors();
        const candidates = selectors.map(s => [...document.querySelectorAll(s)]).flat()
            .filter(el => el.offsetParent !== null);
        const unique = Array.from(new Set(candidates));
        if (unique.length) {
            console.log('[Laichat] Found', unique.length, 'input candidate(s).', unique);
        } else {
            console.warn('[Laichat] No input candidates found.');
        }
        return unique;
    }

    // ─── DOM HELPERS ──────────────────────────────────────────────────────

    function textOf(el) {
        return (el?.innerText || el?.textContent || '').trim();
    }

    // ─── STRIP THOUGHT PREFIX FROM DEEPSEEK (fallback) ────────────────

    function stripThoughtPrefix(text) {
        const lines = text.split('\n');
        let startIdx = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (/^Thought for|^Thinking for|^Model \d+:\d+/.test(line)) {
                startIdx = i + 1;
                continue;
            }
            break;
        }
        if (startIdx > 0) {
            return lines.slice(startIdx).join('\n').trim();
        }
        return text;
    }

    // ─── IMPROVED RESPONSE DETECTION ──────────────────────────────────

    function latestAssistantText() {
        const toolbar = document.getElementById('laichat-toolbar');
        const isInToolbar = (el) => toolbar && toolbar.contains(el);

        const isUIControl = (text) => {
            const controls = [
                /^Show conversation without markdown formatting/i,
                /^Collapse/i, /^Expand/i, /^Copy/i, /^Regenerate/i,
                /^Edit/i, /^Delete/i, /^Save/i, /^Cancel/i,
                /^Submit/i, /^Send/i, /^Stop/i, /^Clear/i, /^Reset/i,
                /^Show more/i, /^Show less/i, /^Loading/i,
                /^Code/i, /^Snippet/i, /^Thumb_up/i, /^Thumb_down/i,
                /^More options/i, /^Open options/i, /^Rerun/i,
                /^One more step/i, /^Verify/i, /^Captcha/i, /^Continue/i,
                /^Please wait/i, /^Checking/i, /^Redirect/i
            ];
            return controls.some(re => re.test(text.trim()));
        };

        const candidates = [];

        // 1. DeepSeek‑specific: use the exact answer container
        if (AI === 'deepseek') {
            const messages = document.querySelectorAll('.ds-message');
            if (messages.length) {
                const lastMsg = messages[messages.length - 1];
                const answerContent = lastMsg.querySelector('.ds-markdown.ds-assistant-message-main-content');
                if (answerContent) {
                    let txt = textOf(answerContent);
                    if (txt.length > 50 && !isUIControl(txt)) {
                        candidates.push(txt);
                        console.log('[Laichat] DeepSeek: found answer in .ds-markdown.ds-assistant-message-main-content, length:', txt.length);
                    }
                } else {
                    let txt = textOf(lastMsg);
                    if (txt.length > 50 && !isUIControl(txt)) {
                        txt = stripThoughtPrefix(txt);
                        if (txt.length > 10) {
                            candidates.push(txt);
                            console.log('[Laichat] DeepSeek: fallback to .ds-message with stripped prefix, length:', txt.length);
                        }
                    }
                }
            }
            if (!candidates.length) {
                const selectors = [
                    '.chat-message-ai', '.message-ai', '.assistant-message',
                    '[data-role="assistant"]', '.message[data-role="assistant"]'
                ];
                let found = [];
                for (const sel of selectors) {
                    document.querySelectorAll(sel).forEach(el => {
                        if (isInToolbar(el)) return;
                        const txt = textOf(el);
                        if (txt.length > 50 && !isUIControl(txt)) {
                            found.push(txt);
                        }
                    });
                }
                if (found.length) {
                    found.sort((a, b) => b.length - a.length);
                    let txt = found[0];
                    txt = stripThoughtPrefix(txt);
                    candidates.push(txt);
                    console.log('[Laichat] DeepSeek: fallback found longest container, stripped length:', txt.length);
                }
            }
        }

        // 2. Gemini‑specific
        if (AI === 'gemini' && !candidates.length) {
            let turn = document.querySelector('ms-chat-turn[data-turn-role="Model"]');
            if (turn) {
                let content = turn.querySelector('.turn-content');
                if (content) {
                    let raw = content.innerText.trim();
                    if (raw.length > 30 && !isUIControl(raw)) {
                        candidates.push(raw);
                        console.log('[Laichat] Gemini: found via ms-chat-turn .turn-content, length:', raw.length);
                    }
                }
            }
            if (!candidates.length) {
                const contents = document.querySelectorAll('.turn-content');
                if (contents.length) {
                    const lastContent = contents[contents.length - 1];
                    let raw = lastContent.innerText.trim();
                    if (raw.length > 30 && !isUIControl(raw)) {
                        candidates.push(raw);
                        console.log('[Laichat] Gemini: found via .turn-content (last), length:', raw.length);
                    }
                }
            }
            if (!candidates.length) {
                const modelEls = document.querySelectorAll('[data-turn-role="Model"]');
                if (modelEls.length) {
                    const lastModel = modelEls[modelEls.length - 1];
                    let raw = lastModel.innerText.trim();
                    if (raw.length > 30 && !isUIControl(raw)) {
                        candidates.push(raw);
                        console.log('[Laichat] Gemini: found via [data-turn-role="Model"], length:', raw.length);
                    }
                }
            }
        }

        // 3. General site‑specific selectors for other AIs
        if (!candidates.length) {
            let selectors = [
                '[data-message-author-role="assistant"] .markdown',
                '[data-message-author-role="assistant"] .message-content',
                '[data-testid*="assistant"] .markdown',
                '[data-testid*="assistant"] .message-content',
                'main article .markdown',
                'main [role="article"] .markdown',
                '.message:last-child .markdown',
                '.assistant-message .markdown',
                '.assistant-message .message-content'
            ];

            if (AI === 'deepseek') {
                selectors = selectors.concat([
                    '.chat-message-ai .markdown',
                    '.ds-message .markdown',
                    '.message[data-role="assistant"] .markdown'
                ]);
            } else if (AI === 'claude') {
                selectors = selectors.concat([
                    '.message.assistant .markdown',
                    '.claude-message .markdown'
                ]);
            } else if (AI === 'chatgpt') {
                selectors = selectors.concat([
                    '[data-message-author-role="assistant"] .markdown'
                ]);
            }

            for (const sel of selectors) {
                document.querySelectorAll(sel).forEach(el => {
                    if (isInToolbar(el)) return;
                    const t = textOf(el);
                    if (t.length > 50 && !isUIControl(t)) {
                        candidates.push(t);
                    }
                });
            }
        }

        // 4. Fallback: generic scanning inside <main>
        if (!candidates.length) {
            const main = document.querySelector('main');
            if (main) {
                const blocks = main.querySelectorAll('div, p, article, section, .message, .chat-message, .response');
                for (const el of blocks) {
                    if (isInToolbar(el)) continue;
                    const t = textOf(el);
                    if (t.length > 50) {
                        const classes = el.className || '';
                        if (!classes.includes('input') && !classes.includes('button') && !classes.includes('send') && !isUIControl(t)) {
                            candidates.push(t);
                        }
                    }
                }
            }
        }

        // 5. Last resort: entire page
        if (!candidates.length) {
            const allElements = document.querySelectorAll('body *');
            const textBlocks = [];
            for (const el of allElements) {
                if (isInToolbar(el)) continue;
                const t = textOf(el);
                if (t.length > 50) {
                    if (!el.closest('script, style, input, textarea, button')) {
                        textBlocks.push(t);
                    }
                }
            }
            if (textBlocks.length) {
                const last = textBlocks[textBlocks.length - 1];
                const inputText = inputCandidates()[0]?.textContent || '';
                if (last !== inputText && !isUIControl(last)) {
                    candidates.push(last);
                }
            }
        }

        // Log candidates for debugging
        console.log('[Laichat] Candidate texts found:', candidates.map(c => c.slice(0, 60) + '...'));

        if (candidates.length) {
            let result = candidates[candidates.length - 1];
            if (result.match(/\([^)]+\)/) && candidates.length > 1) {
                const prev = candidates[candidates.length - 2];
                if (prev && !prev.match(/\([^)]+\)/)) {
                    result = prev;
                }
            }
            console.log('[Laichat] Selected response:', result.slice(0, 80) + '...');
            return result;
        } else {
            console.warn('[Laichat] No suitable response found.');
            return '';
        }
    }

    // ─── FILL INPUT (enhanced with retries) ──────────────────────────────

    function fillInput(text, maxRetries = 5) {
        let attempts = 0;
        return new Promise((resolve) => {
            function tryFill() {
                const el = inputCandidates()[0];
                if (!el) {
                    console.warn(`[Laichat] No input element found (attempt ${attempts+1}/${maxRetries})`);
                    attempts++;
                    if (attempts < maxRetries) {
                        setTimeout(tryFill, 500);
                    } else {
                        resolve(false);
                    }
                    return;
                }
                console.log('[Laichat] Filling input with:', text.slice(0, 60) + '...');

                el.focus();

                if (AI === 'claude') {
                    const htmlText = text.replace(/\n/g, '<br>');
                    el.innerHTML = htmlText;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
                    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
                    setTimeout(() => {
                        const current = el.innerText || el.textContent || '';
                        if (current.includes(text.slice(0, 20))) {
                            console.log('[Laichat] Claude input successfully filled.');
                            resolve(true);
                        } else {
                            console.warn('[Laichat] Claude input content mismatch!');
                            resolve(false);
                        }
                    }, 200);
                    return;
                }

                if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ||
                        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                    if (setter) setter.call(el, text);
                    else el.value = text;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    resolve(true);
                } else {
                    el.textContent = text;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    resolve(true);
                }
            }
            tryFill();
        });
    }

    // ─── ROLE PROMPT INJECTION ──────────────────────────────────────────

    function buildFullPrompt(role) {
        const description = getRolePrompt(role);
        return `[System: You are acting as the **${role}**. ${description}]`;
    }

    function injectRolePrompt(force = false) {
        if (!MY_ROLE || MY_ROLE === 'Worker') {
            toast('No special role set. Select a role from the dropdown.');
            console.log('[Laichat] Role is Worker – skipping injection.');
            return;
        }
        const input = inputCandidates()[0];
        if (!input) {
            toast('No input box found yet. Try again in a moment.');
            console.warn('[Laichat] Inject role prompt: no input.');
            return;
        }
        const prompt = buildFullPrompt(MY_ROLE);
        const currentText = input.value || input.innerText || input.textContent || '';
        if (!force && currentText.trim() === prompt) {
            console.log('[Laichat] Prompt already present, skipping.');
            return;
        }
        if (force || currentText.length < 5) {
            fillInput(prompt).then(success => {
                if (success) {
                    toast(`✅ Role "${MY_ROLE}" prompt injected.`);
                    console.log('[Laichat] Role prompt injected successfully.');
                } else {
                    toast('❌ Failed to inject prompt. Check console.');
                    console.error('[Laichat] fillInput returned false.');
                }
            });
        } else {
            toast('Input has content – use dropdown to force injection.');
            console.log('[Laichat] Input has content, not overwriting.');
        }
    }

    // ─── IMPROVED SUBMIT LOGIC (with correct "Run" button) ──────────────

    function submitInput() {
        const el = inputCandidates()[0];
        if (!el) {
            console.warn('[Laichat] No input element found for submit.');
            return false;
        }

        setTimeout(() => {
            let btn = null;

            // 1. PRIMARY: Look for the correct "Run" submit button
            const allSubmitButtons = document.querySelectorAll('button[type="submit"]');
            for (const b of allSubmitButtons) {
                const ariaLabel = b.getAttribute('aria-label') || '';
                if (ariaLabel.toLowerCase().includes('toggle run settings')) {
                    continue;
                }
                if (b.querySelector('span.run-button-label')) {
                    btn = b;
                    break;
                }
            }

            // 2. If not found, look for any button whose trimmed text is exactly "Run" (or "▶ Run")
            if (!btn) {
                const allButtons = document.querySelectorAll('button');
                for (const b of allButtons) {
                    const text = b.innerText.trim().toLowerCase();
                    if (text === 'run' || text === '▶ run' || text === 'run ▶') {
                        const ariaLabel = b.getAttribute('aria-label') || '';
                        if (ariaLabel.toLowerCase().includes('toggle run settings')) {
                            continue;
                        }
                        btn = b;
                        break;
                    }
                }
            }

            // 3. Fallback: generic send/submit patterns
            if (!btn) {
                const form = el.closest('form');
                if (form) {
                    btn = form.querySelector('button[type="submit"]');
                    if (!btn) {
                        btn = form.querySelector('button[aria-label*="Send"], button[aria-label*="Submit"], button[data-testid*="send"], button[class*="send"], button[class*="submit"]');
                    }
                }
                if (!btn) {
                    const container = el.closest('[class*="chat"], [class*="input"], .chat-input-container, .input-area, .ds-chat-input-area');
                    if (container) {
                        btn = container.querySelector('button[aria-label*="Send"], button[aria-label*="Submit"], button[data-testid*="send"], button[class*="send"], button[class*="submit"]');
                    }
                }
                if (!btn) {
                    const candidates = document.querySelectorAll('button[aria-label*="Send"], button[aria-label*="Submit"], button[data-testid*="send"], button[data-testid*="submit"], button[class*="send"]:not([disabled]), button[class*="submit"]:not([disabled])');
                    for (const b of candidates) {
                        const ariaLabel = b.getAttribute('aria-label') || '';
                        if (!ariaLabel.toLowerCase().includes('toggle run settings')) {
                            btn = b;
                            break;
                        }
                    }
                }
            }

            if (btn && !btn.disabled) {
                console.log('[Laichat] Submitting via button click:', btn);
                btn.click();
                return;
            }

            // 4. If no button, simulate Enter key
            console.log('[Laichat] No submit button found, simulating Enter key.');
            el.focus();
            const events = [
                new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, composed: true }),
                new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, composed: true }),
                new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, composed: true })
            ];
            for (const ev of events) {
                el.dispatchEvent(ev);
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (el.isContentEditable) {
                const textEvent = new InputEvent('textInput', { data: '\n', bubbles: true });
                el.dispatchEvent(textEvent);
            }
        }, 300);

        return true;
    }

    // ─── SEND TO PROGRAMMER (auto‑target) ─────────────────────────────

    function sendToProgrammer() {
        const registry = getRegistry();
        let programmerId = null;
        for (const id in registry) {
            const entry = registry[id];
            if (entry.role && entry.role.toLowerCase() === 'precise programmer') {
                programmerId = id;
                break;
            }
        }
        if (!programmerId) {
            toast('⚠️ No "Precise Programmer" panel found. Please create one.');
            console.warn('[Laichat] No programmer panel found.');
            return;
        }
        sendCurrent(programmerId, true);
    }

    // ─── SEND / RECEIVE ──────────────────────────────────────────────────

    function sendCurrent(targetId, autoSubmit) {
        if (!targetId) {
            toast('No target selected. Open another panel first.');
            return;
        }
        const msg = latestAssistantText();
        if (!msg) {
            toast('Could not find the latest response.');
            console.warn('[Laichat] latestAssistantText returned empty.');
            return;
        }

        const packet = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
            from: MY_ID,
            fromRole: MY_ROLE,
            fromAI: MY_AI,
            to: targetId,
            text: msg,
            created: Date.now(),
            autoSubmit
        };

        const inboxKey = INBOX_PREFIX + targetId;
        GM_setValue(inboxKey, packet);
        GM_setClipboard(msg);
        const registry = getRegistry();
        const targetEntry = registry[targetId];
        const targetLabel = targetEntry ? `${labels[targetEntry.ai]||targetEntry.ai} (${targetEntry.role})` : targetId;
        toast(`📤 Sent to ${targetLabel}`);
        console.log(`[Laichat] Sent message (${msg.length} chars) to ${targetId}`);
    }

    async function receive(packet) {
        if (!packet) return;
        if (packet.from === MY_ID) return;
        if (packet.to !== MY_ID) return;

        const seen = GM_getValue(SEEN_KEY, '');
        if (seen === packet.id) return;
        GM_setValue(SEEN_KEY, packet.id);

        const text = packet.text || '';
        if (!text) {
            toast('⚠️ Received empty message.');
            console.warn('[Laichat] Received empty packet:', packet);
            return;
        }

        console.log(`[Laichat] Received from ${packet.fromAI} (${packet.fromRole}) – text length: ${text.length}`);
        toast(`📥 Received from ${packet.fromAI} (${packet.fromRole}) – ${text.slice(0, 30)}...`);

        const success = await fillInput(text, 5);

        if (success) {
            console.log('[Laichat] Input filled successfully.');
            if (packet.autoSubmit) {
                setTimeout(submitInput, 400);
            }
        } else {
            console.error('[Laichat] Failed to fill input after retries.');
            toast('❌ Could not paste into input box. Showing message in a modal.');
            showMessageModal(text);
        }
    }

    // ─── TOAST ────────────────────────────────────────────────────────────

    function toast(msg) {
        let el = document.getElementById('laichat-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'laichat-toast';
            Object.assign(el.style, {
                position: 'fixed',
                right: '18px',
                bottom: '18px',
                zIndex: 2147483647,
                background: '#151a21',
                color: '#fff',
                padding: '10px 14px',
                border: '1px solid #394452',
                borderRadius: '9px',
                font: '13px -apple-system,BlinkMacSystemFont,sans-serif',
                boxShadow: '0 8px 30px #0008',
                maxWidth: '80%',
                wordBreak: 'break-word'
            });
            document.body.appendChild(el);
        }
        el.textContent = msg;
        clearTimeout(el._t);
        el._t = setTimeout(() => el.remove(), 5000);
    }

    // ─── SHOW MESSAGE IN MODAL (fallback) ──────────────────────────────

    function showMessageModal(text) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top:0; left:0; width:100%; height:100%;
            background: rgba(0,0,0,0.8); z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
        `;
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #0d1117; border: 1px solid #30363d; border-radius: 16px;
            padding: 24px; max-width: 700px; width: 90%; max-height: 80vh;
            display: flex; flex-direction: column; gap: 12px;
            color: #e6edf3; font-family: -apple-system,BlinkMacSystemFont,sans-serif;
        `;
        modal.innerHTML = `
            <h3 style="margin:0;font-weight:600;">📨 Received Message</h3>
            <div style="flex:1;overflow-y:auto;background:#161b22;border-radius:8px;padding:12px;font:13px/1.6 monospace;white-space:pre-wrap;word-break:break-word;max-height:50vh;">${text}</div>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="modal-copy-btn" style="background:#238636;border:0;border-radius:6px;padding:8px 18px;color:#fff;font-weight:600;cursor:pointer;">📋 Copy</button>
                <button id="modal-close-btn" style="background:#21262d;border:0;border-radius:6px;padding:8px 18px;color:#c9d1d9;cursor:pointer;">Close</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        modal.querySelector('#modal-close-btn').onclick = () => overlay.remove();
        modal.querySelector('#modal-copy-btn').onclick = () => {
            navigator.clipboard.writeText(text).then(() => {
                toast('📋 Copied to clipboard!');
            }).catch(() => {
                const area = document.createElement('textarea');
                area.value = text;
                document.body.appendChild(area);
                area.select();
                document.execCommand('copy');
                area.remove();
                toast('📋 Copied!');
            });
        };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    // ─── ROLE LIBRARY MODAL (Settings) ──────────────────────────────────

    function showRoleLibraryModal() {
        const current = localStorage.getItem('laichat.roleLibrary') || '';
        let displayText = '';
        if (current) {
            try {
                displayText = JSON.stringify(JSON.parse(current), null, 2);
            } catch (_) { displayText = current; }
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top:0; left:0; width:100%; height:100%;
            background: rgba(0,0,0,0.7); z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
        `;
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #0d1117; border: 1px solid #30363d; border-radius: 16px;
            padding: 24px; max-width: 700px; width: 90%; max-height: 90vh;
            display: flex; flex-direction: column; gap: 12px;
            color: #e6edf3; font-family: -apple-system,BlinkMacSystemFont,sans-serif;
        `;
        modal.innerHTML = `
            <h3 style="margin:0;font-weight:600;">📚 Role Library</h3>
            <p style="margin:0;color:#8b949e;font-size:13px;">
                Paste a JSON array of roles with <code>name</code> and <code>prompt</code> fields.
                This will override the built‑in prompts for matching role names.
            </p>
            <textarea id="laichat-lib-textarea" style="
                flex:1; min-height:300px; background:#161b22; border:1px solid #30363d;
                border-radius:8px; color:#e6edf3; padding:12px; font:13px/1.5 monospace;
                resize:vertical; width:100%;
            ">${displayText}</textarea>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="lib-save-btn" style="background:#238636;border:0;border-radius:6px;padding:8px 18px;color:#fff;font-weight:600;cursor:pointer;">💾 Save</button>
                <button id="lib-cancel-btn" style="background:#21262d;border:0;border-radius:6px;padding:8px 18px;color:#c9d1d9;cursor:pointer;">Cancel</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const textarea = modal.querySelector('#laichat-lib-textarea');
        const saveBtn = modal.querySelector('#lib-save-btn');
        const cancelBtn = modal.querySelector('#lib-cancel-btn');

        const close = () => overlay.remove();

        saveBtn.onclick = () => {
            try {
                const parsed = JSON.parse(textarea.value);
                localStorage.setItem('laichat.roleLibrary', JSON.stringify(parsed));
                toast('✅ Role library saved!');
                close();
                if (roleSelect) refreshRoleDropdown();
            } catch (e) {
                toast('❌ Invalid JSON: ' + e.message);
            }
        };
        cancelBtn.onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    // ─── FULL TOOLBAR (with global font-size) ───────────────────────────

    let toolbarBox = null;
    let roleSelect = null;
    let targetSelect = null;

    function makeDraggable(element) {
        let isDragging = false;
        let startX, startY, offsetX, offsetY;

        element.addEventListener('mousedown', (e) => {
            if (e.target.closest('select') || e.target.closest('button')) return;
            isDragging = true;
            const rect = element.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            let left = e.clientX - offsetX;
            let top = e.clientY - offsetY;
            const maxX = window.innerWidth - element.offsetWidth;
            const maxY = window.innerHeight - element.offsetHeight;
            left = Math.max(0, Math.min(left, maxX));
            top = Math.max(0, Math.min(top, maxY));
            element.style.left = left + 'px';
            element.style.top = top + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';
        }

        function onMouseUp() {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }

    function refreshRoleDropdown() {
        if (!roleSelect) return;
        const currentVal = roleSelect.value;
        const options = getRoleOptions();
        while (roleSelect.firstChild) roleSelect.removeChild(roleSelect.firstChild);
        for (const r of options) {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            if (r === currentVal) opt.selected = true;
            roleSelect.appendChild(opt);
        }
        const customOpt = document.createElement('option');
        customOpt.value = 'Custom...';
        customOpt.textContent = 'Custom...';
        roleSelect.appendChild(customOpt);
    }

    function refreshTargets() {
        if (!targetSelect) return;
        const registry = getRegistry();
        const currentVal = targetSelect.value;

        while (targetSelect.firstChild) {
            targetSelect.removeChild(targetSelect.firstChild);
        }

        let hasTargets = false;
        for (const id in registry) {
            if (id === MY_ID) continue;
            const entry = registry[id];
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${labels[entry.ai] || entry.ai} (${entry.role})`;
            targetSelect.appendChild(option);
            hasTargets = true;
        }
        if (!hasTargets) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '⏳ No other panels';
            targetSelect.appendChild(opt);
        }
        if (currentVal && targetSelect.querySelector(`option[value="${currentVal}"]`)) {
            targetSelect.value = currentVal;
        }
    }

    function buildToolbar() {
        if (document.getElementById('laichat-toolbar')) {
            console.log('[Laichat] Toolbar already exists.');
            return true;
        }

        console.log('[Laichat] Building full toolbar (compact)...');
        try {
            const box = document.createElement('div');
            box.id = 'laichat-toolbar';
            Object.assign(box.style, {
                position: 'fixed',
                bottom: '12px',
                left: '12px',
                zIndex: 2147483647,
                display: 'flex',
                gap: '4px',
                padding: TOOLBAR_PADDING,
                background: '#151a21ee',
                border: '1px solid #394452',
                borderRadius: '8px',
                backdropFilter: 'blur(6px)',
                alignItems: 'center',
                flexWrap: 'nowrap',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                cursor: 'move',
                userSelect: 'none',
                fontSize: TOOLBAR_FONT_SIZE,
                lineHeight: '1.2'
            });

            makeDraggable(box);

            // Role dropdown
            roleSelect = document.createElement('select');
            roleSelect.style.cssText =
                `background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:4px;padding:2px 4px;font-size:${TOOLBAR_FONT_SIZE};cursor:pointer;max-width:100px;`;
            refreshRoleDropdown();
            roleSelect.onchange = () => {
                const newRole = roleSelect.value;
                if (newRole === 'Custom...') {
                    const custom = prompt('Enter custom role name:', MY_ROLE);
                    if (custom && custom.trim() !== '') {
                        const trimmed = custom.trim();
                        MY_ROLE = trimmed;
                        sessionStorage.setItem('laichat_role', MY_ROLE);
                        localStorage.setItem('laichat_role', MY_ROLE);
                        registerSelf();
                        injectRolePrompt(true);
                        toast(`✅ Role updated to "${MY_ROLE}"`);
                        refreshRoleDropdown();
                        for (const opt of roleSelect.options) {
                            if (opt.value === trimmed) { opt.selected = true; break; }
                        }
                    } else {
                        roleSelect.value = MY_ROLE;
                    }
                    return;
                }
                MY_ROLE = newRole;
                sessionStorage.setItem('laichat_role', MY_ROLE);
                localStorage.setItem('laichat_role', MY_ROLE);
                registerSelf();
                injectRolePrompt(true);
                toast(`✅ Role updated to "${MY_ROLE}"`);
            };
            box.appendChild(roleSelect);

            // Target dropdown
            targetSelect = document.createElement('select');
            targetSelect.id = 'laichat-target';
            targetSelect.style.cssText =
                `background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:4px;padding:2px 4px;font-size:${TOOLBAR_FONT_SIZE};cursor:pointer;max-width:100px;`;
            refreshTargets();
            box.appendChild(targetSelect);

            // Send button
            const sendBtn = document.createElement('button');
            sendBtn.textContent = 'Send';
            Object.assign(sendBtn.style, {
                background: '#4f8cff',
                color: '#fff',
                border: 0,
                borderRadius: '4px',
                padding: BUTTON_PADDING,
                fontSize: TOOLBAR_FONT_SIZE,
                cursor: 'pointer',
                fontWeight: '600',
                whiteSpace: 'nowrap'
            });
            sendBtn.onclick = () => sendCurrent(targetSelect.value, false);
            box.appendChild(sendBtn);

            // Send+Submit button
            const sendSubmitBtn = document.createElement('button');
            sendSubmitBtn.textContent = 'Send+Submit';
            Object.assign(sendSubmitBtn.style, {
                background: '#238636',
                color: '#fff',
                border: 0,
                borderRadius: '4px',
                padding: BUTTON_PADDING,
                fontSize: TOOLBAR_FONT_SIZE,
                cursor: 'pointer',
                fontWeight: '600',
                whiteSpace: 'nowrap'
            });
            sendSubmitBtn.onclick = () => sendCurrent(targetSelect.value, true);
            box.appendChild(sendSubmitBtn);

            // Programmer button
            const programmerBtn = document.createElement('button');
            programmerBtn.textContent = '👨‍💻 Prog.';
            Object.assign(programmerBtn.style, {
                background: '#1f6feb',
                color: '#fff',
                border: 0,
                borderRadius: '4px',
                padding: BUTTON_PADDING,
                fontSize: TOOLBAR_FONT_SIZE,
                cursor: 'pointer',
                fontWeight: '600',
                whiteSpace: 'nowrap'
            });
            programmerBtn.title = 'Send to Precise Programmer (auto‑submit)';
            programmerBtn.onclick = sendToProgrammer;
            box.appendChild(programmerBtn);

            // Refresh button
            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = '↻';
            Object.assign(refreshBtn.style, {
                background: '#21262d',
                color: '#c9d1d9',
                border: 0,
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: TOOLBAR_FONT_SIZE,
                cursor: 'pointer'
            });
            refreshBtn.title = 'Refresh panel list';
            refreshBtn.onclick = () => { refreshTargets(); toast('↻ Refreshed'); };
            box.appendChild(refreshBtn);

            // Settings button
            const settingsBtn = document.createElement('button');
            settingsBtn.textContent = '⚙️';
            settingsBtn.title = 'Import Role Library (JSON)';
            settingsBtn.style.cssText =
                `background:#21262d;color:#c9d1d9;border:0;border-radius:4px;padding:2px 6px;font-size:${TOOLBAR_FONT_SIZE};cursor:pointer;`;
            settingsBtn.onclick = showRoleLibraryModal;
            box.appendChild(settingsBtn);

            document.body.appendChild(box);
            console.log('[Laichat] Full toolbar appended (compact).');

            GM_addValueChangeListener(REGISTRY_KEY, () => {
                refreshTargets();
            });

            toolbarBox = box;
            return true;
        } catch (e) {
            console.error('[Laichat] Error building toolbar:', e);
            return false;
        }
    }

    // ─── LISTENER ─────────────────────────────────────────────────────────

    const myInboxKey = INBOX_PREFIX + MY_ID;
    GM_addValueChangeListener(myInboxKey, (_k, _old, newVal, remote) => {
        if (remote && newVal) {
            receive(newVal);
        }
    });

    setTimeout(() => {
        const pending = GM_getValue(myInboxKey, null);
        if (pending) {
            receive(pending);
        }
    }, 1000);

    // ─── BOOT ─────────────────────────────────────────────────────────────

    let promptAttempts = 0;
    const promptInterval = setInterval(() => {
        const input = inputCandidates()[0];
        if (input) {
            clearInterval(promptInterval);
            console.log('[Laichat] Input box found.');
            if (MY_ROLE && MY_ROLE !== 'Worker') {
                injectRolePrompt(true);
            } else {
                toast('Select a role from the dropdown.');
            }
        } else {
            promptAttempts++;
            if (promptAttempts > 30) {
                clearInterval(promptInterval);
                console.warn('[Laichat] No input box found.');
            }
        }
    }, 500);

    let toolbarAttempts = 0;
    const toolbarInterval = setInterval(() => {
        const success = buildToolbar();
        if (success) {
            clearInterval(toolbarInterval);
        } else {
            toolbarAttempts++;
            if (toolbarAttempts > 30) {
                clearInterval(toolbarInterval);
                console.warn('[Laichat] Failed to build toolbar.');
            }
        }
    }, 500);

    console.log(`[Laichat] ${MY_ID} (${MY_ROLE}) ready. Drag toolbar to reposition.`);
})();