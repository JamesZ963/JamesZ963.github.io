async function resolveLiveStatus() {
  const apiUrl = `https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomPlayInfo?room_id=1962720`;
  const response = await fetch(apiUrl);
  const data = await response.json();
    
  // 检查API返回的代码，0 代表成功
  if (data.code === 0) {
      const liveStatus = data.data.live_status;
            
      // 根据 live_status 的值来判断状态
        if (liveStatus === 1) {
            return true;
        } else if (liveStatus === 2) {
            return true;
        } else {
            return false;
        }
  } else {
      return false;}

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
