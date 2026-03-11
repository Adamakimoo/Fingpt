/**
 * Options page logic for YouTube Markdown Extension.
 */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadSettings();
  await loadStats();
  setupEventListeners();
}

function setupEventListeners() {
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('btn-export-data').addEventListener('click', exportData);
  document.getElementById('btn-import-data').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', importData);
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'claudeApiKey',
    'claudeModel',
    'autoTranscribe',
    'autoSummarize',
    'defaultTemplate',
    'obsidianSubfolder',
    'driveFolder'
  ]);

  if (settings.claudeApiKey) {
    document.getElementById('claude-api-key').value = settings.claudeApiKey;
  }
  if (settings.claudeModel) {
    document.getElementById('claude-model').value = settings.claudeModel;
  }
  document.getElementById('auto-transcribe').checked = settings.autoTranscribe || false;
  document.getElementById('auto-summarize').checked = settings.autoSummarize || false;
  if (settings.defaultTemplate) {
    document.getElementById('default-template').value = settings.defaultTemplate;
  }
  if (settings.obsidianSubfolder) {
    document.getElementById('obsidian-subfolder').value = settings.obsidianSubfolder;
  }
  if (settings.driveFolder) {
    document.getElementById('drive-folder').value = settings.driveFolder;
  }
}

async function saveSettings() {
  const settings = {
    claudeApiKey: document.getElementById('claude-api-key').value.trim(),
    claudeModel: document.getElementById('claude-model').value,
    autoTranscribe: document.getElementById('auto-transcribe').checked,
    autoSummarize: document.getElementById('auto-summarize').checked,
    defaultTemplate: document.getElementById('default-template').value,
    obsidianSubfolder: document.getElementById('obsidian-subfolder').value.trim() || 'YouTube Notes',
    driveFolder: document.getElementById('drive-folder').value.trim() || 'YouTube Notes'
  };

  await chrome.storage.sync.set(settings);

  const status = document.getElementById('save-status');
  status.textContent = 'Settings saved!';
  setTimeout(() => { status.textContent = ''; }, 2000);
}

async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStats', data: {} });
    if (response.success) {
      const stats = response.data;
      document.getElementById('data-stats').innerHTML = `
        <div class="stat-card">
          <div class="number">${stats.totalVideos}</div>
          <div class="label">Videos</div>
        </div>
        <div class="stat-card">
          <div class="number">${stats.totalPlaylists}</div>
          <div class="label">Playlists</div>
        </div>
        <div class="stat-card">
          <div class="number">${stats.withTranscripts}</div>
          <div class="label">Transcribed</div>
        </div>
        <div class="stat-card">
          <div class="number">${stats.withSummaries}</div>
          <div class="label">Summarized</div>
        </div>
        <div class="stat-card">
          <div class="number">${stats.totalTags}</div>
          <div class="label">Tags</div>
        </div>
      `;
    }
  } catch {
    // Stats not available yet
  }
}

async function exportData() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'exportData', data: {} });
    if (response.success) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yt-markdown-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    alert('Export failed: ' + err.message);
  }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const response = await chrome.runtime.sendMessage({ action: 'importData', data });
    if (response.success) {
      alert('Data imported successfully!');
      await loadStats();
    }
  } catch (err) {
    alert('Import failed: ' + err.message);
  }

  event.target.value = '';
}
