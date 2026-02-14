const MIN_DATE = new Date('2021-01-01T00:00:00');

const state = {
  viewMode: 'month',
  currentDate: new Date(),
  events: [],
  searchQuery: '',
  selectedTag: 'all',
  quarterCache: new Map()
};

const calendarEl = document.getElementById('calendar');
const periodTitleEl = document.getElementById('periodTitle');
const viewModeEl = document.getElementById('viewMode');
const datePickerEl = document.getElementById('datePicker');
const prevBtnEl = document.getElementById('prevBtn');
const nextBtnEl = document.getElementById('nextBtn');
const searchInputEl = document.getElementById('searchInput');
const tagFilterEl = document.getElementById('tagFilter');

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseCsv(csvText) {
  const trimmed = csvText.trim();
  if (!trimmed) {
    return [];
  }

  const [headerLine, ...lines] = trimmed.split(/\r?\n/);
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row = Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
      const start = new Date(row.start);
      const end = row.end ? new Date(row.end) : new Date(row.start);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
      }

      return {
        title: row.title || 'Untitled Event',
        start: startOfDay(start),
        end: startOfDay(end),
        tags: (row.tags || '')
          .split('|')
          .map((tag) => tag.trim())
          .filter(Boolean)
      };
    })
    .filter(Boolean);
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
  if (state.quarterCache.has(key)) {
    return state.quarterCache.get(key);
  }

  const path = quarterFilePath(key);
  let events = [];

  try {
    const response = await fetch(path);
    if (response.ok) {
      const csvText = await response.text();
      events = parseCsv(csvText);
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
    if (!keys.includes(key)) {
      keys.push(key);
    }
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

function weekVisibleRange(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: startOfDay(start), end: startOfDay(end) };
}

async function ensureEventsForCurrentView() {
  const { start, end } = state.viewMode === 'month' ? monthVisibleRange(state.currentDate) : weekVisibleRange(state.currentDate);
  const neededKeys = quarterKeysInRange(start, end);

  await Promise.all(neededKeys.map((key) => loadQuarterEvents(key)));
  state.events = [...state.quarterCache.values()].flat();
}

function dateLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function clampToMinDate(date) {
  return date < MIN_DATE ? new Date(MIN_DATE) : date;
}

function getFilteredEvents() {
  const query = state.searchQuery.trim().toLowerCase();
  return state.events.filter((event) => {
    const matchesTag = state.selectedTag === 'all' || event.tags.includes(state.selectedTag);
    if (!matchesTag) {
      return false;
    }

    if (!query) {
      return true;
    }

    const titleMatch = event.title.toLowerCase().includes(query);
    const tagMatch = event.tags.some((tag) => tag.toLowerCase().includes(query));
    return titleMatch || tagMatch;
  });
}

function eventsForDay(day) {
  return getFilteredEvents().filter((event) => day >= event.start && day <= event.end);
}

function renderTagFilterOptions() {
  const allTags = [...new Set(state.events.flatMap((event) => event.tags))].sort((a, b) => a.localeCompare(b));
  const previousTag = state.selectedTag;

  tagFilterEl.innerHTML = '<option value="all">All tags</option>';
  allTags.forEach((tag) => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    tagFilterEl.appendChild(option);
  });

  state.selectedTag = allTags.includes(previousTag) ? previousTag : 'all';
  tagFilterEl.value = state.selectedTag;
}

function renderMonth() {
  const firstDay = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
  const monthStartWeekday = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - monthStartWeekday);

  const fragment = document.createDocumentFragment();
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
    if (day.getMonth() !== state.currentDate.getMonth()) {
      cell.classList.add('muted');
    }

    const number = document.createElement('div');
    number.className = 'day-number';
    number.textContent = String(day.getDate());
    cell.appendChild(number);

    eventsForDay(day).forEach((event) => {
      const item = document.createElement('div');
      item.className = 'event-item';
      item.textContent = event.title;
      cell.appendChild(item);
    });

    grid.appendChild(cell);
  }

  fragment.appendChild(grid);
  calendarEl.replaceChildren(fragment);

  periodTitleEl.textContent = state.currentDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return startOfDay(d);
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
      matches.forEach((event) => {
        const item = document.createElement('div');
        item.className = 'event-item';
        item.textContent = event.title;
        dayBlock.appendChild(item);
      });
    }

    list.appendChild(dayBlock);
  }

  calendarEl.replaceChildren(list);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  periodTitleEl.textContent = `${dateLabel(weekStart)} - ${dateLabel(weekEnd)}`;
}

async function renderCalendar() {
  await ensureEventsForCurrentView();
  renderTagFilterOptions();

  if (state.viewMode === 'month') {
    renderMonth();
  } else {
    renderWeek();
  }
  datePickerEl.value = state.currentDate.toISOString().slice(0, 10);
}

async function movePeriod(direction) {
  const d = new Date(state.currentDate);
  if (state.viewMode === 'month') {
    d.setMonth(d.getMonth() + direction);
  } else {
    d.setDate(d.getDate() + direction * 7);
  }
  state.currentDate = clampToMinDate(d);
  await renderCalendar();
}

viewModeEl.addEventListener('change', async (event) => {
  state.viewMode = event.target.value;
  await renderCalendar();
});

prevBtnEl.addEventListener('click', async () => movePeriod(-1));
nextBtnEl.addEventListener('click', async () => movePeriod(1));

searchInputEl.addEventListener('input', (event) => {
  state.searchQuery = event.target.value;
  if (state.viewMode === 'month') {
    renderMonth();
  } else {
    renderWeek();
  }
});

tagFilterEl.addEventListener('change', (event) => {
  state.selectedTag = event.target.value;
  if (state.viewMode === 'month') {
    renderMonth();
  } else {
    renderWeek();
  }
});

datePickerEl.addEventListener('change', async (event) => {
  const chosen = new Date(`${event.target.value}T00:00:00`);
  if (Number.isNaN(chosen.getTime())) {
    return;
  }
  state.currentDate = clampToMinDate(chosen);
  await renderCalendar();
});

(async function init() {
  state.currentDate = clampToMinDate(startOfDay(new Date()));
  await renderCalendar();
})();
