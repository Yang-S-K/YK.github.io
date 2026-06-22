const API_URL = 'https://script.google.com/macros/s/AKfycbzYH2zCpCSSgapEeektdeiEppSzQlwhP0AXxxebaM1vSiIopiec96fQdiTMrWPyAiw-/exec';

const COLOR_PRESETS = [
  { name: '黃',   dark: '#2c2c1e', light: '#fdfde7', text: '#fbc02d' },
  { name: '藍',   dark: '#1e1e2c', light: '#e3f2fd', text: '#42a5f5' },
  { name: '青',   dark: '#1e2c2c', light: '#e0f7fa', text: '#26c6da' },
  { name: '橘',   dark: '#2c1e1e', light: '#fff3e0', text: '#ff7043' },
  { name: '粉紅', dark: '#2c1e2c', light: '#fce4ec', text: '#ec407a' },
  { name: '灰',   dark: '#2c2c2c', light: '#eeeeee', text: '#9e9e9e' },
  { name: '紫',   dark: '#1e1e1e', light: '#f3e5f5', text: '#ba68c8' },
  { name: '藍灰', dark: '#1e2633', light: '#e8f0fe', text: '#64b5f6' },
  { name: '紫紅', dark: '#2e1e30', light: '#f3e5f5', text: '#ab47bc' },
];

const SECTION_TYPE_LABELS = {
  links:        '連結',
  note:         '筆記',
  embed:        '嵌入',
  announcement: '公告',
};

// ── State ─────────────────────────────────────────────────────────────────────

let state = { sections: [], links: [], users: [], settings: {}, quotes: [], headerLinks: [] };

function getUser() { try { return JSON.parse(localStorage.getItem('yk_user')); } catch { return null; } }

// ── Auth guard ────────────────────────────────────────────────────────────────

(function checkAuth() {
  const user = getUser();
  if (!user || user.role !== 'admin') {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:1rem;">
        <p style="color:#ef5350;font-size:1.1rem;">⛔ 需要管理員權限</p>
        <a href="index.html" style="color:#90caf9;">返回首頁登入</a>
      </div>`;
  }
})();

// ── API ───────────────────────────────────────────────────────────────────────

async function apiPost(payload) {
  const user = getUser();
  if (user) payload.user_id = user.user_id;
  const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
  return res.json();
}

async function loadData() {
  const user = getUser();
  const res = await fetch(`${API_URL}?user_id=${encodeURIComponent(user.user_id)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  state.sections    = data.sections    || [];
  state.links       = data.links       || [];
  state.users       = data.all_users   || [];
  state.quotes      = data.all_quotes  || [];
  state.settings    = data.all_settings || [];

  // parse header_links from settings array
  const hlRow = (data.all_settings || []).find(r => r.key === 'header_links');
  try { state.headerLinks = JSON.parse(hlRow?.value || '[]'); }
  catch { state.headerLinks = []; }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.color = isError ? '#ef5350' : '#66bb6a';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Sections tab ──────────────────────────────────────────────────────────────

function renderSections() {
  const list = document.getElementById('sections-list');
  list.innerHTML = '';
  state.sections.forEach(s => {
    const typeLabel = SECTION_TYPE_LABELS[s.type || 'links'] || s.type || 'links';
    const item = document.createElement('div');
    item.className = 'list-item';
    item.dataset.id = s.section_id;
    item.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span class="item-name">${s.name}</span>
      <span class="badge type-${s.type || 'links'}">${typeLabel}</span>
      <span class="badge ${s.visibility}">${s.visibility}</span>
      <span class="toggle-visible ${s.is_visible !== false ? 'on' : 'off'}" title="切換顯示">
        ${s.is_visible !== false ? '👁' : '🚫'}
      </span>
      <div class="item-actions">
        <button class="btn" data-edit="${s.section_id}">編輯</button>
        <button class="btn btn-danger" data-delete="${s.section_id}">刪除</button>
      </div>
    `;
    item.querySelector('.toggle-visible').addEventListener('click', () => toggleSectionVisible(s));
    item.querySelector('[data-edit]').addEventListener('click', () => openSectionModal(s));
    item.querySelector('[data-delete]').addEventListener('click', () => deleteSection(s));
    list.appendChild(item);
  });

  Sortable.create(list, {
    animation: 150,
    handle: '.drag-handle',
    onEnd: async () => {
      const order = [...list.querySelectorAll('[data-id]')].map(el => el.dataset.id);
      const res = await apiPost({ action: 'reorder_sections', order });
      if (res.success) { toast('排序已儲存'); await refresh(); } else toast(res.message, true);
    },
  });
}

async function toggleSectionVisible(section) {
  const newVal = section.is_visible === false ? true : false;
  const res = await apiPost({ action: 'update_section', section_id: section.section_id, is_visible: newVal });
  if (res.success) { toast('已更新'); await refresh(); } else toast(res.message, true);
}

async function deleteSection(section) {
  if (!confirm(`確定刪除「${section.name}」？此區塊下的所有連結也會一併刪除。`)) return;
  const res = await apiPost({ action: 'delete_section', section_id: section.section_id });
  if (res.success) { toast('已刪除'); await refresh(); } else toast(res.message, true);
}

// ── Section modal ─────────────────────────────────────────────────────────────

function initColorPresets() {
  const container = document.getElementById('color-presets');
  COLOR_PRESETS.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'preset-chip';
    chip.title = p.name;
    chip.style.background = p.text;
    chip.dataset.index = i;
    chip.addEventListener('click', () => applyPreset(i));
    container.appendChild(chip);
  });

  [['sm-dark', 'sm-dark-picker'], ['sm-light', 'sm-light-picker'], ['sm-text', 'sm-text-picker']].forEach(([textId, pickId]) => {
    const txt  = document.getElementById(textId);
    const pick = document.getElementById(pickId);
    txt.addEventListener('input',  () => { if (/^#[0-9a-fA-F]{6}$/.test(txt.value)) pick.value = txt.value; });
    pick.addEventListener('input', () => txt.value = pick.value);
  });
}

function applyPreset(index) {
  const p = COLOR_PRESETS[index];
  document.getElementById('sm-dark').value        = p.dark;
  document.getElementById('sm-light').value       = p.light;
  document.getElementById('sm-text').value        = p.text;
  document.getElementById('sm-dark-picker').value  = p.dark;
  document.getElementById('sm-light-picker').value = p.light;
  document.getElementById('sm-text-picker').value  = p.text;
  document.querySelectorAll('.preset-chip').forEach((c, i) => c.classList.toggle('selected', i === index));
}

function updateVisibilityFields() {
  const v = document.getElementById('sm-visibility').value;
  document.getElementById('sm-password-row').style.display =
    (v === 'password' || v === 'passwordOrUsers') ? '' : 'none';
  document.getElementById('sm-users-row').style.display =
    (v === 'users' || v === 'passwordOrUsers') ? '' : 'none';
}

function updateSectionTypeNote() {
  const type = document.getElementById('sm-type').value;
  const label = document.getElementById('sm-note-label');
  const noteEl = document.getElementById('sm-note');
  const noteLabels = {
    links:        '備註（顯示在標題下方）',
    note:         '筆記內容（支援換行）',
    embed:        '嵌入網址（iframe src）',
    announcement: '公告文字（支援換行）',
  };
  const notePlaceholders = {
    links:        '選填說明文字...',
    note:         '輸入文字內容...',
    embed:        'https://...',
    announcement: '輸入公告內容...',
  };
  label.textContent = noteLabels[type] || '備註 / 內容';
  noteEl.placeholder = notePlaceholders[type] || '';
}

function openSectionModal(section = null) {
  document.getElementById('section-modal-title').textContent = section ? '編輯區塊' : '新增區塊';
  document.getElementById('sm-id').value        = section?.section_id || '';
  document.getElementById('sm-name').value      = section?.name       || '';
  document.getElementById('sm-type').value      = section?.type       || 'links';
  document.getElementById('sm-dark').value      = section?.dark_color  || '#1e1e1e';
  document.getElementById('sm-light').value     = section?.light_color || '#f4f4f9';
  document.getElementById('sm-text').value      = section?.text_color  || '#90caf9';
  document.getElementById('sm-dark-picker').value  = section?.dark_color  || '#1e1e1e';
  document.getElementById('sm-light-picker').value = section?.light_color || '#f4f4f9';
  document.getElementById('sm-text-picker').value  = section?.text_color  || '#90caf9';
  document.getElementById('sm-visibility').value   = section?.visibility  || 'public';
  document.getElementById('sm-password').value     = section?.password    || '';
  document.getElementById('sm-allowed-users').value =
    (section?.allowed_users || '').split(',').filter(Boolean).join('\n');
  document.getElementById('sm-note').value      = section?.note || '';
  document.getElementById('sm-visible').checked = section?.is_visible !== false;
  document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('selected'));
  updateVisibilityFields();
  updateSectionTypeNote();
  document.getElementById('section-modal').classList.remove('hidden');
}

async function saveSectionModal() {
  const id   = document.getElementById('sm-id').value;
  const name = document.getElementById('sm-name').value.trim();
  if (!name) { toast('請輸入名稱', true); return; }

  const payload = {
    action:        id ? 'update_section' : 'add_section',
    section_id:    id || undefined,
    name,
    type:          document.getElementById('sm-type').value,
    dark_color:    document.getElementById('sm-dark').value,
    light_color:   document.getElementById('sm-light').value,
    text_color:    document.getElementById('sm-text').value,
    visibility:    document.getElementById('sm-visibility').value,
    password:      document.getElementById('sm-password').value,
    allowed_users: document.getElementById('sm-allowed-users').value
      .split('\n').map(s => s.trim()).filter(Boolean).join(','),
    note:          document.getElementById('sm-note').value,
    is_visible:    document.getElementById('sm-visible').checked,
  };

  const res = await apiPost(payload);
  if (res.success) {
    closeSectionModal();
    toast(id ? '區塊已更新' : '區塊已新增');
    await refresh();
  } else {
    toast(res.message, true);
  }
}

function closeSectionModal() { document.getElementById('section-modal').classList.add('hidden'); }

// ── Links tab ─────────────────────────────────────────────────────────────────

function getFaviconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
  catch { return ''; }
}

function renderLinks(filterSectionId = '') {
  const list = document.getElementById('links-list');
  list.innerHTML = '';

  const query = document.getElementById('link-search')?.value.toLowerCase() || '';
  let links = filterSectionId
    ? state.links.filter(l => l.section_id === filterSectionId)
    : state.links;

  if (query) {
    links = links.filter(l =>
      l.name.toLowerCase().includes(query) || l.url.toLowerCase().includes(query)
    );
  }

  if (links.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">沒有連結</p>';
    return;
  }

  links.forEach(l => {
    const sectionName = state.sections.find(s => s.section_id === l.section_id)?.name || l.section_id;
    const favicon = l.favicon_url || getFaviconUrl(l.url);
    const item = document.createElement('div');
    item.className = 'list-item';
    item.dataset.id = l.link_id;
    item.innerHTML = `
      <span class="drag-handle">⠿</span>
      ${favicon ? `<img src="${favicon}" class="favicon-preview" onerror="this.remove()">` : ''}
      <div class="item-name">
        ${l.name}
        <div class="item-sub">${l.url.substring(0, 60)}${l.url.length > 60 ? '…' : ''}</div>
        <div class="item-sub">區塊：${sectionName}　點擊：${l.clicks || 0}次　${l.pinned ? '📌' : ''}</div>
      </div>
      <span class="toggle-visible ${l.is_visible !== false ? 'on' : 'off'}" title="切換顯示">
        ${l.is_visible !== false ? '👁' : '🚫'}
      </span>
      <div class="item-actions">
        <button class="btn" data-edit="${l.link_id}">編輯</button>
        <button class="btn btn-danger" data-delete="${l.link_id}">刪除</button>
      </div>
    `;
    item.querySelector('.toggle-visible').addEventListener('click', () => toggleLinkVisible(l));
    item.querySelector('[data-edit]').addEventListener('click', () => openLinkModal(l));
    item.querySelector('[data-delete]').addEventListener('click', () => deleteLink(l));
    list.appendChild(item);
  });

  if (filterSectionId) {
    Sortable.create(list, {
      animation: 150,
      handle: '.drag-handle',
      onEnd: async () => {
        const order = [...list.querySelectorAll('[data-id]')].map(el => el.dataset.id);
        const res = await apiPost({ action: 'reorder_links', order });
        if (res.success) { toast('排序已儲存'); await refresh(); } else toast(res.message, true);
      },
    });
  }
}

async function toggleLinkVisible(link) {
  const res = await apiPost({ action: 'update_link', link_id: link.link_id, is_visible: link.is_visible === false });
  if (res.success) { toast('已更新'); await refresh(); } else toast(res.message, true);
}

async function deleteLink(link) {
  if (!confirm(`確定刪除「${link.name}」？`)) return;
  const res = await apiPost({ action: 'delete_link', link_id: link.link_id });
  if (res.success) { toast('已刪除'); await refresh(); } else toast(res.message, true);
}

// ── Link modal ────────────────────────────────────────────────────────────────

function populateLinkSectionDropdown(selectedId = '') {
  const sel = document.getElementById('lm-section');
  sel.innerHTML = state.sections.map(s =>
    `<option value="${s.section_id}" ${s.section_id === selectedId ? 'selected' : ''}>${s.name}</option>`
  ).join('');
}

function openLinkModal(link = null) {
  document.getElementById('link-modal-title').textContent = link ? '編輯連結' : '新增連結';
  document.getElementById('lm-id').value       = link?.link_id     || '';
  document.getElementById('lm-name').value     = link?.name        || '';
  document.getElementById('lm-url').value      = link?.url         || '';
  document.getElementById('lm-favicon').value  = link?.favicon_url || '';
  document.getElementById('lm-pinned').checked  = link?.pinned     || false;
  document.getElementById('lm-visible').checked = link?.is_visible !== false;
  const filterVal = document.getElementById('link-filter-select').value;
  populateLinkSectionDropdown(link?.section_id || filterVal || state.sections[0]?.section_id || '');
  document.getElementById('link-modal').classList.remove('hidden');
}

async function saveLinkModal() {
  const id   = document.getElementById('lm-id').value;
  const name = document.getElementById('lm-name').value.trim();
  const url  = document.getElementById('lm-url').value.trim();
  if (!name || !url) { toast('請填寫名稱與網址', true); return; }

  const payload = {
    action:      id ? 'update_link' : 'add_link',
    link_id:     id || undefined,
    section_id:  document.getElementById('lm-section').value,
    name, url,
    favicon_url: document.getElementById('lm-favicon').value.trim(),
    pinned:      document.getElementById('lm-pinned').checked,
    is_visible:  document.getElementById('lm-visible').checked,
  };

  const res = await apiPost(payload);
  if (res.success) {
    closeLinkModal();
    toast(id ? '連結已更新' : '連結已新增');
    await refresh();
  } else {
    toast(res.message, true);
  }
}

function closeLinkModal() { document.getElementById('link-modal').classList.add('hidden'); }

// ── Users tab ─────────────────────────────────────────────────────────────────

function renderUsers() {
  const list = document.getElementById('users-list');
  list.innerHTML = '';
  if (state.users.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">無法取得用戶列表（需要 admin 帳號）</p>';
    return;
  }
  state.users.forEach(u => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="item-name">
        ${u.username}
        <div class="item-sub">ID：${u.user_id}</div>
      </div>
      <span class="user-role ${u.role}">${u.role}</span>
      <div class="item-actions">
        <button class="btn" data-edit="${u.user_id}">編輯</button>
        <button class="btn btn-danger" data-delete="${u.user_id}">刪除</button>
      </div>
    `;
    item.querySelector('[data-edit]').addEventListener('click', () => openUserModal(u));
    item.querySelector('[data-delete]').addEventListener('click', () => deleteUser(u));
    list.appendChild(item);
  });
}

function openUserModal(user = null) {
  document.getElementById('user-modal-title').textContent = user ? '編輯用戶' : '新增用戶';
  document.getElementById('um-editing').value   = user?.user_id  || '';
  document.getElementById('um-id').value        = user?.user_id  || '';
  document.getElementById('um-id').readOnly     = !!user;
  document.getElementById('um-username').value  = user?.username || '';
  document.getElementById('um-password').value  = '';
  document.getElementById('um-role').value      = user?.role     || 'user';
  document.getElementById('user-modal').classList.remove('hidden');
}

async function saveUserModal() {
  const editing  = document.getElementById('um-editing').value;
  const userId   = document.getElementById('um-id').value.trim();
  const username = document.getElementById('um-username').value.trim();
  const password = document.getElementById('um-password').value;
  const role     = document.getElementById('um-role').value;

  if (!userId || !username) { toast('請填寫帳號 ID 與名稱', true); return; }
  if (!editing && !password) { toast('新增用戶需要設定密碼', true); return; }

  const payload = editing
    ? { action: 'update_user', target_user_id: editing, username, role, ...(password ? { password } : {}) }
    : { action: 'add_user', user_id: userId, username, password, role };

  const res = await apiPost(payload);
  if (res.success) {
    closeUserModal();
    toast(editing ? '用戶已更新' : '用戶已新增');
    await refresh();
  } else {
    toast(res.message, true);
  }
}

async function deleteUser(user) {
  if (user.user_id === getUser()?.user_id) { toast('不能刪除自己', true); return; }
  if (!confirm(`確定刪除用戶「${user.username}」（${user.user_id}）？`)) return;
  const res = await apiPost({ action: 'delete_user', target_user_id: user.user_id });
  if (res.success) { toast('已刪除'); await refresh(); } else toast(res.message, true);
}

function closeUserModal() { document.getElementById('user-modal').classList.add('hidden'); }

// ── Link checker ──────────────────────────────────────────────────────────────

async function runLinkCheck() {
  const btn = document.getElementById('run-check-btn');
  const results = document.getElementById('checker-results');
  btn.disabled = true;
  btn.textContent = '檢查中...';
  results.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">透過 Apps Script 逐一檢查，請稍候...</p>';

  const res = await apiPost({ action: 'check_links' });
  btn.disabled = false;
  btn.textContent = '開始檢查';

  if (!res.success) { results.innerHTML = `<p style="color:var(--danger);">${res.message}</p>`; return; }

  const ok    = res.results.filter(r => r.ok).length;
  const total = res.results.length;
  results.innerHTML = `<p style="margin-bottom:0.75rem;font-size:0.85rem;">共 ${total} 個連結，${ok} 個正常，${total - ok} 個異常</p>`;

  res.results.forEach(r => {
    const row = document.createElement('div');
    row.className = 'check-row';
    row.innerHTML = `
      <span class="check-name">${r.name}<div style="font-size:0.75rem;color:var(--muted);">${r.url.substring(0, 60)}${r.url.length > 60 ? '…' : ''}</div></span>
      <span class="check-status ${r.ok ? 'check-ok' : 'check-fail'}">${r.ok ? `✓ ${r.status}` : `✗ ${r.status || '無法連線'}`}</span>
    `;
    results.appendChild(row);
  });
}

// ── Interface settings tab ────────────────────────────────────────────────────

function renderInterface() {
  const allSettings = state.settings;

  const getVal = key => {
    const row = allSettings.find(r => r.key === key);
    return row ? row.value : '';
  };

  const titleInput = document.getElementById('setting-page-title');
  if (titleInput) titleInput.value = getVal('page_title');

  const showSearchSel = document.getElementById('setting-show-search');
  if (showSearchSel) showSearchSel.value = getVal('show_search') || 'true';

  renderHeaderLinks();
  renderQuotes();
}

async function saveSetting(key, value) {
  const res = await apiPost({ action: 'update_setting', key, value });
  if (res.success) { toast('設定已儲存'); } else toast(res.message, true);
}

// ── Header links ──────────────────────────────────────────────────────────────

function renderHeaderLinks() {
  const list = document.getElementById('header-links-list');
  list.innerHTML = '';

  state.headerLinks.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="item-name">
        ${item.name}
        <div class="item-sub">${item.url}</div>
      </div>
      <div class="item-actions">
        <button class="btn" data-hl-edit="${idx}">編輯</button>
        <button class="btn btn-danger" data-hl-delete="${idx}">刪除</button>
      </div>
    `;
    row.querySelector('[data-hl-edit]').addEventListener('click', () => openHeaderLinkModal(idx));
    row.querySelector('[data-hl-delete]').addEventListener('click', () => deleteHeaderLink(idx));
    list.appendChild(row);
  });
}

function openHeaderLinkModal(index = null) {
  const isEdit = index !== null && index >= 0;
  const item = isEdit ? state.headerLinks[index] : null;
  document.getElementById('header-link-modal-title').textContent = isEdit ? '編輯 Header 連結' : '新增 Header 連結';
  document.getElementById('hlm-index').value = isEdit ? index : -1;
  document.getElementById('hlm-name').value  = item?.name || '';
  document.getElementById('hlm-url').value   = item?.url  || '';
  document.getElementById('header-link-modal').classList.remove('hidden');
}

function closeHeaderLinkModal() {
  document.getElementById('header-link-modal').classList.add('hidden');
}

async function saveHeaderLinkModal() {
  const index = parseInt(document.getElementById('hlm-index').value);
  const name  = document.getElementById('hlm-name').value.trim();
  const url   = document.getElementById('hlm-url').value.trim();
  if (!name || !url) { toast('請填寫名稱與網址', true); return; }

  const links = [...state.headerLinks];
  if (index >= 0) { links[index] = { name, url }; }
  else { links.push({ name, url }); }

  const res = await apiPost({ action: 'update_setting', key: 'header_links', value: JSON.stringify(links) });
  if (res.success) {
    state.headerLinks = links;
    closeHeaderLinkModal();
    renderHeaderLinks();
    toast('已儲存');
  } else {
    toast(res.message, true);
  }
}

async function deleteHeaderLink(index) {
  if (!confirm('確定刪除此 Header 連結？')) return;
  const links = state.headerLinks.filter((_, i) => i !== index);
  const res = await apiPost({ action: 'update_setting', key: 'header_links', value: JSON.stringify(links) });
  if (res.success) {
    state.headerLinks = links;
    renderHeaderLinks();
    toast('已刪除');
  } else {
    toast(res.message, true);
  }
}

// ── Quotes ────────────────────────────────────────────────────────────────────

function renderQuotes() {
  const list = document.getElementById('quotes-list');
  list.innerHTML = '';

  if (state.quotes.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">尚無語錄</p>';
    return;
  }

  state.quotes.forEach(q => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.dataset.id = q.quote_id;
    const preview = q.text.replace(/\n/g, ' ').substring(0, 60);
    item.innerHTML = `
      <span class="drag-handle">⠿</span>
      <div class="item-name">
        ${preview}${q.text.length > 60 ? '…' : ''}
      </div>
      <span class="toggle-visible ${q.is_active ? 'on' : 'off'}" title="切換啟用">
        ${q.is_active ? '✓' : '✗'}
      </span>
      <div class="item-actions">
        <button class="btn" data-qedit="${q.quote_id}">編輯</button>
        <button class="btn btn-danger" data-qdelete="${q.quote_id}">刪除</button>
      </div>
    `;
    item.querySelector('.toggle-visible').addEventListener('click', () => toggleQuoteActive(q));
    item.querySelector('[data-qedit]').addEventListener('click', () => openQuoteModal(q));
    item.querySelector('[data-qdelete]').addEventListener('click', () => deleteQuote(q));
    list.appendChild(item);
  });

  Sortable.create(list, {
    animation: 150,
    handle: '.drag-handle',
    onEnd: async () => {
      const order = [...list.querySelectorAll('[data-id]')].map(el => el.dataset.id);
      const res = await apiPost({ action: 'reorder_quotes', order });
      if (res.success) { toast('排序已儲存'); await refresh(); } else toast(res.message, true);
    },
  });
}

function openQuoteModal(quote = null) {
  document.getElementById('quote-modal-title').textContent = quote ? '編輯語錄' : '新增語錄';
  document.getElementById('qm-id').value     = quote?.quote_id || '';
  document.getElementById('qm-text').value   = quote?.text     || '';
  document.getElementById('qm-active').checked = quote?.is_active !== false;
  document.getElementById('quote-modal').classList.remove('hidden');
}

function closeQuoteModal() { document.getElementById('quote-modal').classList.add('hidden'); }

async function saveQuoteModal() {
  const id   = document.getElementById('qm-id').value;
  const text = document.getElementById('qm-text').value.trim();
  if (!text) { toast('請輸入語錄內容', true); return; }

  const payload = id
    ? { action: 'update_quote', quote_id: id, text, is_active: document.getElementById('qm-active').checked }
    : { action: 'add_quote', text };

  const res = await apiPost(payload);
  if (res.success) {
    closeQuoteModal();
    toast(id ? '語錄已更新' : '語錄已新增');
    await refresh();
  } else {
    toast(res.message, true);
  }
}

async function toggleQuoteActive(quote) {
  const res = await apiPost({ action: 'update_quote', quote_id: quote.quote_id, text: quote.text, is_active: !quote.is_active });
  if (res.success) { toast('已更新'); await refresh(); } else toast(res.message, true);
}

async function deleteQuote(quote) {
  const preview = quote.text.substring(0, 20);
  if (!confirm(`確定刪除語錄「${preview}…」？`)) return;
  const res = await apiPost({ action: 'delete_quote', quote_id: quote.quote_id });
  if (res.success) { toast('已刪除'); await refresh(); } else toast(res.message, true);
}

// ── Link section filter ────────────────────────────────────────────────────────

function populateLinkFilter() {
  const sel = document.getElementById('link-filter-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">全部</option>' +
    state.sections.map(s => `<option value="${s.section_id}">${s.name}</option>`).join('');
  if (current) sel.value = current;
  renderLinks(sel.value);
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function refresh() {
  try {
    await loadData();
    renderSections();
    populateLinkFilter();
    renderUsers();
    renderInterface();
  } catch (err) {
    toast('資料載入失敗: ' + err.message, true);
  }
}

// ── Event bindings ────────────────────────────────────────────────────────────

document.getElementById('add-section-btn').addEventListener('click', () => openSectionModal());
document.getElementById('section-modal-cancel').addEventListener('click', closeSectionModal);
document.getElementById('section-modal-save').addEventListener('click', saveSectionModal);
document.getElementById('section-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('section-modal')) closeSectionModal();
});
document.getElementById('sm-visibility').addEventListener('change', updateVisibilityFields);
document.getElementById('sm-type').addEventListener('change', updateSectionTypeNote);

document.getElementById('add-link-btn').addEventListener('click', () => openLinkModal());
document.getElementById('link-modal-cancel').addEventListener('click', closeLinkModal);
document.getElementById('link-modal-save').addEventListener('click', saveLinkModal);
document.getElementById('link-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('link-modal')) closeLinkModal();
});
document.getElementById('link-filter-select').addEventListener('change', e => renderLinks(e.target.value));
document.getElementById('link-search').addEventListener('input', () => renderLinks(document.getElementById('link-filter-select').value));

document.getElementById('add-user-btn').addEventListener('click', () => openUserModal());
document.getElementById('user-modal-cancel').addEventListener('click', closeUserModal);
document.getElementById('user-modal-save').addEventListener('click', saveUserModal);
document.getElementById('user-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('user-modal')) closeUserModal();
});

document.getElementById('run-check-btn').addEventListener('click', runLinkCheck);

document.getElementById('save-page-title').addEventListener('click', () => {
  saveSetting('page_title', document.getElementById('setting-page-title').value.trim());
});
document.getElementById('save-show-search').addEventListener('click', () => {
  saveSetting('show_search', document.getElementById('setting-show-search').value);
});

document.getElementById('add-header-link-btn').addEventListener('click', () => openHeaderLinkModal());
document.getElementById('header-link-modal-cancel').addEventListener('click', closeHeaderLinkModal);
document.getElementById('header-link-modal-save').addEventListener('click', saveHeaderLinkModal);
document.getElementById('header-link-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('header-link-modal')) closeHeaderLinkModal();
});

document.getElementById('add-quote-btn').addEventListener('click', () => openQuoteModal());
document.getElementById('quote-modal-cancel').addEventListener('click', closeQuoteModal);
document.getElementById('quote-modal-save').addEventListener('click', saveQuoteModal);
document.getElementById('quote-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('quote-modal')) closeQuoteModal();
});

// ── Init ──────────────────────────────────────────────────────────────────────

initColorPresets();
updateVisibilityFields();
refresh();
