import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const PROFILE_DIR = path.join(ROOT, ".local", "threads-browser-profile");
loadEnv(path.join(ROOT, ".env"));
const PORT = Number(process.env.PORT || 4173);
const MAX_BROWSER_POSTS = Number(process.env.MAX_BROWSER_POSTS || 300);
const MAX_API_POSTS = 100;

let browserContext;

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

function jsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Request body is too large"));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); }
      catch { reject(new Error("Request body must be valid JSON")); }
    });
    req.on("error", reject);
  });
}

function parseAccount(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("請輸入 Threads 帳號名稱或個人頁 URL。");
  let username = raw.replace(/^@/, "");
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (!/(^|\.)threads\.(com|net)$/i.test(url.hostname)) throw new Error("請輸入 threads.com 或 threads.net 的帳號網址。");
    const match = url.pathname.match(/^\/@([^/]+)/);
    if (!match) throw new Error("這個 Threads 網址看起來不是個人頁網址。");
    username = match[1];
  }
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) throw new Error("帳號名稱格式不正確；請輸入 @username 或完整個人頁網址。");
  return username;
}

function topicFor(text = "") {
  const s = text.toLowerCase();
  if (/黃仁勳|輝達|nvidia|台股|股價|股市|大盤|抄底|投資|財經/.test(s)) return "科技／市場";
  if (/市長|政治|選舉|政策|相親|性別|中國|台灣|社會/.test(s)) return "政治／社會";
  if (/旅行|旅遊|瀑布|日本|韓國|江陵/.test(s)) return "生活／旅行";
  if (/吃|美食|料理|咖啡|桂花|牛舌|螃蟹/.test(s)) return "生活／日常";
  return "其他";
}

function countValue(value) {
  const s = String(value || "").replace(/,/g, "").trim();
  const match = s.match(/(\d+(?:\.\d+)?)(萬|千|[kKmM])?/);
  if (!match) return { value: 0, approximate: false };
  const factor = { "萬": 10000, "千": 1000, k: 1000, K: 1000, m: 1_000_000, M: 1_000_000 }[match[2]] || 1;
  return { value: Math.round(Number(match[1]) * factor), approximate: Boolean(match[2]) };
}

function postDay(label) {
  const value = String(label || "").trim();
  const exact = value.match(/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})/);
  if (exact) {
    const time = new Date(value);
    return /T\d{2}:\d{2}/.test(value) && Number.isFinite(+time) ? time.toISOString() : exact[1] + "-" + exact[2].padStart(2, "0") + "-" + exact[3].padStart(2, "0");
  }
  const chinese = value.match(/(\d+)天前/);
  const hours = value.match(/(\d+)小時前/);
  const minutes = value.match(/(\d+)分鐘前/);
  const english = value.match(/(?:about\s*)?(\d+)\s*(m|h|d|w|mo|y)(?:\s|$)/i);
  const englishLong = value.match(/(?:about\s*)?(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i);
  const units = { m: 1, minute: 1, h: 60, hour: 60, d: 1440, day: 1440, w: 10080, week: 10080, mo: 43200, month: 43200, y: 525600, year: 525600 };
  const offset = minutes ? Number(minutes[1]) : hours ? Number(hours[1]) * 60 : chinese ? Number(chinese[1]) * 1440 : english ? Number(english[1]) * (units[english[2].toLowerCase()] || 0) : englishLong ? Number(englishLong[1]) * (units[englishLong[2].toLowerCase()] || 0) : null;
  return offset == null ? null : new Date(Date.now() - offset * 60000).toISOString();
}

async function ensureBrowser() {
  if (!browserContext) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    browserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      channel: "msedge",
      viewport: { width: 1320, height: 920 },
      args: ["--disable-notifications"]
    });
  }
  const pages = browserContext.pages();
  return pages[0] || browserContext.newPage();
}

async function collectBrowser(username) {
  const page = await ensureBrowser();
  const url = `https://www.threads.com/@${encodeURIComponent(username)}`;
  let navigationError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      navigationError = null;
      break;
    } catch (error) {
      navigationError = error;
      if (attempt < 2) await page.waitForTimeout(1200 * (attempt + 1));
    }
  }
  if (navigationError) throw new Error("Threads 個人頁載入失敗，已重試 3 次：" + navigationError.message);
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => document.querySelectorAll('a[href*="/post/"]').length > 0, { timeout: 12000 }).catch(() => {});
  const posts = new Map();
  let staleRounds = 0;
  let previousDomCount = 0;
  let extractionErrors = 0;
  let stopReason = "feed_exhausted_or_stalled";

  for (let round = 0; round < 240 && posts.size < MAX_BROWSER_POSTS && staleRounds < 10; round++) {
    const batch = await page.evaluate((handle) => {
      const target = handle.replace(/^@/, "").toLocaleLowerCase();
      const anchors = [...document.querySelectorAll('a[href*="/post/"]')].filter(a => {
        try {
          const path = decodeURIComponent(new URL(a.href).pathname);
          const match = path.match(/^\/@([^/]+)\/post\/([^/]+)\/?$/i);
          return Boolean(match && match[1].toLocaleLowerCase() === target && match[2]);
        } catch { return false; }
      });
      const findCard = anchor => {
        for (let el = anchor, depth = 0; el && el !== document.body && depth < 18; el = el.parentElement, depth++) {
          const controls = [...el.querySelectorAll('button,[role="button"]')];
          const labels = controls.map(b => [b.getAttribute("aria-label") || "", b.getAttribute("title") || "", b.innerText || b.textContent || ""].join(" "));
          const hasActions = labels.some(x => /讚|喜歡|like/i.test(x)) && labels.some(x => /回覆|reply/i.test(x));
          const hasPostText = [...el.querySelectorAll('[dir="auto"]')].some(n => (n.innerText || n.textContent || "").trim().length > 2);
          if (hasActions && hasPostText && (el.innerText || "").length < 2200) return el;
        }
        return anchor.closest('[data-pressable-container="true"]') || null;
      };
      return anchors.map(a => {
        let card = findCard(a);
        if (!card) {
          for (let el = a; el && el !== document.body; el = el.parentElement) {
            const controls = [...el.querySelectorAll('button,[role="button"]')];
            const labels = controls.map(b => `${b.getAttribute("aria-label") || ""} ${b.getAttribute("title") || ""} ${b.innerText || b.textContent || ""}`);
            const hasActions = labels.some(x => /讚|喜歡|like/i.test(x)) && labels.some(x => /回覆|reply/i.test(x));
            if (hasActions && (el.innerText || "").length < 4000) { card = el; break; }
          }
        }
        if (!card) card = a.parentElement?.parentElement?.parentElement;
        const buttonLabels = [...(card?.querySelectorAll('button,[role="button"]') || [])].map(b => `${b.getAttribute("aria-label") || ""} ${b.getAttribute("title") || ""} ${b.innerText || b.textContent || ""}`.trim());
        const cardLines = (card?.innerText || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
        const texts = [...(card?.querySelectorAll('[dir="auto"]') || [])].map(e => (e.innerText || e.textContent || "").trim())
          .filter(t => t && t.toLocaleLowerCase() !== handle.toLocaleLowerCase() && t.length > 2 && !/^(讚|喜歡|回覆|轉發|分享|儲存|like|reply|repost|share|more)$/i.test(t));
        const fallbackBody = cardLines.filter(line => line.toLocaleLowerCase() !== handle.toLocaleLowerCase() && !buttonLabels.includes(line) && !/^(?:\d+\s*(?:分鐘|小時|天|週|月|年前|前)|\d+\s*(?:m|h|d|w|mo|y))$/i.test(line)).sort((x, y) => y.length - x.length)[0] || "";
        const body = texts.sort((x, y) => y.length - x.length)[0] || fallbackBody;
        const readMetric = re => {
          const label = buttonLabels.find(x => re.test(x) && /\d/.test(x)) || cardLines.find(x => re.test(x) && /\d/.test(x) && x.length < 60);
          if (!label) return null;
          const count = label.match(/([\d,.]+\s*(?:萬|千|[kKmM])?)/);
          if (!count) return null;
          const s = count[1].replace(/,/g, "").trim();
          const m = s.match(/(\d+(?:\.\d+)?)(萬|千|[kKmM])?/);
          if (!m) return null;
          const factor = { "萬": 10000, "千": 1000, k: 1000, K: 1000, m: 1000000, M: 1000000 }[m[2]] || 1;
          return { value: Math.round(Number(m[1]) * factor), approximate: Boolean(m[2]) };
        };
        const href = a.href;
        const id = new URL(href).pathname.match(/\/post\/([^/]+)/i)?.[1] || "";
        const time = card?.querySelector("time");
        const dateLabel = time?.dateTime || time?.getAttribute("datetime") || time?.getAttribute("title") || time?.innerText || a.innerText || "";
        return {
          id,
          url: href,
          dateLabel,
          text: body,
          likes: readMetric(/讚|喜歡|like/i),
          replies: readMetric(/回覆|reply/i),
          reposts: readMetric(/轉發|repost|引用|quote/i),
          views: readMetric(/views?|觀看|瀏覽|曝光/i),
          hasMedia: Boolean(card?.querySelector('a[href*="/media"], video, img'))
        };
      }).filter(p => p.id);
    }, username).catch(error => {
      extractionErrors++;
      console.warn("Threads DOM extraction retry", extractionErrors, error.message);
      return [];
    });

    const normalized = batch.map(p => ({
      id: p.id,
      publishedAt: postDay(p.dateLabel),
      text: p.text,
      likes: p.likes?.value ?? null,
      replies: p.replies?.value ?? null,
      reposts: p.reposts?.value ?? null,
      views: p.views?.value ?? null,
      url: p.url,
      topic: topicFor(p.text),
      format: p.hasMedia ? "圖片／影音" : (/https?:\/\//i.test(p.text) ? "外部連結" : "文字"),
      approximate: Boolean(p.likes?.approximate || p.replies?.approximate || p.reposts?.approximate)
    }));
    const before = posts.size;
    let enriched = false;
    normalized.forEach(p => {
      const old = posts.get(p.id);
      if (!old) { posts.set(p.id, p); return; }
      const merged = {
        ...old,
        ...p,
        text: p.text?.trim() ? p.text : old.text,
        publishedAt: p.publishedAt || old.publishedAt,
        likes: p.likes ?? old.likes,
        replies: p.replies ?? old.replies,
        reposts: p.reposts ?? old.reposts,
        views: p.views ?? old.views
      };
      if (JSON.stringify(merged) !== JSON.stringify(old)) enriched = true;
      posts.set(p.id, merged);
    });
    staleRounds = posts.size === before && !enriched ? staleRounds + 1 : 0;
    const domCount = await page.evaluate(handle => {
      const ids = [...document.querySelectorAll('a[href*="/post/"]')].map(a => {
        try {
          const match = decodeURIComponent(new URL(a.href).pathname).match(/^\/@([^/]+)\/post\/([^/]+)\/?$/i);
          return match && match[1].toLowerCase() === handle.toLowerCase() ? match[2] : null;
        } catch { return null; }
      }).filter(Boolean);
      return new Set(ids).size;
    }, username).catch(() => 0);
    if (posts.size >= MAX_BROWSER_POSTS) { stopReason = "max_posts_reached"; break; }
    if (staleRounds >= 10 && domCount <= previousDomCount) break;
    previousDomCount = Math.max(previousDomCount, domCount);

    const beforeLinks = await page.evaluate(handle => [...new Set([...document.querySelectorAll('a[href*="/post/"]')].map(a => {
      try {
        const match = decodeURIComponent(new URL(a.href).pathname).match(/^\/@([^/]+)\/post\/([^/]+)\/?$/i);
        return match && match[1].toLowerCase() === handle.toLowerCase() ? a.href : null;
      } catch { return null; }
    }).filter(Boolean))].join("\n"), username).catch(() => "");
    await page.evaluate(handle => {
      const anchors = [...document.querySelectorAll('a[href*="/post/"]')].filter(a => {
        try {
          const match = decodeURIComponent(new URL(a.href).pathname).match(/^\/@([^/]+)\/post\/([^/]+)\/?$/i);
          return Boolean(match && match[1].toLowerCase() === handle.toLowerCase());
        } catch { return false; }
      });
      anchors.at(-1)?.scrollIntoView({ block: "end", behavior: "instant" });
      window.scrollBy(0, Math.max(500, Math.round(window.innerHeight * 0.8)));
    }, username);
    try {
      await page.waitForFunction(({ previous, handle }) => {
        const links = [...document.querySelectorAll('a[href*="/post/"]')].map(a => {
          try {
            const match = decodeURIComponent(new URL(a.href).pathname).match(/^\/@([^/]+)\/post\/([^/]+)\/?$/i);
            return match && match[1].toLowerCase() === handle.toLowerCase() ? a.href : null;
          } catch { return null; }
        }).filter(Boolean);
        return new Set(links).size > new Set(previous.split("\n").filter(Boolean)).size || links.some(href => !previous.includes(href));
      }, { previous: beforeLinks, handle: username }, { timeout: 7000 });
      await page.waitForTimeout(450);
    } catch {
      await page.waitForTimeout(1800);
    }
  }

  if (!posts.size) {
    const pageText = await page.locator("body").innerText().catch(() => "");
    if (/登入|Log in|Sign in|使用 Instagram 帳號/i.test(pageText)) {
      return { status: "needs_login", message: "請在剛開啟的 Threads 瀏覽器視窗登入，完成後回到此頁再按一次「分析帳號」。密碼只輸入 Threads 官方頁面，本工具不會接收或保存。" };
    }
    throw new Error("頁面未載入可讀取的公開貼文。請確認帳號拼字、公開狀態，或改用 CSV／JSON 匯入。");
  }
  const collected = [...posts.values()].slice(0, MAX_BROWSER_POSTS);
  const missingFields = {
    text: collected.filter(p => !String(p.text || "").trim()).length,
    publishedAt: collected.filter(p => !p.publishedAt).length,
    likes: collected.filter(p => p.likes == null).length,
    replies: collected.filter(p => p.replies == null).length,
    reposts: collected.filter(p => p.reposts == null).length,
    views: collected.filter(p => p.views == null).length
  };
  return {
    status: "ok",
    posts: collected,
    source: "登入後的 Threads 公開頁",
    collection: {
      scannedLinks: previousDomCount,
      collectedPosts: collected.length,
      extractionErrors,
      stopReason,
      missingFields,
      warning: stopReason === "max_posts_reached" ? `已達擷取上限 ${MAX_BROWSER_POSTS} 篇，資料可能仍未完整。` : "已讀取目前頁面可繼續載入的貼文；Threads 可能仍有登入權限、隱私或載入限制。"
    }
  };
}

async function collectApi(username) {
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) throw new Error("尚未設定 THREADS_ACCESS_TOKEN。請設定具 threads_profile_discovery 權限的 Meta Threads API token，或改用已登入瀏覽器模式。");
  const base = "https://graph.threads.net/v1.0";
  const headers = { Authorization: `Bearer ${token}` };
  const profileUrl = new URL(`${base}/profile_lookup`);
  profileUrl.searchParams.set("username", username);
  profileUrl.searchParams.set("fields", "username,name,biography,profile_picture_url,is_verified,follower_count,likes_count,replies_count,reposts_count,quotes_count,views_count");
  const profileRes = await fetch(profileUrl, { headers });
  const profile = await profileRes.json();
  if (!profileRes.ok) throw new Error(profile.error?.message || `Meta API 回傳 HTTP ${profileRes.status}。請確認 Profile Discovery 權限與 App Review 狀態。`);

  const result = [];
  let next = new URL(`${base}/profile_posts`);
  next.searchParams.set("username", username);
  next.searchParams.set("fields", "id,text,timestamp,permalink,username,media_type,like_count,reply_count,repost_count,quote_count,views");
  next.searchParams.set("limit", String(MAX_API_POSTS));
  while (next && result.length < MAX_API_POSTS) {
    const response = await fetch(next, { headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `Meta API 回傳 HTTP ${response.status}。`);
    result.push(...(data.data || []).map(p => ({
      id: p.id,
      publishedAt: p.timestamp ? new Date(p.timestamp).toISOString() : "",
      text: p.text || "",
      likes: p.like_count == null ? null : Number(p.like_count),
      replies: p.reply_count == null ? null : Number(p.reply_count),
      reposts: p.repost_count == null && p.quote_count == null ? null : Number(p.repost_count || 0) + Number(p.quote_count || 0),
      views: p.views == null ? null : Number(p.views),
      url: p.permalink || "",
      topic: topicFor(p.text),
      format: p.media_type || "文字"
    })));
    next = data.paging?.next ? new URL(data.paging.next) : null;
  }
  return { status: "ok", posts: result.slice(0, MAX_API_POSTS), profile, source: "Meta Threads API", collection: { collectedPosts: result.length, stopReason: result.length >= MAX_API_POSTS ? "max_posts_reached" : "pagination_complete" } };
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "POST" && url.pathname === "/api/shutdown") {
    send(res, 200, { status: "stopping" });
    setTimeout(async () => {
      try { await browserContext?.close(); } catch {}
      server.close();
    }, 100);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/analyze") {
    try {
      const body = await jsonBody(req);
      const username = parseAccount(body.account);
      const result = body.source === "api" ? await collectApi(username) : await collectBrowser(username);
      send(res, 200, { ...result, username, capturedAt: new Date().toISOString() });
    } catch (error) {
      send(res, 400, { status: "error", message: error.message || "分析失敗" });
    }
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Method not allowed" });
  let requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.resolve(PUBLIC, `.${requested}`);
  if (!file.startsWith(`${PUBLIC}${path.sep}`) && file !== path.join(PUBLIC, "index.html")) return send(res, 403, { error: "Forbidden" });
  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, { error: "Not found" });
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : data);
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Threads Report Generator: http://127.0.0.1:${PORT}`));
process.on("SIGINT", async () => { await browserContext?.close().catch(() => {}); server.close(() => process.exit(0)); });
