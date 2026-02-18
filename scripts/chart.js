const MIN_DATE = new Date('2021-01-01T00:00:00');

const canvas = document.getElementById('lineChart');
const ctx = canvas.getContext('2d');
const startDateEl = document.getElementById('startDate');
const endDateEl = document.getElementById('endDate');
const applyRangeBtnEl = document.getElementById('applyRangeBtn');
const recentStreamsBodyEl = document.getElementById('recentStreamsBody');

const state = {
  quarterCache: new Map(),
  allEvents: [],
  filteredEvents: []
};

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function decodeUtf8(buffer) {
  return new TextDecoder('utf-8').decode(buffer);
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
  const trimmed = csvText.replace(/^\uFEFF/, '').trim();
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

      const chatsRaw = row.number_of_chats?.trim();
      const revenueRaw = row.revenue?.trim();
      const chats = chatsRaw ? Number(chatsRaw) : null;
      const revenue = revenueRaw ? Number(revenueRaw) : null;

      const games = toList(row.game);

      return {
        id: `${row.title || 'unknown'}-${row.start_date}-${index}`,
        sequence: index,
        startDate: startOfDay(startDate),
        title: row.title?.trim() || 'Unknown',
        game: games.length ? games.join(', ') : 'Unknown',
        numberOfChats: Number.isNaN(chats) ? null : chats,
        revenue: Number.isNaN(revenue) ? null : revenue
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.startDate - b.startDate) || (a.sequence - b.sequence));
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
  ctx.fillText('No complete chat/revenue data in selected date range.', 25, 40);
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

function renderRecentStreamsTable(streams) {
  const latest = [...streams]
    .sort((a, b) => (b.startDate - a.startDate) || (a.sequence - b.sequence))
    .slice(0, 7);

  if (latest.length === 0) {
    recentStreamsBodyEl.innerHTML = '<tr><td colspan="5" class="small">No stream records in selected range.</td></tr>';
    return;
  }

  recentStreamsBodyEl.innerHTML = latest
    .map((stream) => {
      const date = stream.startDate.toISOString().slice(0, 10);
      const chats = stream.numberOfChats === null ? '-' : String(stream.numberOfChats);
      const revenue = stream.revenue === null ? '-' : String(stream.revenue);
      return `<tr>
        <td>${date}</td>
        <td>${stream.title || 'Unknown'}</td>
        <td>${stream.game || 'Unknown'}</td>
        <td>${chats}</td>
        <td>${revenue}</td>
      </tr>`;
    })
    .join('');
}

async function ensureDataForRange(startDate, endDate) {
  const keys = quarterKeysInRange(startDate, endDate);
  await Promise.all(keys.map((k) => loadQuarterEvents(k)));
  state.allEvents = [...state.quarterCache.values()].flat().sort((a, b) => (a.startDate - b.startDate) || (a.sequence - b.sequence));
}

function parseRangeInputs() {
  const start = new Date(`${startDateEl.value}T00:00:00`);
  const end = new Date(`${endDateEl.value}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null;
  return { start: startOfDay(start), end: startOfDay(end) };
}

async function applyRange() {
  const range = parseRangeInputs();
  if (!range) {
    drawChart([]);
    renderRecentStreamsTable([]);
    return;
  }

  await ensureDataForRange(range.start, range.end);
  const inRange = state.allEvents.filter((e) => e.startDate >= range.start && e.startDate <= range.end);

  state.filteredEvents = inRange.filter((e) => e.numberOfChats !== null && e.revenue !== null);
  drawChart(state.filteredEvents);
  renderRecentStreamsTable(inRange);
}

document.addEventListener('themechange', () => drawChart(state.filteredEvents));
applyRangeBtnEl.addEventListener('click', async () => applyRange());

(async function init() {
  const today = startOfDay(new Date());
  const defaultStart = new Date(today);
  defaultStart.setMonth(defaultStart.getMonth() - 6);

  startDateEl.value = (defaultStart < MIN_DATE ? MIN_DATE : defaultStart).toISOString().slice(0, 10);
  endDateEl.value = today.toISOString().slice(0, 10);
  await applyRange();
})();
