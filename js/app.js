/* ═══════════════════════════════════════════
   标签切换
   ═══════════════════════════════════════════ */
(function() {
  'use strict';
  var tabBtns = document.querySelectorAll('.tab-btn');
  var tabContents = document.querySelectorAll('.tab-content');
  var body = document.body;

  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = this.getAttribute('data-tab');
      tabBtns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      tabContents.forEach(function(c) { c.classList.remove('active'); });
      document.getElementById('tab-' + tab).classList.add('active');

      if (tab === 'midi') {
        body.classList.remove('dir-mode');
        // 重新触发编辑器布局更新
        if (window._midiResizeHandler) window._midiResizeHandler();
      } else if (tab === 'sstv') {
        body.classList.add('dir-mode');
        // 停止 MIDI 播放
        if (window.midiStop) window.midiStop();
        // 刷新 SSTV 编码预览
        if (window.sstvRefreshHex) window.sstvRefreshHex();
      } else {
        body.classList.add('dir-mode');
        // 停止 MIDI 播放
        if (window.midiStop) window.midiStop();
        // 自动刷新导出预览
        if (window.audioExportRefresh) window.audioExportRefresh();
      }
    });
  });
})();

/* ═══════════════════════════════════════════
   SSTV Robot72 文本转音频 — 核心逻辑
   ═══════════════════════════════════════════ */
(function() {
  'use strict';

  // ── DOM refs ──
  var textInput = document.getElementById('sstvTextInput');
  var btnPlay = document.getElementById('sstvBtnPlay');
  var btnStop = document.getElementById('sstvBtnStop');
  var btnExport = document.getElementById('sstvBtnExport');
  var hexContent = document.getElementById('sstvHexContent');
  var hexPreview = document.getElementById('sstvHexPreview');
  var freqTable = document.getElementById('sstvFreqTable');
  var freqTableBody = document.getElementById('sstvFreqTableBody');

  // ── State ──
  var audioCtx = null;
  var isPlaying = false;
  var charDuration = 100;
  var masterVolume = 0.8;
  var scheduledNodes = [];
  var toastTimer = null;

  // ── SSTV Robot72 Color frequency mapping ──
  var FREQ_BLACK = 1500;
  var FREQ_WHITE = 2300;

  function hexToFreq(hexVal) {
    return FREQ_BLACK + (hexVal / 255) * (FREQ_WHITE - FREQ_BLACK);
  }

  function textToHexBytes(text) {
    if (!text) return [];
    var bytes = [];
    for (var i = 0; i < text.length; i += 2) {
      var pair = text.substring(i, i + 2);
      var val = 0;
      if (pair.length === 2) {
        val = ((pair.charCodeAt(0) * 256 + pair.charCodeAt(1)) & 0xFF) || pair.charCodeAt(0) & 0xFF;
      }
      bytes.push({ chars: pair, hex: val, freq: hexToFreq(val) });
    }
    return bytes;
  }

  function getAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function scheduleTone(freq, startTime, duration) {
    var ctx = getAudioContext();
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    var gain = ctx.createGain();
    var vol = masterVolume;
    var attackTime = Math.min(0.005, duration * 0.1);
    var releaseTime = Math.min(0.01, duration * 0.15);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + attackTime);
    gain.gain.setValueAtTime(vol, startTime + duration - releaseTime);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);

    return { osc: osc, gain: gain };
  }

  function play() {
    var text = textInput.value.trim();
    if (!text) { showToast('请输入文本'); return; }

    stopAllNodes();

    var bytes = textToHexBytes(text);
    if (bytes.length === 0) { showToast('无法编码文本'); return; }

    updateHexPreview(bytes);

    var ctx = getAudioContext();
    isPlaying = true;
    btnPlay.innerHTML = '⏸ 暂停';
    btnPlay.classList.add('accent2'); btnPlay.classList.remove('primary');
    btnStop.disabled = false;
    btnExport.disabled = true;

    var now = ctx.currentTime;
    var durSec = charDuration / 1000;
    scheduledNodes = [];

    for (var i = 0; i < bytes.length; i++) {
      var t = now + i * durSec;
      var node = scheduleTone(bytes[i].freq, t, durSec);
      node._index = i;
      scheduledNodes.push(node);
    }

    var totalDuration = bytes.length * durSec;
    scheduledNodes._endTimeout = setTimeout(function() {
      stopPlayback();
    }, totalDuration * 1000 + 200);
  }

  function stopAllNodes() {
    for (var i = 0; i < scheduledNodes.length; i++) {
      try { scheduledNodes[i].osc.stop(); } catch(e) {}
      try { scheduledNodes[i].gain.gain.cancelScheduledValues(0); } catch(e) {}
    }
    if (scheduledNodes._endTimeout) clearTimeout(scheduledNodes._endTimeout);
    scheduledNodes = [];
  }

  function stopPlayback() {
    isPlaying = false;
    stopAllNodes();
    btnPlay.innerHTML = '▶ 播放';
    btnPlay.classList.add('primary'); btnPlay.classList.remove('accent2');
    btnStop.disabled = true;
    btnExport.disabled = false;
  }

  function togglePlay() {
    if (isPlaying) stopPlayback();
    else play();
  }

  function updateDuration(val) {
    charDuration = Math.max(20, Math.min(500, parseInt(val) || 100));
    document.getElementById('sstvDurationSlider').value = charDuration;
    document.getElementById('sstvDurationInput').value = charDuration;
    document.getElementById('sstvDurationVal').textContent = charDuration + ' ms';
  }

  function updateVolume(val) {
    masterVolume = parseInt(val) / 100;
    document.getElementById('sstvVolSlider').value = val;
    document.getElementById('sstvVolVal').textContent = val + '%';
  }

  function updateHexPreview(bytes) {
    if (!bytes || bytes.length === 0) {
      hexPreview.classList.remove('show');
      freqTable.classList.remove('show');
      return;
    }
    hexPreview.classList.add('show');
    freqTable.classList.add('show');

    var hexStr = '';
    var tableRows = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].hex.toString(16).toUpperCase().padStart(2, '0');
      hexStr += h + ' ';
      tableRows += '<tr><td>' + (i + 1) + '</td><td><code>' + escapeHtml(bytes[i].chars) + '</code></td><td><code>' + h + '</code></td><td class="freq-val">' + bytes[i].freq.toFixed(1) + ' Hz</td></tr>';
    }
    hexContent.textContent = hexStr.trim();
    freqTableBody.innerHTML = tableRows;
  }

  function refreshHex() {
    var text = textInput.value;
    var bytes = textToHexBytes(text);
    updateHexPreview(bytes);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function encodeWAV(samples, sampleRate) {
    var numChannels = 1;
    var bitsPerSample = 16;
    var bytesPerSample = bitsPerSample / 8;
    var blockAlign = numChannels * bytesPerSample;
    var byteRate = sampleRate * blockAlign;
    var dataSize = samples.length * bytesPerSample;
    var buf = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buf);

    function w(s, o) { for (var i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
    w('RIFF', 0); view.setUint32(4, 36 + dataSize, true);
    w('WAVE', 8); w('fmt ', 12);
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true); w('data', 36);
    view.setUint32(40, dataSize, true);

    for (var i = 0; i < samples.length; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buf;
  }

  function exportWAV() {
    var text = textInput.value.trim();
    if (!text) { showToast('请输入文本'); return; }

    var bytes = textToHexBytes(text);
    if (bytes.length === 0) { showToast('无法编码文本'); return; }

    var sampleRate = 44100;
    var durSec = charDuration / 1000;
    var totalSamples = Math.ceil(bytes.length * durSec * sampleRate) + Math.ceil(0.05 * sampleRate);
    var offlineCtx = new OfflineAudioContext(1, totalSamples, sampleRate);

    for (var i = 0; i < bytes.length; i++) {
      var t = i * durSec;
      var osc = offlineCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(bytes[i].freq, t);

      var gain = offlineCtx.createGain();
      var vol = masterVolume;
      var attack = Math.min(0.005, durSec * 0.1);
      var release = Math.min(0.01, durSec * 0.15);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + attack);
      gain.gain.setValueAtTime(vol, t + durSec - release);
      gain.gain.linearRampToValueAtTime(0, t + durSec);

      osc.connect(gain);
      gain.connect(offlineCtx.destination);
      osc.start(t);
      osc.stop(t + durSec + 0.01);
    }

    showToast('正在生成 WAV...');
    offlineCtx.startRendering().then(function(rendered) {
      var wavBuf = encodeWAV(rendered.getChannelData(0), sampleRate);
      var blob = new Blob([wavBuf], { type: 'audio/wav' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'sstv-text-' + new Date().toISOString().slice(0, 10) + '.wav';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('WAV 已导出 (' + bytes.length + ' 字节, ' + (bytes.length * durSec).toFixed(1) + 's)');
    }).catch(function(e) {
      showToast('导出失败: ' + e.message);
      console.error(e);
    });
  }

  function showToast(msg) {
    var toast = document.getElementById('toast');
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimer = setTimeout(function() { toast.classList.remove('show'); toastTimer = null; }, 2000);
  }

  // ── Events ──
  textInput.addEventListener('input', function() { refreshHex(); });

  document.addEventListener('keydown', function(e) {
    // 只在 SSTV 标签页激活时处理键盘事件
    if (!document.getElementById('tab-sstv').classList.contains('active')) return;
    if (e.key === ' ' && document.activeElement !== textInput) {
      e.preventDefault(); togglePlay();
    }
    if (e.key === 'Escape' && isPlaying) {
      e.preventDefault(); stopPlayback();
    }
  });

  // ── Expose to global ──
  window.sstvUpdateDuration = updateDuration;
  window.sstvUpdateVolume = updateVolume;
  window.sstvTogglePlay = togglePlay;
  window.sstvStopPlayback = stopPlayback;
  window.sstvRefreshHex = refreshHex;
  window.sstvExportWAV = exportWAV;

  // ── Init ──
  refreshHex();
})();

/* ═══════════════════════════════════════════
   MIDI 文本编辑器 — 核心引擎
   ═══════════════════════════════════════════ */
(function() {
  'use strict';

  var editor = document.getElementById('editor');
  var gutter = document.getElementById('gutter');
  var highlightOverlay = document.getElementById('highlightOverlay');
  var btnPlay = document.getElementById('btnPlay');
  var btnStop = document.getElementById('btnStop');
  var statusIndicator = document.getElementById('statusIndicator');
  var statusText = document.getElementById('statusText');
  var noteCount = document.getElementById('noteCount');
  var totalDuration = document.getElementById('totalDuration');
  var errorCount = document.getElementById('errorCount');
  var toast = document.getElementById('toast');
  var fileInput = document.getElementById('midiFileInput');

  var audioCtx = null;
  var isPlaying = false;
  var isPaused = false;
  var currentNoteIndex = 0;
  var scheduledNotes = [];
  var pauseTime = 0;
  var startTime = 0;
  var bpm = 120;
  var speedMultiplier = 1.0;
  var baseFreq = 261.63;
  var masterVolume = 0.8;
  var waveform = 'triangle';
  var parsedNotes = [];
  var parseErrors = [];
  var toastTimer = null;

  function getAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function ratioToFreq(num, den) {
    if (den === 0) den = 1;
    return baseFreq * (num / den);
  }

  function simplifyFraction(num, den) {
    if (den === 0) return { num: num, den: den };
    var g = gcd(num, den);
    return { num: num / g, den: den / g };
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b > 0) { var t = b; b = a % b; a = t; }
    return a || 1;
  }

  function getEffectiveBPM() { return Math.round(bpm * speedMultiplier); }

  function scheduleNote(note, time) {
    var ctx = getAudioContext();
    var freq = ratioToFreq(note.pitchNum, note.pitchDen);
    var effBPM = getEffectiveBPM();

    var osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.setValueAtTime(freq, time);

    var osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, time);

    var gain = ctx.createGain();
    var velocity = note.velocity / 100;
    var vol = velocity * masterVolume;
    var beatDuration = 60 / effBPM;
    var noteDuration = note.duration * beatDuration;

    var attackTime = Math.min(0.02, noteDuration * 0.1);
    var decayTime = Math.min(0.08, noteDuration * 0.2);
    var sustainLevel = vol * 0.7;

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + attackTime);
    gain.gain.linearRampToValueAtTime(sustainLevel, time + attackTime + decayTime);
    gain.gain.setValueAtTime(sustainLevel, time + noteDuration * 0.8);
    gain.gain.linearRampToValueAtTime(0, time + noteDuration);

    var gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, time);
    gain2.gain.linearRampToValueAtTime(vol * 0.15, time + attackTime);
    gain2.gain.linearRampToValueAtTime(0, time + noteDuration * 0.5);

    osc.connect(gain); osc2.connect(gain2);
    gain.connect(ctx.destination); gain2.connect(ctx.destination);

    osc.start(time); osc.stop(time + noteDuration + 0.05);
    osc2.start(time); osc2.stop(time + noteDuration * 0.5 + 0.05);

    return { osc: osc, osc2: osc2, gain: gain, gain2: gain2 };
  }

  function parseFraction(raw, defaultNum, defaultDen) {
    var trimmed = raw.trim();
    if (!trimmed) return { num: defaultNum, den: defaultDen, str: defaultNum + '/' + defaultDen };
    var match = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) return null;
    var num = parseInt(match[1], 10);
    var den = parseInt(match[2], 10);
    if (den === 0) return null;
    return { num: num, den: den, str: num + '/' + den };
  }

  function parseEditor() {
    var text = editor.value;
    var lines = text.split('\n');
    parsedNotes = [];
    parseErrors = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line === '' || line.indexOf('//') === 0 || line.indexOf('#') === 0) continue;

      var parts = line.split(',').map(function(s) { return s.trim(); });
      if (parts.length < 2) {
        parseErrors.push({ line: i, msg: '格式错误：至少需要时值和音高' });
        continue;
      }

      var durFrac = parseFraction(parts[0], 1, 1);
      if (!durFrac) {
        parseErrors.push({ line: i, msg: '时值格式错误：需为 分子/分母（如 1/1, 1/8）' });
        continue;
      }
      var duration = durFrac.num / durFrac.den;

      var pitchFrac = parseFraction(parts[1], 1, 1);
      if (!pitchFrac) {
        parseErrors.push({ line: i, msg: '音高格式错误：需为 分子/分母（如 1/1, 4/3, 3/2）' });
        continue;
      }
      var freq = ratioToFreq(pitchFrac.num, pitchFrac.den);
      var simplified = simplifyFraction(pitchFrac.num, pitchFrac.den);

      var size = 10;
      var sizeStr = '10';
      if (parts.length >= 3 && parts[2] !== '') {
        var sizeRaw = parts[2];
        var sizeNum = parseInt(sizeRaw, 10);
        if (!isNaN(sizeNum) && sizeNum >= 1 && sizeNum <= 10 && /^\d{2}$/.test(sizeRaw)) {
          size = sizeNum; sizeStr = sizeRaw;
        } else {
          parseErrors.push({ line: i, msg: '大小格式错误：需为两位数 01~10' });
          continue;
        }
      }
      var velocity = size * 10;

      var noteId = '';
      if (parts.length >= 4 && parts[3] !== '') {
        var idRaw = parts[3];
        if (/^\d{2}$/.test(idRaw)) { noteId = idRaw; }
        else {
          parseErrors.push({ line: i, msg: '编号格式错误：需为两位数 00~99' });
          continue;
        }
      }

      parsedNotes.push({
        line: i, duration: duration, durFrac: durFrac.str, durNum: durFrac.num, durDen: durFrac.den,
        pitchFrac: pitchFrac.str, pitchNum: pitchFrac.num, pitchDen: pitchFrac.den,
        pitchFracSimple: simplified.num + '/' + simplified.den, freq: freq,
        size: size, sizeStr: sizeStr, velocity: velocity, id: noteId, raw: line
      });
    }

    updateGutter(); updateStatusBar(); updateHighlightOverlay();
    return parsedNotes;
  }

  function updateGutter() {
    var lines = editor.value.split('\n');
    var errorLines = {};
    for (var i = 0; i < parseErrors.length; i++) errorLines[parseErrors[i].line] = true;
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      var cls = errorLines[i] ? ' error' : '';
      html += '<div class="gutter-line' + cls + '">' + (i + 1) + '</div>';
    }
    gutter.innerHTML = html;
    gutter.scrollTop = editor.scrollTop;
  }

  function updateHighlightOverlay() {
    var style = getComputedStyle(editor);
    var lineHeight = parseFloat(style.getPropertyValue('--editor-lh').trim()) || 24;
    var padTop = parseFloat(style.paddingTop);
    var lines = editor.value.split('\n');
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      html += '<div class="highlight-row" style="top:' + (padTop + i * lineHeight) + 'px;height:' + lineHeight + 'px"></div>';
    }
    highlightOverlay.innerHTML = html;
  }

  function highlightLine(index) {
    var rows = highlightOverlay.querySelectorAll('.highlight-row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove('playing');
    var gutterLines = gutter.querySelectorAll('.gutter-line');
    for (var i = 0; i < gutterLines.length; i++) gutterLines[i].classList.remove('playing');

    if (index >= 0 && index < parsedNotes.length) {
      var note = parsedNotes[index];
      if (note.line < rows.length) rows[note.line].classList.add('playing');
      if (note.line < gutterLines.length) gutterLines[note.line].classList.add('playing');
      updateNoteInfo(note, index);
    }
  }

  function clearHighlight() {
    var rows = highlightOverlay.querySelectorAll('.highlight-row');
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove('playing');
    var gutterLines = gutter.querySelectorAll('.gutter-line');
    for (var i = 0; i < gutterLines.length; i++) gutterLines[i].classList.remove('playing');
    clearNoteInfo();
  }

  function updateNoteInfo(note, index) {
    document.getElementById('infoLine').textContent = (index + 1) + ' / ' + parsedNotes.length;
    document.getElementById('infoDurFrac').textContent = note.durFrac;
    document.getElementById('infoDuration').textContent = note.duration.toFixed(3) + ' 拍';
    document.getElementById('infoPitchFrac').textContent = note.pitchFrac;
    document.getElementById('infoPitchSimple').textContent = note.pitchFrac !== note.pitchFracSimple ? note.pitchFracSimple : '—';
    document.getElementById('infoFreq').textContent = note.freq.toFixed(2) + ' Hz';
    document.getElementById('infoSize').textContent = note.sizeStr + ' (力度:' + note.velocity + ')';
    document.getElementById('infoId').textContent = note.id || '-';
  }

  function clearNoteInfo() {
    var ids = ['infoLine','infoDurFrac','infoDuration','infoPitchFrac','infoPitchSimple','infoFreq','infoSize','infoId'];
    for (var i = 0; i < ids.length; i++) document.getElementById(ids[i]).textContent = '-';
  }

  function updateStatusBar() {
    noteCount.textContent = '音符: ' + parsedNotes.length;
    var totalBeats = 0;
    for (var i = 0; i < parsedNotes.length; i++) totalBeats += parsedNotes[i].duration;
    totalDuration.textContent = '总时长: ' + totalBeats.toFixed(1) + '拍';
    if (parseErrors.length > 0) {
      errorCount.style.display = 'inline';
      errorCount.textContent = '错误: ' + parseErrors.length;
    } else { errorCount.style.display = 'none'; }
  }

  function setStatus(state) {
    statusIndicator.className = 'status-indicator ' + state;
    if (state === 'ready') statusText.textContent = '就绪';
    else if (state === 'playing') statusText.textContent = '演奏中...';
    else if (state === 'paused') statusText.textContent = '已暂停';
  }

  function play() {
    parseEditor();
    if (parsedNotes.length === 0) { showToast('没有可播放的音符'); return; }

    var ctx = getAudioContext();
    isPlaying = true; isPaused = false;
    btnPlay.innerHTML = '⏸ 暂停';
    btnPlay.classList.add('accent2'); btnPlay.classList.remove('primary');
    btnStop.disabled = false;
    setStatus('playing');

    var now = ctx.currentTime;
    startTime = now;
    var cumulativeTime = 0;
    scheduledNotes = [];
    var effBPM = getEffectiveBPM();

    for (var i = 0; i < parsedNotes.length; i++) {
      var note = parsedNotes[i];
      var noteStartTime = now + cumulativeTime;
      var scheduled = scheduleNote(note, noteStartTime);
      scheduled.noteIndex = i;
      scheduled.startTime = noteStartTime;
      scheduled.duration = note.duration * (60 / effBPM);
      scheduledNotes.push(scheduled);
      cumulativeTime += note.duration * (60 / effBPM);
    }

    currentNoteIndex = 0;
    scheduleUIUpdates();
  }

  function scheduleUIUpdates() {
    if (!isPlaying || scheduledNotes.length === 0) return;
    var ctx = getAudioContext();
    var now = ctx.currentTime;

    for (var i = currentNoteIndex; i < scheduledNotes.length; i++) {
      var s = scheduledNotes[i];
      if (now < s.startTime + s.duration) {
        if (i !== currentNoteIndex) { currentNoteIndex = i; highlightLine(i); }
        break;
      }
      if (i === scheduledNotes.length - 1) {
        if (now >= s.startTime + s.duration) { stopPlayback(); return; }
      }
    }
    if (isPlaying) requestAnimationFrame(scheduleUIUpdates);
  }

  function pause() {
    if (!isPlaying) return;
    isPlaying = false; isPaused = true;
    for (var i = 0; i < scheduledNotes.length; i++) {
      try { scheduledNotes[i].osc.stop(); } catch(e) {}
      try { scheduledNotes[i].osc2.stop(); } catch(e) {}
    }
    scheduledNotes = [];
    pauseTime = audioCtx.currentTime - startTime;
    btnPlay.innerHTML = '▶ 继续';
    btnPlay.classList.add('primary'); btnPlay.classList.remove('accent2');
    btnStop.disabled = false;
    setStatus('paused');
  }

  function resume() {
    if (!isPaused) return;
    parseEditor();
    if (parsedNotes.length === 0) return;

    var ctx = getAudioContext();
    isPlaying = true; isPaused = false;
    btnPlay.innerHTML = '⏸ 暂停';
    btnPlay.classList.add('accent2'); btnPlay.classList.remove('primary');
    btnStop.disabled = false;
    setStatus('playing');

    var now = ctx.currentTime;
    startTime = now - pauseTime;
    var cumulativeTime = 0;
    scheduledNotes = [];
    var resumeFrom = currentNoteIndex;
    var effBPM = getEffectiveBPM();

    for (var i = 0; i < parsedNotes.length; i++) {
      var note = parsedNotes[i];
      var noteStartTime = now + cumulativeTime;
      if (i >= resumeFrom) {
        var scheduled = scheduleNote(note, Math.max(now, noteStartTime));
        scheduled.noteIndex = i;
        scheduled.startTime = Math.max(now, noteStartTime);
        scheduled.duration = note.duration * (60 / effBPM);
        scheduledNotes.push(scheduled);
      }
      cumulativeTime += note.duration * (60 / effBPM);
    }
    scheduleUIUpdates();
  }

  function togglePlay() {
    if (isPlaying) pause();
    else if (isPaused) resume();
    else play();
  }

  function stopPlayback() {
    isPlaying = false; isPaused = false;
    for (var i = 0; i < scheduledNotes.length; i++) {
      try { scheduledNotes[i].osc.stop(); } catch(e) {}
      try { scheduledNotes[i].osc2.stop(); } catch(e) {}
    }
    scheduledNotes = []; currentNoteIndex = 0;
    btnPlay.innerHTML = '▶ 播放';
    btnPlay.classList.add('primary'); btnPlay.classList.remove('accent2');
    btnStop.disabled = true;
    clearHighlight(); setStatus('ready');
  }

  function updateSpeedDisplay() {
    var eff = getEffectiveBPM();
    document.getElementById('speedBPM').textContent = '有效 BPM: ' + eff;
    document.getElementById('bpmDisplay').textContent = bpm;
  }

  window.midiUpdateBPM = function(val) {
    bpm = Math.max(20, Math.min(400, parseInt(val) || 120));
    document.getElementById('bpmInput').value = bpm;
    document.getElementById('bpmSlider').value = bpm;
    updateSpeedDisplay();
    if (isPlaying) { stopPlayback(); play(); }
  };

  window.midiUpdateSpeed = function(val) {
    speedMultiplier = Math.max(0.25, Math.min(4.0, parseFloat(val) || 1.0));
    speedMultiplier = Math.round(speedMultiplier * 100) / 100;
    document.getElementById('speedSlider').value = speedMultiplier;
    document.getElementById('speedVal').textContent = speedMultiplier.toFixed(2) + 'x';
    updateSpeedDisplay();
    if (isPlaying) { stopPlayback(); play(); }
  };

  window.midiSetSpeedPreset = function(val) {
    speedMultiplier = parseFloat(val);
    document.getElementById('speedSlider').value = speedMultiplier;
    document.getElementById('speedVal').textContent = speedMultiplier.toFixed(2) + 'x';
    updateSpeedDisplay();
    if (isPlaying) { stopPlayback(); play(); }
  };

  window.midiUpdateBaseFreq = function(val) {
    baseFreq = Math.max(20, Math.min(2000, parseFloat(val) || 261.63));
    document.getElementById('baseFreqInput').value = baseFreq;
    document.getElementById('baseFreqDisplay').textContent = baseFreq.toFixed(1) + ' Hz';
    parseEditor();
    if (isPlaying) { stopPlayback(); play(); }
  };

  window.midiUpdateVolume = function(val) {
    masterVolume = parseInt(val) / 100;
    document.getElementById('volSlider').value = val;
    document.getElementById('volDisplay').textContent = val + '%';
  };

  window.midiUpdateWaveform = function(val) {
    waveform = val;
    if (isPlaying) { stopPlayback(); play(); }
  };

  window.midiLoadExample = function(type) {
    stopPlayback();
    var content = '';
    if (type === 'scale') {
      content = '// 纯律自然大调音阶 (Just Intonation)\n1/1,1/1,10,01\n1/1,9/8,10,02\n1/1,5/4,10,03\n1/1,4/3,10,04\n1/1,3/2,10,05\n1/1,5/3,10,06\n1/1,15/8,10,07\n1/1,2/1,10,08';
    } else if (type === 'melody') {
      content = '// 小星星 (纯律)\n1/1,1/1,10,01\n1/1,1/1,10,02\n1/1,3/2,09,03\n1/1,3/2,09,04\n1/1,5/3,08,05\n1/1,5/3,08,06\n2/1,3/2,08,07\n1/1,4/3,08,08\n1/1,4/3,08,09\n1/1,5/4,09,10\n1/1,5/4,09,11\n1/1,9/8,10,12\n1/1,9/8,10,13\n2/1,1/1,10,14';
    } else if (type === 'chords') {
      content = '// 大三和弦: 1/1, 5/4, 3/2\n1/2,1/1,10,01\n1/2,5/4,09,02\n1/2,3/2,08,03\n1/2,2/1,07,04\n1/2,3/2,08,05\n1/2,5/4,09,06\n// 小三和弦: 1/1, 6/5, 3/2\n1/2,1/1,10,07\n1/2,6/5,09,08\n1/2,3/2,08,09\n1/2,2/1,07,10\n1/2,3/2,08,11\n1/2,6/5,09,12\n// 属七和弦: 1/1, 5/4, 3/2, 7/4\n1/2,1/1,10,13\n1/2,5/4,09,14\n1/2,3/2,08,15\n1/2,7/4,07,16\n1/2,3/2,08,17\n1/2,5/4,09,18\n// 柱式和弦\n3/1,1/1,10,19\n3/1,5/4,09,20\n3/1,3/2,08,21\n3/1,2/1,07,22';
    }
    editor.value = content;
    parseEditor();
    editor.focus();
    showToast('示例已加载');
  };

  window.midiClearEditor = function() {
    stopPlayback();
    editor.value = '';
    parseEditor();
    editor.focus();
  };

  window.midiImportFile = function() { fileInput.click(); };

  window.midiHandleFileImport = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      stopPlayback();
      editor.value = e.target.result;
      parseEditor();
      showToast('文件已导入: ' + file.name);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  window.midiExportFile = function() {
    var content = editor.value;
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'midi-score-' + new Date().toISOString().slice(0,10) + '.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('文件已导出');
  };

  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimer = setTimeout(function() { toast.classList.remove('show'); toastTimer = null; }, 2000);
  }

  // 事件监听
  editor.addEventListener('input', function() { parseEditor(); });
  editor.addEventListener('scroll', function() {
    gutter.scrollTop = editor.scrollTop;
    highlightOverlay.scrollTop = editor.scrollTop;
  });
  editor.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); window.midiExportFile(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      var start = editor.selectionStart, end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      parseEditor();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === ' ' && document.activeElement !== editor) {
      e.preventDefault(); togglePlay();
    }
    if (e.key === 'Escape' && isPlaying) {
      e.preventDefault(); stopPlayback();
    }
  });

  function resizeHandler() {
    updateHighlightOverlay();
    if (isPlaying) highlightLine(currentNoteIndex);
  }
  window.addEventListener('resize', resizeHandler);
  window._midiResizeHandler = resizeHandler;

  window.addEventListener('beforeunload', function() {
    stopPlayback();
    if (audioCtx) audioCtx.close();
  });

  // 恢复保存的内容
  var saved = localStorage.getItem('midi-tools-editor-content');
  if (saved) { editor.value = saved; }
  else { window.midiLoadExample('scale'); }

  var saveTimeout;
  editor.addEventListener('input', function() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(function() {
      localStorage.setItem('midi-tools-editor-content', editor.value);
    }, 500);
  });

  parseEditor();
  updateHighlightOverlay();

  // 暴露到全局
  window.midiTogglePlay = togglePlay;
  window.midiStop = stopPlayback;

  // 暴露 MIDI 编辑器数据供音频导出使用
  window.midiEditor = {
    getParsedNotes: function() { parseEditor(); return parsedNotes; },
    getBPM: function() { return bpm; },
    getSpeedMultiplier: function() { return speedMultiplier; },
    getBaseFreq: function() { return baseFreq; },
    getWaveform: function() { return waveform; },
    getMasterVolume: function() { return masterVolume; }
  };
})();

/* ═══════════════════════════════════════════
   音频导出工具 — WAV / MIDI
   ═══════════════════════════════════════════ */
(function() {
  'use strict';

  var toastTimer2 = null;

  function showToast(msg) {
    var toast = document.getElementById('toast');
    if (toastTimer2) clearTimeout(toastTimer2);
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimer2 = setTimeout(function() { toast.classList.remove('show'); toastTimer2 = null; }, 2000);
  }

  function getEditor() { return window.midiEditor || null; }

  function getNotes() {
    var ed = getEditor();
    return ed ? ed.getParsedNotes() : [];
  }

  function getBPM() {
    var ed = getEditor();
    return ed ? ed.getBPM() : 120;
  }

  function getSpeed() {
    var ed = getEditor();
    return ed ? ed.getSpeedMultiplier() : 1.0;
  }

  function getBaseFreq() {
    var ed = getEditor();
    return ed ? ed.getBaseFreq() : 261.63;
  }

  function getWaveform() {
    var ed = getEditor();
    return ed ? ed.getWaveform() : 'triangle';
  }

  function getVolume() {
    var ed = getEditor();
    return ed ? ed.getMasterVolume() : 0.8;
  }

  function getEffBPM() {
    return getBPM() * getSpeed();
  }

  /* ── 刷新导出预览 ── */
  window.audioExportRefresh = function() {
    var notes = getNotes();
    var effBPM = getEffBPM();
    var totalBeats = 0;
    for (var i = 0; i < notes.length; i++) totalBeats += notes[i].duration;
    var durationSec = totalBeats * 60 / effBPM;

    document.getElementById('exportNoteCount').textContent = notes.length;
    document.getElementById('exportTotalBeats').textContent = totalBeats.toFixed(1);
    document.getElementById('exportBPM').textContent = Math.round(effBPM);
    document.getElementById('exportDuration').textContent = durationSec.toFixed(1) + 's';

    var previewBox = document.getElementById('previewBox');
    var previewContent = document.getElementById('previewContent');
    var previewCount = document.getElementById('previewCount');

    if (notes.length === 0) {
      previewBox.classList.remove('show');
      return;
    }
    previewBox.classList.add('show');
    previewCount.textContent = notes.length + ' 个音符';

    var lines = [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      lines.push((i + 1) + '. ' + n.durFrac + ', ' + n.pitchFrac + ', ' + n.sizeStr + (n.id ? ', ' + n.id : ''));
    }
    previewContent.textContent = lines.join('\n');
  };

  /* ── WAV 编码 ── */
  function encodeWAV(samples, sampleRate, bitDepth) {
    var bytesPerSample = bitDepth / 8;
    var numChannels = 1;
    var blockAlign = numChannels * bytesPerSample;
    var byteRate = sampleRate * blockAlign;
    var dataSize = samples.length * bytesPerSample;
    var bufferSize = 44 + dataSize;
    var buf = new ArrayBuffer(bufferSize);
    var view = new DataView(buf);

    function writeStr(offset, str) {
      for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    for (var i = 0; i < samples.length; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      if (bitDepth === 16) {
        var intVal = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(44 + i * 2, intVal, true);
      } else if (bitDepth === 24) {
        var intVal = Math.round(s * 0x7FFFFF);
        view.setUint8(44 + i * 3, intVal & 0xFF);
        view.setUint8(44 + i * 3 + 1, (intVal >> 8) & 0xFF);
        view.setUint8(44 + i * 3 + 2, (intVal >> 16) & 0xFF);
      }
    }
    return buf;
  }

  /* ── 导出 WAV ── */
  window.exportWAV = async function() {
    var notes = getNotes();
    if (notes.length === 0) {
      showToast('没有可导出的音符，请先在 MIDI 编辑器中输入音符');
      return;
    }

    var sampleRate = parseInt(document.getElementById('optSampleRate').value) || 44100;
    var bitDepth = parseInt(document.getElementById('optBitDepth').value) || 16;
    var effBPM = getEffBPM();
    var baseFreq = getBaseFreq();
    var waveform = getWaveform();
    var volume = getVolume();
    var beatDuration = 60 / effBPM;

    var totalBeats = 0;
    for (var i = 0; i < notes.length; i++) totalBeats += notes[i].duration;
    var totalDuration = totalBeats * beatDuration + 0.5;

    showToast('正在生成 WAV (' + notes.length + ' 音符)...');

    var offlineCtx = new OfflineAudioContext(1, Math.ceil(totalDuration * sampleRate), sampleRate);

    var cumulativeTime = 0;
    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      var freq = baseFreq * (note.pitchNum / note.pitchDen);
      var noteDuration = note.duration * beatDuration;
      var velocity = note.velocity / 100;
      var vol = velocity * volume;

      var osc = offlineCtx.createOscillator();
      osc.type = waveform;
      osc.frequency.setValueAtTime(freq, cumulativeTime);

      var osc2 = offlineCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, cumulativeTime);

      var gain = offlineCtx.createGain();
      var attackTime = Math.min(0.02, noteDuration * 0.1);
      var decayTime = Math.min(0.08, noteDuration * 0.2);
      var sustainLevel = vol * 0.7;

      gain.gain.setValueAtTime(0, cumulativeTime);
      gain.gain.linearRampToValueAtTime(vol, cumulativeTime + attackTime);
      gain.gain.linearRampToValueAtTime(sustainLevel, cumulativeTime + attackTime + decayTime);
      gain.gain.setValueAtTime(sustainLevel, cumulativeTime + noteDuration * 0.8);
      gain.gain.linearRampToValueAtTime(0, cumulativeTime + noteDuration);

      var gain2 = offlineCtx.createGain();
      gain2.gain.setValueAtTime(0, cumulativeTime);
      gain2.gain.linearRampToValueAtTime(vol * 0.15, cumulativeTime + attackTime);
      gain2.gain.linearRampToValueAtTime(0, cumulativeTime + noteDuration * 0.5);

      osc.connect(gain); osc2.connect(gain2);
      gain.connect(offlineCtx.destination); gain2.connect(offlineCtx.destination);

      osc.start(cumulativeTime); osc.stop(cumulativeTime + noteDuration + 0.05);
      osc2.start(cumulativeTime); osc2.stop(cumulativeTime + noteDuration * 0.5 + 0.05);

      cumulativeTime += noteDuration;
    }

    try {
      var rendered = await offlineCtx.startRendering();
      var samples = rendered.getChannelData(0);
      var wavBuffer = encodeWAV(samples, sampleRate, bitDepth);
      var blob = new Blob([wavBuffer], { type: 'audio/wav' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'midi-export-' + new Date().toISOString().slice(0, 10) + '.wav';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('WAV 已导出 (' + notes.length + ' 音符, ' + totalDuration.toFixed(1) + 's)');
    } catch (e) {
      showToast('WAV 导出失败: ' + e.message);
      console.error(e);
    }
  };

  /* ── MIDI 工具函数 ── */
  function freqToMidiNote(freq) {
    if (freq <= 0) return 69;
    return Math.round(69 + 12 * Math.log2(freq / 440));
  }

  function encodeVLQ(value) {
    var bytes = [];
    var v = value;
    bytes.push(v & 0x7F);
    v >>= 7;
    while (v > 0) { bytes.push((v & 0x7F) | 0x80); v >>= 7; }
    bytes.reverse();
    return bytes;
  }

  function buildMIDIBytes(format, numTracks, division, events) {
    var trackData = [];
    for (var i = 0; i < events.length; i++) {
      var vlq = encodeVLQ(events[i].delta);
      for (var j = 0; j < vlq.length; j++) trackData.push(vlq[j]);
      for (var j = 0; j < events[i].data.length; j++) trackData.push(events[i].data[j]);
    }
    var header = [0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
      (format >> 8) & 0xFF, format & 0xFF,
      (numTracks >> 8) & 0xFF, numTracks & 0xFF,
      (division >> 8) & 0xFF, division & 0xFF];
    var trackHeader = [0x4D, 0x54, 0x72, 0x6B];
    var trackLen = trackData.length;
    trackHeader.push((trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF, (trackLen >> 8) & 0xFF, trackLen & 0xFF);
    return new Uint8Array(header.concat(trackHeader).concat(trackData));
  }

  /* ── 导出 MIDI ── */
  window.exportMIDI = function() {
    var notes = getNotes();
    if (notes.length === 0) {
      showToast('没有可导出的音符，请先在 MIDI 编辑器中输入音符');
      return;
    }

    var bpm = getBPM();
    var speed = getSpeed();
    var effBPM = bpm * speed;
    var baseFreq = getBaseFreq();
    var PPQN = 480;
    var tempo = Math.round(60000000 / effBPM);
    var noteLenMode = document.getElementById('optMidiNoteLen').value;

    var trackEvents = [];

    // 设置速度
    trackEvents.push({ delta: 0, data: [0xFF, 0x51, 0x03, (tempo >> 16) & 0xFF, (tempo >> 8) & 0xFF, tempo & 0xFF] });

    // 音轨名称
    var nameBytes = [];
    var nameStr = 'MIDI Export';
    for (var i = 0; i < nameStr.length; i++) nameBytes.push(nameStr.charCodeAt(i));
    trackEvents.push({ delta: 0, data: [0xFF, 0x03].concat(nameBytes) });

    // 乐器选择：原声大钢琴 (Program 0)
    trackEvents.push({ delta: 0, data: [0xC0, 0] });

    // 音符事件
    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      var freq = baseFreq * (note.pitchNum / note.pitchDen);
      var midiNote = Math.max(0, Math.min(127, freqToMidiNote(freq)));
      var velocity = note.velocity;

      var noteTicks;
      if (noteLenMode === 'fixed') {
        noteTicks = Math.round(PPQN / 2); // 八分音符
      } else {
        noteTicks = Math.round(note.duration * PPQN);
      }

      trackEvents.push({ delta: (i === 0) ? 0 : 0, data: [0x90, midiNote, velocity] });
      trackEvents.push({ delta: noteTicks, data: [0x80, midiNote, 0] });
    }

    // 轨道结束
    trackEvents.push({ delta: 0, data: [0xFF, 0x2F, 0x00] });

    var midiBytes = buildMIDIBytes(0, 1, PPQN, trackEvents);
    var blob = new Blob([midiBytes], { type: 'audio/midi' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'midi-export-' + new Date().toISOString().slice(0, 10) + '.mid';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('MIDI 已导出 (' + notes.length + ' 音符, ' + Math.round(effBPM) + ' BPM)');
  };

})();
