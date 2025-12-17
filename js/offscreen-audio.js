let currentAudio = null;
let currentObjectUrl = null;

function stopCurrent() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = '';
    } catch {}
  }
  currentAudio = null;

  if (currentObjectUrl) {
    try {
      URL.revokeObjectURL(currentObjectUrl);
    } catch {}
  }
  currentObjectUrl = null;
}

function guessMimeType(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('.mp3')) return 'audio/mpeg';
  if (u.includes('.ogg') || u.includes('.oga')) return 'audio/ogg';
  if (u.includes('.wav')) return 'audio/wav';
  return '';
}

async function playFromRemoteUrl(url) {
  stopCurrent();

  const audio = new Audio();
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.src = url;
  currentAudio = audio;

  await audio.play();
}

async function playViaFetchBlob(url) {
  stopCurrent();

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = await response.arrayBuffer();
  const type = response.headers.get('content-type') || guessMimeType(url) || 'audio/mpeg';

  const blob = new Blob([buffer], { type });
  const objectUrl = URL.createObjectURL(blob);
  currentObjectUrl = objectUrl;

  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = objectUrl;
  currentAudio = audio;

  audio.addEventListener(
    'ended',
    () => {
      if (currentObjectUrl) {
        try {
          URL.revokeObjectURL(currentObjectUrl);
        } catch {}
        currentObjectUrl = null;
      }
    },
    { once: true }
  );

  await audio.play();
}

async function playAny(urls) {
  let lastError = null;

  for (const url of urls) {
    try {
      await playFromRemoteUrl(url);
      return;
    } catch (e) {
      lastError = e;
    }

    try {
      await playViaFetchBlob(url);
      return;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('No supported audio source');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'offscreenStopAudio') {
    stopCurrent();
    sendResponse?.({ success: true });
    return;
  }

  if (message?.action !== 'offscreenPlayAudioUrls') return;

  (async () => {
    try {
      const urls = Array.isArray(message.urls) ? message.urls.filter(Boolean) : [];
      if (!urls.length) throw new Error('No audio URLs');

      await playAny(urls);
      sendResponse?.({ success: true });
    } catch (error) {
      sendResponse?.({ success: false, message: error?.message || String(error) });
    }
  })();

  return true;
});
