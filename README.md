# YK.github.io — 技術文件（給 Claude 看的）

> 這份文件的閱讀對象是 Claude（AI 助理），目的是讓每次新對話都能快速理解整個系統。
> 使用者：楊凱（YK），個人首頁專案。
> **所有回應必須用繁體中文。每次修改檔案後必須 git push 並更新這份 README.md。**

---

## 專案概覽

- **前端**：GitHub Pages（靜態）
- **後端**：Google Apps Script（REST API，以 doGet/doPost 形式）
- **資料庫**：Google Sheets（5 張工作表）
- **API URL**：`https://script.google.com/macros/s/AKfycbzYH2zCpCSSgapEeektdeiEppSzQlwhP0AXxxebaM1vSiIopiec96fQdiTMrWPyAiw-/exec`

---

## 檔案結構

```
YK.github.io/
├── index.html     — 主頁面（靜態 HTML 骨架）
├── script.js      — 前端主邏輯（API 呼叫、渲染、auth）
├── style.css      — 全站樣式
├── admin.html     — 後台管理介面（靜態 HTML）
├── admin.js       — 後台邏輯
└── Code.gs        — Google Apps Script 後端（需手動貼到 Apps Script）
```

---

## Google Sheets 結構（5 張工作表）

### Sections（區塊）
| 欄位 | 說明 |
|------|------|
| section_id | 唯一 ID（格式 `s_時間戳_亂數`）|
| name | 區塊名稱 |
| order | 排序數字 |
| dark_color | 深色主題背景色（hex）|
| light_color | 淺色主題背景色（hex）|
| text_color | 文字顏色（hex）|
| visibility | public / password / users / passwordOrUsers |
| password | 解鎖密碼 |
| allowed_users | 允許帳號 ID，逗號分隔（如 `yk,friend1`）|
| is_visible | TRUE/FALSE |
| note | 備註文字 / note 類型的內容 / embed 的 URL / announcement 的文字 |
| type | links / note / embed / announcement |

> ⚠️ `type` 欄位是後來新增的，若是舊 Sheets 需執行 `setupSheets()` 才會有這欄。沒有這欄時 type 永遠是 undefined，全部渲染為 links 類型。

### Links（連結）
| 欄位 | 說明 |
|------|------|
| link_id | 唯一 ID（格式 `l_時間戳_亂數`）|
| section_id | 所屬區塊 ID |
| name | 連結名稱 |
| url | 連結網址 |
| order | 排序數字 |
| is_visible | TRUE/FALSE |
| pinned | 置頂（TRUE/FALSE）|
| clicks | 點擊次數 |
| last_clicked | 最後點擊時間 |
| favicon_url | 自訂 Favicon URL（留空自動抓 Google Favicon）|
| visibility | public / password / users / passwordOrUsers |
| password | 解鎖密碼 |
| allowed_users | 允許帳號 ID，逗號分隔 |

> ⚠️ `visibility / password / allowed_users` 也是後來新增的，舊 Sheets 需執行 `setupSheets()`。

### Users（用戶）
| 欄位 | 說明 |
|------|------|
| user_id | 帳號 ID（登入用，建立後不可改）|
| username | 顯示名稱 |
| password | 明文密碼（Apps Script 環境，無加密）|
| role | admin / user |

### Settings（設定，key-value 表）
| key | 說明 |
|-----|------|
| page_title | 頁面標題 |
| show_search | 顯示搜尋欄（true/false）|
| show_quotes | 顯示語錄區塊（true/false）|
| header_links | JSON 字串，格式見下 |

**header_links JSON 結構：**
```json
[
  {
    "name": "WebRTC服務",
    "url": "https://yang-s-k.github.io/web_RTC/",
    "visibility": "public",
    "password": "",
    "allowed_users": ""
  }
]
```
`visibility / password / allowed_users` 為選填欄位（無填則視為 public）。

### Quotes（語錄）
| 欄位 | 說明 |
|------|------|
| quote_id | 唯一 ID（格式 `q_時間戳_亂數`）|
| text | 語錄內容（換行用 `\n`）|
| order | 排序數字 |
| is_active | TRUE/FALSE（false 代表停用，不顯示）|

---

## API 設計（Code.gs）

### doGet

URL：`{API_URL}?user_id={userId}`（未登入則省略 user_id）

**回傳結構：**
```json
{
  "success": true,
  "sections": [...],
  "links": [...],
  "current_user": { "user_id": "", "username": "", "role": "" },
  "settings": { "page_title": "", "show_search": "", "show_quotes": "", "header_links": [...] },
  "quotes": [...],       // null = Quotes 表不存在；[] = 全部停用
  "all_users": [...],    // 僅 admin 才有
  "all_quotes": [...],   // 僅 admin 才有（含停用的）
  "all_settings": [...]  // 僅 admin 才有（原始 key-value 陣列）
}
```

**Section 可見性過濾邏輯：**
- `public` → 所有人可見，`locked: false`
- `password` → 所有人可見，`locked: true`（admin 例外，永遠 `locked: false`）
- `users` → 只有 allowed_users 名單內或 admin 可見
- `passwordOrUsers` → 所有人可見，不在名單內的人 `locked: true`

**Link 過濾邏輯：**
- Admin → 看到所有連結，`locked: false`
- 非 Admin：
  - 被鎖定的 section 底下的連結 → 不回傳
  - `public` → 正常回傳
  - `password` → `locked: true`，url/favicon 回傳空字串
  - `users` → 不在名單內 → 不回傳
  - `passwordOrUsers` → 不在名單內 → `locked: true`，url 空字串

**quotes 的 null vs [] 區別（重要！）：**
- `null` = Quotes 工作表不存在 → 前端用 FALLBACK_QUOTES
- `[]` = 工作表存在但全部停用 → 前端隱藏語錄區塊

### doPost

Body 為 JSON，格式：`{ "action": "...", "user_id": "...", ...其他參數 }`

**不需要 admin 的 action（在 admin 驗證之前處理）：**

| action | 說明 |
|--------|------|
| `login` | 登入，回傳 user 物件和 token |
| `verify_section_password` | 驗證區塊密碼，成功回傳 links 陣列 |
| `verify_link_password` | 驗證連結密碼，成功回傳 url |
| `update_section_note` | 更新 note 欄位，需 admin 或在該 section 的 allowed_users 名單 |
| `track_click` | 記錄點擊（不需登入）|

**需要 admin 的 action：**

| 類別 | action |
|------|--------|
| Sections | `add_section`, `update_section`, `delete_section`, `reorder_sections` |
| Links | `add_link`, `update_link`, `delete_link`, `reorder_links` |
| Users | `add_user`, `update_user`, `delete_user` |
| Settings | `update_setting`（key, value）|
| Quotes | `add_quote`, `update_quote`, `delete_quote`, `reorder_quotes` |
| 其他 | `check_links`（用 UrlFetchApp 逐一測試所有連結）|

### setupSheets()

這是一個在 Apps Script 手動執行的函式（不是 API），用來：
1. 建立所有工作表（若不存在）
2. 填入預設資料
3. Migration：幫舊 Sections 補上 `type` 欄；幫舊 Links 補上 `visibility/password/allowed_users` 欄

**何時執行：** 第一次部署、或 Code.gs 新增了 Sheets 欄位後。

---

## 前端邏輯（script.js）

### 認證系統
```
localStorage.yk_user  → JSON {user_id, username, role}
localStorage.yk_token → 字串 token（"auth_時間戳"）
```
- `getUser()` / `getToken()` / `setSession()` / `clearSession()`
- 後端目前不驗證 token，只驗證 user_id

### 快取系統（Stale-While-Revalidate）
```
localStorage.yk_page_cache → 上次 API 回傳的完整資料 JSON
```
頁面載入順序：
1. `updateAuthUI(getUser())` — 立即從 localStorage 更新 UI
2. 若有快取 → 立即渲染
3. 背景 fetch 新資料 → 更新 UI + 存快取

### Session Unlock（區塊解鎖暫存）
```
sessionStorage.yk_unlocked → [[section_id, links[]], ...] 的 JSON
```
解鎖成功後把 links 存進 Map，頁面不重整也維持解鎖狀態。

### 語錄系統
```js
const FALLBACK_QUOTES = [13 條備用語錄];
let activeQuotes = [...FALLBACK_QUOTES]; // 當前使用中的語錄
let quotesFromAPI = false; // 是否已從 API 收到資料
```
- `updateQuote()`：若 `quotesFromAPI && activeQuotes.length === 0` → 隱藏 quote-box
- API 回傳 `null` → 不改變 quotesFromAPI（繼續用 FALLBACK）
- API 回傳 `[]` → `quotesFromAPI = true`，`activeQuotes = []`（隱藏 quote-box）

### Header Links 可見性（renderHeaderLinks）
```
public          → 所有人顯示
users           → 只有 admin 和 allowed_users 顯示（其他人完全看不到）
password        → 顯示 🔒 按鈕，點擊彈出密碼框
passwordOrUsers → allowed_users/admin 直接顯示；其他人看到 🔒 按鈕
```
密碼驗證是 **前端 client-side**（密碼在 settings JSON 裡），適合個人網站。

**重要 guard 防止 container 被清空：**
```js
if (!Array.isArray(headerLinks)) return;
```

### Section 類型渲染（renderSectionBody）
```
type === 'links'        → renderLinkGrid（連結網格 + 快速新增）
type === 'note'         → renderNote（純文字 + 可內嵌編輯）
type === 'embed'        → renderEmbed（16:9 iframe）
type === 'announcement' → renderAnnouncement（左側 border 公告）
```

### Note 內嵌編輯（renderNote）
- 判斷 `user.role === 'admin'` 或 `user.user_id in section.allowed_users`
- 有權限者看到 ✏️ 編輯 按鈕 → 點擊切換為 textarea + 儲存/取消
- 儲存呼叫 `update_section_note` API
- 儲存成功後直接更新 `section.note`（不重載頁面）

### 鎖定連結（makeLockedLinkItem）
- `link.locked === true` 的連結渲染為 div.link-item.locked（🔒 顯示）
- 點擊展開 inline 密碼框 → 呼叫 `verify_link_password` → 成功則 `window.open(result.url)`

### Admin 按鈕顯示陷阱
```js
// 錯誤：style.display = '' 會清除 inline style，fallback 到 CSS 的 display:none
// 正確：
adminBtn.style.display = user.role === 'admin' ? 'inline-block' : 'none';
```

---

## 後台（admin.html / admin.js）

### 5 個 Tab
| Tab | 功能 |
|-----|------|
| 區塊 | Section CRUD + 拖曳排序（Sortable.js）|
| 連結 | Link CRUD + 篩選/搜尋 + 拖曳排序（需選擇 section 才可排序）|
| 用戶 | User CRUD |
| 連結檢查 | 透過 Apps Script UrlFetchApp 逐一測試所有連結 |
| 介面設定 | 頁面標題/搜尋欄/語錄區塊開關 + Header 連結 + 語錄管理 |

### State 物件
```js
let state = {
  sections:    [],  // doGet 回傳的 sections（admin 看到全部）
  links:       [],  // doGet 回傳的 links（admin 看到全部且 locked=false）
  users:       [],  // all_users
  settings:    [],  // all_settings（原始 key-value 陣列）
  quotes:      [],  // all_quotes（含停用的）
  headerLinks: [],  // 從 settings.header_links 解析的陣列
};
```

### Modal 動態欄位
所有 visibility select 都有：`updateVisibilityFields()` / `updateLinkVisibilityFields()` / `updateHeaderLinkVisibilityFields()`
- `public` → 隱藏 password 欄和 users 欄
- `password` → 顯示 password 欄
- `users` → 顯示 users 欄
- `passwordOrUsers` → 顯示兩個欄

### 顏色預設（9 種）
黃、藍、青、橘、粉紅、灰、紫、藍灰、紫紅  
選擇後填入 dark_color / light_color / text_color 三個欄位。

---

## 樣式（style.css）

### CSS 變數（雙主題）
- `:root` → 深色（預設）
- `body.light` → 淺色

重要變數：`--bg-color`, `--text-color`, `--card-bg`, `--card-hover`, `--section-border`, `--link-color`, `--preview-border`, `--danger`, `--success`

### Section Card 顏色
```css
.section-card {
  background: var(--section-bg, var(--card-bg));
  color: var(--section-text, var(--text-color));
}
```
`--section-bg` 和 `--section-text` 由 JS 透過 inline style 設定（根據 currentTheme 選 dark_color 或 light_color）。

---

## 初始化 / 部署流程

### 第一次部署
1. Google Apps Script 新增專案，貼上 `Code.gs`
2. 執行 `setupSheets()` 一次（建立 5 張工作表 + 預設資料）
3. 部署為 Web App（Execute as: Me，Access: Anyone）
4. 複製 URL 貼到 `script.js` 和 `admin.js` 的 `API_URL` 常數

### 更新 Code.gs 後
- 重新部署（建立新版本）
- 若有新增 Sheets 欄位 → 再執行一次 `setupSheets()`

---

## 已知問題 / 重要陷阱

### announcement / note / embed 顯示不出來
Sheets 沒有 `type` 欄 → `section.type === undefined` → `renderSectionBody` 預設 `'links'`。**解法：執行 `setupSheets()`**。

### 語錄全部停用還是顯示
原因：`if (data.quotes?.length)` 對 `[]` 是 falsy，不會更新 activeQuotes。**解法：用 `Array.isArray` 判斷**。

### Header Links 消失
`renderHeaderLinks(undefined)` 之前版本會清空 container。**解法：`if (!Array.isArray(headerLinks)) return;`**。

### updateRow 靜默跳過不存在的欄位
`headers.indexOf(key) === -1` 時不報錯，直接跳過。這就是為何改了資料但沒存進去的根本原因。

---

## 已實作功能清單

- [x] Section CRUD + 排序 + 四種類型（links/note/embed/announcement）
- [x] Link CRUD + 排序 + 置頂 + 點擊統計 + Favicon 自動抓取
- [x] 四種可見性模式（Section 和 Link 都有）
- [x] 用戶登入/登出/管理（CRUD）
- [x] 語錄系統（CRUD + 排序 + 啟用/停用 + Fallback + 開關）
- [x] Header 連結（可見性模式 + 密碼保護）
- [x] Note 區塊內嵌編輯（allowed_users 可用）
- [x] 搜尋欄（即時過濾連結）
- [x] 深色/淺色主題切換
- [x] Stale-While-Revalidate 快取
- [x] Session unlock（區塊解鎖暫存）
- [x] 連結有效性檢查（Apps Script UrlFetchApp）
- [x] 連結 Preview（hover 顯示 iframe）
- [x] 快速新增連結（admin 在 section 內 + 按鈕）
- [x] Skeleton loading
- [x] 頁面標題設定

---

## 外部依賴

- **Sortable.js** `1.15.0`（CDN）— admin 後台拖曳排序
- **Google Favicon API**：`https://www.google.com/s2/favicons?domain={hostname}&sz=32`
