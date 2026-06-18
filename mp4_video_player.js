const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const selectFileBtn = document.getElementById('selectFileBtn');
const videoContainer = document.getElementById('videoContainer');
const videoEl = document.getElementById('videoEl');
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const playLabel = document.getElementById('playLabel');
const seekBackBtn = document.getElementById('seekBackBtn');
const seekForwardBtn = document.getElementById('seekForwardBtn');
const progressFill = document.getElementById('progressFill');
const progressWrap = document.getElementById('progressWrap');
const timeDisplay = document.getElementById('timeDisplay');
const fileName = document.getElementById('fileName');

function loadFile(file) {
  if (!file || !file.type.startsWith('video/')) return;
  const url = URL.createObjectURL(file);
  videoEl.src = url;
  fileName.textContent = file.name;
  dropZone.classList.add('hidden');
  videoContainer.classList.add('visible');
  setPlayState(false);
}

function setPlayState(playing) {
  if (playing) {
    playIcon.className = 'ti ti-player-pause';
    playLabel.textContent = '일시정지';
  } else {
    playIcon.className = 'ti ti-player-play';
    playLabel.textContent = '재생';
  }
}

function seek(delta) {
  videoEl.currentTime = Math.max(0, Math.min(videoEl.duration || 0, videoEl.currentTime + delta));
}

function fmt(s) {
  if (isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return m + ':' + sec;
}

selectFileBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.style.background = 'var(--color-background-tertiary)';
});

dropZone.addEventListener('dragleave', () => {
  dropZone.style.background = '';
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.style.background = '';
  loadFile(e.dataTransfer.files[0]);
});

playPauseBtn.addEventListener('click', () => {
  if (videoEl.paused) {
    videoEl.play();
    setPlayState(true);
  } else {
    videoEl.pause();
    setPlayState(false);
  }
});

seekBackBtn.addEventListener('click', () => {
  seek(-10);
});

seekForwardBtn.addEventListener('click', () => {
  seek(10);
});

videoEl.addEventListener('ended', () => {
  setPlayState(false);
});

videoEl.addEventListener('timeupdate', () => {
  const pct = videoEl.duration ? (videoEl.currentTime / videoEl.duration) * 100 : 0;
  progressFill.style.width = pct.toFixed(2) + '%';
  timeDisplay.textContent = fmt(videoEl.currentTime) + ' / ' + fmt(videoEl.duration);
});

progressWrap.addEventListener('click', e => {
  const rect = progressWrap.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  if (videoEl.duration) videoEl.currentTime = ratio * videoEl.duration;
});
