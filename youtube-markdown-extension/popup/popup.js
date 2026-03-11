/**
 * Popup dashboard logic for YouTube Markdown Extension.
 */

import { copyToClipboard } from '../lib/export-clipboard.js';
import { saveToObsidian } from '../lib/export-obsidian.js';
import { uploadToDrive } from '../lib/export-drive.js';
import { sanitizeFilename } from '../lib/markdown.js';

// ── State ──
let currentVideoMeta = null;
let allVideos = [];
let allPlaylists = [];
let activeTag = null;
let currentAIContent = null;

// ── Initialization ──

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupTabs();
  setupEventListeners();
  await loadCurrentVideo();
  await loadLibrary();
  await loadPlaylists();
  await updateStats();
}

// ── Tab Navigation ──

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });
}

// ── Event Listeners ──

function setupEventListeners() {
  // Settings
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Current video actions
  document.getElementById('btn-save-current').addEventListener('click', handleSaveCurrent);
  document.getElementById('btn-transcribe-current').addEventListener('click', handleTranscribeCurrent);
  document.getElementById('btn-summarize-current').addEventListener('click', handleSummarizeCurrent);

  // Search
  document.getElementById('search-input').addEventListener('input', handleSearch);

  // Export actions
  document.getElementById('export-video-select').addEventListener('change', handleExportVideoChange);
  document.getElementById('export-template-select').addEventListener('change', handlePreviewUpdate);
  document.getElementById('btn-gen-summary').addEventListener('click', () => generateAI('summarize'));
  document.getElementById('btn-gen-study').addEventListener('click', () => generateAI('generateStudyNotes'));
  document.getElementById('btn-gen-skills').addEventListener('click', () => generateAI('generateSkillsFile'));
  document.getElementById('btn-gen-blog').addEventListener('click', () => generateAI('generateBlogDraft'));
  document.getElementById('btn-export-clipboard').addEventListener('click', () => exportTo('clipboard'));
  document.getElementById('btn-export-download').addEventListener('click', () => exportTo('download'));
  document.getElementById('btn-export-obsidian').addEventListener('click', () => exportTo('obsidian'));
  document.getElementById('btn-export-drive').addEventListener('click', () => exportTo('drive'));
}

// ── Current Video Tab ──

async function loadCurrentVideo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('youtube.com/watch')) {
      showCurrentEmpty();
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoMetadata' });
    if (response) {
      currentVideoMeta = response;
      displayCurrentVideo(response);

      // Check if already saved
      const saved = await sendMessage('getVideo', { videoId: response.videoId });
      if (saved.data) {
        currentVideoMeta = { ...currentVideoMeta, ...saved.data };
        document.getElementById('btn-save-current').textContent = 'Saved';
        document.getElementById('btn-save-current').classList.add('btn-success');

        if (saved.data.transcript) {
          showTranscriptPreview(saved.data.transcript);
        }
        if (saved.data.summary) {
          showSummaryPreview(saved.data.summary);
        }
      }
    } else {
      showCurrentEmpty();
    }
  } catch {
    showCurrentEmpty();
  }
}

function showCurrentEmpty() {
  document.getElementById('current-no-video').classList.remove('hidden');
  document.getElementById('current-video-details').classList.add('hidden');
}

function displayCurrentVideo(meta) {
  document.getElementById('current-no-video').classList.add('hidden');
  document.getElementById('current-video-details').classList.remove('hidden');
  document.getElementById('current-thumbnail').src = meta.thumbnail;
  document.getElementById('current-title').textContent = meta.title;
  document.getElementById('current-channel').textContent = meta.channel;
  document.getElementById('current-duration').textContent = meta.duration;
}

function showTranscriptPreview(transcript) {
  const text = typeof transcript === 'string' ? transcript : transcript.fullText || '';
  if (!text) return;
  document.getElementById('current-transcript-preview').classList.remove('hidden');
  document.getElementById('current-transcript-text').textContent = text.substring(0, 500) + '...';
}

function showSummaryPreview(summary) {
  if (!summary) return;
  document.getElementById('current-summary-preview').classList.remove('hidden');
  document.getElementById('current-summary-text').textContent = summary;
}

async function handleSaveCurrent() {
  if (!currentVideoMeta) return;
  const btn = document.getElementById('btn-save-current');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await sendMessage('saveVideo', currentVideoMeta);
    btn.textContent = 'Saved';
    btn.classList.add('btn-success');
    toast('Video saved!', 'success');
    await loadLibrary();
    await updateStats();
  } catch (err) {
    btn.textContent = 'Save Video';
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleTranscribeCurrent() {
  if (!currentVideoMeta) return;
  const btn = document.getElementById('btn-transcribe-current');
  btn.disabled = true;
  btn.textContent = 'Transcribing...';
  showLoading('Fetching transcript...');

  try {
    // Ensure video is saved first
    await sendMessage('saveVideo', currentVideoMeta);

    const result = await sendMessage('transcribeVideo', { videoId: currentVideoMeta.videoId });
    if (result.data) {
      showTranscriptPreview(result.data);
      btn.textContent = 'Transcribed';
      btn.classList.add('btn-success');
      toast('Transcript fetched!', 'success');
    }
  } catch (err) {
    btn.textContent = 'Transcribe';
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    hideLoading();
  }
}

async function handleSummarizeCurrent() {
  if (!currentVideoMeta) return;
  const btn = document.getElementById('btn-summarize-current');
  btn.disabled = true;
  btn.textContent = 'Summarizing...';
  showLoading('Generating AI summary...');

  try {
    const result = await sendMessage('summarize', { videoId: currentVideoMeta.videoId });
    if (result.data) {
      showSummaryPreview(result.data);
      btn.textContent = 'Summarized';
      btn.classList.add('btn-success');
      toast('Summary generated!', 'success');
    }
  } catch (err) {
    btn.textContent = 'AI Summary';
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    hideLoading();
  }
}

// ── Library Tab ──

async function loadLibrary() {
  const result = await sendMessage('getAllVideos');
  allVideos = result.data || [];
  renderVideoList(allVideos);
  populateExportSelect(allVideos);
}

function renderVideoList(videos) {
  const container = document.getElementById('library-list');

  if (!videos.length) {
    container.innerHTML = '<div class="empty-state"><p>No saved videos yet. Save a video from the Current tab.</p></div>';
    return;
  }

  container.innerHTML = videos.map(v => `
    <div class="video-card" data-video-id="${v.videoId}">
      <img class="thumb" src="${v.thumbnail}" alt="" loading="lazy">
      <div class="info">
        <h4 title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</h4>
        <div class="meta">
          <span>${escapeHtml(v.channel)}</span>
          <span>${v.duration || ''}</span>
          <span>${new Date(v.savedAt).toLocaleDateString()}</span>
        </div>
        <div class="tags">
          ${(v.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join('')}
          ${v.transcript ? '<span style="color:#2e7d32">transcribed</span>' : ''}
          ${v.summary ? '<span style="color:#3ea6ff">summarized</span>' : ''}
        </div>
      </div>
      <div class="actions">
        <button class="delete" data-action="delete" data-video-id="${v.videoId}" title="Delete">X</button>
      </div>
    </div>
  `).join('');

  // Event delegation for delete
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const videoId = btn.dataset.videoId;
      await sendMessage('deleteVideo', { videoId });
      toast('Video removed', 'success');
      await loadLibrary();
      await updateStats();
    });
  });

  // Load tag filters
  loadTagFilters(allVideos);
}

function loadTagFilters(videos) {
  const tags = [...new Set(videos.flatMap(v => v.tags || []))];
  const container = document.getElementById('tag-filters');

  if (!tags.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = tags.map(t => `
    <span class="tag-chip ${activeTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>
  `).join('');

  container.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      activeTag = activeTag === tag ? null : tag;
      const filtered = activeTag
        ? allVideos.filter(v => (v.tags || []).includes(activeTag))
        : allVideos;
      renderVideoList(filtered);
    });
  });
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  if (!query) {
    renderVideoList(allVideos);
    return;
  }
  const filtered = allVideos.filter(v =>
    v.title.toLowerCase().includes(query) ||
    v.channel.toLowerCase().includes(query) ||
    (v.tags || []).some(t => t.toLowerCase().includes(query))
  );
  renderVideoList(filtered);
}

// ── Playlists Tab ──

async function loadPlaylists() {
  const result = await sendMessage('getAllPlaylists');
  allPlaylists = result.data || [];
  renderPlaylists(allPlaylists);
}

function renderPlaylists(playlists) {
  const container = document.getElementById('playlists-list');

  if (!playlists.length) {
    container.innerHTML = '<div class="empty-state"><p>No saved playlists. Visit a YouTube playlist to save it.</p></div>';
    return;
  }

  container.innerHTML = playlists.map(p => `
    <div class="playlist-card" data-playlist-id="${p.playlistId}">
      <h4>${escapeHtml(p.title)}</h4>
      <div class="meta">${p.videoIds?.length || 0} videos &middot; Saved ${new Date(p.savedAt).toLocaleDateString()}</div>
      <div class="btn-row">
        <button class="btn btn-sm" data-action="export-playlist" data-playlist-id="${p.playlistId}">Export All</button>
        <button class="btn btn-sm delete" data-action="delete-playlist" data-playlist-id="${p.playlistId}">Delete</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="delete-playlist"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sendMessage('deletePlaylist', { playlistId: btn.dataset.playlistId });
      toast('Playlist removed', 'success');
      await loadPlaylists();
    });
  });
}

// ── Export Tab ──

function populateExportSelect(videos) {
  const select = document.getElementById('export-video-select');
  select.innerHTML = '<option value="">-- Choose a video --</option>' +
    videos.map(v => `<option value="${v.videoId}">${escapeHtml(v.title)}</option>`).join('');
}

async function handleExportVideoChange() {
  currentAIContent = null;
  await handlePreviewUpdate();
}

async function handlePreviewUpdate() {
  const videoId = document.getElementById('export-video-select').value;
  const template = document.getElementById('export-template-select').value;
  const previewEl = document.getElementById('export-preview');
  const previewText = document.getElementById('export-preview-text');

  if (!videoId) {
    previewEl.classList.add('hidden');
    return;
  }

  try {
    const result = await sendMessage('renderMarkdown', {
      videoId,
      template,
      aiContent: currentAIContent
    });
    previewText.textContent = result.data;
    previewEl.classList.remove('hidden');
  } catch (err) {
    previewText.textContent = `Error: ${err.message}`;
    previewEl.classList.remove('hidden');
  }
}

async function generateAI(action) {
  const videoId = document.getElementById('export-video-select').value;
  if (!videoId) {
    toast('Select a video first', 'error');
    return;
  }

  showLoading('Generating AI content...');

  try {
    const result = await sendMessage(action, { videoId });
    currentAIContent = result.data;
    await handlePreviewUpdate();
    toast('AI content generated!', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function exportTo(destination) {
  const previewText = document.getElementById('export-preview-text').textContent;
  if (!previewText) {
    toast('Nothing to export. Select a video and generate preview first.', 'error');
    return;
  }

  const videoId = document.getElementById('export-video-select').value;
  const video = allVideos.find(v => v.videoId === videoId);
  const filename = sanitizeFilename(video?.title || 'youtube-note') + '.md';

  try {
    switch (destination) {
      case 'clipboard':
        await copyToClipboard(previewText);
        toast('Copied to clipboard!', 'success');
        break;

      case 'download':
        await sendMessage('downloadMarkdown', { filename, content: previewText });
        toast('Download started!', 'success');
        break;

      case 'obsidian':
        showLoading('Saving to Obsidian...');
        await saveToObsidian(filename, previewText);
        toast('Saved to Obsidian vault!', 'success');
        break;

      case 'drive':
        showLoading('Uploading to Google Drive...');
        const result = await uploadToDrive(filename, previewText);
        toast(`Uploaded to Drive: ${result.name}`, 'success');
        break;
    }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ── Stats ──

async function updateStats() {
  try {
    const result = await sendMessage('getStats');
    document.getElementById('stats-badge').textContent = `${result.data.totalVideos} videos`;
  } catch {
    // Ignore
  }
}

// ── Utilities ──

async function sendMessage(action, data = {}) {
  const response = await chrome.runtime.sendMessage({ action, data });
  if (!response.success) {
    throw new Error(response.error || 'Operation failed');
  }
  return response;
}

function showLoading(text = 'Loading...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
