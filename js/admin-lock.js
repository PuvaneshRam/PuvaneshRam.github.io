// Password lock for admin.html. The admin app's code exists only as js/admin.vault.js: it is
// encrypted (AES-256-GCM) with a random data key, and that data key is stored twice — once
// locked by the admin password (PBKDF2-SHA-256) and once by a one-time recovery code the owner
// sends to their own email / WhatsApp at setup. Without one of the two there is nothing to run,
// so a copy of this page on the public site is useless.
// First run (no vault yet): choose a password; the plaintext js/admin.js is encrypted into the
// vault and deleted. A later plaintext js/admin.js is treated as an update and encrypted the
// next time the admin connects to the folder.
(() => {
  const PW_ITERATIONS = 600000;
  const CODE_ITERATIONS = 100000; // recovery codes carry ~100 random bits, so a lighter KDF is enough
  const MIN_LENGTH = 12;
  const MIN_BITS = 70;
  const COMMON = ['password', 'passw0rd', 'qwerty', 'admin', 'letmein', 'welcome', 'portfolio', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'abc123', '123456', '654321', '111111', '000000', 'trustno1', 'sunshine', 'princess', 'secret'];
  const IDLE_MS = 15 * 60 * 1000;
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no 0/O or 1/I lookalikes
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const AAD = enc.encode('pr-admin-vault-v2');

  const lockEl = document.getElementById('adm-lock');
  const noticeEl = document.getElementById('adm-lock-notice');

  let vault = typeof ADMIN_VAULT === 'undefined' ? null : ADMIN_VAULT;
  let dataKey = null;
  let source = null;
  let dirHandle = null;
  let app = null;
  let running = false;
  let afterCode = null;

  // where the owner sends their recovery code; taken from the profile the site already has
  const contact = (() => {
    const p = typeof PROFILE === 'undefined' ? {} : PROFILE;
    let phone = ((p.cvOnly && p.cvOnly.phone) || '').replace(/\D/g, '');
    if (phone.length === 10) phone = `91${phone}`; // 10-digit Indian mobile → international format for WhatsApp
    return { email: p.email || '', phone };
  })();
  const maskEmail = (e) => e.replace(/^(.)[^@]*(@.*)$/, '$1•••$2');
  const maskPhone = (p) => `•••• ${p.slice(-4)}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- crypto ----------
  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const random = (n) => crypto.getRandomValues(new Uint8Array(n));

  async function kek(secret, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function aesEncrypt(k, bytes) {
    const iv = random(12);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, k, bytes);
    return { iv: toB64(iv), data: toB64(new Uint8Array(data)) };
  }
  async function aesDecrypt(k, box) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv), additionalData: AAD }, k, fromB64(box.data)));
  }
  const newDataKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

  // lock the data key under a password or recovery code
  async function wrap(key, secret, iterations) {
    const salt = random(16);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    return { salt: toB64(salt), iter: iterations, ...(await aesEncrypt(await kek(secret, salt, iterations), raw)) };
  }
  // throws if the secret is wrong (AES-GCM authentication fails)
  async function unwrap(slot, secret) {
    const raw = await aesDecrypt(await kek(secret, fromB64(slot.salt), slot.iter), slot);
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
  }
  const sealApp = (key, text) => aesEncrypt(key, enc.encode(text));
  const openApp = async (key, box) => dec.decode(await aesDecrypt(key, box));

  function newRecoveryCode() {
    const chars = [...random(20)].map((b) => CODE_ALPHABET[b % 32]).join('');
    return chars.match(/.{5}/g).join('-');
  }
  const normalizeCode = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const vaultFile = (v) => `// Encrypted admin app. AES-256-GCM; the key is locked by the admin password and by a recovery code.
// Written by admin.html. Do not edit: it cannot be read or changed without the password or code.
const ADMIN_VAULT = ${JSON.stringify(v)};
`;

  // ---------- folder access ----------
  async function dirAt(root, parts, create) {
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return dir;
  }
  const split = (path) => { const parts = path.split('/'); return [parts, parts.pop()]; };
  async function readFile(root, path) {
    const [parts, name] = split(path);
    return (await (await (await dirAt(root, parts, false)).getFileHandle(name)).getFile()).text();
  }
  async function writeFile(root, path, text) {
    const [parts, name] = split(path);
    const w = await (await (await dirAt(root, parts, true)).getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  }
  async function removeFile(root, path) {
    const [parts, name] = split(path);
    await (await dirAt(root, parts, false)).removeEntry(name);
  }
  async function pickSiteFolder() {
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'portfolio-site', mode: 'readwrite' });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Pick your website folder to continue.' : e.message);
    }
    try {
      await readFile(handle, 'index.html');
    } catch {
      throw new Error("That isn't your website folder. Pick the one that contains index.html.");
    }
    return handle;
  }
  // same IndexedDB slot the admin app uses to remember the website folder (silently does nothing on file:// pages)
  function storeHandle(handle) {
    return new Promise((resolve) => {
      const req = indexedDB.open('portfolio-admin', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve();
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(handle, 'dir');
          tx.oncomplete = tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
    });
  }

  // ---------- wrong-attempt throttle (slows guessing in the page; the KDF slows offline guessing) ----------
  function fails() {
    try { return JSON.parse(localStorage.getItem('adminLockFails')) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; }
  }
  function setFails(f) { try { localStorage.setItem('adminLockFails', JSON.stringify(f)); } catch {} }
  function checkThrottle() {
    const wait = Math.ceil((fails().until - Date.now()) / 1000);
    if (wait > 0) throw new Error(`Too many wrong attempts. Try again in ${wait}s.`);
  }
  function recordFailure() {
    const f = fails();
    f.n += 1;
    if (f.n >= 3) f.until = Date.now() + Math.min(2 ** (f.n - 3), 60) * 1000;
    setFails(f);
  }

  // ---------- views ----------
  const logo = '<p class="lock-logo"><b>PR</b>ADMIN</p>';
  const pwField = (label, name, auto) =>
    `<label class="field"><span>${label}</span><input type="password" name="${name}" autocomplete="${auto}" required></label>`;
  const whereSaved = () => {
    const places = [contact.email && `your email (<b>${esc(maskEmail(contact.email))}</b>)`, contact.phone && `WhatsApp (<b>${esc(maskPhone(contact.phone))}</b>)`].filter(Boolean);
    return places.length ? ` Look for it in ${places.join(' or ')}.` : '';
  };

  const VIEWS = {
    setup: () => `
      <form class="lock-card" data-mode="setup" novalidate>
        ${logo}
        <h1>Secure your admin</h1>
        <p class="lock-text">Choose a password. The admin app is then encrypted with it, so nobody can use this page without it, including on your live site.</p>
        ${pwField('New password', 'pw', 'new-password')}
        <p class="lock-strength" data-strength></p>
        ${pwField('Confirm password', 'pw2', 'new-password')}
        <p class="lock-hint">At least ${MIN_LENGTH} characters, not based on your name, email or phone. Four or five random words, like a short odd sentence, make a strong password that's easy to remember.</p>
        <p class="lock-error" role="alert"></p>
        <button class="adm-btn primary lock-submit">Create password &amp; choose site folder</button>
        <p class="lock-hint">Next, pick your website folder (the one with index.html). You'll then get a recovery code to send to your email and WhatsApp.</p>
      </form>`,
    unlock: () => `
      <form class="lock-card" data-mode="unlock" novalidate>
        ${logo}
        <h1>Admin locked</h1>
        <p class="lock-text">Enter your password to open the content manager.</p>
        ${pwField('Password', 'pw', 'current-password')}
        <p class="lock-error" role="alert"></p>
        <button class="adm-btn primary lock-submit">Unlock</button>
        <button type="button" class="lock-link" data-view="recover">Forgot your password?</button>
      </form>`,
    relock: () => `
      <form class="lock-card" data-mode="unlock" novalidate>
        ${logo}
        <h1>Locked</h1>
        <p class="lock-text">The admin locked itself. Your unsaved changes are kept; unlock to carry on.</p>
        ${pwField('Password', 'pw', 'current-password')}
        <p class="lock-error" role="alert"></p>
        <button class="adm-btn primary lock-submit">Unlock</button>
      </form>`,
    recover: () => `
      <form class="lock-card" data-mode="recover" novalidate>
        ${logo}
        <h1>Reset password</h1>
        <p class="lock-text">Enter the recovery code you saved when you set up the admin.${whereSaved()}</p>
        <label class="field"><span>Recovery code</span><input type="text" name="code" autocomplete="off" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required></label>
        ${pwField('New password', 'pw', 'new-password')}
        <p class="lock-strength" data-strength></p>
        ${pwField('Confirm new password', 'pw2', 'new-password')}
        <p class="lock-hint">Next, pick your website folder so the new password can be saved. You'll get a new recovery code; the old one stops working.</p>
        <p class="lock-error" role="alert"></p>
        <button class="adm-btn primary lock-submit">Reset password</button>
        <button type="button" class="lock-link" data-view="unlock">Back to sign in</button>
        <details class="lock-help">
          <summary>Lost the recovery code too?</summary>
          <p>Copy <code>admin.js</code> from the <code>admin-src</code> backup folder (next to your website folder) into <code>js/</code>, delete <code>js/admin.vault.js</code>, then reopen this page to set everything up again. Your posts, profile and CV are not affected.</p>
        </details>
      </form>`,
    code: (code) => {
      const message = `Portfolio admin recovery code: ${code}\n\nIf you forget your admin password, open admin.html, click "Forgot your password?" and enter this code. Keep this message private.`;
      return `
        <div class="lock-card">
          ${logo}
          <h1>Save your recovery code</h1>
          <p class="lock-text">If you forget your password, this code is the only way back in. It's shown only once, so send it to yourself now.</p>
          <div class="recovery-code">${code}</div>
          <div class="recovery-send">
            ${contact.email ? `<a class="adm-btn" href="mailto:${esc(contact.email)}?subject=${encodeURIComponent('Portfolio admin recovery code')}&body=${encodeURIComponent(message)}">Email to ${esc(maskEmail(contact.email))}</a>` : ''}
            ${contact.phone ? `<a class="adm-btn" href="https://wa.me/${contact.phone}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">WhatsApp to ${esc(maskPhone(contact.phone))}</a>` : ''}
            <button type="button" class="adm-btn" data-copy="${code}">Copy</button>
          </div>
          <label class="lock-check"><input type="checkbox" data-ack> I've sent or saved my recovery code</label>
          <button type="button" class="adm-btn primary lock-submit" data-continue disabled>Continue to admin</button>
        </div>`;
    },
    change: () => `
      <form class="lock-card" data-mode="change" novalidate>
        <h1>Change password</h1>
        ${pwField('Current password', 'current', 'current-password')}
        ${pwField('New password', 'pw', 'new-password')}
        <p class="lock-strength" data-strength></p>
        ${pwField('Confirm new password', 'pw2', 'new-password')}
        <p class="lock-hint">At least ${MIN_LENGTH} characters, not based on your name, email or phone. Your recovery code keeps working.</p>
        <p class="lock-error" role="alert"></p>
        <div class="lock-actions">
          <button type="button" class="adm-btn ghost" data-cancel>Cancel</button>
          <button class="adm-btn primary lock-submit">Change password</button>
        </div>
      </form>`,
    unsupported: () => `
      <div class="lock-card">
        ${logo}
        <h1>Open in Chrome or Edge</h1>
        <p class="lock-text">The secure admin needs a browser with built-in encryption and folder access. Open admin.html in Google Chrome or Microsoft Edge.</p>
      </div>`
  };

  function show(mode, arg) {
    if (mode !== 'change') document.body.classList.add('locked');
    lockEl.classList.toggle('modal', mode === 'change');
    lockEl.innerHTML = VIEWS[mode](arg);
    lockEl.hidden = false;
    lockEl.querySelector('input')?.focus();
  }

  function hide() {
    lockEl.hidden = true;
    lockEl.innerHTML = '';
    document.body.classList.remove('locked');
  }

  function showCode(code, then) {
    afterCode = then;
    show('code', code);
  }

  let noticeTimer;
  function notice(msg, isError) {
    noticeEl.textContent = msg;
    noticeEl.classList.toggle('error', !!isError);
    noticeEl.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { noticeEl.hidden = true; }, 8000);
  }

  // ---------- password strength ----------
  // rough entropy estimate (length × log2 of the character pool), plus checks for the patterns
  // attackers try first: common passwords, the owner's own name/email/phone, repeats and sequences
  function passwordProblem(pw) {
    if (pw.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
    const lower = pw.toLowerCase();
    const p = typeof PROFILE === 'undefined' ? {} : PROFILE;
    const personal = [
      ...(p.name || '').toLowerCase().split(/\s+/),
      (p.email || '').toLowerCase().split('@')[0],
      contact.phone.slice(-6)
    ].filter((w) => w && w.length >= 3);
    if (COMMON.some((w) => lower.includes(w))) return 'That contains a very common password. Pick something less guessable.';
    if (personal.some((w) => lower.includes(w))) return "Don't use your name, email or phone number in the password.";
    if (new Set(pw).size < 6) return 'Too many repeated characters.';
    if (/(.)\1{3,}/.test(pw) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|zxcv)/i.test(pw)) return 'Avoid repeats and keyboard or number sequences.';
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/\d/.test(pw)) pool += 10;
    if (/[^a-zA-Z\d]/.test(pw)) pool += 33;
    if (pw.length * Math.log2(pool) < MIN_BITS) return 'Too predictable. Make it longer, or mix in capitals, numbers or symbols.';
    return '';
  }

  function strengthLabel(pw) {
    if (!pw) return '';
    if (passwordProblem(pw)) return 'weak';
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/\d/.test(pw)) pool += 10;
    if (/[^a-zA-Z\d]/.test(pw)) pool += 33;
    return pw.length * Math.log2(pool) >= 90 ? 'strong' : 'good';
  }

  // ---------- flows ----------
  function checkNew(pw, pw2) {
    const problem = passwordProblem(pw);
    if (problem) throw new Error(problem);
    if (pw !== pw2) throw new Error("The two passwords don't match.");
  }

  function start() {
    hide();
    running = true;
    lastActive = Date.now();
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const script = document.createElement('script');
    script.src = url;
    script.onload = script.onerror = () => URL.revokeObjectURL(url);
    document.body.appendChild(script);
  }

  async function doSetup(form, btn) {
    checkNew(form.pw.value, form.pw2.value);
    const handle = await pickSiteFolder();
    let text;
    try {
      text = await readFile(handle, 'js/admin.js');
    } catch {
      throw new Error('That folder has no js/admin.js to encrypt.');
    }

    btn.textContent = 'Encrypting…';
    const key = await newDataKey();
    const code = newRecoveryCode();
    vault = {
      v: 2,
      app: await sealApp(key, text),
      password: await wrap(key, form.pw.value, PW_ITERATIONS),
      recovery: await wrap(key, normalizeCode(code), CODE_ITERATIONS)
    };
    await writeFile(handle, 'js/admin.vault.js', vaultFile(vault));
    await removeFile(handle, 'js/admin.js');
    storeHandle(handle);
    dirHandle = handle;
    dataKey = key;
    source = text;
    showCode(code, start);
  }

  async function doUnlock(form, btn) {
    checkThrottle();
    btn.textContent = 'Checking…';
    let key;
    try {
      key = await unwrap(vault.password, form.pw.value);
    } catch {
      recordFailure();
      throw new Error('Wrong password.');
    }
    setFails({ n: 0, until: 0 });
    dataKey = key;
    if (running) {
      hide();
      lastActive = Date.now();
    } else {
      source = await openApp(key, vault.app);
      start();
    }
  }

  async function doRecover(form, btn) {
    checkThrottle();
    const code = normalizeCode(form.code.value);
    if (code.length !== 20) throw new Error('A recovery code has 20 letters and numbers.');
    checkNew(form.pw.value, form.pw2.value);
    // pick the folder first, while the click still counts as a user gesture
    if (!dirHandle) dirHandle = await pickSiteFolder();

    btn.textContent = 'Checking…';
    let key;
    try {
      key = await unwrap(vault.recovery, code);
    } catch {
      recordFailure();
      throw new Error("That recovery code doesn't match.");
    }
    setFails({ n: 0, until: 0 });

    const nextCode = newRecoveryCode();
    vault = {
      ...vault,
      password: await wrap(key, form.pw.value, PW_ITERATIONS),
      recovery: await wrap(key, normalizeCode(nextCode), CODE_ITERATIONS)
    };
    await writeFile(dirHandle, 'js/admin.vault.js', vaultFile(vault));
    storeHandle(dirHandle);
    dataKey = key;
    source = await openApp(key, vault.app);
    showCode(nextCode, start);
  }

  async function doChange(form) {
    if (!dirHandle) throw new Error('Connect your website folder first (top bar), then change the password.');
    let key;
    try {
      key = await unwrap(vault.password, form.current.value);
    } catch {
      throw new Error('Current password is wrong.');
    }
    checkNew(form.pw.value, form.pw2.value);
    const next = { ...vault, password: await wrap(key, form.pw.value, PW_ITERATIONS) };
    await writeFile(dirHandle, 'js/admin.vault.js', vaultFile(next));
    vault = next;
    dataKey = key;
    hide();
    notice('Password changed. Your recovery code still works.');
  }

  // a clean session reloads, which drops the decrypted app from memory; with unsaved edits it
  // only covers the screen so the work survives until the password is entered again
  function lock() {
    if (!running) return;
    if (!app || !app.isDirty()) { location.reload(); return; }
    dataKey = null;
    show('relock');
  }

  // called by the admin app whenever it connects to the website folder
  async function folderConnected(handle) {
    dirHandle = handle;
    if (!dataKey) return;
    let text;
    try { text = await readFile(handle, 'js/admin.js'); } catch { return; }
    try {
      vault = { ...vault, app: await sealApp(dataKey, text) };
      await writeFile(handle, 'js/admin.vault.js', vaultFile(vault));
      await removeFile(handle, 'js/admin.js');
      source = text;
      notice('Admin update installed and encrypted. Reload the page to use the new version.');
    } catch (e) {
      notice(`Couldn't encrypt the admin update: ${e.message}`, true);
    }
  }

  // ---------- events ----------
  const FLOWS = { setup: doSetup, unlock: doUnlock, recover: doRecover, change: doChange };

  lockEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = form.querySelector('.lock-error');
    const btn = form.querySelector('.lock-submit');
    const label = btn.textContent;
    err.textContent = '';
    btn.disabled = true;
    try {
      await FLOWS[form.dataset.mode](form, btn);
    } catch (ex) {
      err.textContent = ex.message;
      btn.textContent = label;
    } finally {
      btn.disabled = false;
    }
  });

  lockEl.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-cancel]')) { hide(); return; }
    const view = t.closest('[data-view]');
    if (view) { show(view.dataset.view); return; }
    const copy = t.closest('[data-copy]');
    if (copy) {
      try {
        await navigator.clipboard.writeText(copy.dataset.copy);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Select the code above to copy';
      }
      return;
    }
    if (t.closest('[data-continue]') && afterCode) {
      const then = afterCode;
      afterCode = null;
      then();
    }
  });

  lockEl.addEventListener('input', (e) => {
    if (e.target.name !== 'pw') return;
    const meter = lockEl.querySelector('[data-strength]');
    if (!meter) return;
    const level = strengthLabel(e.target.value);
    meter.className = `lock-strength ${level}`;
    meter.textContent = level ? `Strength: ${level}${level === 'weak' ? ` — ${passwordProblem(e.target.value)}` : ''}` : '';
  });

  lockEl.addEventListener('change', (e) => {
    if (e.target.matches('[data-ack]')) lockEl.querySelector('[data-continue]').disabled = !e.target.checked;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lockEl.classList.contains('modal') && !lockEl.hidden) hide();
  });

  document.getElementById('adm-lock-btn').addEventListener('click', lock);
  document.getElementById('adm-password').addEventListener('click', () => show('change'));

  let lastActive = Date.now();
  ['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach((type) =>
    window.addEventListener(type, () => { lastActive = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (running && lockEl.hidden && Date.now() - lastActive > IDLE_MS) lock();
  }, 30000);

  window.AdminLock = Object.freeze({
    folderConnected,
    register(api) { app = api; }
  });

  if (!window.crypto?.subtle) show('unsupported');
  else if (vault) show('unlock');
  else show(typeof window.showDirectoryPicker === 'function' ? 'setup' : 'unsupported');
})();
