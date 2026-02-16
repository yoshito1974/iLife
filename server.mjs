import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const CORS_ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN || "*";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 180000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 20000);
const MAX_HEROINES_ITEMS = Number(process.env.MAX_HEROINES_ITEMS || 70);
const DETAIL_FETCH_CONCURRENCY = Number(process.env.DETAIL_FETCH_CONCURRENCY || 6);
const MAX_UPCOMING_CONCERTS = Number(process.env.MAX_UPCOMING_CONCERTS || 36);
const UPCOMING_HORIZON_DAYS = Number(process.env.UPCOMING_HORIZON_DAYS || 366);
const CALENDAR_LOOKBACK_DAYS = Number(process.env.CALENDAR_LOOKBACK_DAYS || 60);
const MAX_CALENDAR_EVENTS = Number(process.env.MAX_CALENDAR_EVENTS || 80);
const MAX_X_POSTS = Number(process.env.MAX_X_POSTS || 10);
const X_DETAIL_FETCH_LIMIT = Number(process.env.X_DETAIL_FETCH_LIMIT || 1);
const MEMBER_X_CONCURRENCY = Number(process.env.MEMBER_X_CONCURRENCY || 2);
const MEMBER_X_MAX_CANDIDATES = Number(process.env.MEMBER_X_MAX_CANDIDATES || 6);
const MEMBER_X_FETCH_RETRIES = Number(process.env.MEMBER_X_FETCH_RETRIES || 1);
const MEMBER_X_RETRY_BASE_DELAY_MS = Number(process.env.MEMBER_X_RETRY_BASE_DELAY_MS || 1200);

const HEROINES_BASE_URL = "https://heroines.jp";
const HEROINES_NEWS_URL = `${HEROINES_BASE_URL}/news/news.json`;
const X_MIRROR_URL = "https://r.jina.ai/http://x.com/iLiFE_official";
const X_ACCOUNT = "@iLiFE_official";
const X_OFFICIAL_USER = "iLiFE_official";

const MEMBER_X_GROUPS = {
  ilife: {
    label: "iLiFE",
    members: [
      { memberName: "あいす", userName: "ice_icol", timelinePath: "" },
      { memberName: "心花りり", userName: "iLiFE_riri", timelinePath: "/with_replies" },
      { memberName: "若葉のあ", userName: "iLiFE_wakaba", timelinePath: "" },
      { memberName: "虹羽みに", userName: "iLiFE_mini", timelinePath: "" },
      { memberName: "福丸うさ", userName: "iLiFE_fukumaru", timelinePath: "/media" },
      { memberName: "空詩かれん", userName: "iLiFE_karen", timelinePath: "/highlights" },
      { memberName: "小熊まむ", userName: "iLiFE_koguma", timelinePath: "" },
      { memberName: "純嶺みき", userName: "iLiFE_sumire", timelinePath: "" },
      {
        memberName: "恋星はるか",
        userName: "Haru_nonfic",
        timelinePath: "/media",
        strictPath: true,
        twstalkerFallback: true,
      },
    ],
  },
  nonfic: {
    label: "のんふぃく",
    members: [
      { memberName: "香乃あむ", userName: "Amu_nonfic", timelinePath: "" },
      { memberName: "澪織にいな", userName: "Niina_nonfic", timelinePath: "" },
      { memberName: "ころね", userName: "colne_icol", timelinePath: "" },
      {
        memberName: "恋星はるか",
        userName: "Haru_nonfic",
        timelinePath: "/media",
        strictPath: true,
        twstalkerFallback: true,
      },
      {
        memberName: "真白里帆",
        userName: "Riho_nonfic",
        timelinePath: "/media",
        strictPath: true,
        twstalkerFallback: true,
      },
      { memberName: "海まりん", userName: "Marin_nonfic", timelinePath: "" },
      { memberName: "水瀬ぴあの", userName: "Piano_nonfic", timelinePath: "/media", strictPath: true },
      {
        memberName: "永月十華",
        userName: "Touka_nonfic",
        timelinePath: "/media",
        strictPath: true,
        twstalkerFallback: true,
      },
    ],
  },
};

const MEMBER_X_GROUP_KEYS = Object.keys(MEMBER_X_GROUPS);

const mimeByExt = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const cache = {
  data: null,
  fetchedAt: 0,
  pending: null,
};

const memberRowCache = new Map();

function withCorsHeaders(headers = {}) {
  return {
    ...headers,
    "access-control-allow-origin": CORS_ALLOW_ORIGIN,
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, withCorsHeaders({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  }));
  res.end(JSON.stringify(payload));
}

function extname(filePath) {
  return path.extname(filePath).toLowerCase();
}

async function serveStatic(pathname, res) {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const resolvedPath = path.normalize(path.join(publicDir, relativePath));

  if (!resolvedPath.startsWith(publicDir)) {
    jsonResponse(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await readFile(resolvedPath);
    res.writeHead(200, withCorsHeaders({
      "content-type": mimeByExt[extname(resolvedPath)] || "application/octet-stream",
    }));
    res.end(file);
  } catch {
    jsonResponse(res, 404, { error: "Not Found" });
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "ilife-live-signal/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }

    return await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(`fetch failed for ${url}: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableFetchError(error) {
  if (!(error instanceof Error)) return false;
  return /\((429|5\d{2})\)/.test(error.message) || /aborted|timeout|timed out|network/i.test(error.message);
}

async function fetchTextWithRetry(url, attempts = 1, baseDelayMs = 800) {
  let lastError = null;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      return await fetchText(url);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableFetchError(error)) {
        break;
      }
      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`fetch failed for ${url}`);
}

function decodeHtml(text) {
  return text
    .replaceAll("&nbsp;", " ")
    .replaceAll("&yen;", "¥")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function cleanWhitespace(text) {
  return text
    .replaceAll("\r", "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToText(html) {
  const normalized = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return cleanWhitespace(decodeHtml(normalized));
}

function toAbsUrl(urlOrPath) {
  if (!urlOrPath) return "";
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return new URL(urlOrPath, HEROINES_BASE_URL).toString();
}

function parseDotDate(dateText) {
  const match = dateText.match(/(20\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseTime(rawValue) {
  if (!rawValue) return null;
  const match = rawValue.match(/([0-2]?\d)[:：]([0-5]\d)/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23) return null;
  return { hour, minute, label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

function toUtcMsFromJst(year, month, day, hour = 12, minute = 0) {
  return Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0);
}

function toIso(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function timestampFromStatusId(statusId) {
  if (!/^\d{10,}$/.test(statusId || "")) return null;

  try {
    const twitterEpochMs = 1288834974657n;
    const id = BigInt(statusId);
    const unixMs = Number((id >> 22n) + twitterEpochMs);
    if (!Number.isFinite(unixMs) || unixMs <= 0) return null;
    return unixMs;
  } catch {
    return null;
  }
}

function jstDateKeyFromMs(ms) {
  if (!Number.isFinite(ms)) return null;
  const shifted = new Date(ms + 9 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) return [];
  const maxWorkers = Math.max(1, Math.min(limit, items.length));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: maxWorkers }, () => runWorker()));
  return results;
}

function firstMatchDate(text, fallbackYear) {
  const target = text || "";

  const fullDate = target.match(/(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?/);
  if (fullDate) {
    return {
      year: Number(fullDate[1]),
      month: Number(fullDate[2]),
      day: Number(fullDate[3]),
    };
  }

  const shortDate = target.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (shortDate && fallbackYear) {
    return {
      year: Number(fallbackYear),
      month: Number(shortDate[1]),
      day: Number(shortDate[2]),
    };
  }

  return null;
}

function extractArticleText(html) {
  const match = html.match(/fc-article-contents__wysiwyg">\s*([\s\S]*?)\s*<\/div>/i);
  if (!match) return "";
  return htmlToText(match[1]);
}

function extractVenue(articleText) {
  const lines = articleText.split("\n").map((line) => line.trim()).filter(Boolean);
  const venueLine = lines.find(
    (line) => /^[@＠]\s*/.test(line) || /^at\s+/i.test(line) || /^会場\s*[:：]/.test(line)
  );
  if (!venueLine) return null;

  return venueLine
    .replace(/^[@＠]\s*/, "")
    .replace(/^at\s+/i, "")
    .replace(/^会場\s*[:：]\s*/, "")
    .trim();
}

function extractOpenStart(articleText) {
  const match = articleText.match(
    /OPEN\s*([0-2]?\d[:：][0-5]\d)\s*\/\s*START\s*([0-2]?\d[:：][0-5]\d)/i
  );
  if (!match) return { openTime: null, startTime: null };
  return { openTime: parseTime(match[1]), startTime: parseTime(match[2]) };
}

function excerpt(text, length = 180) {
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function isEventHeadline(title) {
  if (!title) return false;

  if (
    /(くじ|キャンペーン|プレゼント|注意喚起|規約|メンテナンス|会員証|サイトジャック|お知らせ|抽選会|利用規約|ポリシー|重要)/i.test(
      title
    )
  ) {
    return false;
  }

  if (
    /(抽選|受付開始|公演|live|ライブ|生誕祭|ツアー|出演|特典会|fes|festival|day|oneman|ワンマン|anniversary|countdown|league|final|tour|birthday)/i.test(
      title
    )
  ) {
    return true;
  }

  return false;
}

function looksLikeConcert(item) {
  const target = `${item.title}\n${item.excerpt || ""}`;

  if (
    /(くじ|キャンペーン|プレゼント|注意喚起|規約|メンテナンス|会員証|サイトジャック|お知らせ|抽選会)/i.test(
      item.title
    )
  ) {
    return false;
  }

  if (/(公演|live|ライブ|生誕祭|ツアー|出演|特典会|day|release|イベント|oneman|ワンマン)/i.test(target)) {
    return true;
  }

  if (/(open|start|会場|出演|公演概要|@ )/i.test(target)) {
    return true;
  }

  return false;
}

async function enrichHeroinesItem(item) {
  const detailUrl = toAbsUrl(item.link);
  const published = parseDotDate(item.date);
  const publishedMs = published
    ? toUtcMsFromJst(published.year, published.month, published.day, 12, 0)
    : Date.now();

  let articleText = "";
  let eventDate = null;
  let venue = null;
  let openTime = null;
  let startTime = null;

  try {
    const detailHtml = await fetchText(detailUrl);
    articleText = extractArticleText(detailHtml);
    const summaryScope = articleText.includes("【公演概要】")
      ? articleText.split("【公演概要】")[1]
      : articleText;
    eventDate = firstMatchDate(summaryScope, published?.year);
    if (!eventDate) {
      eventDate = firstMatchDate(item.title, published?.year);
    }
    venue = extractVenue(articleText);
    const openStart = extractOpenStart(articleText);
    openTime = openStart.openTime;
    startTime = openStart.startTime;
  } catch {
    articleText = "";
    eventDate = firstMatchDate(item.title, published?.year);
  }

  let eventMs = null;
  if (eventDate) {
    const baseTime = startTime || openTime;
    eventMs = toUtcMsFromJst(
      eventDate.year,
      eventDate.month,
      eventDate.day,
      baseTime?.hour ?? 12,
      baseTime?.minute ?? 0
    );
  }

  const eventDateLabel = eventDate
    ? `${eventDate.year}/${String(eventDate.month).padStart(2, "0")}/${String(eventDate.day).padStart(2, "0")}`
    : null;

  return {
    id: `heroines-${item.link.replaceAll("/", "-")}`,
    source: "HEROINES NEWS",
    title: item.title,
    url: detailUrl,
    publishedAt: toIso(publishedMs),
    publishedTimestamp: publishedMs,
    eventAt: toIso(eventMs),
    eventTimestamp: eventMs,
    eventDateLabel,
    dateKey: jstDateKeyFromMs(eventMs),
    venue,
    openTime: openTime?.label ?? null,
    startTime: startTime?.label ?? null,
    excerpt: excerpt(articleText),
    tags: item.tags || [],
  };
}

async function fetchHeroinesFeed() {
  const text = await fetchText(HEROINES_NEWS_URL);
  const newsJson = JSON.parse(text);
  const items = Array.isArray(newsJson.items) ? newsJson.items : [];

  const eventItems = items.filter((item) => isEventHeadline(item.title)).slice(0, MAX_HEROINES_ITEMS);

  const enriched = (await mapWithConcurrency(eventItems, DETAIL_FETCH_CONCURRENCY, (item) =>
    enrichHeroinesItem(item)
  )).filter(Boolean);

  const now = Date.now();
  const maxFutureMs = now + UPCOMING_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  const calendarLookbackMs = now - CALENDAR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const concertCandidates = enriched
    .filter((item) => looksLikeConcert(item))
    .filter((item) => Number.isFinite(item.eventTimestamp))
    .filter((item) => item.eventTimestamp >= calendarLookbackMs)
    .filter((item) => item.eventTimestamp <= maxFutureMs)
    .sort((a, b) => a.eventTimestamp - b.eventTimestamp);

  const dedupedConcerts = [];
  const seenConcertKey = new Set();
  for (const concert of concertCandidates) {
    const dedupeKey = `${concert.dateKey || concert.eventDateLabel || "nodate"}::${concert.title}`;
    if (seenConcertKey.has(dedupeKey)) continue;
    seenConcertKey.add(dedupeKey);
    dedupedConcerts.push(concert);
  }

  const upcomingConcerts = dedupedConcerts
    .filter((event) => event.eventTimestamp >= now - 12 * 60 * 60 * 1000)
    .slice(0, MAX_UPCOMING_CONCERTS);

  const calendarEvents = dedupedConcerts.slice(0, MAX_CALENDAR_EVENTS).map((event) => ({
    id: event.id,
    title: event.title,
    source: event.source,
    url: event.url,
    eventAt: event.eventAt,
    eventDateLabel: event.eventDateLabel,
    dateKey: event.dateKey,
    venue: event.venue,
    openTime: event.openTime,
    startTime: event.startTime,
    excerpt: event.excerpt,
  }));

  const latestNews = [...enriched]
    .sort((a, b) => b.publishedTimestamp - a.publishedTimestamp)
    .slice(0, 12);

  return {
    ok: true,
    scannedCount: eventItems.length,
    upcomingConcerts,
    calendarEvents,
    latestNews,
  };
}

function cleanMarkdownTextLine(line) {
  return cleanWhitespace(
    line
      .replace(/!\[[^\]]*]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
  );
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function memberPathCandidates(member) {
  if (member.strictPath) {
    return [member.timelinePath || ""];
  }

  const ordered = [];
  for (const pathCandidate of [
    member.timelinePath || "",
    "",
    "/with_replies",
    "/media",
    "/highlights",
    "/likes",
  ]) {
    if (ordered.includes(pathCandidate)) continue;
    ordered.push(pathCandidate);
  }
  return ordered;
}

function looksLikeTweetText(line) {
  if (!line) return false;
  if (line.length < 10) return false;
  if (line.startsWith("Title:")) return false;
  if (line.startsWith("URL Source:")) return false;
  if (line.startsWith("Markdown Content:")) return false;
  if (line.startsWith("![")) return false;
  if (line.startsWith("[")) return false;
  if (line === "Pinned") return false;
  if (line === "Quote") return false;
  if (line === "Who to follow") return false;
  if (line === "New to X?") return false;
  if (line === "Show more") return false;
  if (line === "Sign up now to get your own personalized timeline!") return false;
  if (line.endsWith("’s posts")) return false;
  if (line.includes("Don’t miss what’s happening")) return false;
  if (/^\d{1,3}(,\d{3})*\s+posts$/.test(line)) return false;
  if (/^[^ ]{1,14}【[^】]{1,8}】$/.test(line)) return false;
  if (/^@[_A-Za-z0-9]+$/.test(line)) return false;
  if (!/[。！？!?#♡♥❤❣]/.test(line) && line.length < 28) {
    const jpCharCount = (line.match(/[ぁ-んァ-ヶ一-龯]/g) || []).length;
    if (jpCharCount < 4) return false;
  }
  return true;
}

function parseMonthDay(line, now) {
  const match = line.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/i
  );
  if (!match) return null;

  const monthIndex = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(match[1].toLowerCase());
  if (monthIndex < 0) return null;

  const day = Number(match[2]);
  let year = now.getUTCFullYear();
  let candidate = toUtcMsFromJst(year, monthIndex + 1, day, 12, 0);
  if (candidate > now.getTime() + 45 * 24 * 60 * 60 * 1000) {
    year -= 1;
    candidate = toUtcMsFromJst(year, monthIndex + 1, day, 12, 0);
  }
  return candidate;
}

function parseXDateFromNeighbors(lines, index) {
  const now = new Date();
  const start = Math.max(index - 4, 0);
  const end = Math.min(index + 2, lines.length);
  const neighborhood = lines.slice(start, end);

  for (const line of neighborhood) {
    const full = line.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
    if (full) {
      const candidate = toUtcMsFromJst(Number(full[1]), Number(full[2]), Number(full[3]), 12, 0);
      if (candidate <= now.getTime() + 2 * 24 * 60 * 60 * 1000) {
        return candidate;
      }
    }
    const monthDayMs = parseMonthDay(line, now);
    if (monthDayMs) return monthDayMs;
  }

  return null;
}

function parseXPosts(markdown, options = {}) {
  const accountUser = options.accountUser || X_OFFICIAL_USER;
  const accountLabel = options.accountLabel || `@${accountUser}`;
  const maxPosts = Number.isFinite(options.maxPosts) ? options.maxPosts : MAX_X_POSTS;
  const lines = markdown.split("\n").map((line) => line.trim());
  const posts = [];
  const seenStatus = new Set();
  const escapedAccount = escapeRegex(accountUser);
  const statusRegex = new RegExp(`https:\\/\\/x\\.com\\/${escapedAccount}\\/status\\/(\\d{10,})`, "i");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!looksLikeTweetText(line)) continue;

    let statusId = null;
    let statusLine = i;
    for (let j = i; j < Math.min(i + 12, lines.length); j += 1) {
      const statusMatch = lines[j].match(statusRegex);
      if (statusMatch) {
        statusId = statusMatch[1];
        statusLine = j;
        break;
      }
    }
    if (!statusId || seenStatus.has(statusId)) continue;

    let chosenText = "";
    const textWindowStart = Math.max(i, statusLine - 5);
    for (let k = textWindowStart; k <= statusLine; k += 1) {
      if (!looksLikeTweetText(lines[k])) continue;
      if (lines[k].length > chosenText.length) {
        chosenText = lines[k];
      }
    }
    if (!chosenText) chosenText = line;

    const text = cleanMarkdownTextLine(chosenText);
    if (!text) continue;
    seenStatus.add(statusId);

    const snowflakeMs = timestampFromStatusId(statusId);
    const parsedDateMs = parseXDateFromNeighbors(lines, i);
    const fallbackMs = Date.now() - posts.length * 90 * 1000;
    const timestamp = snowflakeMs ?? parsedDateMs ?? fallbackMs;
    const postedAtMs = snowflakeMs ?? parsedDateMs;

    posts.push({
      id: `x-${statusId}`,
      source: "X",
      account: accountLabel,
      title: text.length > 64 ? `${text.slice(0, 64)}...` : text,
      text,
      url: `https://x.com/${accountUser}/status/${statusId}`,
      postedAt: postedAtMs ? toIso(postedAtMs) : null,
      timestamp,
    });

    if (posts.length >= maxPosts) break;
  }

  if (posts.length < 4) {
    const fallbackRegex = new RegExp(`https:\\/\\/x\\.com\\/${escapedAccount}\\/status\\/(\\d{10,})`, "gi");
    let match;
    while ((match = fallbackRegex.exec(markdown)) !== null && posts.length < maxPosts) {
      const statusId = match[1];
      if (seenStatus.has(statusId)) continue;
      seenStatus.add(statusId);
      const snowflakeMs = timestampFromStatusId(statusId);
      const fallbackTimestamp = snowflakeMs ?? Date.now() - posts.length * 90 * 1000;
      posts.push({
        id: `x-${statusId}`,
        source: "X",
        account: accountLabel,
        title: "投稿を開く",
        text: "投稿本文の抽出に失敗したため、リンク先を確認してください。",
        url: `https://x.com/${accountUser}/status/${statusId}`,
        postedAt: snowflakeMs ? toIso(snowflakeMs) : null,
        timestamp: fallbackTimestamp,
      });
    }
  }

  return posts.sort((a, b) => b.timestamp - a.timestamp).slice(0, maxPosts);
}

function monthToNumber(shortMonth) {
  return {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  }[shortMonth.toLowerCase()] ?? null;
}

function parseStatusDetail(markdown) {
  const titleMatch = markdown.match(/Title:[\s\S]*?on X:\s"([\s\S]*?)"\s\/ X/);
  const titleText = titleMatch ? cleanMarkdownTextLine(titleMatch[1].replace(/\n+/g, " ")) : null;

  const postedAtMatch = markdown.match(
    /\[(\d{1,2}):(\d{2})\s*([AP]M)\s*[·•]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(20\d{2})\]\(https:\/\/x\.com\/[^)]+\/status\/\d{10,}/i
  );
  let postedAt = null;

  if (postedAtMatch) {
    const rawHour = Number(postedAtMatch[1]);
    const minute = Number(postedAtMatch[2]);
    const ampm = postedAtMatch[3].toUpperCase();
    const month = monthToNumber(postedAtMatch[4]);
    const day = Number(postedAtMatch[5]);
    const year = Number(postedAtMatch[6]);

    if (month && day && year && rawHour >= 1 && rawHour <= 12 && minute >= 0 && minute <= 59) {
      const hour24 = ampm === "PM" ? (rawHour % 12) + 12 : rawHour % 12;
      postedAt = toIso(toUtcMsFromJst(year, month, day, hour24, minute));
    }
  }

  if (!postedAt) {
    const dateMatch = markdown.match(
      /Last edited[^\n]*?\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(20\d{2})/i
    );
    if (dateMatch) {
      const month = monthToNumber(dateMatch[1]);
      const day = Number(dateMatch[2]);
      const year = Number(dateMatch[3]);
      if (month && day && year) {
        postedAt = toIso(toUtcMsFromJst(year, month, day, 12, 0));
      }
    }
  }

  return {
    text: titleText,
    postedAt,
  };
}

function parseTwstalkerLatestText(markdown) {
  const lines = String(markdown || "").split("\n").map((line) => line.trim());
  const startIndex = Math.max(0, lines.findIndex((line) => line === "Markdown Content:"));

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith("Title:")) continue;
    if (line.startsWith("URL Source:")) continue;
    if (line === "Markdown Content:") continue;
    if (line.startsWith("[")) continue;
    if (line.startsWith("_") && line.endsWith("_")) continue;
    if (/twstalker|followers|following|profile picture|tweet picture/i.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    if (line.length < 8) continue;

    const cleaned = cleanMarkdownTextLine(line);
    if (!cleaned || cleaned === "-") continue;
    return cleaned;
  }

  return null;
}

async function fetchTwstalkerLatestPost(member) {
  const markdown = await fetchTextWithRetry(
    `https://r.jina.ai/http://twstalker.com/${member.userName}`,
    2,
    900
  );
  const text = parseTwstalkerLatestText(markdown);
  if (!text) return null;

  return {
    title: text.length > 64 ? `${text.slice(0, 64)}...` : text,
    text,
    url: `https://x.com/${member.userName}`,
    postedAt: null,
    timestamp: Date.now(),
    source: "twstalker",
  };
}

async function enrichXPosts(posts, accountUser = X_OFFICIAL_USER) {
  const targets = posts
    .filter((post) => post.text.includes("抽出に失敗"))
    .slice(0, Math.max(0, X_DETAIL_FETCH_LIMIT));

  await Promise.all(
    targets.map(async (post) => {
      const statusMatch = post.url.match(/status\/(\d{10,})/);
      if (!statusMatch) return;

      try {
        const detailMarkdown = await fetchText(`https://r.jina.ai/http://x.com/${accountUser}/status/${statusMatch[1]}`);
        const detail = parseStatusDetail(detailMarkdown);
        if (detail.text) {
          post.text = detail.text;
          post.title = detail.text.length > 64 ? `${detail.text.slice(0, 64)}...` : detail.text;
        }
        if (detail.postedAt) {
          post.postedAt = detail.postedAt;
          const parsed = Date.parse(detail.postedAt);
          if (!Number.isNaN(parsed)) {
            post.timestamp = parsed;
          }
        }
      } catch {
        // Ignore detail failures and keep coarse data.
      }
    })
  );

  return posts.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_X_POSTS);
}

async function fetchXFeed() {
  const markdown = await fetchText(X_MIRROR_URL);
  const parsed = parseXPosts(markdown, {
    accountUser: X_OFFICIAL_USER,
    accountLabel: X_ACCOUNT,
    maxPosts: MAX_X_POSTS,
  });
  const posts = await enrichXPosts(parsed, X_OFFICIAL_USER);
  return {
    ok: true,
    scannedCount: posts.length,
    posts,
  };
}

function toMemberRowFallback(member, error) {
  return {
    memberName: member.memberName,
    account: `@${member.userName}`,
    profileUrl: `https://x.com/${member.userName}`,
    latestPost: null,
    ok: false,
    error: error instanceof Error ? error.message : "failed to fetch member posts",
  };
}

function toMemberRowFromCache(member, cachedRow, error) {
  return {
    memberName: member.memberName,
    account: `@${member.userName}`,
    profileUrl: `https://x.com/${member.userName}`,
    latestPost: cachedRow?.latestPost
      ? {
          title: cachedRow.latestPost.title,
          text: cachedRow.latestPost.text,
          url: cachedRow.latestPost.url,
          postedAt: cachedRow.latestPost.postedAt,
          timestamp: cachedRow.latestPost.timestamp,
          source: cachedRow.latestPost.source || "cache",
        }
      : null,
    ok: Boolean(cachedRow?.latestPost),
    stale: true,
    error: error instanceof Error ? `stale cache: ${error.message}` : "stale cache",
  };
}

function isLimitedFallbackPost(post) {
  return Boolean(post && post.source === "limited");
}

async function fetchMemberLatestXRow(member) {
  const profileUrl = `https://x.com/${member.userName}`;
  let lastError = null;
  let latest = null;

  for (const timelinePath of memberPathCandidates(member)) {
    const markdownUrl = `https://r.jina.ai/http://x.com/${member.userName}${timelinePath}`;
    try {
      const markdown = await fetchTextWithRetry(
        markdownUrl,
        MEMBER_X_FETCH_RETRIES,
        MEMBER_X_RETRY_BASE_DELAY_MS
      );
      const parsed = parseXPosts(markdown, {
        accountUser: member.userName,
        accountLabel: `@${member.userName}`,
        maxPosts: MEMBER_X_MAX_CANDIDATES,
      });
      if (parsed.length > 0) {
        latest = parsed[0];
        break;
      }
    } catch (error) {
      lastError = error;
      if (isRetryableFetchError(error)) {
        break;
      }
    }
  }

  if (!latest && member.twstalkerFallback) {
    try {
      latest = await fetchTwstalkerLatestPost(member);
    } catch {
      // Ignore fallback failure and keep not found result.
    }
  }

  if (!latest && member.twstalkerFallback && isRetryableFetchError(lastError)) {
    latest = {
      title: "取得制限中",
      text: "取得元のレート制限により本文を取得できませんでした。プロフィールから最新投稿を確認してください。",
      url: `https://x.com/${member.userName}`,
      postedAt: null,
      timestamp: Date.now(),
      source: "limited",
    };
  }

  if (!latest && lastError instanceof Error) {
    throw lastError;
  }

  return {
    memberName: member.memberName,
    account: `@${member.userName}`,
    profileUrl,
    latestPost: latest
      ? {
          title: latest.title,
          text: latest.text,
          url: latest.url,
          postedAt: latest.postedAt,
          timestamp: latest.timestamp,
          source: latest.source || "x",
        }
      : null,
    ok: Boolean(latest),
    error: latest ? null : "latest post not found",
  };
}

function buildMemberGroupFallbackRows(error = null) {
  const groups = {};
  for (const groupKey of MEMBER_X_GROUP_KEYS) {
    groups[groupKey] = MEMBER_X_GROUPS[groupKey].members.map((member) => toMemberRowFallback(member, error));
  }
  return groups;
}

async function fetchMembersXRows(memberList) {
  const rows = await mapWithConcurrency(memberList, MEMBER_X_CONCURRENCY, async (member) => {
    try {
      const row = await fetchMemberLatestXRow(member);
      const cachedRow = memberRowCache.get(member.userName);

      if (row.ok && row.latestPost && !isLimitedFallbackPost(row.latestPost)) {
        memberRowCache.set(member.userName, row);
        return row;
      }

      if (row.ok && row.latestPost && isLimitedFallbackPost(row.latestPost) && cachedRow?.latestPost) {
        return toMemberRowFromCache(member, cachedRow, new Error("rate limited"));
      }

      if (cachedRow?.latestPost) {
        return toMemberRowFromCache(member, cachedRow, new Error(row.error || "latest post not found"));
      }

      return row;
    } catch (error) {
      const cachedRow = memberRowCache.get(member.userName);
      if (cachedRow?.latestPost) {
        return toMemberRowFromCache(member, cachedRow, error);
      }
      return toMemberRowFallback(member, error);
    }
  });

  return rows;
}

async function fetchMembersXFeed() {
  const uniqueMembersByUser = new Map();
  for (const groupKey of MEMBER_X_GROUP_KEYS) {
    for (const member of MEMBER_X_GROUPS[groupKey].members) {
      if (!uniqueMembersByUser.has(member.userName)) {
        uniqueMembersByUser.set(member.userName, member);
      }
    }
  }

  const uniqueRows = await fetchMembersXRows([...uniqueMembersByUser.values()]);
  const rowByUser = new Map(uniqueRows.map((row) => [row.account.slice(1), row]));

  const groups = {};
  let scannedCount = 0;
  let successCount = 0;

  for (const groupKey of MEMBER_X_GROUP_KEYS) {
    const rows = MEMBER_X_GROUPS[groupKey].members.map((member) => {
      const base = rowByUser.get(member.userName);
      if (!base) return toMemberRowFallback(member, new Error("member row missing"));
      return {
        ...base,
        memberName: member.memberName,
        account: `@${member.userName}`,
        profileUrl: `https://x.com/${member.userName}`,
      };
    });
    groups[groupKey] = rows;
    scannedCount += rows.length;
    successCount += rows.filter((row) => row.ok).length;
  }

  return {
    ok: successCount > 0,
    scannedCount,
    successCount,
    rows: groups.ilife || [],
    groups,
  };
}

function buildTimeline({ upcomingConcerts, latestNews, xPosts }) {
  const items = [];

  for (const concert of upcomingConcerts) {
    items.push({
      id: `timeline-${concert.id}`,
      kind: "concert",
      source: concert.source,
      title: concert.title,
      text: concert.venue ? `会場: ${concert.venue}` : concert.excerpt || "",
      url: concert.url,
      timestamp: concert.eventTimestamp || concert.publishedTimestamp,
      at: concert.eventAt || concert.publishedAt,
    });
  }

  for (const news of latestNews) {
    items.push({
      id: `timeline-news-${news.id}`,
      kind: "news",
      source: news.source,
      title: news.title,
      text: news.excerpt,
      url: news.url,
      timestamp: news.publishedTimestamp,
      at: news.publishedAt,
    });
  }

  for (const post of xPosts) {
    items.push({
      id: `timeline-${post.id}`,
      kind: "social",
      source: `${post.source} ${post.account}`,
      title: post.title,
      text: post.text,
      url: post.url,
      timestamp: post.timestamp,
      at: post.postedAt,
    });
  }

  const deduped = new Map();
  for (const item of items) {
    if (!deduped.has(item.url)) {
      deduped.set(item.url, item);
    }
  }

  return [...deduped.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 28);
}

export async function buildFeed() {
  const [heroinesResult, xResult, membersXResult] = await Promise.allSettled([
    fetchHeroinesFeed(),
    fetchXFeed(),
    fetchMembersXFeed(),
  ]);

  const heroines = heroinesResult.status === "fulfilled"
    ? heroinesResult.value
    : {
        ok: false,
        scannedCount: 0,
        upcomingConcerts: [],
        calendarEvents: [],
        latestNews: [],
        error: heroinesResult.reason instanceof Error ? heroinesResult.reason.message : "unknown error",
      };

  const x = xResult.status === "fulfilled"
    ? xResult.value
    : {
        ok: false,
        scannedCount: 0,
        posts: [],
        error: xResult.reason instanceof Error ? xResult.reason.message : "unknown error",
      };

  const memberFallbackGroups = buildMemberGroupFallbackRows(
    membersXResult.status === "rejected" && membersXResult.reason instanceof Error
      ? membersXResult.reason
      : null
  );

  const membersX = membersXResult.status === "fulfilled"
    ? membersXResult.value
    : {
        ok: false,
        scannedCount: 0,
        successCount: 0,
        rows: memberFallbackGroups.ilife || [],
        groups: memberFallbackGroups,
        error: membersXResult.reason instanceof Error ? membersXResult.reason.message : "unknown error",
      };

  const timeline = buildTimeline({
    upcomingConcerts: heroines.upcomingConcerts,
    latestNews: heroines.latestNews,
    xPosts: x.posts,
  });

  return {
    generatedAt: new Date().toISOString(),
    cacheTtlMs: CACHE_TTL_MS,
    sources: {
      heroines,
      x,
      membersX,
    },
    upcomingConcerts: heroines.upcomingConcerts,
    calendarEvents: heroines.calendarEvents,
    latestNews: heroines.latestNews,
    xPosts: x.posts,
    memberXRows: membersX.rows,
    memberXGroups: membersX.groups || { ilife: membersX.rows, nonfic: [] },
    timeline,
  };
}

async function getCachedFeed(forceRefresh = false) {
  if (!forceRefresh && cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  if (cache.pending) {
    return cache.pending;
  }

  cache.pending = (async () => {
    const feed = await buildFeed();
    cache.data = feed;
    cache.fetchedAt = Date.now();
    cache.pending = null;
    return feed;
  })().catch((error) => {
    cache.pending = null;
    throw error;
  });

  return cache.pending;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const method = (req.method || "GET").toUpperCase();

    if (method === "OPTIONS") {
      res.writeHead(204, withCorsHeaders({ "cache-control": "no-store" }));
      res.end();
      return;
    }

    if (requestUrl.pathname === "/api/health") {
      jsonResponse(res, 200, {
        ok: true,
        now: new Date().toISOString(),
        cacheAgeMs: cache.fetchedAt ? Date.now() - cache.fetchedAt : null,
      });
      return;
    }

    if (requestUrl.pathname === "/api/feed") {
      const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
      try {
        const feed = await getCachedFeed(forceRefresh);
        jsonResponse(res, 200, feed);
      } catch (error) {
        jsonResponse(res, 500, {
          error: "Failed to build feed",
          detail: error instanceof Error ? error.message : "unknown error",
        });
      }
      return;
    }

    await serveStatic(requestUrl.pathname, res);
  });
}

export const server = createServer();

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  server.listen(PORT, HOST, () => {
    process.stdout.write(`iLiFE live site ready on http://${HOST}:${PORT}\n`);
  });
}
