const runtimeConfig = typeof window !== "undefined" && window.ILIFE_CONFIG && typeof window.ILIFE_CONFIG === "object"
  ? window.ILIFE_CONFIG
  : {};

function normalizeApiBase(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

const API_BASE_URL = normalizeApiBase(runtimeConfig.API_BASE_URL || "");

function toApiEndpoint(pathnameWithQuery) {
  const path = String(pathnameWithQuery || "");
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

const refreshButton = document.querySelector("#refreshButton");
const autoRefreshCheckbox = document.querySelector("#autoRefresh");
const lastUpdatedEl = document.querySelector("#lastUpdated");
const errorBanner = document.querySelector("#errorBanner");
const concertListEl = document.querySelector("#concertList");
const xPostListEl = document.querySelector("#xPostList");
const timelineListEl = document.querySelector("#timelineList");
const nextConcertValueEl = document.querySelector("#nextConcertValue");
const xCountValueEl = document.querySelector("#xCountValue");
const sourceStateValueEl = document.querySelector("#sourceStateValue");
const calendarPrevButton = document.querySelector("#calendarPrevButton");
const calendarNextButton = document.querySelector("#calendarNextButton");
const calendarMonthLabelEl = document.querySelector("#calendarMonthLabel");
const calendarGridEl = document.querySelector("#calendarGrid");
const calendarEventListEl = document.querySelector("#calendarEventList");
const memberXTableBodyEl = document.querySelector("#memberXTableBody");
const memberTabEls = Array.from(document.querySelectorAll(".member-tab[data-member-group]"));
const memberGroupCaptionEl = document.querySelector("#memberGroupCaption");
const emptyTemplate = document.querySelector("#emptyStateTemplate");

const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const monthLabelFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
});
const dayLabelFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

let autoRefreshTimer = null;
const MEMBER_GROUP_LABELS = {
  ilife: "iLiFE",
  nonfic: "のんふぃく",
};
const MEMBER_GROUP_CAPTIONS = {
  ilife: "iLiFEメンバーごとの最新X投稿（各1件）",
  nonfic: "のんふぃくメンバーごとの最新X投稿（各1件）",
};
let memberXGroupsState = {
  ilife: [],
  nonfic: [],
};
let activeMemberGroup = "ilife";

const calendarState = {
  eventMap: new Map(),
  monthKey: null,
  selectedDateKey: null,
};

function toDateText(iso) {
  if (!iso) return "-";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "-";
  return dateTimeFmt.format(value);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseMonthKey(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function parseDateKey(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function toJstPartsFromMs(ms) {
  if (!Number.isFinite(ms)) return null;
  const shifted = new Date(ms + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function toJstDateKeyFromIso(iso) {
  const ms = Date.parse(iso || "");
  if (Number.isNaN(ms)) return null;
  const parts = toJstPartsFromMs(ms);
  if (!parts) return null;
  return toDateKey(parts.year, parts.month, parts.day);
}

function getCurrentJstMonthKey() {
  const parts = toJstPartsFromMs(Date.now());
  if (!parts) return "1970-01";
  return `${parts.year}-${pad2(parts.month)}`;
}

function shiftMonthKey(monthKey, delta) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return getCurrentJstMonthKey();
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`;
}

function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getFirstWeekdayInMonthJst(year, month) {
  const ms = Date.UTC(year, month - 1, 1, -9, 0, 0);
  const parts = toJstPartsFromMs(ms);
  return parts?.weekday ?? 0;
}

function toMonthLabel(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return "-";
  const base = new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 0, 0, 0));
  return monthLabelFmt.format(base);
}

function toDateKeyLabel(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return "-";
  const base = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 3, 0, 0));
  return dayLabelFmt.format(base);
}

function dateKeyToSlash(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return "-";
  return `${parsed.year}/${pad2(parsed.month)}/${pad2(parsed.day)}`;
}

function toCalendarSortValue(event) {
  const fromEventAt = Date.parse(event.eventAt || "");
  if (!Number.isNaN(fromEventAt)) return fromEventAt;
  if (event.dateKey) {
    const fromDateKey = Date.parse(`${event.dateKey}T00:00:00+09:00`);
    if (!Number.isNaN(fromDateKey)) return fromDateKey;
  }
  return Number.MAX_SAFE_INTEGER;
}

function safeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "-";
}

function shortenText(value, maxLength = 110) {
  const text = safeText(value);
  if (text === "-") return text;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function setError(message) {
  if (!message) {
    errorBanner.hidden = true;
    errorBanner.textContent = "";
    return;
  }
  errorBanner.hidden = false;
  errorBanner.textContent = message;
}

function clearNode(node) {
  node.innerHTML = "";
}

function cloneEmptyState() {
  return emptyTemplate.content.firstElementChild.cloneNode(true);
}

function createCard({ title, meta, text, url, linkLabel }) {
  const article = document.createElement("article");
  article.className = "card";

  const titleEl = document.createElement("h3");
  titleEl.className = "card-title";
  titleEl.textContent = safeText(title);
  article.append(titleEl);

  if (meta) {
    const metaEl = document.createElement("p");
    metaEl.className = "card-meta";
    metaEl.textContent = meta;
    article.append(metaEl);
  }

  if (text) {
    const textEl = document.createElement("p");
    textEl.className = "card-text";
    textEl.textContent = text;
    article.append(textEl);
  }

  if (url) {
    const linkEl = document.createElement("a");
    linkEl.className = "card-link";
    linkEl.href = url;
    linkEl.target = "_blank";
    linkEl.rel = "noopener noreferrer";
    linkEl.textContent = linkLabel || "詳細を見る";
    article.append(linkEl);
  }

  return article;
}

function renderConcerts(items) {
  clearNode(concertListEl);
  if (!items.length) {
    concertListEl.append(cloneEmptyState());
    nextConcertValueEl.textContent = "予定なし";
    return;
  }

  const next = items[0];
  nextConcertValueEl.textContent = next.eventDateLabel || toDateText(next.eventAt);

  for (const item of items) {
    const timeLine = [
      item.eventDateLabel ? `開催日: ${item.eventDateLabel}` : "",
      item.openTime ? `OPEN ${item.openTime}` : "",
      item.startTime ? `START ${item.startTime}` : "",
      item.venue ? `会場 ${item.venue}` : "",
    ]
      .filter(Boolean)
      .join(" / ");

    concertListEl.append(
      createCard({
        title: item.title,
        meta: timeLine || `公開日: ${toDateText(item.publishedAt)}`,
        text: item.excerpt,
        url: item.url,
        linkLabel: "公演情報を開く",
      })
    );
  }
}

function renderXPosts(items) {
  clearNode(xPostListEl);
  xCountValueEl.textContent = String(items.length);

  if (!items.length) {
    xPostListEl.append(cloneEmptyState());
    return;
  }

  for (const item of items) {
    const meta = [
      item.account || "",
      item.postedAt ? toDateText(item.postedAt) : "時刻不明",
    ]
      .filter(Boolean)
      .join(" / ");

    xPostListEl.append(
      createCard({
        title: item.title,
        meta,
        text: item.text,
        url: item.url,
        linkLabel: "Xで開く",
      })
    );
  }
}

function normalizeMemberXGroups(feed) {
  const source = feed && typeof feed === "object" && feed.memberXGroups && typeof feed.memberXGroups === "object"
    ? feed.memberXGroups
    : {};

  const ilifeRows = Array.isArray(source.ilife)
    ? source.ilife
    : Array.isArray(feed?.memberXRows)
      ? feed.memberXRows
      : [];
  const nonficRows = Array.isArray(source.nonfic) ? source.nonfic : [];

  return {
    ilife: ilifeRows,
    nonfic: nonficRows,
  };
}

function syncMemberTabState() {
  for (const tabEl of memberTabEls) {
    const groupKey = tabEl.dataset.memberGroup || "ilife";
    const rows = memberXGroupsState[groupKey] || [];
    const baseLabel = tabEl.dataset.memberLabel || MEMBER_GROUP_LABELS[groupKey] || groupKey;
    tabEl.textContent = `${baseLabel} (${rows.length})`;
    tabEl.classList.toggle("is-active", groupKey === activeMemberGroup);
  }

  if (memberGroupCaptionEl) {
    memberGroupCaptionEl.textContent = MEMBER_GROUP_CAPTIONS[activeMemberGroup] || MEMBER_GROUP_CAPTIONS.ilife;
  }
}

function renderMemberXFocus() {
  syncMemberTabState();
  renderMemberXTable(memberXGroupsState[activeMemberGroup] || [], activeMemberGroup);
}

function renderMemberXTable(rows, groupKey = "ilife") {
  if (!memberXTableBodyEl) return;
  clearNode(memberXTableBodyEl);

  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "member-error";
    td.textContent = `${MEMBER_GROUP_LABELS[groupKey] || "対象"}のメンバー投稿データがありません。`;
    tr.append(td);
    memberXTableBodyEl.append(tr);
    return;
  }

  for (const row of list) {
    const tr = document.createElement("tr");

    const memberTd = document.createElement("td");
    memberTd.className = "member-member";
    memberTd.textContent = safeText(row.memberName);
    tr.append(memberTd);

    const accountTd = document.createElement("td");
    if (row.profileUrl) {
      const accountLink = document.createElement("a");
      accountLink.className = "member-account-link";
      accountLink.href = row.profileUrl;
      accountLink.target = "_blank";
      accountLink.rel = "noopener noreferrer";
      accountLink.textContent = safeText(row.account);
      accountTd.append(accountLink);
    } else {
      accountTd.textContent = safeText(row.account);
    }
    tr.append(accountTd);

    const latestTimeTd = document.createElement("td");
    latestTimeTd.textContent = row.latestPost
      ? (row.latestPost.postedAt ? toDateText(row.latestPost.postedAt) : "時刻不明")
      : "取得不可";
    tr.append(latestTimeTd);

    const textTd = document.createElement("td");
    textTd.className = row.latestPost ? "member-post-text" : "member-error";
    textTd.textContent = row.latestPost ? shortenText(row.latestPost.text, 130) : safeText(row.error || "投稿未取得");
    tr.append(textTd);

    const linkTd = document.createElement("td");
    if (row.latestPost?.url) {
      const link = document.createElement("a");
      link.className = "member-link";
      link.href = row.latestPost.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "投稿へ";
      linkTd.append(link);
    } else {
      linkTd.textContent = "-";
    }
    tr.append(linkTd);

    memberXTableBodyEl.append(tr);
  }
}

function renderTimeline(items) {
  clearNode(timelineListEl);
  if (!items.length) {
    timelineListEl.append(cloneEmptyState());
    return;
  }

  for (const item of items) {
    const wrapper = document.createElement("article");
    wrapper.className = "timeline-item";

    const top = document.createElement("div");
    top.className = "timeline-top";

    const source = document.createElement("p");
    source.className = "timeline-source";
    source.textContent = safeText(item.source);
    top.append(source);

    const time = document.createElement("p");
    time.className = "timeline-time";
    time.textContent = toDateText(item.at);
    top.append(time);

    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = safeText(item.title);

    wrapper.append(top);
    wrapper.append(title);

    if (item.text) {
      const text = document.createElement("p");
      text.className = "card-text";
      text.textContent = item.text;
      wrapper.append(text);
    }

    if (item.url) {
      const link = document.createElement("a");
      link.className = "card-link";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "リンクを開く";
      wrapper.append(link);
    }

    timelineListEl.append(wrapper);
  }
}

function buildCalendarEventMap(events) {
  const map = new Map();

  for (const event of events) {
    const dateKey = event.dateKey || toJstDateKeyFromIso(event.eventAt);
    if (!dateKey) continue;

    const normalized = {
      ...event,
      dateKey,
    };

    if (!map.has(dateKey)) {
      map.set(dateKey, []);
    }
    map.get(dateKey).push(normalized);
  }

  for (const [key, list] of map.entries()) {
    map.set(
      key,
      list.sort((a, b) => toCalendarSortValue(a) - toCalendarSortValue(b))
    );
  }

  return map;
}

function firstEventDateKeyInMonth(monthKey) {
  const targetPrefix = `${monthKey}-`;
  const candidates = [...calendarState.eventMap.keys()]
    .filter((key) => key.startsWith(targetPrefix))
    .sort();
  return candidates[0] || null;
}

function findPreferredMonthKey(events) {
  const currentMonth = getCurrentJstMonthKey();
  const hasCurrentMonth = events.some((event) => event.dateKey.startsWith(`${currentMonth}-`));
  if (hasCurrentMonth) return currentMonth;

  const now = Date.now();
  const nextFuture = events.find((event) => toCalendarSortValue(event) >= now - 12 * 60 * 60 * 1000);
  if (nextFuture) return nextFuture.dateKey.slice(0, 7);

  if (events.length) {
    return events[events.length - 1].dateKey.slice(0, 7);
  }

  return currentMonth;
}

function renderCalendarEventList() {
  clearNode(calendarEventListEl);

  if (!calendarState.eventMap.size) {
    calendarEventListEl.append(cloneEmptyState());
    return;
  }

  const selectedKey = calendarState.selectedDateKey;
  const selectedLabel = document.createElement("p");
  selectedLabel.className = "calendar-selected-label";
  selectedLabel.textContent = `${toDateKeyLabel(selectedKey)} の予定`;
  calendarEventListEl.append(selectedLabel);

  const events = calendarState.eventMap.get(selectedKey) || [];
  if (!events.length) {
    const empty = document.createElement("article");
    empty.className = "empty-state";
    empty.textContent = "この日の予定はありません。";
    calendarEventListEl.append(empty);
    return;
  }

  for (const event of events) {
    const meta = [
      `開催日: ${event.eventDateLabel || dateKeyToSlash(event.dateKey)}`,
      event.openTime ? `OPEN ${event.openTime}` : "",
      event.startTime ? `START ${event.startTime}` : "",
      event.venue ? `会場 ${event.venue}` : "",
    ]
      .filter(Boolean)
      .join(" / ");

    calendarEventListEl.append(
      createCard({
        title: event.title,
        meta,
        text: event.excerpt || "",
        url: event.url,
        linkLabel: "イベント詳細を開く",
      })
    );
  }
}

function renderCalendarGrid() {
  clearNode(calendarGridEl);

  if (!calendarState.monthKey) {
    calendarState.monthKey = getCurrentJstMonthKey();
  }
  if (calendarMonthLabelEl) {
    calendarMonthLabelEl.textContent = toMonthLabel(calendarState.monthKey);
  }

  const current = parseMonthKey(calendarState.monthKey);
  if (!current) {
    renderCalendarEventList();
    return;
  }

  const prev = parseMonthKey(shiftMonthKey(calendarState.monthKey, -1));
  const next = parseMonthKey(shiftMonthKey(calendarState.monthKey, 1));

  const daysInCurrent = getDaysInMonth(current.year, current.month);
  const daysInPrev = prev ? getDaysInMonth(prev.year, prev.month) : 31;
  const firstWeekday = getFirstWeekdayInMonthJst(current.year, current.month);
  const totalCells = Math.ceil((firstWeekday + daysInCurrent) / 7) * 7;

  for (let index = 0; index < totalCells; index += 1) {
    const dayOffset = index - firstWeekday + 1;
    let cellYear = current.year;
    let cellMonth = current.month;
    let dayNumber = dayOffset;
    let inCurrentMonth = true;

    if (dayOffset < 1) {
      inCurrentMonth = false;
      cellYear = prev?.year ?? current.year;
      cellMonth = prev?.month ?? current.month;
      dayNumber = daysInPrev + dayOffset;
    } else if (dayOffset > daysInCurrent) {
      inCurrentMonth = false;
      cellYear = next?.year ?? current.year;
      cellMonth = next?.month ?? current.month;
      dayNumber = dayOffset - daysInCurrent;
    }

    const dateKey = toDateKey(cellYear, cellMonth, dayNumber);
    const events = calendarState.eventMap.get(dateKey) || [];

    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-cell";
    if (!inCurrentMonth) button.classList.add("is-other-month");
    if (events.length) button.classList.add("is-has-events");
    if (dateKey === calendarState.selectedDateKey) button.classList.add("is-selected");

    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.textContent = String(dayNumber);
    button.append(number);

    if (events.length) {
      const badge = document.createElement("span");
      badge.className = "calendar-badge";
      badge.textContent = `${events.length}件`;
      button.append(badge);
    }

    button.addEventListener("click", () => {
      calendarState.monthKey = dateKey.slice(0, 7);
      calendarState.selectedDateKey = dateKey;
      renderCalendarGrid();
    });

    calendarGridEl.append(button);
  }

  renderCalendarEventList();
}

function renderCalendar(events) {
  const normalized = (events || [])
    .map((event) => {
      const dateKey = event.dateKey || toJstDateKeyFromIso(event.eventAt);
      if (!dateKey) return null;
      return {
        ...event,
        dateKey,
      };
    })
    .filter(Boolean)
    .sort((a, b) => toCalendarSortValue(a) - toCalendarSortValue(b));

  calendarState.eventMap = buildCalendarEventMap(normalized);

  if (!calendarState.monthKey) {
    calendarState.monthKey = findPreferredMonthKey(normalized);
  }

  if (
    !calendarState.selectedDateKey ||
    !calendarState.selectedDateKey.startsWith(`${calendarState.monthKey}-`)
  ) {
    calendarState.selectedDateKey =
      firstEventDateKeyInMonth(calendarState.monthKey) || `${calendarState.monthKey}-01`;
  }

  renderCalendarGrid();
}

function renderSourceState(feed) {
  const states = [];
  states.push(feed.sources?.heroines?.ok ? "NEWS:OK" : "NEWS:NG");
  states.push(feed.sources?.x?.ok ? "X:OK" : "X:NG");
  states.push(feed.sources?.membersX?.ok ? "MEMBERS:OK" : "MEMBERS:NG");
  sourceStateValueEl.textContent = states.join(" / ");
}

async function loadFeed(forceRefresh = false) {
  setError("");
  refreshButton.disabled = true;
  refreshButton.textContent = "更新中...";

  try {
    const endpointPath = forceRefresh ? "/api/feed?refresh=1" : "/api/feed";
    const endpoint = toApiEndpoint(endpointPath);
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const feed = await response.json();
    renderCalendar(feed.calendarEvents || feed.upcomingConcerts || []);
    renderConcerts(feed.upcomingConcerts || []);
    renderXPosts(feed.xPosts || []);
    memberXGroupsState = normalizeMemberXGroups(feed);
    if (!Object.prototype.hasOwnProperty.call(memberXGroupsState, activeMemberGroup)) {
      activeMemberGroup = "ilife";
    }
    renderMemberXFocus();
    renderTimeline(feed.timeline || []);
    renderSourceState(feed);

    lastUpdatedEl.textContent = `最終更新: ${toDateText(feed.generatedAt)}`;

    if (!feed.sources?.heroines?.ok || !feed.sources?.x?.ok || !feed.sources?.membersX?.ok) {
      const warnings = [];
      if (!feed.sources?.heroines?.ok) warnings.push("NEWS取得に失敗");
      if (!feed.sources?.x?.ok) warnings.push("X取得に失敗");
      if (!feed.sources?.membersX?.ok) warnings.push("メンバーX取得に失敗");
      setError(`${warnings.join(" / ")}。時間を置いて再読み込みしてください。`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    const runningOnGithubPages = typeof location !== "undefined" && location.hostname.endsWith("github.io");
    if (runningOnGithubPages && !API_BASE_URL) {
      setError(
        `更新に失敗しました: ${detail}。GitHub Pagesでは config.js の API_BASE_URL をバックエンドURLに設定してください。`
      );
    } else {
      setError(`更新に失敗しました: ${detail}`);
    }
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "今すぐ更新";
  }
}

function setupAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }

  if (autoRefreshCheckbox.checked) {
    autoRefreshTimer = setInterval(() => {
      loadFeed(false);
    }, 5 * 60 * 1000);
  }
}

refreshButton.addEventListener("click", () => {
  loadFeed(true);
});

autoRefreshCheckbox.addEventListener("change", setupAutoRefresh);

if (calendarPrevButton) {
  calendarPrevButton.addEventListener("click", () => {
    calendarState.monthKey = shiftMonthKey(calendarState.monthKey || getCurrentJstMonthKey(), -1);
    calendarState.selectedDateKey =
      firstEventDateKeyInMonth(calendarState.monthKey) || `${calendarState.monthKey}-01`;
    renderCalendarGrid();
  });
}

if (calendarNextButton) {
  calendarNextButton.addEventListener("click", () => {
    calendarState.monthKey = shiftMonthKey(calendarState.monthKey || getCurrentJstMonthKey(), 1);
    calendarState.selectedDateKey =
      firstEventDateKeyInMonth(calendarState.monthKey) || `${calendarState.monthKey}-01`;
    renderCalendarGrid();
  });
}

for (const tabEl of memberTabEls) {
  tabEl.addEventListener("click", () => {
    const nextGroup = tabEl.dataset.memberGroup || "ilife";
    if (nextGroup === activeMemberGroup) return;
    activeMemberGroup = nextGroup;
    renderMemberXFocus();
  });
}

syncMemberTabState();
setupAutoRefresh();
loadFeed(false);
