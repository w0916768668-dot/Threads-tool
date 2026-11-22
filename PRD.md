# Threads 帳號貼文爬取與數據分析工具

## 產品需求文件（PRD）

| 欄位 | 內容 |
|---|---|
| 文件版本 | 1.1 |
| 文件狀態 | 草案；進入產品開發前由需求方確認 |
| 日期 | 2026-11-22 |
| 產品範圍 | Windows 免安裝本機版與雲端 Web 版 |
| 主要使用者 | 內容團隊、社群經營者、行銷分析人員 |

## 1. 產品目標與問題定義

### 1.1 背景與問題

內容團隊需要評估 Threads 帳號近期貼文的表現，但逐篇瀏覽、抄錄互動數與整理主題費時。不同取得方式也可能造成貼文數不足、日期精度不一致、互動欄位缺漏或重複資料。缺值若被當成 0，或日期不明時被填成今天，會讓分析結論失真。

### 1.2 產品目標

提供一套能以 Threads 帳號名稱或個人頁 URL 建立分析報告的工具，清楚呈現資料來源與完整度，將可取得的貼文資料轉成可追溯的指標、圖表與內容建議。

產品有兩種互相獨立的交付模式：

1. **本機免安裝版**：Windows 可攜資料夾與 EXE，單機使用，不要求工具帳號。使用者可手動登入 Threads，或匯入 CSV／JSON；資料預設留在本機。
2. **雲端 Web 版**：以 Next.js 部署至 Vercel，以 Supabase Auth 與 PostgreSQL 管理使用者、任務、貼文及分析結果；登入使用者只能讀寫自己的資料。

本機與雲端報告預設分開保存，不自動同步。使用者可透過 CSV／JSON 匯出及匯入資料；任何上傳到雲端的動作都需清楚告知目的地並由使用者執行。

### 1.3 成功指標

- 帳號有效且資料來源可用時，至少取得 30 篇貼文；若帳號不足 30 篇或平台限制，顯示實際取得數與原因，不宣稱完整。
- 每篇貼文保留來源、貼文 URL、可取得的時間與互動欄位；缺值維持 null 並在報告標示。
- 報告提供總覽、Top 5、至少 2 張圖表、至少 3 項有數據依據的觀察及可執行建議。
- 同一資料集重複處理後，去重結果與指標一致。
- 雲端版所有資料存取均通過使用者隔離規則；本機資料不會在未操作匯出或上傳時送往雲端。

### 1.4 目標使用情境

- 行銷人員分析單一 Threads 帳號近期香港的貼文互動。
- 內容團隊比較多個帳號或不同分析任務的主題及表現。
- 使用者在本機透過 Edge 可見頁面收集公開貼文，或匯入先前匯出的資料。
- 已獲授權的雲端使用者建立、查看、重跑或刪除分析任務。

### 1.5 不處理範圍

- 不繞過 Threads 登入牆、CAPTCHA、速率限制、隱私設定或存取控制。
- 不擷取私訊、私人帳號內容、未公開欄位或其他使用者的個人資料。
- 不保證平台未提供的曝光數、完整歷史貼文或精確發文時間一定可取得。
- 不將本機登入狀態、Cookie 或 API 權杖自動複製到雲端。

## 2. 產品範圍與優先級

| 優先級 | 範圍 | 目標 |
|---|---|---|
| Must | 本機免安裝分析 | 輸入帳號、讀取可見公開貼文、匯入資料、產生儀表板與匯出 |
| Must | 資料完整度與例外回報 | 顯示取得數、上限、重試、缺欄位、資料來源及限制 |
| Must | 雲端帳號與隔離 | Email／Password 或 Magic Link 登入、任務儲存、RLS |
| Must | 基本分析 | 互動統計、Top 5、至少 2 圖表、內容分析及至少 3 項洞察 |
| Should | 任務歷史與快取 | 查看、重跑、刪除任務；避免短時間重複抓取 |
| Should | 多帳號比較 | 在同一使用者權限內比較多個帳號或期間 |
| Should | 三群組內容分析 | 依互動表現分組，使用一致 NLP 方法比較成功與待改善內容 |
| Could | LLM 建議 | 產生有引用資料依據、可驗證的內容策略建議；須提供隱私與資料傳送說明 |
| Could | 可調整擷取量 | 由使用者設定上限、日期區間與重抓策略 |

### 2.1 目前原型與目標版差異

目前免安裝原型已具備帳號輸入、Playwright／Edge 讀取、Meta API 選項、CSV／JSON 匯入、HTML 儀表板、JSON 匯出及最多 300 篇擷取上限。其餘項目仍需依本 PRD 規劃與實作。

目前尚未完成：雲端工具帳號登入、Supabase 資料表與 RLS、任務持久化與歷史、雲端部署、多帳號比較、互動三分組 NLP，以及 LLM 建議。原型不得對使用者暗示上述功能已可用。

## 3. 功能需求

### 3.1 帳號輸入與分析任務

1. 接受 Threads username（含或不含 @）及 threads.com／threads.net 個人頁 URL。
2. 驗證帳號格式與 URL 網域；拒絕非 Threads 網址及非個人頁路徑。
3. 建立任務時記錄帳號、來源、日期範圍、貼文上限、建立時間與任務狀態。
4. 雲端版提供建立、查看、重跑及刪除任務；本機版可即時分析，並由使用者匯出 JSON 保存或分享。
5. 狀態至少包含 queued、collecting、processing、completed、partial、failed、cancelled。

### 3.2 資料取得與來源

支援以下來源，報告必須標示實際來源：

- **官方 Threads API**：使用者提供已授權的存取權杖或完成 OAuth；依 Meta 授權範圍呼叫 Profile Discovery／貼文端點並遵循分頁。
- **登入後的公開頁面**：本機 Playwright 啟動獨立 Edge 使用者資料夾，由使用者在 Threads 官方頁手動登入；只讀取使用者可見的公開貼文，不收集密碼。
- **CSV／JSON 匯入**：欄位符合匯入規格的使用者資料。
- **示範資料**：僅用於預覽，必須醒目標示為虛構，不能混入真實分析結果。

瀏覽器讀取採漸進捲動與等待新貼文載入，最多重試 3 次導頁、每次擷取最多 300 篇（可設定上限）。若達上限、停止載入或遇到權限限制，回傳 partial 狀態及可讀取原因。遇 CAPTCHA、登入驗證或平台阻擋時停止自動擷取，提示使用者依官方流程處理或改用 API／資料匯入。

### 3.3 每篇貼文必要欄位

| 欄位 | 型別 | 必填／缺值規則 | 說明 |
|---|---|---|---|
| post_id | string | 有來源 ID 時必填；否則以 URL 作穩定識別 | Threads 貼文識別碼 |
| username | string | 必填 | 貼文所屬帳號 |
| published_at | timestamptz | 可為 null | 保存 UTC；畫面以 Asia/Taipei 顯示 |
| text | text | 可為 null | 原始貼文文字；不得以空字串偽裝已讀取 |
| views | bigint | 可為 null | 曝光／觀看數；來源未提供時留空 |
| likes | bigint | 可為 null | 按讚數 |
| replies | bigint | 可為 null | 回覆數 |
| reposts | bigint | 可為 null | 轉發數 |
| quotes | bigint | 可為 null | 引用數；不得與轉發重複計算 |
| post_url | text | 必填 | 原始貼文連結 |
| media_type | string | 可為 null | 文字、圖片、影音、連結等 |
| source | enum | 必填 | api、browser、import |
| captured_at | timestamptz | 必填 | 擷取時間 |
| completeness | jsonb | 必填 | 欄位可讀取狀態與缺漏原因 |

### 3.4 資料清理與指標定義

- 去重優先使用平台 post_id，其次 post_url；兩者皆無時使用 published_at 與正規化文字組合。
- 時間使用來源提供的 datetime／timestamp 或明確相對時間；無法判定時存 null，絕不代填當日日期。
- 互動數定義為 likes + replies + reposts + quotes。未知欄位不視為 0。
- 若貼文缺少任一互動欄位，顯示「部分資料」；部分互動和完整互動分開計算，不可混成無標記的排行。
- 互動率定義為完整互動數 ÷ views × 100。分母或必要互動欄位缺失時顯示「—」。
- 文字特徵包含字數、hashtag、mention 及 URL 數量；保留原文，清理後文字僅供分析。
- 時間分布只使用有效 timestamp；沒有發文小時資料時不得推估小時。
- 報告列出擷取篇數、去重篇數、缺欄位筆數、來源、擷取時間及停止原因。

### 3.5 分析與報告

1. 總覽：貼文數、平均 likes／replies／reposts、完整互動數、可計算時的互動率、平均文字長度。
2. Top 5：依完整互動數排序；若樣本不足或互動欄位不完整，顯示資料完整度和可比較篇數。
3. 圖表至少 2 張：貼文互動趨勢、星期分布；來源有精確時間時可加發文小時分布。
4. 文字分析：文字長度與互動的關係、常見 hashtag／mention／URL、貼文類型。
5. 表現分組：僅使用 likes 與 replies 均可取得的貼文，以 likes + replies 排序後按三分位分為高、中、低三群；reposts／quotes 作為補充觀察，不改變分組分數。每群抽取 3–5 篇進行相同 NLP 分析。每群不足 3 篇時標示樣本不足，不產生確定性結論。
6. 洞察：至少 3 項，逐項標示觀察數據、解讀、推測限制、建議及驗證方法；不得把相關性描述成因果。
7. LLM 建議（Could）：提供三項可執行建議、證據貼文或指標、優先級及驗證方式。使用者未設定模型或未同意傳送資料時不呼叫外部模型。
8. 報告可選日期範圍；預設顯示本次已取得的全部資料，未知日期仍保留並單獨標示。

### 3.6 匯入、匯出與快取

- CSV 必須支援 published_at、text、views、likes、replies、reposts、quotes、url。
- JSON 支援貼文陣列或包含 posts 陣列的物件。
- 匯入前預覽資料筆數與欄位對應；日期或文字缺失的資料列保留在錯誤摘要，不可靜默丟棄。
- 匯出 CSV／JSON，包含來源、帳號、生成時間、指標定義、欄位完整度及貼文資料。
- 雲端快取鍵包含 user_id、username、來源、日期範圍與資料版本；預設快取 24 小時，使用者可強制重抓。

### 3.7 使用者登入與權限

- 本機版不要求工具帳號；Threads 登入只在本機 Edge 官方頁完成，登入資料保存在本機專用 profile。
- 雲端版提供 Email／Password 或 Magic Link 至少一種登入方式。
- 未登入者不可建立、查看、重跑或刪除雲端任務及 dashboard。
- Supabase RLS 以 auth.uid() 限制分析任務及其關聯貼文、摘要只能由擁有者存取。
- service role key 僅能留在伺服器端，不得輸出至瀏覽器或提交至版本庫。
- 使用者刪除任務時，需同步刪除其貼文及摘要；帳號刪除需依資料保留政策清除或匿名化資料。

### 3.8 多帳號比較

雲端使用者可選擇至少兩個已完成任務，比較同一日期區間的貼文數、平均互動、完整互動率、內容類型與主題。若來源或欄位完整度不同，需顯示比較限制，禁止以缺值補零後直接排名。

## 4. 使用者流程

### 4.1 本機版

1. 使用者解壓縮可攜資料夾，雙擊 EXE。
2. 報告頁選擇瀏覽器、API 或資料匯入來源，輸入 username／URL 與分析範圍。
3. 瀏覽器來源會開啟專用 Edge；使用者手動登入 Threads 官方頁後返回報告頁重跑。
4. 工具擷取、去重及整理欄位，顯示進度與錯誤。
5. 報告頁顯示結果、完整度、限制、洞察與匯出選項。
6. 使用者匯出 JSON／CSV；本機與雲端不會自動同步。

### 4.2 雲端版

1. 使用者註冊／登入。
2. 建立分析任務並輸入帳號、來源、日期區間及貼文上限。
3. API／授權或匯入來源完成資料取得；必要時由本機工具匯出後，使用者明確上傳到自己的雲端任務。
4. 系統顯示任務狀態、可讀取篇數、重試及缺漏摘要。
5. 使用者查看 dashboard、建立多帳號比較、重跑或刪除任務。
6. 使用者匯出資料；LLM 建議只在使用者已設定並同意後執行。

## 5. 資料模型與關聯

| 資料表 | 主要欄位 | 關聯／權限 |
|---|---|---|
| profiles | id uuid、display_name、created_at | id 對應 Supabase Auth user id；使用者只讀寫自己的 profile |
| analysis_tasks | id uuid、user_id uuid、username、profile_url、source、status、date_from、date_to、post_limit、collected_count、missing_summary jsonb、error_code、created_at、started_at、completed_at、cache_key | user_id FK profiles.id；RLS 只允許本人存取 |
| posts | id uuid、task_id uuid、platform_post_id、username、published_at、text、views、likes、replies、reposts、quotes、post_url、media_type、hashtags text[]、mentions text[]、url_count、source、captured_at、completeness jsonb | task_id FK analysis_tasks.id；透過任務擁有者 RLS；task_id + platform_post_id 唯一 |
| analysis_summaries | id uuid、task_id uuid、metrics jsonb、group_results jsonb、insights jsonb、recommendations jsonb、analysis_version、created_at | task_id FK analysis_tasks.id；一任務可有多版摘要，使用者只能讀取自己的任務 |

刪除 analysis_tasks 預設 cascade 刪除 posts 與 summaries。不同使用者的 cache key 和查詢結果不得互相暴露。匿名使用者的本機資料不進 Supabase。

## 6. 例外情境與處理

| 情境 | 系統處理 | 使用者可見訊息／後續 |
|---|---|---|
| URL 或 username 格式錯誤 | 不建立擷取請求 | 指出支援格式並保留輸入 |
| 帳號不存在或頁面 404 | 任務標記 failed | 確認帳號拼字或改用匯入 |
| 私人帳號／權限不足 | 停止讀取 | 說明只能讀取獲授權或公開可見內容 |
| Threads 未登入／登入過期 | 不接收密碼；保留任務可重跑 | 在官方 Edge 手動登入後重試 |
| CAPTCHA／平台阻擋 | 立即停止，不自動繞過 | 提示依官方流程處理或選擇其他來源 |
| 網路逾時／頁面載入失敗 | 最多重試 3 次，記錄錯誤碼 | 顯示已重試次數與重新執行選項 |
| 捲動後無新貼文 | 結束為 partial／完成並標示停止原因 | 顯示實際取得數，提供 API／匯入替代方案 |
| 達 300 篇預設上限 | 停止並標記上限 | 顯示「資料可能未完整」及上限值 |
| 少於 30 篇 | 保留有效資料，不捏造樣本 | 顯示取得數；低於分析門檻的圖表或分組標示樣本不足 |
| 欄位缺漏 | 缺值為 null，不補 0 | 顯示欄位缺漏數及對指標的影響 |
| 重複貼文／任務 | 依唯一鍵去重；雲端可命中個人快取 | 顯示重複筆數與快取時間 |
| 匯入格式錯誤 | 不覆蓋既有資料 | 顯示錯誤列、缺欄位及範例格式 |
| API 權限／token 無效 | 任務標記 failed，不記錄 token | 提示檢查權限或改用其他來源 |
| 任務重複提交 | 同一 user 的相同 cache key 回傳既有任務或提示重用 | 可選「使用快取」或「強制重抓」 |
| 雲端未登入／越權 | 回 401／403；不回傳資料 | 導向登入或顯示無權存取 |

## 7. 驗收標準（Given／When／Then）

1. **帳號輸入**：Given 一個有效 username 或 Threads 個人頁 URL，When 使用者提交，Then 系統正確解析 username 並建立對應分析任務。
2. **非法網址**：Given 一個非 Threads 網域或非個人頁 URL，When 使用者提交，Then 系統拒絕擷取並顯示格式錯誤，不建立成功任務。
3. **最低貼文數**：Given 帳號有至少 30 篇可讀貼文且來源允許，When 擷取完成，Then 去重後報告至少包含 30 篇；若不足則標記實際數與 partial 原因。
4. **欄位保留**：Given 貼文包含時間、文字、互動數及 URL，When 完成擷取，Then 對應欄位可在匯出 JSON 找到，日期可轉換為 UTC 並以台北時區顯示。
5. **未知欄位**：Given 頁面未提供 views 或某互動數，When 報告產生，Then 該欄位為 null／「—」，缺漏摘要計數正確，互動率不以 0 替代。
6. **日期未知**：Given 貼文無法解析時間，When 報告產生，Then published_at 保持 null，該貼文在全部資料視圖仍可查看且日期圖表不把它算作今日。
7. **去重**：Given 同一 post_id 或 URL 在多次捲動中出現，When 整理資料，Then 僅保留一篇且保留可取得欄位較完整的記錄。
8. **擷取重試**：Given 網頁導覽暫時逾時，When 系統讀取帳號，Then 最多重試 3 次並記錄錯誤；重試失敗後任務狀態為 failed。
9. **上限標示**：Given 擷取達到設定上限，When 任務完成，Then 狀態或警示明確表示到達上限且資料可能不完整。
10. **儀表板**：Given 至少 30 篇有效貼文，When 使用者開啟報告，Then 顯示總覽、Top 5、至少 2 張圖表及至少 3 項含數據依據的觀察。
11. **NLP 分組**：Given 至少 9 篇貼文都含 likes 與 replies，When 執行分析，Then 系統依 likes + replies 三分位分組，並以同一 NLP 方法分析每組 3–5 篇；不足 3 篇時顯示樣本不足且不輸出確定結論。
12. **匯出**：Given 已完成任務，When 使用者選擇 CSV／JSON 匯出，Then 匯出資料包含來源、帳號、生成時間、欄位完整度、指標定義及貼文 URL。
13. **本機隱私**：Given 使用者使用本機版並未選擇上傳，When 完成分析，Then 貼文與登入 profile 只保存在本機，沒有背景傳送至雲端。
14. **雲端登入**：Given 使用者未登入，When 嘗試開啟雲端 dashboard 或任務，Then 系統拒絕讀取並要求登入。
15. **RLS 隔離**：Given 使用者 A 與 B 各有一筆任務，When A 以 API／資料庫查詢讀取任務，Then A 看不到 B 的任務、貼文及摘要。
16. **任務刪除**：Given 使用者刪除自己的任務，When 刪除完成，Then 任務、關聯貼文及摘要一併刪除；其他使用者資料不受影響。
17. **快取重用**：Given 使用者在快取有效期內重複分析相同帳號、來源與日期範圍，When 未選擇強制重抓，Then 系統可重用本人快取並顯示快取時間。
18. **LLM 隱私**：Given 未設定 LLM 或使用者未同意傳送資料，When 打開報告，Then 系統不呼叫外部 LLM，仍能顯示基本數據洞察。

## 8. 非功能需求

### 8.1 安全與隱私

- 僅限本機 loopback 服務，不對公網監聽；對外公開前須另行設計認證與 CSRF／CORS 控制。
- 不接收 Threads 密碼；Cookie／瀏覽器 profile 僅存於本機專用資料夾，提供清除方式。
- API token 使用環境變數或安全儲存；不得寫入分析 JSON、日誌或前端程式。
- HTTPS 僅使用可信憑證；雲端 Supabase 使用 RLS 與最小權限。
- 日誌記錄任務狀態、來源、耗時與錯誤碼，不記錄完整貼文內容、token、Cookie 或密碼。
- 匯入檔案先限制大小與格式；輸出 HTML 對使用者貼文文字做 escaping，避免腳本注入。

### 8.2 效能與可用性

- 單一本機任務在 30 篇資料下，目標 2 分鐘內顯示報告（不含人工登入與平台等待）。
- 雲端 API 頁面載入及報告檢視目標 3 秒內完成（P95，排除首次大型資料分析）。
- 任務進度、重試與 partial 狀態可見；長時間擷取可取消。
- 300 篇上限可調整；大量資料採分批寫入與分頁顯示。
- 支援 Windows 10／11 x64；可攜版本不需安裝 Node，但需系統 Microsoft Edge。

### 8.3 相容、維運與部署

- Web 前端使用可部署至 Vercel 的 Next.js。
- 雲端 Auth、資料表及 RLS 使用 Supabase；環境變數提供 .env.example。
- 資料來源端點及 Playwright DOM 選擇器須可獨立更新；平台改版時可停用不穩定來源並保留匯入 fallback。
- 提供單元測試、資料清理測試、RLS 權限測試及匯入／匯出測試。
- 建置流程應產生本機可攜 EXE 資料夾與 ZIP；雲端版本可獨立部署，不依賴使用者的桌面 Node 環境。

## 9. 開發拆解與優先級

| 階段 | 優先級 | 工作項目 | 完成定義 |
|---|---|---|---|
| 0. 規格確認 | Must | 確認雙交付模式、資料同步原則、資料來源及 LLM 隱私 | 本 PRD 範圍與驗收條件由需求方確認 |
| 1. 擷取可靠度 | Must | 分頁／捲動、重試、去重、缺值保留、來源與完整度記錄 | 驗收條件 1–9 通過；錯誤可追蹤 |
| 2. 分析報告 | Must | 指標、Top 5、圖表、內容分類與至少 3 項洞察 | 驗收條件 10–11 通過；圖表資料與 JSON 一致 |
| 3. 本機交付 | Must | 免安裝 EXE、匯入匯出、Edge profile 管理與說明 | 新 Windows 環境可解壓啟動；不需 npm |
| 4. 雲端登入與資料 | Must | Next.js、Supabase Auth、schema、RLS、任務 CRUD | 驗收條件 14–16 通過；RLS 測試覆蓋所有表 |
| 5. 雲端擷取與快取 | Must | API／匯入資料取得、分頁、快取、任務狀態 | 權限錯誤可回報；重複任務按 cache key 正確處理 |
| 6. 多帳號與 NLP | Should | 比較報告、三分組與一致 NLP 方法 | 樣本不足時明確降級，不產生誤導洞察 |
| 7. LLM 建議 | Could | 可設定模型、使用者同意、引用數據證據 | 驗收條件 18 通過；建議可追溯並可關閉 |

## 10. 風險、假設與待決事項

### 10.1 風險

- Threads 網頁 DOM、可見欄位、速率限制與登入政策可能變動；Playwright 讀取不能保證完整或永久穩定。
- 曝光數等指標可能不在公開頁或 API 權限內，因此不可作為每篇必有欄位。
- Vercel 雲端函式不適合承載需人工登入的持久瀏覽器流程；雲端擷取優先採官方 API／匯入，必要時由本機工具執行後由使用者明確上傳。
- LLM 分析可能受樣本量、語言或模型幻覺影響；所有建議需附證據與驗證方式。

### 10.2 已確認決策

- 本機版與雲端版都納入本產品目標。
- 本機版免工具帳號登入；雲端版提供工具帳號登入。
- 本機與雲端資料預設獨立，不自動同步；以使用者明確匯出／匯入為資料移轉方式。
- 未知數值與日期保留缺值，不以 0 或今天代填。

### 10.3 開發前需由需求方確認

- 雲端版優先採 Meta OAuth／官方 API，或只接受使用者上傳匯出資料。
- LLM 建議是否允許把貼文文字傳至外部模型；若允許，需指定供應商與資料保留政策。
- 本機分析任務是否要保存完整歷史，或只保留使用者匯出的檔案。
- 預設日期範圍、300 篇上限及可調整範圍是否符合實際使用需求。
- Web 與 EXE 的版本發布、資料刪除期限及雲端備份政策。

## 11. PDF 要求對照

本 PRD 已涵蓋 PDF 所要求的產品目標、功能描述、使用者流程、資料表／欄位／權限、例外情境、Given／When／Then 驗收條件、非功能需求及 Must／Should／Could 開發拆解。PDF 中的 Next.js、Vercel、Supabase、登入、RLS、多帳號、快取、NLP 分組及 LLM 建議列入雲端目標版或後續階段；目前可攜原型尚未實作的部分已在第 2.1 節標明。

依 PDF 規定，PRD 確認前不應開始新的功能開發；本文件目前為待確認草案。

## 12. 目標系統架構

以下為本 PRD 定義的完整目標架構，不代表目前原型已實作全部元件。架構同時包含本機免安裝版及雲端 Web 版，但兩者資料預設分開。

> 圖檔：[PNG 架構圖](./架構圖.png) · [可編輯 SVG](./架構圖.svg)

~~~mermaid
flowchart LR
  subgraph UserSide[使用者端]
    user[內容團隊／分析人員]
    browser[Web 瀏覽器]
    exe[Windows 免安裝 EXE]
    edge[本機 Microsoft Edge<br/>使用者手動登入 Threads]
    localdata[本機報告暫存<br/>CSV／JSON 匯出]
  end

  subgraph Vercel[Vercel]
    next[Next.js Web App<br/>Dashboard／任務管理／比較報告]
    routes[Next.js API Routes<br/>輸入驗證／授權檢查]
  end

  subgraph Supabase[Supabase]
    auth[Supabase Auth<br/>Email／Password 或 Magic Link]
    jobs[任務處理器<br/>Edge Function 或長任務 Worker]
    analysis[清理／去重／指標／NLP 分析]
    db[(PostgreSQL<br/>profiles／analysis_tasks／posts／analysis_summaries)]
    rls[RLS<br/>依 auth.uid() 隔離資料]
    vault[安全憑證儲存<br/>Meta OAuth／API Token]
  end

  subgraph Sources[資料來源]
    threadsapi[Meta Threads API<br/>需授權範圍]
    publicpage[Threads 公開頁<br/>僅本機 Playwright 讀取]
    upload[使用者匯入 CSV／JSON]
  end

  subgraph OptionalServices[選用外部服務]
    llm[LLM 建議服務<br/>使用者同意後才傳送最少資料]
  end

  user --> browser
  user --> exe
  browser --> next
  next --> auth
  next --> routes
  routes --> jobs
  routes --> db
  jobs --> vault
  jobs --> threadsapi
  jobs --> upload
  jobs --> analysis
  analysis --> db
  db --> rls
  rls --> next
  analysis -. 使用者啟用建議 .-> llm

  exe --> edge
  edge --> publicpage
  exe --> localdata
  localdata -. 使用者手動匯出／匯入；不自動同步 .-> browser
~~~

### 12.1 架構元件責任

| 元件 | 責任 |
|---|---|
| Next.js／Vercel | 提供登入後 dashboard、任務管理、多帳號比較、匯入匯出操作及 API 路由；不得將 Supabase service role key 或 Threads token 暴露在前端 |
| Supabase Auth | 管理雲端工具帳號登入；與 Threads 的登入狀態分開 |
| Next.js API Routes | 驗證輸入及登入身分，建立任務，將請求交給後端處理器；所有資料查詢均須受 RLS 約束 |
| 任務處理器 | 執行分頁 API 讀取、匯入解析、重試、狀態更新及錯誤回報；若 Vercel／Edge Function 執行時間不足，改採可持續執行的 Worker，不在請求中無限制阻塞 |
| 分析服務 | 去重、缺值處理、時間正規化、互動指標、Top 5、圖表彙總、三群組 NLP 與可追溯洞察 |
| Supabase PostgreSQL | 儲存 profiles、analysis_tasks、posts、analysis_summaries；任務刪除時依關聯規則刪除子資料 |
| RLS | 以 auth.uid() 驗證擁有者；posts 與 summaries 透過 analysis_tasks.user_id 限制讀寫 |
| 憑證儲存 | OAuth／API 權杖僅存於伺服器端安全儲存；不得放進前端、匯出檔或一般日誌 |
| 本機 EXE | 單機輸入帳號、啟動 Playwright Edge、讀取登入後可見頁面、產生本機報告；不自動連上 Supabase |
| LLM 建議服務 | 選用；僅在使用者明確啟用時傳送必要且最少化的貼文樣本與彙總指標，將輸出附證據存入摘要 |

### 12.2 資料流與信任邊界

1. 雲端使用者先通過 Supabase Auth；Next.js API 以使用者身分建立分析任務。
2. 任務處理器使用獲授權的 Meta API 或使用者上傳資料取得貼文。雲端不接管本機 Edge 的登入 Cookie。
3. 貼文資料經清理、去重與分析後寫入 Supabase；任務、貼文和摘要均由 RLS 按使用者隔離。
4. 本機 EXE 使用自己的 Edge profile 與本機暫存。只有使用者明確匯出並在雲端版上傳時，資料才跨越本機／雲端邊界。
5. LLM 是外部信任邊界；使用者未啟用時不傳資料，啟用時不傳 Threads token、Cookie 或不必要帳號資訊。

### 12.3 架構決策與待確認

- 雲端長任務的實際執行平台須以 300 篇資料的效能與執行時間測試決定；Vercel API Route 不應直接維持長時間瀏覽器工作。
- 雲端優先使用官方 API 和使用者匯入；Playwright 登入頁讀取只保留在本機模式。
- 本機與雲端不共用 session、Cookie、資料庫或快取；跨端搬移一律由使用者手動匯出／匯入。
- PostgreSQL RLS policy、資料保留期限、OAuth 權杖儲存方式及 LLM 供應商須在雲端開發前完成安全審查與確認。




