const MIN_DATE = new Date('2021-01-01T00:00:00');
const MAX_EVENTS_PER_DAY = 3;
const SEARCH_PAGE_SIZE = 10;

const state = {
  currentDate: new Date(),
  events: [],
  searchQuery: '',
  quarterCache: new Map(),
  anchoredEventId: null,
  searchMode: false,
  searchResults: [],
  searchPage: 1
};

const calendarEl = document.getElementById('calendar');
const periodTitleEl = document.getElementById('periodTitle');
const datePickerEl = document.getElementById('datePicker');
const prevBtnEl = document.getElementById('prevBtn');
const nextBtnEl = document.getElementById('nextBtn');
const searchInputEl = document.getElementById('searchInput');
const searchBtnEl = document.getElementById('searchBtn');
const exitSearchBtnEl = document.getElementById('exitSearchBtn');
const searchResultsSectionEl = document.getElementById('searchResultsSection');
const searchResultsEl = document.getElementById('searchResults');
const searchPaginationEl = document.getElementById('searchPagination');
const calendarControlsEl = document.getElementById('calendarControls');
const popupEl = document.getElementById('eventPopup');

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function decodeUtf8(buffer) {
  return new TextDecoder('utf-8').decode(buffer);
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  values.push(current.trim());
  return values;
}

function toList(rawValue) {
  if (!rawValue) return [];
  return rawValue.split(',').map((x) => x.trim()).filter(Boolean);
}

function parseCsv(csvText) {
  const normalized = csvText.replace(/^\uFEFF/, '');
  const trimmed = normalized.trim();
  if (!trimmed) return [];

  const [headerLine, ...lines] = trimmed.split(/\r?\n/);
  const headers = splitCsvLine(headerLine).map((h) => h.replace(/^\uFEFF/, '').toLowerCase());

  return lines
    .filter(Boolean)
    .map((line, index) => {
      const values = splitCsvLine(line);
      const row = Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));

      const startDate = new Date(row.start_date);
      if (Number.isNaN(startDate.getTime())) return null;

      const chats = row.number_of_chats?.trim() ? Number(row.number_of_chats.trim()) : null;
      const revenue = row.revenue?.trim() ? Number(row.revenue.trim()) : null;

      return {
        id: `${row.title || 'unknown'}-${row.start_date}-${index}`,
        sequence: index,
        title: row.title?.trim() || 'Unknown',
        startDate: startOfDay(startDate),
        games: toList(row.game),
        tags: toList(row.tags),
        summary: row.summary?.trim() || '',
        numberOfChats: Number.isNaN(chats) ? null : chats,
        revenue: Number.isNaN(revenue) ? null : revenue
      };
    })
    .filter(Boolean)
    .map((event) => ({ ...event, games: event.games.length ? event.games : ['Unknown'] }));
}

function quarterFromDate(date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

function quarterKey(date) {
  return `${date.getFullYear()}-Q${quarterFromDate(date)}`;
}

function quarterFilePath(key) {
  return `data/events-${key}.csv`;
}

async function loadQuarterEvents(key) {
  if (state.quarterCache.has(key)) return state.quarterCache.get(key);

  let events = [];
  const path = quarterFilePath(key);
  try {
    const response = await fetch(path);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      events = parseCsv(decodeUtf8(buffer));
    } else if (response.status !== 404) {
      console.warn(`Failed to load ${path}: HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(`Failed to load ${path}:`, error);
  }

  state.quarterCache.set(key, events);
  return events;
}

function quarterKeysInRange(startDate, endDate) {
  const keys = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endCursor = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cursor <= endCursor) {
    const key = quarterKey(cursor);
    if (!keys.includes(key)) keys.push(key);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function monthVisibleRange(date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  return { start: startOfDay(start), end: startOfDay(end) };
}

async function ensureEventsForCurrentView() {
  const { start, end } = monthVisibleRange(state.currentDate);
  await Promise.all(quarterKeysInRange(start, end).map((key) => loadQuarterEvents(key)));
  state.events = [...state.quarterCache.values()].flat();
}

async function ensureEventsForSearch() {
  const currentYear = new Date().getFullYear() + 1;
  const searchEnd = new Date(currentYear, 11, 31);
  await Promise.all(quarterKeysInRange(MIN_DATE, searchEnd).map((key) => loadQuarterEvents(key)));
  state.events = [...state.quarterCache.values()].flat();
}

function clampToMinDate(date) {
  return date < MIN_DATE ? new Date(MIN_DATE) : date;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getFilteredEvents() {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) return state.events;
  return state.events.filter((event) => (
    event.title.toLowerCase().includes(query)
    || event.games.join(', ').toLowerCase().includes(query)
    || event.tags.join(', ').toLowerCase().includes(query)
    || event.summary.toLowerCase().includes(query)
  ));
}

function eventsForDay(day) {
  return getFilteredEvents()
    .filter((event) => isSameDay(event.startDate, day))
    .sort((a, b) => a.sequence - b.sequence);
}

function hidePopupIfNotAnchored() {
  if (!state.anchoredEventId) popupEl.hidden = true;
}

function popupHtml(event) {
  const lines = [
    `<strong>${event.title || 'Unknown'}</strong>`,
    `<span><b>Game:</b> ${event.games.length ? event.games.join(', ') : 'Unknown'}</span>`
  ];

  const start = event.startDate.toISOString().slice(0, 10);
  lines.push(`<span><b>Date:</b> ${start}</span>`);

  if (event.tags.length) lines.push(`<span><b>Tags:</b> ${event.tags.join(', ')}</span>`);
  if (event.numberOfChats !== null) lines.push(`<span><b>Chats:</b> ${event.numberOfChats}</span>`);
  if (event.revenue !== null) lines.push(`<span><b>Revenue:</b> ${formatCurrency(event.revenue)}</span>`);
  if (event.summary) lines.push(`<span><b>Summary:</b> ${event.summary}</span>`);

  return lines.join('<br>');
}

function showPopupForEvent(event, anchorEl) {
  popupEl.innerHTML = popupHtml(event);
  const rect = anchorEl.getBoundingClientRect();
  popupEl.style.top = `${window.scrollY + rect.bottom + 8}px`;
  popupEl.style.left = `${window.scrollX + rect.left}px`;
  popupEl.hidden = false;
}

function applySelectedEventStyling() {
  calendarEl.querySelectorAll('.event-item').forEach((el) => {
    el.classList.toggle('selected', el.dataset.eventId === state.anchoredEventId);
  });
}

function buildEventItem(event) {
  const item = document.createElement('div');
  item.className = 'event-item';
  item.dataset.eventId = event.id;
  item.textContent = `${event.title || 'Unknown'} (${event.games.length ? event.games.join(', ') : 'Unknown'})`;
  item.addEventListener('mouseenter', () => showPopupForEvent(event, item));
  item.addEventListener('mouseleave', hidePopupIfNotAnchored);
  item.addEventListener('click', (clickEvent) => {
    clickEvent.stopPropagation();
    state.anchoredEventId = state.anchoredEventId === event.id ? null : event.id;
    if (state.anchoredEventId) showPopupForEvent(event, item);
    else popupEl.hidden = true;
    applySelectedEventStyling();
  });
  return item;
}

function appendEventsToDayContainer(container, day) {
  const dayEvents = eventsForDay(day);
  const visibleEvents = dayEvents.slice(0, MAX_EVENTS_PER_DAY);
  visibleEvents.forEach((event) => container.appendChild(buildEventItem(event)));

  if (dayEvents.length > MAX_EVENTS_PER_DAY) {
    const more = document.createElement('div');
    more.className = 'event-more small';
    more.textContent = `+${dayEvents.length - MAX_EVENTS_PER_DAY} more`;
    container.appendChild(more);
  }
}

function renderMonth() {
  const firstDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  const weekNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const grid = document.createElement('div');
  grid.className = 'month-grid';

  weekNames.forEach((dayName) => {
    const header = document.createElement('div');
    header.className = 'weekday-header';
    header.textContent = dayName;
    grid.appendChild(header);
  });

  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (day.getMonth() !== state.currentDate.getMonth()) cell.classList.add('muted');

    const number = document.createElement('div');
    number.className = 'day-number';
    number.textContent = String(day.getDate());
    cell.appendChild(number);
    appendEventsToDayContainer(cell, day);
    grid.appendChild(cell);
  }

  calendarEl.replaceChildren(grid);
  periodTitleEl.textContent = state.currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  applySelectedEventStyling();
}

function highlightMatch(text, query) {
  const safeText = escapeHtml(text);
  if (!query) return safeText;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'ig');
  return safeText.replace(regex, '<mark>$1</mark>');
}

function renderSearchPagination(totalPages) {
  if (totalPages <= 1) {
    searchPaginationEl.replaceChildren();
    return;
  }

  const frag = document.createDocumentFragment();
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.textContent = 'Previous';
  prev.disabled = state.searchPage === 1;
  prev.addEventListener('click', () => {
    state.searchPage -= 1;
    renderSearchResults();
  });
  frag.appendChild(prev);

  for (let i = 1; i <= totalPages; i += 1) {
    const pageBtn = document.createElement('button');
    pageBtn.type = 'button';
    pageBtn.textContent = String(i);
    if (i === state.searchPage) pageBtn.classList.add('active-page');
    pageBtn.addEventListener('click', () => {
      state.searchPage = i;
      renderSearchResults();
    });
    frag.appendChild(pageBtn);
  }

  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Next';
  next.disabled = state.searchPage === totalPages;
  next.addEventListener('click', () => {
    state.searchPage += 1;
    renderSearchResults();
  });
  frag.appendChild(next);

  searchPaginationEl.replaceChildren(frag);
}

function renderSearchResults() {
  const total = state.searchResults.length;
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  state.searchPage = Math.min(state.searchPage, totalPages);

  const startIndex = (state.searchPage - 1) * SEARCH_PAGE_SIZE;
  const pageItems = state.searchResults.slice(startIndex, startIndex + SEARCH_PAGE_SIZE);

  if (total === 0) {
    searchResultsEl.innerHTML = '<div class="small">No results found.</div>';
    searchPaginationEl.replaceChildren();
    return;
  }

  const query = state.searchQuery.trim();
  searchResultsEl.innerHTML = pageItems.map((event) => {
    const date = event.startDate.toISOString().slice(0, 10);
    const games = event.games.join(', ');
    const tags = event.tags.join(', ');
    const summary = event.summary || '-';
    return `<article class="search-result-item">
      <h3>${highlightMatch(event.title, query)}</h3>
      <p><b>Date:</b> ${date}</p>
      <p><b>Game:</b> ${highlightMatch(games, query)}</p>
      <p><b>Tags:</b> ${highlightMatch(tags || '-', query)}</p>
      <p><b>Summary:</b> ${highlightMatch(summary, query)}</p>
    </article>`;
  }).join('');

  renderSearchPagination(totalPages);
}

function enterSearchMode() {
  state.searchMode = true;
  calendarEl.hidden = true;
  periodTitleEl.hidden = true;
  calendarControlsEl.hidden = true;
  popupEl.hidden = true;
  state.anchoredEventId = null;
  searchResultsSectionEl.hidden = false;
  exitSearchBtnEl.hidden = false;
}

function exitSearchMode() {
  state.searchMode = false;
  searchResultsSectionEl.hidden = true;
  exitSearchBtnEl.hidden = true;
  calendarEl.hidden = false;
  periodTitleEl.hidden = false;
  calendarControlsEl.hidden = false;
}

async function runSearch() {
  state.searchQuery = searchInputEl.value.trim();
  if (!state.searchQuery) {
    return;
  }

  await ensureEventsForSearch();
  state.searchResults = getFilteredEvents().sort((a, b) => (b.startDate - a.startDate) || (a.sequence - b.sequence));
  state.searchPage = 1;
  enterSearchMode();
  renderSearchResults();
}

async function renderCalendar() {
  await ensureEventsForCurrentView();
  renderMonth();
  datePickerEl.value = state.currentDate.toISOString().slice(0, 10);
}

async function moveMonth(direction) {
  const d = new Date(state.currentDate);
  d.setMonth(d.getMonth() + direction);
  state.currentDate = clampToMinDate(d);
  await renderCalendar();
}

prevBtnEl.addEventListener('click', async () => moveMonth(-1));
nextBtnEl.addEventListener('click', async () => moveMonth(1));
searchBtnEl.addEventListener('click', async () => runSearch());

searchInputEl.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    await runSearch();
  }
});

exitSearchBtnEl.addEventListener('click', async () => {
  exitSearchMode();
  await renderCalendar();
});

datePickerEl.addEventListener('change', async (event) => {
  const chosen = new Date(`${event.target.value}T00:00:00`);
  if (Number.isNaN(chosen.getTime())) return;
  state.currentDate = clampToMinDate(chosen);
  state.anchoredEventId = null;
  popupEl.hidden = true;
  await renderCalendar();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.event-item') && !event.target.closest('#eventPopup')) {
    state.anchoredEventId = null;
    popupEl.hidden = true;
    applySelectedEventStyling();
  }
});

(async function init() {
  state.currentDate = clampToMinDate(startOfDay(new Date()));
  await renderCalendar();
})();
