# Threads 帳號報告工具

本機網頁工具。輸入 Threads 帳號名稱或個人頁 URL 後，產生互動摘要、Top 5 貼文、貼文趨勢、星期分布、Hashtag 與內容主題分析。也可匯入 CSV／JSON，並匯出目前報告資料。

需求規格：[PRD.md](./PRD.md) · [目標架構圖](./架構圖.md) · [PNG 架構圖](./架構圖.png)

## 免安裝版

已打包版本位於 `release` 資料夾，完整壓縮包是專案資料夾中的 `Threads報告工具_免安裝版.zip`。解壓縮並保留整個資料夾後，雙擊 `Threads報告工具.exe` 即可啟動；無須安裝 Node.js 或執行 npm。工具會使用 Windows 內建 Microsoft Edge 開啟 Threads 登入視窗。關閉小型啟動視窗中的「結束工具」會停止本機服務。

請勿只複製 `.exe`；同一資料夾中的 `node.exe`、`node_modules`、`server.js` 和 `public` 都是必要檔案。若要重新打包，執行 `powershell -ExecutionPolicy Bypass -File .\build-portable.ps1`。

## 啟動

需要 Node.js 20 或更新版本。

```powershell
cd "F:\GPT\Threads 帳號貼文爬取與數據分析\threads-report-generator"
npm install
npm start
```

需要 Windows Microsoft Edge；瀏覽器讀取模式會使用 Edge，不會安裝或繞過 Threads 的登入驗證。

接著在瀏覽器開啟 <http://127.0.0.1:4173>。

## Threads 頁面讀取

選擇「登入瀏覽器讀取」後按「分析帳號並產生報告」，工具會開啟一個由 Playwright 管理的 Microsoft Edge 視窗。第一次使用時，請在該視窗手動登入 Threads，回到本機報告頁再次按分析。登入狀態存在 `.local/threads-browser-profile`，不會寫入程式設定檔；請勿把該資料夾分享給他人。免安裝版的登入狀態存在 `release/.local/threads-browser-profile`。遇到登入驗證或 CAPTCHA 時，請在 Threads 視窗依官方流程處理，不要嘗試自動繞過。

讀取方式依賴 Threads 公開頁面的 HTML，網站改版、登入牆、隱私設定或載入限制都可能使讀取失敗。工具會持續捲動並重試，預設最多擷取 300 篇；達上限會在報告標示可能不完整。報告預設納入全部已擷取貼文，未知日期不會被假設為今天。無法讀取的互動數顯示為「—」；公開頁未提供曝光數時，互動率留白。

## Meta Threads API（選用）

API 模式需要 Meta Threads API 存取權杖及 `threads_profile_discovery` 權限。將 `.env.example` 複製為 `.env`，填入 `THREADS_ACCESS_TOKEN` 後重新啟動。任意帳號的 Profile Discovery 可能需要 Meta App Review／進階權限；若 API 不接受該帳號或權杖，請用登入瀏覽器或匯入資料。

## 匯入資料

CSV 欄位可用 `published_at,text,views,likes,replies,reposts,url`；JSON 可直接放貼文陣列，或使用 `{ "posts": [...] }`。缺少日期或文字的列不會納入分析。報告會在頁面上標明資料來自瀏覽器、API、使用者匯入或示範資料。

## 指標

- 互動數：讚 + 回覆 + 轉發／引用。
- 互動率：互動數 ÷ 曝光數；沒有曝光數時顯示「—」。
- Top 5：按互動數排序。
- 星期與趨勢：以可用貼文日期統計；不推估未提供的發文時刻。

