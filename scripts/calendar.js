const MIN_DATE = new Date('2021-01-01T00:00:00');
const MAX_EVENTS_PER_DAY = 3;

const state = {
  viewMode: 'month',
  currentDate: new Date(),
  events: [],
  searchQuery: '',
  quarterCache: new Map(),
  anchoredEventId: null
};

const calendarEl = document.getElementById('calendar');
const periodTitleEl = document.getElementById('periodTitle');
const viewModeEl = document.getElementById('viewMode');
const datePickerEl = document.getElementById('datePicker');
const prevBtnEl = document.getElementById('prevBtn');
const nextBtnEl = document.getElementById('nextBtn');
const searchInputEl = document.getElementById('searchInput');
const popupEl = document.getElementById('eventPopup');

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
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
  return rawValue
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseCsv(csvText) {
  const trimmed = csvText.trim();
  if (!trimmed) return [];

  const [headerLine, ...lines] = trimmed.split(/\r?\n/);
  const headers = splitCsvLine(headerLine).map((h) => h.toLowerCase());

  return lines
    .filter(Boolean)
    .map((line, index) => {
      const values = splitCsvLine(line);
      const row = Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));

      const startDate = new Date(row.start_date);
      const rawEndDate = row.end_date ? new Date(row.end_date) : null;

      if (Number.isNaN(startDate.getTime())) {
        return null;
      }

      const endDate = rawEndDate && !Number.isNaN(rawEndDate.getTime()) ? rawEndDate : startDate;

      const chatValue = row.number_of_chats?.trim();
      const revenueValue = row.revenue?.trim();
      const chats = chatValue ? Number(chatValue) : null;
      const revenue = revenueValue ? Number(revenueValue) : null;

      return {
        id: `${row.title || 'unknown'}-${row.start_date}-${index}`,
        title: row.title?.trim() || 'Unknown',
        startDate: startOfDay(startDate),
        endDate: startOfDay(endDate),
        startTime: row.start_time?.trim() || '',
        endTime: row.end_time?.trim() || '',
        games: toList(row.game),
        tags: toList(row.tags),
        summary: row.summary?.trim() || '',
        numberOfChats: Number.isNaN(chats) ? null : chats,
        revenue: Number.isNaN(revenue) ? null : revenue
      };
    })
    .filter(Boolean)
    .map((event) => ({
      ...event,
      games: event.games.length ? event.games : ['Unknown']
    }));
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
      events = parseCsv(await response.text());
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

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return startOfDay(d);
}

function weekVisibleRange(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

async function ensureEventsForCurrentView() {
  const { start, end } = state.viewMode === 'month' ? monthVisibleRange(state.currentDate) : weekVisibleRange(state.currentDate);
  await Promise.all(quarterKeysInRange(start, end).map((key) => loadQuarterEvents(key)));
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
  return getFilteredEvents().filter((event) => isSameDay(event.startDate, day));
}

function dateLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function hidePopupIfNotAnchored() {
  if (!state.anchoredEventId) popupEl.hidden = true;
}

function popupHtml(event) {
  const lines = [
    `<strong>${event.title || 'Unknown'}</strong>`,
    `<span><b>Game:</b> ${event.games.length ? event.games.join(', ') : 'Unknown'}</span>`
  ];

  if (event.startDate || event.endDate) {
    const start = event.startDate.toISOString().slice(0, 10);
    const end = event.endDate.toISOString().slice(0, 10);
    const dateText = start === end ? start : `${start} to ${end}`;
    lines.push(`<span><b>Date:</b> ${dateText}</span>`);
  }
  if (event.startTime || event.endTime) {
    lines.push(`<span><b>Time:</b> ${event.startTime || '-'} to ${event.endTime || '-'}</span>`);
  }
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

function renderWeek() {
  const weekStart = startOfWeek(state.currentDate);
  const list = document.createElement('div');
  list.className = 'week-list';

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);

    const dayBlock = document.createElement('div');
    dayBlock.className = 'week-day';

    const heading = document.createElement('strong');
    heading.textContent = day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    dayBlock.appendChild(heading);

    const matches = eventsForDay(day);
    if (matches.length === 0) {
      const none = document.createElement('div');
      none.className = 'small';
      none.textContent = 'No events';
      dayBlock.appendChild(none);
    } else {
      appendEventsToDayContainer(dayBlock, day);
    }

    list.appendChild(dayBlock);
  }

  calendarEl.replaceChildren(list);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  periodTitleEl.textContent = `${dateLabel(weekStart)} - ${dateLabel(weekEnd)}`;
  applySelectedEventStyling();
}

async function renderCalendar() {
  await ensureEventsForCurrentView();
  if (state.viewMode === 'month') renderMonth();
  else renderWeek();
  datePickerEl.value = state.currentDate.toISOString().slice(0, 10);
}

async function movePeriod(direction) {
  const d = new Date(state.currentDate);
  if (state.viewMode === 'month') d.setMonth(d.getMonth() + direction);
  else d.setDate(d.getDate() + direction * 7);
  state.currentDate = clampToMinDate(d);
  await renderCalendar();
}

viewModeEl.addEventListener('change', async (event) => {
  state.viewMode = event.target.value;
  state.anchoredEventId = null;
  popupEl.hidden = true;
  await renderCalendar();
});

prevBtnEl.addEventListener('click', async () => movePeriod(-1));
nextBtnEl.addEventListener('click', async () => movePeriod(1));

searchInputEl.addEventListener('input', (event) => {
  state.searchQuery = event.target.value;
  state.anchoredEventId = null;
  popupEl.hidden = true;
  if (state.viewMode === 'month') renderMonth();
  else renderWeek();
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
