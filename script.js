// ── 設定（部署 Apps Script 後替換此 URL）─────────────────────────────────────
const API_URL = 'https://script.google.com/macros/s/AKfycbzYH2zCpCSSgapEeektdeiEppSzQlwhP0AXxxebaM1vSiIopiec96fQdiTMrWPyAiw-/exec';

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getUser()  { try { return JSON.parse(localStorage.getItem('yk_user')); } catch { return null; } }
function getToken() { return localStorage.getItem('yk_token'); }
function setSession(user, token) {
  localStorage.setItem('yk_user', JSON.stringify(user));
  localStorage.setItem('yk_token', token);
}
function clearSession() {
  localStorage.removeItem('yk_user');
  localStorage.removeItem('yk_token');
}

// ── Cache helpers (stale-while-revalidate) ─────────────────────────────────────

function getCachedData()       { try { return JSON.parse(localStorage.getItem('yk_page_cache')); } catch { return null; } }
function setCachedData(data)   { localStorage.setItem('yk_page_cache', JSON.stringify(data)); }

// 記錄本次 session 已解鎖的 section 密碼（key: section_id, value: links[]）
const unlockedSections = new Map(
  JSON.parse(sessionStorage.getItem('yk_unlocked') || '[]')
);
function persistUnlocked() {
  sessionStorage.setItem('yk_unlocked', JSON.stringify([...unlockedSections.entries()]));
}

// ── Favicon ───────────────────────────────────────────────────────────────────

function getFaviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch { return ''; }
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchPageData() {
  const user = getUser();
  const params = user ? `?user_id=${encodeURIComponent(user.user_id)}` : '';
  const res = await fetch(API_URL + params);
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return data;
}

async function verifyPassword(sectionId, password) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'verify_section_password', section_id: sectionId, password }),
  });
  return res.json();
}

function trackClick(linkId) {
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'track_click', link_id: linkId }),
  }).catch(() => {});
}

async function apiPost(payload) {
  const user = getUser();
  if (user) payload.user_id = user.user_id;
  const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
  return res.json();
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const toggleBtn = document.getElementById('toggle-theme');

function prefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const savedTheme = localStorage.getItem('theme');
let currentTheme = savedTheme || (prefersDark() ? 'dark' : 'light');

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light');
    toggleBtn.textContent = '☀️';
  } else {
    document.body.classList.remove('light');
    toggleBtn.textContent = '🌙';
  }
}

applyTheme(currentTheme);

toggleBtn.addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', currentTheme);
  applyTheme(currentTheme);
  const cached = getCachedData();
  if (cached) renderAll(cached.sections, cached.links);
});

// ── Quote ─────────────────────────────────────────────────────────────────────

const quotes = [
  "「妳是什麼座的啊？」\n：「金牛座啊，你呢？」\n「我是為妳量身訂做的。」",
  "「別再哭了，這樣有個地方會痛。」\n：「我的眼睛嗎？」\n「不是，是我的心會痛。」",
  "「我可以跟妳問路嗎？」\n：「你要到哪裡？」\n「到妳心裡。」",
  "「你覺得一個禮拜裡面，我比較喜歡哪一天？」\n：「星期天嗎？」\n「我喜歡有你的每一天。」",
  "「妳為什麼要害我！」\n：「我害你什麼了？」\n「害我那麼喜歡妳！」",
  "「下禮拜要期末考，但是我一點都不想唸書….因為我只想念妳。」",
  "你不用多好，只要我喜歡你就好。",
  "我有個很大的缺點，缺了點你。",
  "老虎不發威，妳當我……當我女朋友吧。",
  "我不能玩捉迷藏，因為喜歡妳是藏不住的。",
  "這世界上的美有很多種，而你就是我最喜歡的那種。",
  "妳的過去我來不及參與，但妳的未來我一定不會缺席。",
  "我不需要征服世界，因為發現妳就是我的全世界。",
];

function updateQuote() {
  document.getElementById('quote-line').innerText = quotes[Math.floor(Math.random() * quotes.length)];
}

const today = new Date();
document.getElementById('quote-date').textContent =
  today.toLocaleDateString('zh-Hant', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
updateQuote();
document.getElementById('quote-button').addEventListener('click', updateQuote);

// ── Search ─────────────────────────────────────────────────────────────────────

const searchBox = document.getElementById('search-box');
searchBox.addEventListener('input', () => {
  const cached = getCachedData();
  if (cached) renderAll(cached.sections, cached.links);
});

// ── Preview box ────────────────────────────────────────────────────────────────

const previewBox    = document.getElementById('previewBox');
const previewIframe = previewBox.querySelector('iframe');

// ── Render ────────────────────────────────────────────────────────────────────

function makeLinkAnchor(link) {
  const anchor = document.createElement('a');
  anchor.href = link.url;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  anchor.className = 'link-item';
  anchor.dataset.linkId = link.link_id;

  const faviconSrc = link.favicon_url || getFaviconUrl(link.url);
  if (faviconSrc) {
    const img = document.createElement('img');
    img.src = faviconSrc;
    img.className = 'favicon';
    img.onerror = () => img.remove();
    anchor.appendChild(img);
  }

  const span = document.createElement('span');
  span.textContent = link.name;
  anchor.appendChild(span);

  anchor.addEventListener('click', () => trackClick(link.link_id));

  anchor.addEventListener('mouseenter', e => {
    previewIframe.src = link.url;
    previewBox.style.left = e.pageX + 20 + 'px';
    previewBox.style.top  = e.pageY + 20 + 'px';
    previewBox.style.display = 'block';
  });
  anchor.addEventListener('mousemove', e => {
    previewBox.style.left = e.pageX + 20 + 'px';
    previewBox.style.top  = e.pageY + 20 + 'px';
  });
  anchor.addEventListener('mouseleave', () => {
    previewBox.style.display = 'none';
    previewIframe.src = '';
  });

  return anchor;
}

function renderPinned(links) {
  const pinned = links.filter(l => l.pinned);
  const el = document.getElementById('pinned-section');
  if (pinned.length === 0) { el.style.display = 'none'; return; }
  el.style.display = '';
  const grid = el.querySelector('.link-grid');
  grid.innerHTML = '';
  pinned.forEach(l => grid.appendChild(makeLinkAnchor(l)));
}

function renderLockedOverlay(section, container) {
  const overlay = document.createElement('div');
  overlay.className = 'locked-overlay';

  const msg = document.createElement('p');
  const isPasswordOrUsers = section.visibility === 'passwordOrUsers';
  msg.textContent = isPasswordOrUsers ? '此區塊需要密碼或登入帳號才能查看' : '此區塊需要密碼才能查看';
  overlay.appendChild(msg);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'locked-actions';

  const pwBtn = document.createElement('button');
  pwBtn.className = 'unlock-btn';
  pwBtn.textContent = '🔑 輸入密碼';
  actionsDiv.appendChild(pwBtn);

  if (isPasswordOrUsers && !getUser()) {
    const loginBtn = document.createElement('button');
    loginBtn.className = 'unlock-btn';
    loginBtn.textContent = '👤 登入帳號';
    loginBtn.addEventListener('click', () => openLoginModal());
    actionsDiv.appendChild(loginBtn);
  }

  overlay.appendChild(actionsDiv);

  const pwRow = document.createElement('div');
  pwRow.className = 'password-input-row';
  pwRow.style.display = 'none';

  const pwInput = document.createElement('input');
  pwInput.type = 'password';
  pwInput.placeholder = '輸入密碼';
  pwRow.appendChild(pwInput);

  const pwSubmit = document.createElement('button');
  pwSubmit.className = 'unlock-btn';
  pwSubmit.textContent = '確認';
  pwRow.appendChild(pwSubmit);

  const errMsg = document.createElement('div');
  errMsg.className = 'password-error';

  overlay.appendChild(pwRow);
  overlay.appendChild(errMsg);
  container.appendChild(overlay);

  pwBtn.addEventListener('click', () => {
    pwRow.style.display = pwRow.style.display === 'none' ? 'flex' : 'none';
    pwInput.focus();
  });

  async function tryUnlock() {
    const pw = pwInput.value;
    if (!pw) return;
    pwSubmit.disabled = true;
    errMsg.textContent = '驗證中...';
    const result = await verifyPassword(section.section_id, pw);
    pwSubmit.disabled = false;
    if (result.success) {
      unlockedSections.set(section.section_id, result.links);
      persistUnlocked();
      container.innerHTML = '';
      renderLinkGrid(result.links, container, section);
    } else {
      errMsg.textContent = result.message || '密碼錯誤';
    }
  }

  pwSubmit.addEventListener('click', tryUnlock);
  pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
}

function renderLinkGrid(links, container, section) {
  const query = searchBox.value.toLowerCase();
  const filtered = query ? links.filter(l => l.name.toLowerCase().includes(query)) : links;

  const grid = document.createElement('div');
  grid.className = 'link-grid';
  filtered.forEach(l => grid.appendChild(makeLinkAnchor(l)));
  container.appendChild(grid);

  if (getUser()?.role === 'admin') {
    const qaBtn = document.createElement('button');
    qaBtn.className = 'quick-add-btn';
    qaBtn.textContent = '+ 新增連結';
    qaBtn.addEventListener('click', () => showQuickAdd(section.section_id, container.parentElement, links));
    container.appendChild(qaBtn);
  }
}

function renderAll(sections, links) {
  const query = searchBox.value.toLowerCase();
  const container = document.getElementById('linkSections');
  container.innerHTML = '';

  const filteredLinks = query
    ? links.filter(l => l.name.toLowerCase().includes(query))
    : links;

  renderPinned(filteredLinks);

  sections.forEach(section => {
    const sectionLinks = filteredLinks.filter(l => l.section_id === section.section_id);
    if (query && sectionLinks.length === 0 && section.locked) return;

    const bgColor = currentTheme === 'dark' ? section.dark_color : section.light_color;

    const el = document.createElement('div');
    el.className = 'section';
    el.style.backgroundColor = bgColor;

    const h2 = document.createElement('h2');
    h2.style.color = section.text_color;

    const titleLeft = document.createElement('div');
    titleLeft.className = 'section-title-left';
    if (section.locked) {
      const lock = document.createElement('span');
      lock.className = 'lock-icon';
      lock.textContent = '🔒';
      titleLeft.appendChild(lock);
    }
    const nameSpan = document.createElement('span');
    nameSpan.textContent = section.name;
    titleLeft.appendChild(nameSpan);
    h2.appendChild(titleLeft);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-btn';
    toggleBtn.textContent = '⮟';
    h2.appendChild(toggleBtn);
    el.appendChild(h2);

    if (section.note) {
      const note = document.createElement('div');
      note.className = 'section-note';
      note.textContent = section.note;
      el.appendChild(note);
    }

    const body = document.createElement('div');
    el.appendChild(body);

    if (section.locked && !unlockedSections.has(section.section_id)) {
      renderLockedOverlay(section, body);
    } else {
      const linksToShow = unlockedSections.has(section.section_id)
        ? unlockedSections.get(section.section_id)
        : sectionLinks;
      renderLinkGrid(linksToShow, body, section);
    }

    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      toggleBtn.textContent = hidden ? '⮟' : '⮝';
    });

    container.appendChild(el);
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function showSkeleton() {
  const container = document.getElementById('linkSections');
  container.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    container.innerHTML += `
      <div class="skeleton-section">
        <div class="skeleton-title"></div>
        <div class="skeleton-grid">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      </div>`;
  }
}

// ── Auth UI ───────────────────────────────────────────────────────────────────

function updateAuthUI(user) {
  const loginBtn  = document.getElementById('login-btn');
  const userInfo  = document.getElementById('user-info');
  const adminBtn  = document.getElementById('admin-btn');
  const userLabel = document.getElementById('user-label');

  if (user) {
    loginBtn.classList.add('hidden');
    userInfo.classList.add('visible');
    userLabel.textContent = user.username;
    if (user.role === 'admin') adminBtn.classList.add('visible');
    else adminBtn.classList.remove('visible');
  } else {
    loginBtn.classList.remove('hidden');
    userInfo.classList.remove('visible');
    adminBtn.classList.remove('visible');
  }
}

// ── Login modal ───────────────────────────────────────────────────────────────

function openLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('modal-userid').focus();
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('modal-userid').value = '';
  document.getElementById('modal-password').value = '';
  document.getElementById('modal-msg').textContent = '';
}

function initLoginModal() {
  document.getElementById('login-btn').addEventListener('click', openLoginModal);
  document.getElementById('modal-close').addEventListener('click', closeLoginModal);
  document.getElementById('login-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('login-modal')) closeLoginModal();
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession();
    updateAuthUI(null);
    sessionStorage.removeItem('yk_unlocked');
    unlockedSections.clear();
    init();
  });

  document.getElementById('modal-submit').addEventListener('click', handleLogin);
  document.getElementById('modal-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
}

async function handleLogin() {
  const userId   = document.getElementById('modal-userid').value.trim();
  const password = document.getElementById('modal-password').value;
  const msgEl    = document.getElementById('modal-msg');
  const btn      = document.getElementById('modal-submit');

  if (!userId || !password) { msgEl.textContent = '請輸入帳號與密碼'; msgEl.style.color = 'var(--danger)'; return; }

  msgEl.style.color = 'var(--text-color)';
  msgEl.textContent = '驗證中...';
  btn.disabled = true;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'login', user_id: userId, password }),
    });
    const data = await res.json();

    if (data.success) {
      setSession(data.user, data.token);
      closeLoginModal();
      updateAuthUI(data.user);
      await init();
    } else {
      msgEl.style.color = 'var(--danger)';
      msgEl.textContent = data.message || '登入失敗';
    }
  } catch {
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = '連線失敗，請檢查網路狀態';
  } finally {
    btn.disabled = false;
  }
}

// ── Quick-add ─────────────────────────────────────────────────────────────────

function showQuickAdd(sectionId, sectionEl, existingLinks) {
  const existing = sectionEl.querySelector('.quick-add-popover');
  if (existing) { existing.remove(); return; }

  const popover = document.createElement('div');
  popover.className = 'quick-add-popover';
  popover.innerHTML = `
    <input id="qa-name" placeholder="連結名稱" />
    <input id="qa-url"  placeholder="https://..." />
    <div class="popover-actions">
      <button class="popover-cancel">取消</button>
      <button class="popover-submit">新增</button>
    </div>
    <div id="qa-msg" style="font-size:0.8rem; margin-top:0.4rem; text-align:right;"></div>
  `;
  sectionEl.appendChild(popover);
  popover.querySelector('#qa-name').focus();

  popover.querySelector('.popover-cancel').addEventListener('click', () => popover.remove());

  async function submit() {
    const name = popover.querySelector('#qa-name').value.trim();
    const url  = popover.querySelector('#qa-url').value.trim();
    const msg  = popover.querySelector('#qa-msg');
    if (!name || !url) { msg.textContent = '請填寫名稱與網址'; return; }

    msg.textContent = '新增中...';
    const result = await apiPost({ action: 'add_link', section_id: sectionId, name, url });
    if (result.success) {
      popover.remove();
      await init();
    } else {
      msg.textContent = result.message || '新增失敗';
    }
  }

  popover.querySelector('.popover-submit').addEventListener('click', submit);
  popover.querySelector('#qa-url').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const cached = getCachedData();
  if (cached) {
    renderAll(cached.sections, cached.links);
  } else {
    showSkeleton();
  }
  updateAuthUI(getUser());

  try {
    const data = await fetchPageData();
    setCachedData({ sections: data.sections, links: data.links });
    renderAll(data.sections, data.links);
    if (data.current_user) updateAuthUI(data.current_user);
  } catch (err) {
    if (!cached) {
      document.getElementById('linkSections').innerHTML =
        `<p style="text-align:center;opacity:0.6;">⚠️ 無法載入資料（${err.message}）</p>`;
    }
  }
}

initLoginModal();
init();
