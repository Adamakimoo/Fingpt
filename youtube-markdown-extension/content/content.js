/**
 * YouTube content script.
 * Runs on youtube.com pages to extract video metadata and add save buttons.
 */

(function () {
  'use strict';

  let currentVideoId = null;
  let fabElement = null;

  // ── Initialization ──

  function init() {
    observeNavigation();
    handlePage();
  }

  /**
   * YouTube is a SPA - listen for navigation events.
   */
  function observeNavigation() {
    // YouTube fires this custom event on SPA navigation
    document.addEventListener('yt-navigate-finish', handlePage);

    // Fallback: watch for URL changes
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handlePage();
      }
    }).observe(document.body, { subtree: true, childList: true });
  }

  function handlePage() {
    const videoId = getVideoIdFromUrl();
    if (videoId && videoId !== currentVideoId) {
      currentVideoId = videoId;
      injectFAB();
    } else if (!videoId) {
      currentVideoId = null;
      removeFAB();
    }

    // Check if on playlist page
    if (isPlaylistPage()) {
      injectPlaylistSaveButton();
    }
  }

  // ── URL Parsing ──

  function getVideoIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  function getPlaylistIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('list');
  }

  function isPlaylistPage() {
    return window.location.pathname === '/playlist' || getPlaylistIdFromUrl();
  }

  // ── Video Metadata Extraction ──

  function extractVideoMetadata() {
    const videoId = getVideoIdFromUrl();
    if (!videoId) return null;

    const title = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string'
    )?.textContent?.trim() || document.title.replace(' - YouTube', '').trim();

    const channel = document.querySelector(
      '#channel-name yt-formatted-string a, ytd-channel-name yt-formatted-string a'
    )?.textContent?.trim() || '';

    const description = document.querySelector(
      '#description-inline-expander yt-formatted-string, #description yt-formatted-string'
    )?.textContent?.trim() || '';

    const durationEl = document.querySelector('.ytp-time-duration');
    const duration = durationEl?.textContent?.trim() || '';

    const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    return {
      videoId,
      title,
      channel,
      description: description.substring(0, 500),
      duration,
      thumbnail,
      url
    };
  }

  // ── Playlist Extraction ──

  function extractPlaylistData() {
    const playlistId = getPlaylistIdFromUrl();
    if (!playlistId) return null;

    const titleEl = document.querySelector(
      'h1#title yt-formatted-string, .metadata-wrapper yt-formatted-string'
    );
    const title = titleEl?.textContent?.trim() || 'Untitled Playlist';

    const videoElements = document.querySelectorAll(
      'ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer'
    );

    const videos = Array.from(videoElements).map((el, index) => {
      const linkEl = el.querySelector('a#video-title, a.yt-simple-endpoint');
      const href = linkEl?.getAttribute('href') || '';
      const vidMatch = href.match(/[?&]v=([^&]+)/);
      const vidId = vidMatch ? vidMatch[1] : '';

      return {
        videoId: vidId,
        title: linkEl?.textContent?.trim() || '',
        position: index + 1
      };
    }).filter(v => v.videoId);

    return {
      playlistId,
      title,
      videoIds: videos.map(v => v.videoId),
      videos
    };
  }

  // ── Floating Action Button ──

  function injectFAB() {
    removeFAB();

    fabElement = document.createElement('div');
    fabElement.id = 'ytmd-fab';
    fabElement.innerHTML = `
      <button id="ytmd-save-btn" title="Save to YouTube Markdown">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Save</span>
      </button>
      <button id="ytmd-transcribe-btn" title="Transcribe this video">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 6h16M4 12h16M4 18h10"/>
        </svg>
        <span>Transcribe</span>
      </button>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #ytmd-fab {
        position: fixed;
        bottom: 80px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-family: 'YouTube Sans', 'Roboto', Arial, sans-serif;
      }
      #ytmd-fab button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: none;
        border-radius: 20px;
        background: #cc0000;
        color: white;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        transition: background 0.2s, transform 0.1s;
      }
      #ytmd-fab button:hover {
        background: #aa0000;
        transform: scale(1.05);
      }
      #ytmd-fab button.success {
        background: #2e7d32;
      }
      #ytmd-fab button.loading {
        opacity: 0.7;
        pointer-events: none;
      }
      #ytmd-fab .ytmd-toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: #323232;
        color: white;
        border-radius: 8px;
        font-size: 13px;
        z-index: 10000;
        animation: ytmd-fade-in 0.3s;
      }
      @keyframes ytmd-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(fabElement);

    // Event listeners
    document.getElementById('ytmd-save-btn').addEventListener('click', handleSave);
    document.getElementById('ytmd-transcribe-btn').addEventListener('click', handleTranscribe);
  }

  function removeFAB() {
    if (fabElement) {
      fabElement.remove();
      fabElement = null;
    }
  }

  function injectPlaylistSaveButton() {
    if (document.getElementById('ytmd-playlist-save')) return;

    const header = document.querySelector(
      'ytd-playlist-header-renderer .metadata-action-bar, #top-level-buttons-computed'
    );
    if (!header) return;

    const btn = document.createElement('button');
    btn.id = 'ytmd-playlist-save';
    btn.textContent = 'Save Playlist to Markdown';
    btn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #cc0000;
      border-radius: 20px;
      background: transparent;
      color: #cc0000;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      margin-left: 8px;
    `;
    btn.addEventListener('click', handlePlaylistSave);
    header.appendChild(btn);
  }

  // ── Action Handlers ──

  async function handleSave() {
    const btn = document.getElementById('ytmd-save-btn');
    btn.classList.add('loading');
    btn.querySelector('span').textContent = 'Saving...';

    const metadata = extractVideoMetadata();
    if (!metadata) {
      showToast('Could not extract video info.');
      btn.classList.remove('loading');
      btn.querySelector('span').textContent = 'Save';
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveVideo',
        data: metadata
      });

      if (response.success) {
        btn.classList.remove('loading');
        btn.classList.add('success');
        btn.querySelector('span').textContent = 'Saved!';
        showToast(`Saved: ${metadata.title}`);
        setTimeout(() => {
          btn.classList.remove('success');
          btn.querySelector('span').textContent = 'Save';
        }, 2000);
      }
    } catch (err) {
      btn.classList.remove('loading');
      btn.querySelector('span').textContent = 'Save';
      showToast('Error saving video.');
    }
  }

  async function handleTranscribe() {
    const btn = document.getElementById('ytmd-transcribe-btn');
    btn.classList.add('loading');
    btn.querySelector('span').textContent = 'Transcribing...';

    const videoId = getVideoIdFromUrl();
    if (!videoId) {
      showToast('No video found.');
      btn.classList.remove('loading');
      btn.querySelector('span').textContent = 'Transcribe';
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'transcribeVideo',
        data: { videoId }
      });

      if (response.success) {
        btn.classList.remove('loading');
        btn.classList.add('success');
        btn.querySelector('span').textContent = 'Transcribed!';
        showToast('Transcript saved!');
        setTimeout(() => {
          btn.classList.remove('success');
          btn.querySelector('span').textContent = 'Transcribe';
        }, 2000);
      } else {
        throw new Error(response.error || 'Transcription failed');
      }
    } catch (err) {
      btn.classList.remove('loading');
      btn.querySelector('span').textContent = 'Transcribe';
      showToast(err.message || 'Transcription failed.');
    }
  }

  async function handlePlaylistSave() {
    const data = extractPlaylistData();
    if (!data) {
      showToast('Could not extract playlist data.');
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        action: 'savePlaylist',
        data
      });
      showToast(`Saved playlist: ${data.title} (${data.videoIds.length} videos)`);
    } catch (err) {
      showToast('Error saving playlist.');
    }
  }

  // ── Toast Notifications ──

  function showToast(message, duration = 3000) {
    const existing = document.querySelector('.ytmd-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'ytmd-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), duration);
  }

  // ── Listen for messages from popup/background ──

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'getVideoMetadata') {
      sendResponse(extractVideoMetadata());
    } else if (msg.action === 'getPlaylistData') {
      sendResponse(extractPlaylistData());
    }
    return true;
  });

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
