/**
 * Background service worker for YouTube Markdown Extension.
 * Routes messages between content scripts, popup, and library modules.
 */

import { saveVideo, getVideo, getAllVideos, deleteVideo, updateVideoTranscript, updateVideoSummary, savePlaylist, getAllPlaylists, deletePlaylist, getStats, exportAllData, importData } from '../lib/storage.js';
import { fetchTranscript } from '../lib/transcript.js';
import { summarize, generateStudyNotes, generateSkillsFile, generateBlogDraft } from '../lib/ai-summary.js';
import { renderTemplate, sanitizeFilename } from '../lib/markdown.js';

// ── Context Menu ──

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ytmd-save-link',
    title: 'Save YouTube video to Markdown',
    contexts: ['link'],
    targetUrlPatterns: ['*://www.youtube.com/watch*', '*://youtu.be/*']
  });

  // Update badge
  updateBadge();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'ytmd-save-link') {
    const url = info.linkUrl;
    const videoId = extractVideoId(url);
    if (videoId) {
      try {
        await saveVideoFromId(videoId);
        updateBadge();
      } catch (err) {
        console.error('Failed to save video from context menu:', err);
      }
    }
  }
});

// ── Message Router ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true; // Keep message channel open for async response
});

async function handleMessage(message) {
  const { action, data } = message;

  switch (action) {
    // ── Video operations ──
    case 'saveVideo':
      await saveVideo(data);
      await updateBadge();
      return { success: true };

    case 'getVideo':
      return { success: true, data: await getVideo(data.videoId) };

    case 'getAllVideos':
      return { success: true, data: await getAllVideos() };

    case 'deleteVideo':
      await deleteVideo(data.videoId);
      await updateBadge();
      return { success: true };

    // ── Transcript operations ──
    case 'transcribeVideo': {
      const transcript = await fetchTranscript(data.videoId);
      await updateVideoTranscript(data.videoId, transcript);
      return { success: true, data: transcript };
    }

    // ── AI operations ──
    case 'summarize': {
      const video = await getVideo(data.videoId);
      if (!video?.transcript) {
        throw new Error('Video has no transcript. Transcribe it first.');
      }
      const transcriptText = video.transcript.fullText || video.transcript;
      const summary = await summarize(transcriptText, video);
      await updateVideoSummary(data.videoId, summary);
      return { success: true, data: summary };
    }

    case 'generateStudyNotes': {
      const video = await getVideo(data.videoId);
      if (!video?.transcript) throw new Error('No transcript available.');
      const transcriptText = video.transcript.fullText || video.transcript;
      const notes = await generateStudyNotes(transcriptText, video);
      return { success: true, data: notes };
    }

    case 'generateSkillsFile': {
      const video = await getVideo(data.videoId);
      if (!video?.transcript) throw new Error('No transcript available.');
      const transcriptText = video.transcript.fullText || video.transcript;
      const skills = await generateSkillsFile(transcriptText, video);
      return { success: true, data: skills };
    }

    case 'generateBlogDraft': {
      const video = await getVideo(data.videoId);
      if (!video?.transcript) throw new Error('No transcript available.');
      const transcriptText = video.transcript.fullText || video.transcript;
      const blog = await generateBlogDraft(transcriptText, video);
      return { success: true, data: blog };
    }

    // ── Markdown generation ──
    case 'renderMarkdown': {
      const video = await getVideo(data.videoId);
      if (!video) throw new Error('Video not found.');
      const md = renderTemplate(data.template || 'video-note', {
        ...video,
        aiContent: data.aiContent
      });
      return { success: true, data: md };
    }

    // ── Export operations ──
    case 'downloadMarkdown': {
      const filename = sanitizeFilename(data.filename) + '.md';
      const blob = new Blob([data.content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      await chrome.downloads.download({
        url,
        filename: `YouTube Notes/${filename}`,
        saveAs: data.saveAs || false
      });
      return { success: true };
    }

    // ── Playlist operations ──
    case 'savePlaylist':
      await savePlaylist(data);
      return { success: true };

    case 'getAllPlaylists':
      return { success: true, data: await getAllPlaylists() };

    case 'deletePlaylist':
      await deletePlaylist(data.playlistId);
      return { success: true };

    // ── Stats & data ──
    case 'getStats':
      return { success: true, data: await getStats() };

    case 'exportData':
      return { success: true, data: await exportAllData() };

    case 'importData':
      await importData(data);
      await updateBadge();
      return { success: true };

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ── Helpers ──

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}

async function saveVideoFromId(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(url);
  const html = await response.text();

  const titleMatch = html.match(/<title>(.+?)<\/title>/);
  const title = titleMatch
    ? titleMatch[1].replace(' - YouTube', '').trim()
    : 'Unknown Video';

  const channelMatch = html.match(/"ownerChannelName":"([^"]+)"/);
  const channel = channelMatch ? channelMatch[1] : '';

  await saveVideo({
    videoId,
    title,
    channel,
    url,
    duration: '',
    description: '',
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  });
}

async function updateBadge() {
  try {
    const stats = await getStats();
    const text = stats.totalVideos > 0 ? String(stats.totalVideos) : '';
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#cc0000' });
  } catch {
    // Ignore badge errors
  }
}
