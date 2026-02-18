const MIN_DATE = new Date('2021-01-01T00:00:00');

const canvas = document.getElementById('lineChart');
const ctx = canvas.getContext('2d');
const startDateEl = document.getElementById('startDate');
const endDateEl = document.getElementById('endDate');
const applyRangeBtnEl = document.getElementById('applyRangeBtn');

const state = {
  quarterCache: new Map(),
  allEvents: [],
  filteredEvents: []
};

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseCsv(csvText) {
  const trimmed = csvText.trim();
  if (!trimmed) return [];

  const [headerLine, ...lines] = trimmed.split(/\r?\n/);
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row = Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
      const startDate = new Date(row.start_date);
      const chats = Number(row.number_of_chats ?? 0);
      const revenue = Number(row.revenue ?? 0);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(chats) || Number.isNaN(revenue)) {
        return null;
      }

      return {
        startDate: startOfDay(startDate),
        numberOfChats: chats,
        revenue
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startDate - b.startDate);
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

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    bg: styles.getPropertyValue('--canvas-bg').trim() || '#ffffff',
    axis: styles.getPropertyValue('--axis').trim() || '#d1d5db',
    text: styles.getPropertyValue('--text').trim() || '#374151',
    chats: '#60a5fa',
    revenue: '#f59e0b'
  };
}

function drawNoData(theme) {
  ctx.fillStyle = theme.text;
  ctx.font = '16px Calibri, "Microsoft YaHei", sans-serif';
  ctx.fillText('No data in selected date range.', 25, 40);
}

function drawChart(events) {
  const width = canvas.width;
  const height = canvas.height;
  const pad = { top: 35, right: 60, bottom: 45, left: 60 };
  const theme = getThemeColors();

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  if (events.length === 0) {
    drawNoData(theme);
    return;
  }

  const minTime = events[0].startDate.getTime();
  const maxTime = events[events.length - 1].startDate.getTime();

  const maxChats = Math.max(...events.map((e) => e.numberOfChats), 1);
  const maxRevenue = Math.max(...events.map((e) => e.revenue), 1);

  const xScale = (time) => {
    if (maxTime === minTime) return pad.left;
    return pad.left + ((time - minTime) / (maxTime - minTime)) * (width - pad.left - pad.right);
  };

  const yChats = (value) => height - pad.bottom - (value / maxChats) * (height - pad.top - pad.bottom);
  const yRevenue = (value) => height - pad.bottom - (value / maxRevenue) * (height - pad.top - pad.bottom);

  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  ctx.fillStyle = theme.text;
  ctx.font = '12px Calibri, "Microsoft YaHei", sans-serif';
  ctx.fillText('Chats', 10, pad.top + 5);
  ctx.fillText('Revenue', width - 52, pad.top + 5);
  ctx.fillText(events[0].startDate.toISOString().slice(0, 10), pad.left, height - 12);
  ctx.fillText(events[events.length - 1].startDate.toISOString().slice(0, 10), width - pad.right - 90, height - 12);
  ctx.fillText(String(maxChats), 10, pad.top + 22);
  ctx.fillText(String(maxRevenue), width - 52, pad.top + 22);

  ctx.strokeStyle = theme.chats;
  ctx.lineWidth = 2;
  ctx.beginPath();
  events.forEach((e, i) => {
    const x = xScale(e.startDate.getTime());
    const y = yChats(e.numberOfChats);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = theme.revenue;
  ctx.lineWidth = 2;
  ctx.beginPath();
  events.forEach((e, i) => {
    const x = xScale(e.startDate.getTime());
    const y = yRevenue(e.revenue);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = theme.chats;
  ctx.fillRect(pad.left, pad.top - 18, 10, 10);
  ctx.fillStyle = theme.text;
  ctx.fillText('Number of Chats', pad.left + 14, pad.top - 9);

  ctx.fillStyle = theme.revenue;
  ctx.fillRect(pad.left + 140, pad.top - 18, 10, 10);
  ctx.fillStyle = theme.text;
  ctx.fillText('Revenue', pad.left + 154, pad.top - 9);
}

async function ensureDataForRange(startDate, endDate) {
  const keys = quarterKeysInRange(startDate, endDate);
  await Promise.all(keys.map((k) => loadQuarterEvents(k)));
  state.allEvents = [...state.quarterCache.values()].flat().sort((a, b) => a.startDate - b.startDate);
}

function parseRangeInputs() {
  const start = new Date(`${startDateEl.value}T00:00:00`);
  const end = new Date(`${endDateEl.value}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return null;
  }
  return { start: startOfDay(start), end: startOfDay(end) };
}

async function applyRange() {
  const range = parseRangeInputs();
  if (!range) {
    drawChart([]);
    return;
  }

  await ensureDataForRange(range.start, range.end);
  state.filteredEvents = state.allEvents.filter((e) => e.startDate >= range.start && e.startDate <= range.end);
  drawChart(state.filteredEvents);
}

document.addEventListener('themechange', () => {
  drawChart(state.filteredEvents);
});

applyRangeBtnEl.addEventListener('click', async () => {
  await applyRange();
});

(async function init() {
  const today = startOfDay(new Date());
  const defaultStart = new Date(today);
  defaultStart.setMonth(defaultStart.getMonth() - 6);

  startDateEl.value = (defaultStart < MIN_DATE ? MIN_DATE : defaultStart).toISOString().slice(0, 10);
  endDateEl.value = today.toISOString().slice(0, 10);
  await applyRange();
})();
