// ─────────────────────────────────────────────────────────────────────────────
// Sheets 結構（請手動建立以下工作表與欄位）
//
// Sections: section_id | name | order | dark_color | light_color | text_color |
//           visibility | password | allowed_users | is_visible | note
//
// Links:    link_id | section_id | name | url | order | is_visible |
//           pinned | clicks | last_clicked | favicon_url
//
// Users:    user_id | username | password | role
//
// visibility 可選值: public | password | users | passwordOrUsers
// role 可選值: admin | user
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── doGet：讀取頁面資料 ────────────────────────────────────────────────────────

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

    // 找出目前用戶
    let userObj = null;
    if (userId) {
      const users = sheetToObjects(ss.getSheetByName('Users'));
      userObj = users.find(u => String(u.user_id) === userId) || null;
    }
    const userIsAdmin = userObj && userObj.role === 'admin';

    // 過濾 section，決定是否顯示、是否鎖定
    const sections = [];
    allSections.forEach(s => {
      const v = s.visibility;
      const allowedList = String(s.allowed_users || '').split(',').map(x => x.trim()).filter(Boolean);
      const userAllowed = userObj && (userIsAdmin || allowedList.includes(userId));

      let include = false;
      let locked = false;

      if (v === 'public') {
        include = true;
      } else if (v === 'password') {
        include = true;
        locked = true;
      } else if (v === 'users') {
        include = userAllowed;
        locked = false;
      } else if (v === 'passwordOrUsers') {
        include = true;
        locked = !userAllowed; // 有帳號權限的不用密碼，否則顯示但鎖定
      }

      if (include) {
        sections.push({
          section_id: s.section_id,
          name: s.name,
          order: Number(s.order),
          dark_color: s.dark_color,
          light_color: s.light_color,
          text_color: s.text_color,
          visibility: v,
          allowed_users: String(s.allowed_users || ''),
          note: s.note || '',
          locked: locked,
        });
      }
    });

    // 鎖定的 section 不回傳連結（必須解鎖後才拿）
    const lockedIds = new Set(sections.filter(s => s.locked).map(s => s.section_id));
    const visibleIds = new Set(sections.map(s => s.section_id));

    const links = allLinks
      .filter(l => visibleIds.has(l.section_id) && !lockedIds.has(l.section_id))
      .map(l => ({
        link_id: l.link_id,
        section_id: l.section_id,
        name: l.name,
        url: l.url,
        order: Number(l.order),
        pinned: isTrue(l.pinned),
        clicks: Number(l.clicks) || 0,
        last_clicked: l.last_clicked ? String(l.last_clicked) : '',
        favicon_url: l.favicon_url || '',
      }));

    const currentUser = userObj ? {
      user_id: userObj.user_id,
      username: userObj.username,
      role: userObj.role,
    } : null;

    // Admin 另外拿全部 users 清單
    let allUsers = null;
    if (userIsAdmin) {
      allUsers = sheetToObjects(ss.getSheetByName('Users')).map(u => ({
        user_id: u.user_id, username: u.username, role: u.role,
      }));
    }

    return jsonResponse({ success: true, sections, links, current_user: currentUser, all_users: allUsers });

  } catch(err) {
    return jsonResponse({ success: false, message: '後端錯誤: ' + err.toString() });
  }
}

// ── doPost：所有寫入操作 ───────────────────────────────────────────────────────

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── 登入 ─────────────────────────────────────────────────────────────────
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

    // ── 驗證 Section 密碼（解鎖後回傳該 section 的連結）────────────────────────
    if (params.action === 'verify_section_password') {
      const sections = sheetToObjects(ss.getSheetByName('Sections'));
      const section = sections.find(s => String(s.section_id) === String(params.section_id));
      if (!section) return jsonResponse({ success: false, message: '找不到此區塊' });
      if (String(section.password) !== String(params.password)) {
        return jsonResponse({ success: false, message: '密碼錯誤' });
      }
      const links = sheetToObjects(ss.getSheetByName('Links'))
        .filter(l => String(l.section_id) === String(params.section_id) && isTrue(l.is_visible))
        .sort((a, b) => Number(a.order) - Number(b.order))
        .map(l => ({
          link_id: l.link_id, section_id: l.section_id, name: l.name, url: l.url,
          order: Number(l.order), pinned: isTrue(l.pinned),
          clicks: Number(l.clicks) || 0, favicon_url: l.favicon_url || '',
        }));
      return jsonResponse({ success: true, links });
    }

    // ── 記錄點擊 ──────────────────────────────────────────────────────────────
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

    // ── 以下皆需 Admin 權限 ────────────────────────────────────────────────────
    if (!isAdmin(ss, params.user_id)) {
      return jsonResponse({ success: false, message: '權限不足' });
    }

    // ── Section CRUD ──────────────────────────────────────────────────────────

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
        params.allowed_users || '', true, params.note || '',
      ]);
      return jsonResponse({ success: true, section_id: newId });
    }

    if (params.action === 'update_section') {
      const sheet = ss.getSheetByName('Sections');
      const ok = updateRow(sheet, 'section_id', params.section_id, {
        name: params.name, dark_color: params.dark_color, light_color: params.light_color,
        text_color: params.text_color, visibility: params.visibility,
        password: params.password, allowed_users: params.allowed_users,
        is_visible: params.is_visible, note: params.note,
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
          // 一併刪除該 section 的連結
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
      params.order.forEach((sectionId, idx) => {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idCol]) === String(sectionId)) {
            sheet.getRange(i + 1, orderCol + 1).setValue(idx + 1);
            break;
          }
        }
      });
      return jsonResponse({ success: true });
    }

    // ── Link CRUD ─────────────────────────────────────────────────────────────

    if (params.action === 'add_link') {
      const sheet = ss.getSheetByName('Links');
      const data = sheet.getDataRange().getValues();
      const secLinks = data.slice(1).filter(r => String(r[1]) === String(params.section_id));
      const maxOrder = secLinks.length > 0 ? Math.max(...secLinks.map(r => Number(r[4]) || 0)) : 0;
      const newId = generateId('l');
      sheet.appendRow([newId, params.section_id, params.name, params.url, maxOrder + 1, true, false, 0, '', params.favicon_url || '']);
      return jsonResponse({ success: true, link_id: newId });
    }

    if (params.action === 'update_link') {
      const sheet = ss.getSheetByName('Links');
      const ok = updateRow(sheet, 'link_id', params.link_id, {
        name: params.name, url: params.url, section_id: params.section_id,
        is_visible: params.is_visible, pinned: params.pinned, favicon_url: params.favicon_url,
      });
      return jsonResponse({ success: ok, message: ok ? undefined : '找不到連結' });
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
      params.order.forEach((linkId, idx) => {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idCol]) === String(linkId)) {
            sheet.getRange(i + 1, orderCol + 1).setValue(idx + 1);
            break;
          }
        }
      });
      return jsonResponse({ success: true });
    }

    // ── User 管理 ─────────────────────────────────────────────────────────────

    if (params.action === 'add_user') {
      const sheet = ss.getSheetByName('Users');
      const data = sheet.getDataRange().getValues();
      if (data.slice(1).some(r => String(r[0]) === String(params.user_id))) {
        return jsonResponse({ success: false, message: '帳號 ID 已存在' });
      }
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

    // ── 連結有效性檢查 ─────────────────────────────────────────────────────────
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

// ── 初始化工作表結構（第一次設置時在 Apps Script 編輯器執行一次）─────────────────

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  function ensureSheet(name, headers) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    return sheet;
  }

  ensureSheet('Sections', ['section_id','name','order','dark_color','light_color','text_color','visibility','password','allowed_users','is_visible','note']);
  ensureSheet('Links',    ['link_id','section_id','name','url','order','is_visible','pinned','clicks','last_clicked','favicon_url']);
  ensureSheet('Users',    ['user_id','username','password','role']);

  Logger.log('工作表建立完成');
}
