const API_URL = 'https://script.google.com/macros/s/AKfycbzYH2zCpCSSgapEeektdeiEppSzQlwhP0AXxxebaM1vSiIopiec96fQdiTMrWPyAiw-/exec';

// ── Auth ──────────────────────────────────────────────────────────────────────

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

// ── Cache ─────────────────────────────────────────────────────────────────────

function getCachedData() {
  try { return JSON.parse(localStorage.getItem('yk_page_cache')); } catch { return null; }
}
function setCachedData(data) {
  try { localStorage.setItem('yk_page_cache', JSON.stringify(data)); } catch {}
}

// ── Session unlock map ────────────────────────────────────────────────────────

const unlockedSections = new Map(
  JSON.parse(sessionStorage.getItem('yk_unlocked') || '[]')
);
function saveUnlocked() {
  sessionStorage.setItem('yk_unlocked', JSON.stringify([...unlockedSections.entries()]));
}

// ── Theme ─────────────────────────────────────────────────────────────────────

let currentTheme = localStorage.getItem('theme') ||
  (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

function applyTheme() {
  document.body.classList.toggle('light', currentTheme === 'light');
  document.getElementById('toggle-theme').textContent = currentTheme === 'light' ? '🌙' : '☀️';
}

document.getElementById('toggle-theme').addEventListener('click', () => {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', currentTheme);
  applyTheme();
  const cached = getCachedData();
  if (cached) renderAll(cached.sections || [], cached.links || []);
});

// ── Favicon ───────────────────────────────────────────────────────────────────

function getFaviconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
  catch { return ''; }
}

// ── Fallback quotes (used if Sheets returns none) ─────────────────────────────

const FALLBACK_QUOTES = [
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

let activeQuotes = [...FALLBACK_QUOTES];
let quotesFromAPI = false; // true 之後，空陣列代表全部停用而不是 fallback

function updateQuote() {
  const box = document.getElementById('quote-box');
  // 已從 API 拿到資料且沒有啟用的語錄 → 隱藏整個區塊
  if (quotesFromAPI && activeQuotes.length === 0) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  const list = activeQuotes.length ? activeQuotes : FALLBACK_QUOTES;
  const raw = list[Math.floor(Math.random() * list.length)];
  document.getElementById('quote-line').innerHTML = raw.replace(/\n/g, '<br>');
  document.getElementById('quote-date').textContent =
    new Date().toLocaleDateString('zh-Hant', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}
document.getElementById('quote-button').addEventListener('click', updateQuote);

// ── Settings ──────────────────────────────────────────────────────────────────

function applySettings(settings) {
  if (!settings) return;
  if (settings.page_title) {
    document.getElementById('page-title').textContent = settings.page_title;
    document.title = settings.page_title;
  }
  const searchBox = document.getElementById('search-box');
  if (settings.show_search === 'false' || settings.show_search === false) {
    searchBox.style.display = 'none';
  } else {
    searchBox.style.display = '';
  }
  const quoteBox = document.getElementById('quote-box');
  if (settings.show_quotes === 'false' || settings.show_quotes === false) {
    quoteBox.style.display = 'none';
  } else if (!quotesFromAPI || activeQuotes.length > 0) {
    quoteBox.style.display = '';
  }
}

function renderHeaderLinks(headerLinks) {
  if (!Array.isArray(headerLinks)) return;
  const container = document.getElementById('header-links-container');
  container.innerHTML = '';
  headerLinks.forEach(item => {
    if (!item.name || !item.url) return;
    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = item.name;
    container.appendChild(a);
  });
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchPageData() {
  const user = getUser();
  const url = user ? `${API_URL}?user_id=${encodeURIComponent(user.user_id)}` : API_URL;
  const res = await fetch(url);
  return res.json();
}

async function apiPost(payload) {
  const user = getUser();
  if (user) payload.user_id = user.user_id;
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function verifyPassword(sectionId, password) {
  return apiPost({ action: 'verify_section_password', section_id: sectionId, password });
}

async function verifyLinkPassword(linkId, password) {
  return apiPost({ action: 'verify_link_password', link_id: linkId, password });
}

function trackClick(linkId) {
  apiPost({ action: 'track_click', link_id: linkId }).catch(() => {});
}

// ── Render helpers ────────────────────────────────────────────────────────────

function makeLinkAnchor(link) {
  if (link.locked) return makeLockedLinkItem(link);

  const a = document.createElement('a');
  a.className = 'link-item';
  a.href = link.url;
  a.target = '_blank';
  a.rel = 'noopener';

  const favicon = document.createElement('img');
  favicon.className = 'favicon';
  favicon.src = link.favicon_url || getFaviconUrl(link.url);
  favicon.alt = '';
  favicon.onerror = () => { favicon.style.display = 'none'; };

  const nameEl = document.createElement('span');
  nameEl.textContent = link.name;

  a.appendChild(favicon);
  a.appendChild(nameEl);

  a.addEventListener('click', () => trackClick(link.link_id));

  const previewBox = document.getElementById('previewBox');
  a.addEventListener('mouseenter', () => {
    previewBox.querySelector('iframe').src = link.url;
    previewBox.style.display = 'block';
  });
  a.addEventListener('mouseleave', () => {
    previewBox.style.display = 'none';
    previewBox.querySelector('iframe').src = '';
  });

  return a;
}

function makeLockedLinkItem(link) {
  const wrapper = document.createElement('div');
  wrapper.className = 'link-item locked';

  const nameEl = document.createElement('span');
  nameEl.textContent = '🔒 ' + link.name;
  wrapper.appendChild(nameEl);

  wrapper.addEventListener('click', () => {
    const existing = wrapper.querySelector('.link-unlock-form');
    if (existing) { existing.remove(); return; }

    const form = document.createElement('div');
    form.className = 'link-unlock-form';
    form.innerHTML = `
      <input type="password" placeholder="輸入密碼" class="lu-pwd">
      <div class="lu-error"></div>
      <div class="lu-actions">
        <button class="lu-submit">解鎖</button>
        <button class="lu-cancel">取消</button>
      </div>
    `;
    wrapper.appendChild(form);

    form.querySelector('.lu-cancel').addEventListener('click', e => { e.stopPropagation(); form.remove(); });
    form.querySelector('.lu-submit').addEventListener('click', async e => {
      e.stopPropagation();
      const pwd = form.querySelector('.lu-pwd').value;
      const btn = form.querySelector('.lu-submit');
      btn.disabled = true;
      const result = await verifyLinkPassword(link.link_id, pwd);
      btn.disabled = false;
      if (result.success) {
        form.remove();
        window.open(result.url, '_blank');
        trackClick(link.link_id);
      } else {
        form.querySelector('.lu-error').textContent = result.message || '密碼錯誤';
      }
    });
    form.querySelector('.lu-pwd').addEventListener('keydown', e => {
      if (e.key === 'Enter') form.querySelector('.lu-submit').click();
      e.stopPropagation();
    });
  });

  return wrapper;
}

function renderPinned(links) {
  const pinned = links.filter(l => l.pinned);
  const container = document.getElementById('pinned-section');
  if (pinned.length === 0) { container.style.display = 'none'; return; }
  container.style.display = '';
  const grid = container.querySelector('.link-grid');
  grid.innerHTML = '';
  pinned.forEach(l => grid.appendChild(makeLinkAnchor(l)));
}

function renderLinkGrid(links, container, section) {
  const grid = document.createElement('div');
  grid.className = 'link-grid';

  const q = (document.getElementById('search-box').value || '').toLowerCase();
  const filtered = q
    ? links.filter(l => l.name.toLowerCase().includes(q) || l.url.toLowerCase().includes(q))
    : links;

  filtered.forEach(l => grid.appendChild(makeLinkAnchor(l)));
  container.appendChild(grid);

  if (getUser()?.role === 'admin') {
    const btn = document.createElement('button');
    btn.className = 'quick-add-btn';
    btn.textContent = '＋ 新增連結';
    btn.addEventListener('click', () => showQuickAdd(section.section_id, container));
    container.appendChild(btn);
  }
}

// ── Section type renderers ────────────────────────────────────────────────────

function renderNote(section, container) {
  const div = document.createElement('div');
  div.className = 'section-content-note';
  div.innerHTML = (section.note || '').replace(/\n/g, '<br>');
  container.appendChild(div);
}

function renderEmbed(section, container) {
  const wrap = document.createElement('div');
  wrap.className = 'section-embed';
  const iframe = document.createElement('iframe');
  iframe.src = section.note || '';
  iframe.allowFullscreen = true;
  wrap.appendChild(iframe);
  container.appendChild(wrap);
}

function renderAnnouncement(section, container) {
  const div = document.createElement('div');
  div.className = 'section-announcement';
  div.innerHTML = (section.note || '').replace(/\n/g, '<br>');
  container.appendChild(div);
}

function renderSectionBody(section, links, container) {
  const type = section.type || 'links';
  if (type === 'note')         { renderNote(section, container); return; }
  if (type === 'embed')        { renderEmbed(section, container); return; }
  if (type === 'announcement') { renderAnnouncement(section, container); return; }
  renderLinkGrid(links, container, section);
}

// ── Locked overlay ────────────────────────────────────────────────────────────

function renderLockedOverlay(section, container, onUnlock) {
  const overlay = document.createElement('div');
  overlay.className = 'locked-overlay';

  const msg = document.createElement('div');
  msg.className = 'locked-msg';
  msg.textContent = '🔒 此區塊需要解鎖';
  overlay.appendChild(msg);

  const actions = document.createElement('div');
  actions.className = 'locked-actions';

  if (section.visibility === 'passwordOrUsers' || section.visibility === 'password') {
    const row = document.createElement('div');
    row.className = 'password-input-row';
    const inp = document.createElement('input');
    inp.type = 'password';
    inp.placeholder = '輸入密碼';
    inp.className = 'section-password-input';
    const btn = document.createElement('button');
    btn.className = 'unlock-btn';
    btn.textContent = '解鎖';
    const err = document.createElement('div');
    err.className = 'password-error';

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const result = await verifyPassword(section.section_id, inp.value);
      btn.disabled = false;
      if (result.success) {
        unlockedSections.set(section.section_id, result.links);
        saveUnlocked();
        overlay.remove();
        onUnlock(result.links);
      } else {
        err.textContent = result.message || '密碼錯誤';
      }
    });

    inp.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });

    row.appendChild(inp);
    row.appendChild(btn);
    actions.appendChild(row);
    actions.appendChild(err);
  }

  if (section.visibility === 'users' || section.visibility === 'passwordOrUsers') {
    const hint = document.createElement('div');
    hint.className = 'locked-login-hint';
    hint.textContent = '或登入帳號查看';
    actions.appendChild(hint);
  }

  overlay.appendChild(actions);
  container.appendChild(overlay);
}

// ── Main render ───────────────────────────────────────────────────────────────

const categoryOrder = [];

function renderAll(sections, links) {
  const q = (document.getElementById('search-box').value || '').toLowerCase();
  const container = document.getElementById('linkSections');
  container.innerHTML = '';

  renderPinned(links);

  const orderedIds = categoryOrder.length
    ? [...categoryOrder, ...sections.map(s => s.section_id).filter(id => !categoryOrder.includes(id))]
    : sections.map(s => s.section_id);

  orderedIds.forEach(sid => {
    const section = sections.find(s => s.section_id === sid);
    if (!section) return;

    const sectionLinks = links.filter(l => l.section_id === sid);

    if (q && section.type === 'links') {
      const hasMatch = sectionLinks.some(l =>
        l.name.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
      );
      if (!hasMatch) return;
    }

    const card = document.createElement('div');
    card.className = 'section-card';
    const isDark = currentTheme !== 'light';
    card.style.setProperty('--section-bg', isDark ? section.dark_color : section.light_color);
    card.style.setProperty('--section-text', section.text_color);
    card.dataset.sectionId = sid;

    const h2 = document.createElement('h2');
    h2.textContent = section.name;
    card.appendChild(h2);

    const body = document.createElement('div');
    body.className = 'section-body';

    if (section.locked && !unlockedSections.has(sid)) {
      renderLockedOverlay(section, body, unlockedLinks => {
        renderSectionBody(section, unlockedLinks, body);
      });
    } else {
      const resolvedLinks = unlockedSections.has(sid)
        ? unlockedSections.get(sid)
        : sectionLinks;
      renderSectionBody(section, resolvedLinks, body);
    }

    card.appendChild(body);
    container.appendChild(card);
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function showSkeleton() {
  const container = document.getElementById('linkSections');
  container.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const div = document.createElement('div');
    div.className = 'skeleton-section';
    container.appendChild(div);
  }
}

// ── Auth UI ───────────────────────────────────────────────────────────────────

function updateAuthUI(user) {
  const loginBtn  = document.getElementById('login-btn');
  const userInfo  = document.getElementById('user-info');
  const userLabel = document.getElementById('user-label');
  const adminBtn  = document.getElementById('admin-btn');

  if (user) {
    loginBtn.style.display  = 'none';
    userInfo.style.display  = 'flex';
    userLabel.textContent   = user.username;
    adminBtn.style.display  = user.role === 'admin' ? 'inline-block' : 'none';
  } else {
    loginBtn.style.display  = '';
    userInfo.style.display  = 'none';
    adminBtn.style.display  = 'none';
  }
}

function openLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('modal-userid').value    = '';
  document.getElementById('modal-password').value  = '';
  document.getElementById('modal-msg').textContent = '';
}
function closeLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
}

async function handleLogin() {
  const userId   = document.getElementById('modal-userid').value.trim();
  const password = document.getElementById('modal-password').value;
  const msg      = document.getElementById('modal-msg');
  if (!userId || !password) { msg.textContent = '請填入帳號和密碼'; return; }

  const btn = document.getElementById('modal-submit');
  btn.disabled = true;
  const result = await apiPost({ action: 'login', user_id: userId, password }).catch(() => ({ success: false }));
  btn.disabled = false;

  if (result.success) {
    setSession(result.user, result.token);
    closeLoginModal();
    updateAuthUI(result.user);
    location.reload();
  } else {
    msg.textContent = result.message || '登入失敗';
  }
}

document.getElementById('login-btn').addEventListener('click', openLoginModal);
document.getElementById('modal-close').addEventListener('click', closeLoginModal);
document.getElementById('modal-submit').addEventListener('click', handleLogin);
document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  updateAuthUI(null);
  location.reload();
});
document.getElementById('login-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('login-modal')) closeLoginModal();
});
document.getElementById('modal-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

// ── Quick-add popover ─────────────────────────────────────────────────────────

function showQuickAdd(sectionId, sectionEl) {
  const existing = sectionEl.querySelector('.quick-add-popover');
  if (existing) { existing.remove(); return; }

  const pop = document.createElement('div');
  pop.className = 'quick-add-popover';
  pop.innerHTML = `
    <input type="text" id="qa-name" placeholder="名稱">
    <input type="url"  id="qa-url"  placeholder="網址">
    <button id="qa-submit">新增</button>
    <button id="qa-cancel">取消</button>
  `;
  sectionEl.appendChild(pop);

  pop.querySelector('#qa-cancel').addEventListener('click', () => pop.remove());
  pop.querySelector('#qa-submit').addEventListener('click', async () => {
    const name = pop.querySelector('#qa-name').value.trim();
    const url  = pop.querySelector('#qa-url').value.trim();
    if (!name || !url) return;

    const result = await apiPost({ action: 'add_link', section_id: sectionId, name, url });
    if (result.success) {
      pop.remove();
      init();
    }
  });
}

// ── Search ────────────────────────────────────────────────────────────────────

document.getElementById('search-box').addEventListener('input', () => {
  const cached = getCachedData();
  if (cached) renderAll(cached.sections || [], cached.links || []);
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  applyTheme();
  updateAuthUI(getUser());
  updateQuote();

  const cached = getCachedData();
  if (cached) {
    applySettings(cached.settings);
    renderHeaderLinks(cached.settings?.header_links);
    if (Array.isArray(cached.quotes)) {
      quotesFromAPI = true;
      activeQuotes = cached.quotes.map(q => q.text);
    }
    updateQuote();
    renderAll(cached.sections || [], cached.links || []);
  } else {
    showSkeleton();
  }

  try {
    const data = await fetchPageData();
    if (data.success) {
      setCachedData(data);
      applySettings(data.settings);
      renderHeaderLinks(data.settings?.header_links);
      if (Array.isArray(data.quotes)) {
        quotesFromAPI = true;
        activeQuotes = data.quotes.map(q => q.text);
        updateQuote();
      }
      renderAll(data.sections || [], data.links || []);
      updateAuthUI(data.current_user || getUser());
    }
  } catch(err) {
    console.warn('資料載入失敗，使用快取', err);
  }
}

init();
