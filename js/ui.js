/* ═══════════════════════════════════════════
   UI 控件：标签切换 & 侧边栏 & 高级参数 & 初始化
   ═══════════════════════════════════════════ */
(function() {
  'use strict';
  var body = document.body;

  // ── 左侧栏切换 ──
  window.toggleLeftSidebar = function() {
    var sidebar = document.getElementById('leftSidebar');
    var toggle = document.getElementById('sidebarToggle');
    if (sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      toggle.classList.remove('active');
    } else {
      sidebar.classList.add('open');
      toggle.classList.add('active');
    }
  };

  // ── 主标签切换（MIDI / 音频导出 / SSTV） ──
  window.switchMainTab = function(tab) {
    // 更新左侧栏高亮
    var navItems = document.querySelectorAll('.left-nav-item');
    navItems.forEach(function(item) { item.classList.remove('active'); });
    var activeItem = document.querySelector('.left-nav-item[data-tab="' + tab + '"]');
    if (activeItem) activeItem.classList.add('active');

    // 切换标签内容
    var tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(function(c) { c.classList.remove('active'); });
    var target = document.getElementById('tab-' + tab);
    if (target) target.classList.add('active');

    if (tab === 'midi') {
      body.classList.remove('dir-mode');
      if (window._midiResizeHandler) window._midiResizeHandler();
    } else if (tab === 'sstv') {
      body.classList.add('dir-mode');
      if (window.midiStop) window.midiStop();
      if (window.sstvRefreshHex) window.sstvRefreshHex();
    } else {
      body.classList.add('dir-mode');
      if (window.midiStop) window.midiStop();
      if (window.audioExportRefresh) window.audioExportRefresh();
    }
  };

  // ── 右侧栏标签切换（音符信息 / 教程 / 作品信息） ──
  window.switchSidebarTab = function(tab) {
    var sidebarTabs = document.querySelectorAll('.sidebar-tab');
    sidebarTabs.forEach(function(t) { t.classList.remove('active'); });
    var activeTab = document.querySelector('.sidebar-tab[data-sidebar-tab="' + tab + '"]');
    if (activeTab) activeTab.classList.add('active');

    var panels = document.querySelectorAll('.sidebar-panel');
    panels.forEach(function(p) { p.classList.remove('active'); });
    var panel = document.getElementById('sidebarPanel' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (panel) panel.classList.add('active');
  };
})();

/* ═══════════════════════════════════════════
   高级参数（侧边栏内嵌）
   ═══════════════════════════════════════════ */
(function() {
  'use strict';

  var defaults = {
    attack: 0.020,
    release: 0.050,
    sustain: 0.70,
    harmonic: 0.15,
    fadeOut: 0.20
  };

  var params = {};
  Object.keys(defaults).forEach(function(k) { params[k] = defaults[k]; });

  window.advancedUpdateParam = function(key, val) {
    var displayMap = {
      attack: { id: 'advAttackVal', scale: 0.001, fixed: 3 },
      release: { id: 'advReleaseVal', scale: 0.001, fixed: 3 },
      sustain: { id: 'advSustainVal', scale: 0.01, fixed: 2 },
      harmonic: { id: 'advHarmonicVal', scale: 0.01, fixed: 2 },
      fadeOut: { id: 'advFadeOutVal', scale: 0.01, fixed: 2 }
    };
    var dm = displayMap[key];
    var value = parseInt(val) * dm.scale;
    params[key] = value;
    document.getElementById(dm.id).textContent = value.toFixed(dm.fixed);
  };

  window.advancedResetDefaults = function() {
    Object.keys(defaults).forEach(function(k) { params[k] = defaults[k]; });
    var resetSlider = function(id, valId, value, text) {
      var el = document.getElementById(id); if (el) el.value = value;
      var vel = document.getElementById(valId); if (vel) vel.textContent = text;
    };
    resetSlider('advAttack', 'advAttackVal', 20, '0.020');
    resetSlider('advRelease', 'advReleaseVal', 50, '0.050');
    resetSlider('advSustain', 'advSustainVal', 70, '0.70');
    resetSlider('advHarmonic', 'advHarmonicVal', 15, '0.15');
    resetSlider('advFadeOut', 'advFadeOutVal', 20, '0.20');
  };

  window.getAdvancedParams = function() { return params; };
})();

/* ═══════════════════════════════════════════
   主题配色系统
   ═══════════════════════════════════════════ */
(function() {
  'use strict';

  var themes = {
    default: {
      primary: '#d0bcff', onPrimary: '#381e72', primaryContainer: '#4f378b', onPrimaryContainer: '#eaddff',
      tertiary: '#efb8c8', onTertiary: '#492532', tertiaryContainer: '#633b48', onTertiaryContainer: '#ffd8e4'
    },
    ocean: {
      primary: '#b3d4ff', onPrimary: '#003258', primaryContainer: '#00497d', onPrimaryContainer: '#d4e4ff',
      tertiary: '#7dd3c0', onTertiary: '#00382c', tertiaryContainer: '#005142', onTertiaryContainer: '#a0f0dc'
    },
    forest: {
      primary: '#b8f0b8', onPrimary: '#002108', primaryContainer: '#00390f', onPrimaryContainer: '#d4ffd4',
      tertiary: '#ffd470', onTertiary: '#261900', tertiaryContainer: '#3a2800', onTertiaryContainer: '#ffe08a'
    },
    sunset: {
      primary: '#ffb4a2', onPrimary: '#561e0d', primaryContainer: '#733422', onPrimaryContainer: '#ffdbd4',
      tertiary: '#ffd470', onTertiary: '#261900', tertiaryContainer: '#3a2800', onTertiaryContainer: '#ffe08a'
    },
    lavender: {
      primary: '#e5c4ff', onPrimary: '#3d1f6e', primaryContainer: '#553686', onPrimaryContainer: '#f2ddff',
      tertiary: '#b8d4ff', onTertiary: '#002a4a', tertiaryContainer: '#003f6a', onTertiaryContainer: '#d4e4ff'
    },
    cherry: {
      primary: '#ffc0cb', onPrimary: '#581a26', primaryContainer: '#74303c', onPrimaryContainer: '#ffd9e0',
      tertiary: '#ffb4a2', onTertiary: '#561e0d', tertiaryContainer: '#733422', onTertiaryContainer: '#ffdbd4'
    }
  };

  window.applyTheme = function(name) {
    var t = themes[name] || themes['default'];
    var root = document.documentElement;
    root.style.setProperty('--md-primary', t.primary);
    root.style.setProperty('--md-on-primary', t.onPrimary);
    root.style.setProperty('--md-primary-container', t.primaryContainer);
    root.style.setProperty('--md-on-primary-container', t.onPrimaryContainer);
    root.style.setProperty('--md-tertiary', t.tertiary);
    root.style.setProperty('--md-on-tertiary', t.onTertiary);
    root.style.setProperty('--md-tertiary-container', t.tertiaryContainer);
    root.style.setProperty('--md-on-tertiary-container', t.onTertiaryContainer);
    localStorage.setItem('midi-tools-theme', name);
    document.getElementById('themePopup').classList.remove('show');
    // Update active indicator
    var swatches = document.querySelectorAll('.theme-swatch');
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].classList.toggle('active', swatches[i].getAttribute('data-theme') === name);
    }
  };

  window.toggleThemePopup = function() {
    document.getElementById('themePopup').classList.toggle('show');
  };

  // Close popup when clicking outside
  document.addEventListener('click', function(e) {
    var popup = document.getElementById('themePopup');
    var btn = document.getElementById('themeBtn');
    if (popup && popup.classList.contains('show') && !popup.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      popup.classList.remove('show');
    }
  });

  // Load saved theme
  var savedTheme = localStorage.getItem('midi-tools-theme') || 'default';
  window.applyTheme(savedTheme);
})();

/* ═══════════════════════════════════════════
   初始化：应用语言设置
   ═══════════════════════════════════════════ */
(function() {
  // Apply saved language on load, default to English
  var savedLang = localStorage.getItem('midi-tools-lang');
  if (savedLang && (savedLang === 'zh' || savedLang === 'en')) {
    window.setLanguage(savedLang);
  } else {
    // No saved preference: apply English (default)
    window.setLanguage('en');
  }
})();