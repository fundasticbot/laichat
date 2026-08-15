// ==UserScript==
// @name         Laichat Bridge
// @namespace    laichat
// @version      0.3.2
// @description  Role library from localStorage. Strict prompts. Toolbar at bottom‑left.
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

    // ─── DYNAMIC ROLE PROMPT (localStorage first, then fallback) ────────

    const DEFAULT_ROLES_DATA = [{
        name: 'Critical Reviewer',
        prompt: `You are the Critical Reviewer (Red Team). RULES: 1) Max 200 words. 2) ONLY list defects, edge cases, security flaws, performance bottlenecks. 3) DO NOT propose solutions or write code. 4) Stick EXACTLY to the provided code. 5) Flag only what is broken or missing. Format: Bullet points. No fluff.`
    }, {
        name: 'Solution Architect',
        prompt: `You are the Solution Architect (Blue Team). RULES: 1) Max 200 words. 2) Synthesize the reviewer's findings into a minimal step‑by‑step fix plan. 3) DO NOT write code. 4) Do not add new features. 5) Prioritise the simplest path. Format: Numbered steps. No fluff.`
    }, {
        name: 'Precise Programmer',
        prompt: `You are the Precise Programmer. RULES: 1) Output ONLY the exact code changes (diff or full file). 2) Do NOT add extra features, comments, or tests unless asked. 3) Do NOT refactor unrelated code. 4) Strictly implement the architect's plan. Format: Code blocks only. No explanations.`
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

    // ─── ROBUST RESPONSE DETECTION ──────────────────────────────────────

    function latestAssistantText() {
        const candidates = [];

        let selectors = [
            '[data-message-author-role="assistant"]',
            '[data-testid*="assistant"]',
            'main article',
            'main [role="article"]',
            '.message:last-child .markdown',
            '.assistant-message'
        ];

        if (AI === 'deepseek') {
            selectors = selectors.concat([
                '.chat-message-ai',
                '.message-ai',
                '.assistant-message',
                '.message[data-role="assistant"]',
                '.chat-message[data-role="assistant"]',
                '.ai-message',
                '.chat-container .assistant',
                '.ds-message',
                '.message-item[data-role="assistant"]',
                '.message[data-author="assistant"]',
                '.assistant',
                '.assistant-message-content',
                '.message-content:not(.user)'
            ]);
        } else if (AI === 'gemini') {
            selectors = selectors.concat([
                '.model-response',
                '.response',
                '.message-content'
            ]);
        } else if (AI === 'claude') {
            selectors = selectors.concat([
                '.message.assistant',
                '.claude-message'
            ]);
        }

        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach(el => {
                const t = textOf(el);
                if (t.length > 15) candidates.push(t);
            });
        }

        if (!candidates.length) {
            const main = document.querySelector('main');
            if (main) {
                const blocks = main.querySelectorAll('div, p, article, section, .message, .chat-message, .response');
                for (const el of blocks) {
                    const t = textOf(el);
                    if (t.length > 15) {
                        const classes = el.className || '';
                        if (!classes.includes('input') && !classes.includes('button') && !classes.includes('send')) {
                            candidates.push(t);
                        }
                    }
                }
            }
        }

        if (!candidates.length) {
            const allElements = document.querySelectorAll('body *');
            const textBlocks = [];
            for (const el of allElements) {
                const t = textOf(el);
                if (t.length > 15) {
                    if (!el.closest('script, style, input, textarea, button')) {
                        textBlocks.push(t);
                    }
                }
            }
            if (textBlocks.length) {
                const last = textBlocks[textBlocks.length - 1];
                const inputText = inputCandidates()[0]?.textContent || '';
                if (last !== inputText) {
                    candidates.push(last);
                }
            }
        }

        if (candidates.length) {
            const result = candidates[candidates.length - 1];
            console.log('[Laichat] Latest response found:', result.slice(0, 60) + '...');
            return result;
        } else {
            console.warn('[Laichat] No response found after all attempts.');
            return '';
        }
    }

    // ─── FILL INPUT ──────────────────────────────────────────────────────

    function fillInput(text) {
        const el = inputCandidates()[0];
        if (!el) {
            console.warn('[Laichat] No input element found.');
            return false;
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
                } else {
                    console.warn('[Laichat] Claude input content mismatch!');
                }
            }, 200);
            return true;
        }

        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ||
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(el, text);
            else el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        } else {
            el.textContent = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
    }

    function submitInput() {
        const el = inputCandidates()[0];
        if (!el) return false;
        const form = el.closest('form');
        if (form) {
            const btn = form.querySelector('button[type="submit"]');
            if (btn && !btn.disabled) { btn.click(); return true; }
        }
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        return true;
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
            const success = fillInput(prompt);
            if (success) {
                toast(`✅ Role "${MY_ROLE}" prompt injected.`);
                console.log('[Laichat] Role prompt injected successfully.');
            } else {
                toast('❌ Failed to inject prompt. Check console.');
                console.error('[Laichat] fillInput returned false.');
            }
        } else {
            toast('Input has content – use dropdown to force injection.');
            console.log('[Laichat] Input has content, not overwriting.');
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
                boxShadow: '0 8px 30px #0008'
            });
            document.body.appendChild(el);
        }
        el.textContent = msg;
        clearTimeout(el._t);
        el._t = setTimeout(() => el.remove(), 2500);
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

    // ─── TOOLBAR – DRAGGABLE, BOTTOM‑LEFT ─────────────────────────────

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

    function buildToolbar() {
        if (document.getElementById('laichat-toolbar')) {
            console.log('[Laichat] Toolbar already exists.');
            return true;
        }

        console.log('[Laichat] Building toolbar...');
        try {
            const box = document.createElement('div');
            box.id = 'laichat-toolbar';
            Object.assign(box.style, {
                position: 'fixed',
                bottom: '12px',        // <-- placed at bottom
                left: '12px',          // <-- left side
                zIndex: 2147483647,
                display: 'flex',
                gap: '6px',
                padding: '6px 10px',
                background: '#151a21ee',
                border: '1px solid #394452',
                borderRadius: '10px',
                backdropFilter: 'blur(6px)',
                alignItems: 'center',
                flexWrap: 'nowrap',
                maxWidth: '600px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                cursor: 'move',
                userSelect: 'none'
            });

            makeDraggable(box);

            // ─── No role badge – only dropdown ───────────────────────────

            // Role dropdown
            roleSelect = document.createElement('select');
            roleSelect.style.cssText =
                'background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;max-width:130px;';

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
                'background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;max-width:140px;';

            function refreshTargets() {
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

            box.appendChild(targetSelect);
            refreshTargets();

            // Send button
            const sendBtn = document.createElement('button');
            sendBtn.textContent = `↗ Send (${MY_ROLE})`;
            Object.assign(sendBtn.style, {
                background: '#4f8cff',
                color: '#fff',
                border: 0,
                borderRadius: '6px',
                padding: '4px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '600',
                whiteSpace: 'nowrap'
            });
            sendBtn.onclick = () => sendCurrent(targetSelect.value, false);
            box.appendChild(sendBtn);

            // Send + submit
            const sendSubmitBtn = document.createElement('button');
            sendSubmitBtn.textContent = `↗ + submit (${MY_ROLE})`;
            Object.assign(sendSubmitBtn.style, {
                background: '#238636',
                color: '#fff',
                border: 0,
                borderRadius: '6px',
                padding: '4px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '600',
                whiteSpace: 'nowrap'
            });
            sendSubmitBtn.onclick = () => sendCurrent(targetSelect.value, true);
            box.appendChild(sendSubmitBtn);

            // Refresh button
            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = '↻';
            Object.assign(refreshBtn.style, {
                background: '#21262d',
                color: '#c9d1d9',
                border: 0,
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer'
            });
            refreshBtn.title = 'Refresh panel list';
            refreshBtn.onclick = refreshTargets;
            box.appendChild(refreshBtn);

            // Settings (import library)
            const settingsBtn = document.createElement('button');
            settingsBtn.textContent = '⚙️';
            settingsBtn.title = 'Import Role Library (JSON)';
            settingsBtn.style.cssText =
                'background:#21262d;color:#c9d1d9;border:0;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;';
            settingsBtn.onclick = showRoleLibraryModal;
            box.appendChild(settingsBtn);

            document.body.appendChild(box);
            console.log('[Laichat] Toolbar appended (bottom‑left).');

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
    }

    async function receive(packet) {
        if (!packet) return;
        if (packet.from === MY_ID) return;
        if (packet.to !== MY_ID) return;

        const seen = GM_getValue(SEEN_KEY, '');
        if (seen === packet.id) return;
        GM_setValue(SEEN_KEY, packet.id);

        const ok = fillInput(packet.text);
        if (!ok) {
            toast(`📥 Received from ${packet.fromAI} (${packet.fromRole}), but no input box found.`);
            return;
        }
        toast(`📥 Received from ${packet.fromAI} (${packet.fromRole})`);
        if (packet.autoSubmit) {
            setTimeout(submitInput, 600);
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