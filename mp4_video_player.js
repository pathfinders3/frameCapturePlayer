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
const frameStepInput = document.getElementById('frameStepInput');
const startTimeInput = document.getElementById('startTimeInput');
const relativeStartToggle = document.getElementById('relativeStartToggle');
const extractFramesBtn = document.getElementById('extractFramesBtn');
const extractStatus = document.getElementById('extractStatus');
const progressFill = document.getElementById('progressFill');
const progressWrap = document.getElementById('progressWrap');
const timeDisplay = document.getElementById('timeDisplay');
const fileName = document.getElementById('fileName');
const framesToExtract = 10;
let extractionInProgress = false;

function loadFile(file) {
  if (!file || !file.type.startsWith('video/')) return;
  const url = URL.createObjectURL(file);
  videoEl.src = url;
  fileName.textContent = file.name;
  dropZone.classList.add('hidden');
  videoContainer.classList.add('visible');
  setExtractStatus('');
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

function setExtractStatus(message) {
  extractStatus.textContent = message;
}

function getSafeBaseName(name) {
  return (name || 'frame').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9가-힣_-]+/g, '_');
}

function waitForEvent(target, eventName) {
  return new Promise(resolve => {
    const handler = () => {
      target.removeEventListener(eventName, handler);
      resolve();
    };
    target.addEventListener(eventName, handler);
  });
}

async function setVideoTime(targetTime) {
  const safeTime = Math.max(0, Math.min(targetTime, videoEl.duration || targetTime));
  if (Math.abs(videoEl.currentTime - safeTime) < 0.01) {
    return safeTime;
  }

  const seeked = waitForEvent(videoEl, 'seeked');
  videoEl.currentTime = safeTime;
  await seeked;
  return safeTime;
}

function canvasToBlob(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

function triggerDownload(blob, fileNameText) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileNameText;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function captureFrameToBlob(canvas, context) {
  context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
}

async function buildZipFromFrames(frames, baseName) {
  if (typeof JSZip === 'undefined') {
    throw new Error('ZIP 라이브러리를 불러오지 못했습니다.');
  }

  const zip = new JSZip();
  frames.forEach(frame => {
    zip.file(frame.name, frame.blob);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `${baseName}_frames.zip`);
}

async function extractFramesByPlayback(stepFrames, startPosition) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const context = canvas.getContext('2d', { willReadFrequently: false });

  if (!canvas.width || !canvas.height || !context) {
    throw new Error('비디오 해상도를 확인할 수 없습니다.');
  }

  const baseName = getSafeBaseName(fileName.textContent || 'frame');
  const wasMuted = videoEl.muted;
  const wasPlaying = !videoEl.paused;
  const originalTime = videoEl.currentTime;
  const safeStartTime = Math.max(0, Math.min(startPosition, Math.max(0, (videoEl.duration || startPosition) - 0.05)));
  let capturedCount = 0;
  let frameIndex = 0;
  const frames = [];

  videoEl.muted = true;

  try {
    await setVideoTime(safeStartTime);
    setPlayState(true);

    if (videoEl.paused) {
      await videoEl.play();
    }

    while (capturedCount < framesToExtract) {
      await new Promise(resolve => {
        if (typeof videoEl.requestVideoFrameCallback === 'function') {
          videoEl.requestVideoFrameCallback(() => resolve());
        } else {
          requestAnimationFrame(() => resolve());
        }
      });

      if (frameIndex % stepFrames === 0) {
        const blob = await captureFrameToBlob(canvas, context);
        if (blob) {
          const sequence = String(capturedCount + 1).padStart(2, '0');
          frames.push({ name: `${baseName}_${sequence}.png`, blob });
          capturedCount += 1;
          setExtractStatus(`${capturedCount}/${framesToExtract}장 추출 중...`);
        }
      }

      frameIndex += 1;

      if (videoEl.ended) {
        break;
      }
    }
  } finally {
    videoEl.pause();
    videoEl.currentTime = originalTime;
    videoEl.muted = wasMuted;
    if (wasPlaying) {
      await videoEl.play();
    }
  }

  await buildZipFromFrames(frames, baseName);
  return capturedCount;
}

async function extractFramesBySeeking(stepFrames, startPosition) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const context = canvas.getContext('2d', { willReadFrequently: false });

  if (!canvas.width || !canvas.height || !context) {
    throw new Error('비디오 해상도를 확인할 수 없습니다.');
  }

  const baseName = getSafeBaseName(fileName.textContent || 'frame');
  const wasMuted = videoEl.muted;
  const wasPlaying = !videoEl.paused;
  const originalTime = videoEl.currentTime;
  const safeStartTime = Math.max(0, Math.min(startPosition, Math.max(0, (videoEl.duration || startPosition) - 0.05)));
  const assumedFps = 30;
  const frameIntervalSeconds = stepFrames / assumedFps;
  let capturedCount = 0;
  const frames = [];

  videoEl.muted = true;

  try {
    await setVideoTime(safeStartTime);

    for (let i = 0; i < framesToExtract; i += 1) {
      if (i > 0) {
        const targetTime = safeStartTime + (i * frameIntervalSeconds);
        await setVideoTime(targetTime);
      }
      const blob = await captureFrameToBlob(canvas, context);
      if (blob) {
        const sequence = String(i + 1).padStart(2, '0');
        frames.push({ name: `${baseName}_${sequence}.png`, blob });
        capturedCount += 1;
        setExtractStatus(`${capturedCount}/${framesToExtract}장 추출 중...`);
      }
    }
  } finally {
    videoEl.currentTime = originalTime;
    videoEl.muted = wasMuted;
    if (wasPlaying) {
      await videoEl.play();
    }
  }

  await buildZipFromFrames(frames, baseName);
  return capturedCount;
}

async function extractFrames() {
  if (extractionInProgress) {
    return;
  }

  const stepFrames = Number.parseInt(frameStepInput.value, 10);
  if (!Number.isFinite(stepFrames) || stepFrames < 1) {
    setExtractStatus('프레임 간격은 1 이상의 숫자여야 합니다.');
    return;
  }

  const startTime = Number.parseFloat(startTimeInput.value);
  if (!Number.isFinite(startTime) || startTime < 0) {
    setExtractStatus('시작 초는 0 이상의 숫자여야 합니다.');
    return;
  }

  const currentPosition = videoEl.currentTime;
  const startPosition = relativeStartToggle.checked ? currentPosition + startTime : startTime;

  if (!videoEl.src) {
    setExtractStatus('먼저 비디오 파일을 선택해 주세요.');
    return;
  }

  extractionInProgress = true;
  extractFramesBtn.disabled = true;
  frameStepInput.disabled = true;
  startTimeInput.disabled = true;
  relativeStartToggle.disabled = true;
  setExtractStatus('프레임 추출을 시작합니다...');

  try {
    let capturedCount = 0;
    if (typeof videoEl.requestVideoFrameCallback === 'function') {
      capturedCount = await extractFramesByPlayback(stepFrames, startPosition);
    } else {
      capturedCount = await extractFramesBySeeking(stepFrames, startPosition);
    }

    setExtractStatus(`${capturedCount}개의 PNG를 ZIP으로 다운로드했습니다.`);
  } catch (error) {
    setExtractStatus(error instanceof Error ? error.message : '프레임 추출에 실패했습니다.');
  } finally {
    extractionInProgress = false;
    extractFramesBtn.disabled = false;
    frameStepInput.disabled = false;
    startTimeInput.disabled = false;
    relativeStartToggle.disabled = false;
  }
}

selectFileBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));

extractFramesBtn.addEventListener('click', () => {
  void extractFrames();
});

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
  } else {
    videoEl.pause();
  }
});

seekBackBtn.addEventListener('click', () => {
  seek(-10);
});

seekForwardBtn.addEventListener('click', () => {
  seek(10);
});

document.addEventListener('keydown', e => {
  if (!videoEl.src) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    seek(-10);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    seek(10);
  }
});

videoEl.addEventListener('ended', () => {
  setPlayState(false);
});

videoEl.addEventListener('play', () => {
  setPlayState(true);
});

videoEl.addEventListener('pause', () => {
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
