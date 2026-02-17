const canvas = document.getElementById('lineChart');
const ctx = canvas.getContext('2d');

function parseCsv(csvText) {
  const [headerLine, ...lines] = csvText.trim().split(/\r?\n/);
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());
  const dateIndex = headers.indexOf('date');
  const valueIndex = headers.indexOf('value');

  return lines
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(',').map((v) => v.trim());
      const date = new Date(cols[dateIndex]);
      const value = Number(cols[valueIndex]);
      if (Number.isNaN(date.getTime()) || Number.isNaN(value)) {
        return null;
      }
      return { date, value };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

function drawChart(points) {
  const width = canvas.width;
  const height = canvas.height;
  const pad = { top: 35, right: 30, bottom: 45, left: 55 };

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (points.length === 0) {
    ctx.fillStyle = '#111827';
    ctx.font = '16px Arial';
    ctx.fillText('No valid data found in CSV.', 25, 40);
    return;
  }

  const minValue = Math.min(...points.map((p) => p.value));
  const maxValue = Math.max(...points.map((p) => p.value));
  const minTime = points[0].date.getTime();
  const maxTime = points[points.length - 1].date.getTime();

  const xScale = (time) => {
    if (maxTime === minTime) return pad.left;
    return pad.left + ((time - minTime) / (maxTime - minTime)) * (width - pad.left - pad.right);
  };

  const yScale = (val) => {
    if (maxValue === minValue) return (height - pad.bottom + pad.top) / 2;
    return height - pad.bottom - ((val - minValue) / (maxValue - minValue)) * (height - pad.top - pad.bottom);
  };

  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  ctx.fillStyle = '#374151';
  ctx.font = '12px Arial';
  ctx.fillText(minValue.toFixed(2), 8, height - pad.bottom);
  ctx.fillText(maxValue.toFixed(2), 8, pad.top + 4);
  ctx.fillText(points[0].date.toISOString().slice(0, 10), pad.left, height - 12);
  ctx.fillText(points[points.length - 1].date.toISOString().slice(0, 10), width - pad.right - 85, height - 12);

  ctx.strokeStyle = '#2b6de0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xScale(point.date.getTime());
    const y = yScale(point.value);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = '#2b6de0';
  points.forEach((point) => {
    const x = xScale(point.date.getTime());
    const y = yScale(point.value);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

(async function init() {
  const response = await fetch('data/line-data.csv');
  const csvText = await response.text();
  const points = parseCsv(csvText);
  drawChart(points);
})();
