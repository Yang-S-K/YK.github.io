// ─────────────────────────────────────────────────────────────────────────────
// Sheets 結構
//
// Sections: section_id | name | order | dark_color | light_color | text_color |
//           visibility | password | allowed_users | is_visible | note | type
//
// Links:    link_id | section_id | name | url | order | is_visible |
//           pinned | clicks | last_clicked | favicon_url |
//           visibility | password | allowed_users
//
// Users:    user_id | username | password | role
//
// Settings: key | value
//   keys: page_title, show_search, show_quotes, header_links
//
// Quotes:   quote_id | text | order | is_active
//
// visibility: public | password | users | passwordOrUsers
// type:       links | note | embed | announcement
// role:       admin | user
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function isTrue(val) {
  return val === true || val === 'TRUE' || val === 'true';
}

function isAdmin(ss, userId) {
  const users = sheetToObjects(ss.getSheetByName('Users'));
  const user = users.find(u => String(u.user_id) === String(userId));
  return user && user.role === 'admin';
}

function generateId(prefix) {
  return prefix + '_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 5);
}

function updateRow(sheet, idColName, idValue, updates) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf(idColName);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(idValue)) {
      Object.entries(updates).forEach(([key, val]) => {
        if (val !== undefined) {
          const col = headers.indexOf(key);
          if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(val);
        }
      });
      return true;
    }
  }
  return false;
}

// ── doGet ─────────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userId = (e && e.parameter && e.parameter.user_id) ? String(e.parameter.user_id) : null;

    const allSections = sheetToObjects(ss.getSheetByName('Sections'))
      .filter(s => isTrue(s.is_visible))
      .sort((a, b) => Number(a.order) - Number(b.order));

    const allLinks = sheetToObjects(ss.getSheetByName('Links'))
      .filter(l => isTrue(l.is_visible))
      .sort((a, b) => Number(a.order) - Number(b.order));

    let userObj = null;
    if (userId) {
      const users = sheetToObjects(ss.getSheetByName('Users'));
      userObj = users.find(u => String(u.user_id) === userId) || null;
    }
    const userIsAdmin = userObj && userObj.role === 'admin';

    // ── Sections（visibility 過濾 + lock 判斷）──
    const sections = [];
    allSections.forEach(s => {
      const v = s.visibility;
      const allowedList = String(s.allowed_users || '').split(',').map(x => x.trim()).filter(Boolean);
      const userAllowed = userObj && (userIsAdmin || allowedList.includes(String(userId)));

      let include = false, locked = false;
      if (v === 'public')               { include = true; }
      else if (v === 'password')        { include = true; locked = !userIsAdmin; }
      else if (v === 'users')           { include = userAllowed; }
      else if (v === 'passwordOrUsers') { include = true; locked = !userAllowed; }

      if (include) {
        sections.push({
          section_id:    s.section_id,
          name:          s.name,
          order:         Number(s.order),
          dark_color:    s.dark_color,
          light_color:   s.light_color,
          text_color:    s.text_color,
          visibility:    v,
          allowed_users: String(s.allowed_users || ''),
          note:          s.note || '',
          type:          s.type || 'links',
          locked:        locked,
        });
      }
    });

    const lockedSectionIds = new Set(sections.filter(s => s.locked).map(s => s.section_id));
    const visibleSectionIds = new Set(sections.map(s => s.section_id));

    // ── Links（admin 看全部；非 admin 依 section lock + link visibility 過濾）──
    let links;
    if (userIsAdmin) {
      links = allLinks
        .filter(l => visibleSectionIds.has(l.section_id))
        .map(l => ({
          link_id:       l.link_id,
          section_id:    l.section_id,
          name:          l.name,
          url:           l.url,
          order:         Number(l.order),
          pinned:        isTrue(l.pinned),
          pinned_order:  Number(l.pinned_order) || 0,
          clicks:        Number(l.clicks) || 0,
          last_clicked:  l.last_clicked ? String(l.last_clicked) : '',
          favicon_url:   l.favicon_url || '',
          locked:        false,
          visibility:    l.visibility || 'public',
          allowed_users: String(l.allowed_users || ''),
        }));
    } else {
      links = allLinks
        .filter(l => visibleSectionIds.has(l.section_id) && !lockedSectionIds.has(l.section_id))
        .map(l => {
          const lv = l.visibility || 'public';
          const lAllowed = String(l.allowed_users || '').split(',').map(x => x.trim()).filter(Boolean);
          const lUserAllowed = userObj && lAllowed.includes(String(userId));

          let lInclude = true, lLocked = false;
          if (lv === 'public')              { lInclude = true; }
          else if (lv === 'password')       { lInclude = true; lLocked = true; }
          else if (lv === 'users')          { lInclude = lUserAllowed; }
          else if (lv === 'passwordOrUsers') { lInclude = true; lLocked = !lUserAllowed; }

          if (!lInclude) return null;
          return {
            link_id:      l.link_id,
            section_id:   l.section_id,
            name:         l.name,
            url:          lLocked ? '' : l.url,
            order:        Number(l.order),
            pinned:       isTrue(l.pinned) && !lLocked,
            pinned_order: Number(l.pinned_order) || 0,
            clicks:       Number(l.clicks) || 0,
            last_clicked: l.last_clicked ? String(l.last_clicked) : '',
            favicon_url:  lLocked ? '' : (l.favicon_url || ''),
            locked:       lLocked,
          };
        })
        .filter(Boolean);
    }

    const currentUser = userObj
      ? { user_id: userObj.user_id, username: userObj.username, role: userObj.role }
      : null;

    let allUsers = null;
    if (userIsAdmin) {
      allUsers = sheetToObjects(ss.getSheetByName('Users'))
        .map(u => ({ user_id: u.user_id, username: u.username, role: u.role }));
    }

    // ── Settings ──
    const settingsObj = {};
    const settingsSheet = ss.getSheetByName('Settings');
    if (settingsSheet) {
      sheetToObjects(settingsSheet).forEach(row => { settingsObj[row.key] = row.value; });
    }
    try { settingsObj.header_links = JSON.parse(settingsObj.header_links || '[]'); }
    catch { settingsObj.header_links = []; }

    let allSettings = null;
    if (userIsAdmin && settingsSheet) {
      allSettings = sheetToObjects(settingsSheet);
    }

    // ── Quotes ──
    // null = Quotes sheet 不存在（未部署新版）; [] = 存在但全部停用
    const quotesSheet = ss.getSheetByName('Quotes');
    const quotes = quotesSheet
      ? sheetToObjects(quotesSheet)
          .filter(q => isTrue(q.is_active))
          .sort((a, b) => Number(a.order) - Number(b.order))
          .map(q => ({ quote_id: q.quote_id, text: String(q.text) }))
      : null;

    let allQuotes = null;
    if (userIsAdmin && quotesSheet) {
      allQuotes = sheetToObjects(quotesSheet)
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map(q => ({
          quote_id:  q.quote_id,
          text:      String(q.text),
          order:     Number(q.order),
          is_active: isTrue(q.is_active),
        }));
    }

    return jsonResponse({
      success: true, sections, links,
      current_user: currentUser, all_users: allUsers,
      settings: settingsObj, quotes,
      all_quotes: allQuotes, all_settings: allSettings,
    });

  } catch(err) {
    return jsonResponse({ success: false, message: '後端錯誤: ' + err.toString() });
  }
}

// ── doPost ────────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── 登入 ──
    if (params.action === 'login') {
      const users = sheetToObjects(ss.getSheetByName('Users'));
      const user = users.find(u =>
        String(u.user_id) === String(params.user_id) &&
        String(u.password) === String(params.password)
      );
      if (user) {
        return jsonResponse({
          success: true,
          user: { user_id: user.user_id, username: user.username, role: user.role },
          token: 'auth_' + new Date().getTime(),
        });
      }
      return jsonResponse({ success: false, message: '帳號或密碼錯誤' });
    }

    // ── 驗證 Section 密碼 ──
    if (params.action === 'verify_section_password') {
      const sections = sheetToObjects(ss.getSheetByName('Sections'));
      const section = sections.find(s => String(s.section_id) === String(params.section_id));
      if (!section) return jsonResponse({ success: false, message: '找不到此區塊' });
      if (String(section.password) !== String(params.password))
        return jsonResponse({ success: false, message: '密碼錯誤' });

      const links = sheetToObjects(ss.getSheetByName('Links'))
        .filter(l => String(l.section_id) === String(params.section_id) && isTrue(l.is_visible))
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map(l => ({
          link_id: l.link_id, section_id: l.section_id,
          name: l.name, url: l.url, order: Number(l.order),
          pinned: isTrue(l.pinned), clicks: Number(l.clicks) || 0,
          favicon_url: l.favicon_url || '', locked: false,
        }));
      return jsonResponse({ success: true, links });
    }

    // ── 驗證 Link 密碼 ──
    if (params.action === 'verify_link_password') {
      const links = sheetToObjects(ss.getSheetByName('Links'));
      const link = links.find(l => String(l.link_id) === String(params.link_id));
      if (!link) return jsonResponse({ success: false, message: '找不到連結' });
      if (String(link.password) !== String(params.password))
        return jsonResponse({ success: false, message: '密碼錯誤' });
      return jsonResponse({ success: true, url: link.url, favicon_url: link.favicon_url || '' });
    }

    // ── 更新 Note 內容（允許 allowed_users 使用，不需 admin）──
    if (params.action === 'update_section_note') {
      if (!params.user_id) return jsonResponse({ success: false, message: '未登入' });
      const users = sheetToObjects(ss.getSheetByName('Users'));
      const user = users.find(u => String(u.user_id) === String(params.user_id));
      if (!user) return jsonResponse({ success: false, message: '找不到使用者' });
      const sections = sheetToObjects(ss.getSheetByName('Sections'));
      const section = sections.find(s => String(s.section_id) === String(params.section_id));
      if (!section) return jsonResponse({ success: false, message: '找不到區塊' });
      const isAdminUser = user.role === 'admin';
      const allowedList = String(section.allowed_users || '').split(',').map(x => x.trim()).filter(Boolean);
      if (!isAdminUser && !allowedList.includes(String(params.user_id))) {
        return jsonResponse({ success: false, message: '沒有編輯權限' });
      }
      const sheet = ss.getSheetByName('Sections');
      const ok = updateRow(sheet, 'section_id', params.section_id, { note: params.note });
      return jsonResponse({ success: ok, message: ok ? undefined : '找不到區塊' });
    }

    // ── 記錄點擊 ──
    if (params.action === 'track_click') {
      const sheet = ss.getSheetByName('Links');
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const idCol = headers.indexOf('link_id');
      const clicksCol = headers.indexOf('clicks');
      const lastCol = headers.indexOf('last_clicked');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(params.link_id)) {
          if (clicksCol >= 0) sheet.getRange(i + 1, clicksCol + 1).setValue((Number(data[i][clicksCol]) || 0) + 1);
          if (lastCol >= 0) sheet.getRange(i + 1, lastCol + 1).setValue(new Date());
          return jsonResponse({ success: true });
        }
      }
      return jsonResponse({ success: false, message: '找不到連結' });
    }

    // ── Admin 驗證 ──
    if (!isAdmin(ss, params.user_id)) {
      return jsonResponse({ success: false, message: '權限不足' });
    }

    // ── Section CRUD ──

    if (params.action === 'add_section') {
      const sheet = ss.getSheetByName('Sections');
      const rows = sheet.getLastRow();
      const maxOrder = rows > 1
        ? Math.max(...sheet.getRange(2, 3, rows - 1, 1).getValues().map(r => Number(r[0]) || 0))
        : 0;
      const newId = generateId('s');
      sheet.appendRow([
        newId, params.name, maxOrder + 1,
        params.dark_color || '#1e1e1e', params.light_color || '#f4f4f9', params.text_color || '#90caf9',
        params.visibility || 'public', params.password || '',
        params.allowed_users || '', true, params.note || '', params.type || 'links',
      ]);
      return jsonResponse({ success: true, section_id: newId });
    }

    if (params.action === 'update_section') {
      const sheet = ss.getSheetByName('Sections');
      const ok = updateRow(sheet, 'section_id', params.section_id, {
        name: params.name, dark_color: params.dark_color, light_color: params.light_color,
        text_color: params.text_color, visibility: params.visibility,
        password: params.password, allowed_users: params.allowed_users,
        is_visible: params.is_visible, note: params.note, type: params.type,
      });
      return jsonResponse({ success: ok, message: ok ? undefined : '找不到區塊' });
    }

    if (params.action === 'delete_section') {
      const sheet = ss.getSheetByName('Sections');
      const data = sheet.getDataRange().getValues();
      const idCol = data[0].indexOf('section_id');
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][idCol]) === String(params.section_id)) {
          sheet.deleteRow(i + 1);
          const linksSheet = ss.getSheetByName('Links');
          const ld = linksSheet.getDataRange().getValues();
          const lsc = ld[0].indexOf('section_id');
          for (let j = ld.length - 1; j >= 1; j--) {
            if (String(ld[j][lsc]) === String(params.section_id)) linksSheet.deleteRow(j + 1);
          }
          return jsonResponse({ success: true });
        }
      }
      return jsonResponse({ success: false, message: '找不到區塊' });
    }

    if (params.action === 'reorder_sections') {
      const sheet = ss.getSheetByName('Sections');
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const idCol = headers.indexOf('section_id');
      const orderCol = headers.indexOf('order');
      params.order.forEach((sid, idx) => {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idCol]) === String(sid)) {
            sheet.getRange(i + 1, orderCol + 1).setValue(idx + 1); break;
          }
        }
      });
      return jsonResponse({ success: true });
    }

    // ── Link CRUD ──

    if (params.action === 'add_link') {
      const sheet = ss.getSheetByName('Links');
      const data = sheet.getDataRange().getValues();
      const secLinks = data.slice(1).filter(r => String(r[1]) === String(params.section_id));
      const maxOrder = secLinks.length > 0 ? Math.max(...secLinks.map(r => Number(r[4]) || 0)) : 0;
      const newId = generateId('l');
      sheet.appendRow([
        newId, params.section_id, params.name, params.url, maxOrder + 1,
        true, false, 0, '', params.favicon_url || '',
        params.visibility || 'public', params.password || '', params.allowed_users || '',
      ]);
      return jsonResponse({ success: true, link_id: newId });
    }

    if (params.action === 'update_link') {
      const sheet = ss.getSheetByName('Links');
      const updates = {
        name: params.name, url: params.url, section_id: params.section_id,
        is_visible: params.is_visible, pinned: params.pinned, favicon_url: params.favicon_url,
        visibility: params.visibility, password: params.password, allowed_users: params.allowed_users,
      };
      // 第一次置頂時自動分配 pinned_order（排在最後）
      if (params.pinned) {
        const allLinks = sheetToObjects(sheet);
        const current = allLinks.find(l => String(l.link_id) === String(params.link_id));
        if (!isTrue(current?.pinned)) {
          const maxPinOrder = allLinks
            .filter(l => isTrue(l.pinned))
            .reduce((m, l) => Math.max(m, Number(l.pinned_order) || 0), 0);
          updates.pinned_order = maxPinOrder + 1;
        }
      }
      const ok = updateRow(sheet, 'link_id', params.link_id, updates);
      return jsonResponse({ success: ok, message: ok ? undefined : '找不到連結' });
    }

    if (params.action === 'reorder_pinned') {
      const sheet = ss.getSheetByName('Links');
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const idCol = headers.indexOf('link_id');
      const pinOrderCol = headers.indexOf('pinned_order');
      if (pinOrderCol < 0) return jsonResponse({ success: false, message: '請先執行 setupSheets()' });
      params.order.forEach((lid, idx) => {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idCol]) === String(lid)) {
            sheet.getRange(i + 1, pinOrderCol + 1).setValue(idx + 1); break;
          }
        }
      });
      return jsonResponse({ success: true });
    }

    if (params.action === 'delete_link') {
      const sheet = ss.getSheetByName('Links');
      const data = sheet.getDataRange().getValues();
      const idCol = data[0].indexOf('link_id');
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][idCol]) === String(params.link_id)) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ success: true });
        }
      }
      return jsonResponse({ success: false, message: '找不到連結' });
    }

    if (params.action === 'reorder_links') {
      const sheet = ss.getSheetByName('Links');
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const idCol = headers.indexOf('link_id');
      const orderCol = headers.indexOf('order');
      params.order.forEach((lid, idx) => {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idCol]) === String(lid)) {
            sheet.getRange(i + 1, orderCol + 1).setValue(idx + 1); break;
          }
        }
      });
      return jsonResponse({ success: true });
    }

    // ── User 管理 ──

    if (params.action === 'add_user') {
      const sheet = ss.getSheetByName('Users');
      const data = sheet.getDataRange().getValues();
      if (data.slice(1).some(r => String(r[0]) === String(params.user_id)))
        return jsonResponse({ success: false, message: '帳號 ID 已存在' });
      sheet.appendRow([params.user_id, params.username, params.password, params.role || 'user']);
      return jsonResponse({ success: true });
    }

    if (params.action === 'update_user') {
      const sheet = ss.getSheetByName('Users');
      const ok = updateRow(sheet, 'user_id', params.target_user_id, {
        username: params.username, password: params.password, role: params.role,
      });
      return jsonResponse({ success: ok, message: ok ? undefined : '找不到使用者' });
    }

    if (params.action === 'delete_user') {
      const sheet = ss.getSheetByName('Users');
      const data = sheet.getDataRange().getValues();
      const idCol = data[0].indexOf('user_id');
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][idCol]) === String(params.target_user_id)) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ success: true });
        }
      }
      return jsonResponse({ success: false, message: '找不到使用者' });
    }

    // ── Settings ──

    if (params.action === 'update_setting') {
      const sheet = ss.getSheetByName('Settings');
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const keyCol = headers.indexOf('key');
      const valCol = headers.indexOf('value');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][keyCol]) === String(params.key)) {
          sheet.getRange(i + 1, valCol + 1).setValue(params.value);
          return jsonResponse({ success: true });
        }
      }
      sheet.appendRow([params.key, params.value]);
      return jsonResponse({ success: true });
    }

    // ── Quotes CRUD ──

    if (params.action === 'add_quote') {
      const sheet = ss.getSheetByName('Quotes');
      const rows = sheet.getLastRow();
      const maxOrder = rows > 1
        ? Math.max(...sheet.getRange(2, 3, rows - 1, 1).getValues().map(r => Number(r[0]) || 0))
        : 0;
      const newId = generateId('q');
      sheet.appendRow([newId, params.text, maxOrder + 1, true]);
      return jsonResponse({ success: true, quote_id: newId });
    }

    if (params.action === 'update_quote') {
      const sheet = ss.getSheetByName('Quotes');
      const ok = updateRow(sheet, 'quote_id', params.quote_id, {
        text: params.text, is_active: params.is_active,
      });
      return jsonResponse({ success: ok, message: ok ? undefined : '找不到語錄' });
    }

    if (params.action === 'delete_quote') {
      const sheet = ss.getSheetByName('Quotes');
      const data = sheet.getDataRange().getValues();
      const idCol = data[0].indexOf('quote_id');
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][idCol]) === String(params.quote_id)) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ success: true });
        }
      }
      return jsonResponse({ success: false, message: '找不到語錄' });
    }

    if (params.action === 'reorder_quotes') {
      const sheet = ss.getSheetByName('Quotes');
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const idCol = headers.indexOf('quote_id');
      const orderCol = headers.indexOf('order');
      params.order.forEach((qid, idx) => {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idCol]) === String(qid)) {
            sheet.getRange(i + 1, orderCol + 1).setValue(idx + 1); break;
          }
        }
      });
      return jsonResponse({ success: true });
    }

    // ── 連結有效性檢查 ──
    if (params.action === 'check_links') {
      const links = sheetToObjects(ss.getSheetByName('Links'))
        .filter(l => l.url && l.url !== '#' && isTrue(l.is_visible));
      const results = links.map(link => {
        try {
          const res = UrlFetchApp.fetch(link.url, { muteHttpExceptions: true, followRedirects: true });
          const code = res.getResponseCode();
          return { link_id: link.link_id, name: link.name, url: link.url, status: code, ok: code >= 200 && code < 400 };
        } catch(err) {
          return { link_id: link.link_id, name: link.name, url: link.url, status: 0, ok: false };
        }
      });
      return jsonResponse({ success: true, results });
    }

    return jsonResponse({ success: false, message: '未知的 action: ' + params.action });

  } catch(err) {
    return jsonResponse({ success: false, message: '後端錯誤: ' + err.toString() });
  }
}

// ── 初始化工作表（第一次執行，或新增欄位後執行）────────────────────────────────

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  function ensureSheet(name, headers) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    return sheet;
  }

  ensureSheet('Sections', ['section_id','name','order','dark_color','light_color','text_color','visibility','password','allowed_users','is_visible','note','type']);
  const linksSheet = ensureSheet('Links', ['link_id','section_id','name','url','order','is_visible','pinned','clicks','last_clicked','favicon_url','visibility','password','allowed_users']);
  ensureSheet('Users', ['user_id','username','password','role']);

  // Settings with defaults
  const settingsSheet = ensureSheet('Settings', ['key','value']);
  if (settingsSheet.getLastRow() <= 1) {
    settingsSheet.appendRow(['page_title', '楊凱網頁快速連接']);
    settingsSheet.appendRow(['show_search', 'true']);
    settingsSheet.appendRow(['show_quotes', 'true']);
    settingsSheet.appendRow(['header_links', JSON.stringify([{ name: 'WebRTC服務', url: 'https://yang-s-k.github.io/web_RTC/' }])]);
  } else {
    const rows = sheetToObjects(settingsSheet);
    if (!rows.find(r => r.key === 'show_quotes')) {
      settingsSheet.appendRow(['show_quotes', 'true']);
    }
  }

  // Quotes with defaults
  const quotesSheet = ensureSheet('Quotes', ['quote_id','text','order','is_active']);
  if (quotesSheet.getLastRow() <= 1) {
    const defaultQuotes = [
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
    defaultQuotes.forEach((text, i) => {
      quotesSheet.appendRow([generateId('q'), text, i + 1, true]);
    });
  }

  // 幫既有 Sections 表補上 type 欄
  const sectSheet = ss.getSheetByName('Sections');
  if (sectSheet && sectSheet.getLastRow() > 0) {
    const headers = sectSheet.getRange(1, 1, 1, sectSheet.getLastColumn()).getValues()[0];
    if (!headers.includes('type')) {
      const newCol = sectSheet.getLastColumn() + 1;
      sectSheet.getRange(1, newCol).setValue('type');
      if (sectSheet.getLastRow() > 1) {
        sectSheet.getRange(2, newCol, sectSheet.getLastRow() - 1, 1).setValue('links');
      }
    }
  }

  // 幫既有 Links 表補上 visibility / password / allowed_users / pinned_order 欄
  if (linksSheet && linksSheet.getLastRow() > 0) {
    const lHeaders = linksSheet.getRange(1, 1, 1, linksSheet.getLastColumn()).getValues()[0];
    ['visibility', 'password', 'allowed_users'].forEach(col => {
      if (!lHeaders.includes(col)) {
        const newCol = linksSheet.getLastColumn() + 1;
        linksSheet.getRange(1, newCol).setValue(col);
        if (col === 'visibility' && linksSheet.getLastRow() > 1) {
          linksSheet.getRange(2, newCol, linksSheet.getLastRow() - 1, 1).setValue('public');
        }
      }
    });
    // 補上 pinned_order，並對已置頂的連結自動編號
    const lHeaders2 = linksSheet.getRange(1, 1, 1, linksSheet.getLastColumn()).getValues()[0];
    if (!lHeaders2.includes('pinned_order')) {
      const newCol = linksSheet.getLastColumn() + 1;
      linksSheet.getRange(1, newCol).setValue('pinned_order');
      if (linksSheet.getLastRow() > 1) {
        const lData = linksSheet.getDataRange().getValues();
        const pinnedCol = lData[0].indexOf('pinned');
        let pinOrder = 1;
        for (let i = 1; i < lData.length; i++) {
          if (isTrue(lData[i][pinnedCol])) {
            linksSheet.getRange(i + 1, newCol).setValue(pinOrder++);
          }
        }
      }
    }
  }

  Logger.log('工作表設定完成');
}
