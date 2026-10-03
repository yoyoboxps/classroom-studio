# Classroom Studio · 第二款版型

依使用者提供的桌機與手機版型製作。專案保存於 `網站` 資料夾；GitHub 儲存庫 `yoyoboxps/classroom-studio`。深色工作室保留既有 Google 登入、班級管理、點數交易及 Netlify Functions。

## 本次設計

- 桌機：頂部導覽、橫向水母預覽、畫面描述、比例、標準品質、用量與橘色生成按鈕。
- 手機：班級選單獨立成列、分頁下移、表單與生成按鈕直向排列。
- 原版型水母與品牌標誌抽取為靜態素材，示範圖片可下載。
- 無 Supabase 設定時明示示範模式；不呼叫模型、不生成新媒體、不扣點。
- 品質選項目前僅提供後端支援的標準品質。
- 桌機与手機各自使用原版型水母圖片，依畫面寬度載入對應素材。

## GitHub 與 Netlify

將本資料夾內容作為 GitHub 儲存庫根目錄。Netlify 匯入此儲存庫：Base directory 留空，Build command `npm run build`，Publish directory `dist`；Functions 由 `netlify.toml` 指定。
若儲存庫包含上層目錄，Base directory 設為 `網站`。
使用 Node.js 22，第一次執行 `npm ci`。正式啟用 API 前，按下方說明設定 Supabase、Google OAuth 及模型金鑰。請勿提交 `.env` 或 `.netlify`。

本次修改記錄見 `製作記錄.md`，視覺驗證見 `design-qa.md`。

---

# Classroom Studio · AI 創作教室

Netlify + React / TypeScript + SCSS + Supabase。學生使用 Google 登入，老師建立班級、設定人數上限與每人額度，再分享網址讓學生登入加入。圖片透過 OpenAI Responses API 的背景圖片生成工具，影片透過 xAI 照片轉影片 API。

## 目前可以使用的內容

- 可互動的學生工作室：提示詞、比例、照片選擇／拖放、預覽、下載、點數與歷史。
- 老師後台：新增班級、匯入學生、調整額度、暫停班級、處理待確認任務。
- 未設定 Supabase 時，顯示清楚標示的示範模式，班級資料只存在本機瀏覽器；生成按鈕僅驗證流程，不產生作品或扣款。
- 已附正式登入、API、SQL schema 與 Netlify 設定。沒有真實金鑰與資料庫時，無法測試真實生成、扣點或 Google OAuth。

## 啟動

```bash
npm install
npm run dev
```

這會開啟前端示範。完整本機 API 開發請使用 `npx netlify-cli dev`；請在 `.env` 設定對應變數。

```bash
npm run build
npm test
```

## 正式啟用步驟

1. 建立 Supabase 專案，於 SQL Editor 執行 `supabase/schema.sql` 一次。此檔是初始建置，非可重複執行的 migration。
2. 在 Supabase Authentication 啟用 Google，並在 Google Cloud 建立 OAuth client；設定 Supabase callback URL。
3. 將 Netlify 網址設為 Supabase Site URL，加入正式及需使用的預覽 Redirect URLs；OAuth 不接受未設定的來源。
4. 在 Netlify 環境變數填入 `.env.example` 對應值。瀏覽器可公開的只有 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。Service role、OpenAI、xAI 金鑰只能供 Functions 使用。
5. 為供應商設定有權使用的模型 ID；範例預填 `gpt-5` + `gpt-image-2`、`grok-imagine-video-1.5`，正式上線前請在你的帳戶驗證模型權限與成本。文字模型和圖片工具都會產生成本。
6. 用管理者 Google 帳號登入一次。到 Supabase SQL Editor 用以下語句指定老師；學生不能在網站自行修改角色：

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_TEACHER_EMAIL');
```

7. 重新登入後在老師後台建立班級、設定總點數、每人額度與人數上限，複製班級連結分享給學生。學生以驗證過的 Google 帳號登入後自動加入，名額或未分配點數不足時拒絕加入；重複登入不會再分配一次。只有一個開放班級時，首頁登入也會自動加入；多個班級時使用班級專屬連結。
8. 重新部署到 Netlify，使前端建置取得 VITE 變數。正式發佈後 Scheduled Function 每分鐘確認待完成任務，預覽部署不會執行排程。
9. 正式課程前，用兩個學生帳號實測：名額已滿被拒、個人額度不足被拒、同時提交只允許一筆、成功扣點、失敗退款、關閉影片頁面後排程完成結算。

## 不保存媒體的設計

- 不使用 Supabase Storage 或 Netlify Blobs，無作品庫。
- 上傳照片以 base64 在請求中傳給 xAI；限制 JPG / PNG / WebP、3 MB，伺服器驗證檔案 magic bytes。沒有把照片寫入資料庫或檔案系統。
- 圖片與影片採供應商非同步任務；本站僅保留 provider ID，用於查詢狀態與正確結算。
- OpenAI 背景請求使用 `store: true`，由供應商暫存提示詞和結果；這不是零資料保留（ZDR）。本站不保存媒體不等於供應商不保留；若要求所有供應商都零保存，需更換流程並查核帳戶資料政策。
- 圖片結果回傳瀏覽器記憶體，JPEG 固定品質與壓縮；影片使用供應商 HTTPS 連結，預覽或下載可能受供應商連結有效期、CORS 影響。請立即下載，瀏覽器無法抓取時會開啟來源另存。
- 不保存提示詞、照片、作品 URL 或圖片 base64；僅保存點數、使用者、時間、生成類型和任務狀態。程式不記錄請求內容；Netlify 平台層級日誌／供應商資料政策另行適用。
- 學生端不提供歷史作品取回功能，只有點數使用紀錄。

## 公平扣點與失敗處理

- 班級總額度 >= 所有個人額度總和。個別加點需有未分配點數；降額不可低於已使用＋預扣。
- 資料庫交易鎖定班級與學生，再檢查額度、預扣、建立任務。
- 全帳號最多一個 processing/review 任務，以 partial unique index 保證。圖片請求以 `max_tool_calls: 1` 限制最多一次圖片工具呼叫。
- 請求 UUID 保證重複提交不會重複呼叫模型；結算鎖定任務，重複查詢不會重複扣／退。
- 可確認的 4xx 拒絕與終止失敗會退款；提交逾時、5xx 或無 provider ID 不自動重試／退款，改為 review，老師查核供應商後手動結算。
- 自助加入以 Google 帳號識別；同一人使用不同帳號仍可能占用多個名額，老師可在學生列表核對。

## Netlify 部署

建置命令 `npm run build`，發佈目錄 `dist`，Functions 目錄 `netlify/functions`。使用 Git 匯入並將整個專案部署；只拖曳 `dist` 到 Netlify Drop 只能部署前端，無法啟用後端功能。

未提供／未指定部署目標時，本機預覽不覆蓋任何既有 Netlify 網站。Supabase service role 不可暴露給瀏覽器。

## 樣式與 RWD

所有字級 >= 12px（0.75rem），主要操作文字 14px 以上。SCSS 變數集中定義顏色；760px 以下改為可開關側欄，480px 以下表單單欄，表格可在容器內橫向捲動。遵循 prefers-reduced-motion。原生 dialog 提供焦點限制與 Escape 關閉。

## 參考文件

- https://docs.netlify.com/build/functions/
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://developers.openai.com/api/docs/guides/tools-image-generation
- https://developers.openai.com/api/docs/guides/background
- https://docs.x.ai/developers/model-capabilities/video/image-to-video

## 網址自助加入更新

既有專案請在 SQL Editor 執行 `supabase/migrations/20261003_link_enrollment.sql`。此 migration 不變更既有角色或額度；既有班級保持關閉自助加入，需由老師開啟 `self_enrollment` 並設定 `max_students`。新建班級預設開放。班級連結為 `https://你的網站/?class=班級UUID`。已套用至「歡喜人數」，上限15人。任何取得連結的已驗證 Google 帳號均可加入，老師可暫停班級停止加入與生成。沒有學生名單也能開課。

驗證記錄（2026-10-03）：正式建置成功，14 項資料庫測試通過；正式資料庫以交易回復方式驗證首次加入100點與重複加入不增加分配，測試後學生與已分配點數皆為0。實際學生 Google 首次登入仍待開課試用。
