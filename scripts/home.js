async function resolveLiveStatus() {
  if (typeof window.checkLiveStatus !== 'function') {
    return false;
  }

  try {
    const result = window.checkLiveStatus();
    return typeof result?.then === 'function' ? Boolean(await result) : Boolean(result);
  } catch (error) {
    console.warn('checkLiveStatus 调用失败，改为离线视觉：', error);
    return false;
  }
}

function renderLiveVisuals(isLive) {
  const liveVisualEl = document.getElementById('liveVisual');
  const offlineVisualEl = document.getElementById('offlineVisual');

  if (!liveVisualEl || !offlineVisualEl) {
    return;
  }

  liveVisualEl.hidden = !isLive;
  offlineVisualEl.hidden = isLive;
}

(async function initHomeVisuals() {
  const isLive = await resolveLiveStatus();
  renderLiveVisuals(isLive);
})();
