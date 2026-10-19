/* 小小电路城 —— 中文朗读（Web Speech API）
   全站点击、零件解释、问题提示、示例和帮助都会用中文读出来。
   朗读开关单独保存，不影响音效开关。 */
(function (global) {
  'use strict';

  var KEY = 'xiaoxiao-dianlucheng-voice';
  var synth = global.speechSynthesis || null;

  var state = {
    enabled: true,
    supported: !!synth && !!global.SpeechSynthesisUtterance,
    gesture: false,
    voices: [],
    voice: null,
    speaking: false,
    lastText: '',
    lastAt: 0
  };

  var listeners = [];
  function emit() {
    listeners.forEach(function (fn) { try { fn(state); } catch (e) {} });
  }

  function supported() { return state.supported; }

  function loadPref() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'off') state.enabled = false;
    } catch (e) {}
  }
  function savePref() {
    try { localStorage.setItem(KEY, state.enabled ? 'on' : 'off'); } catch (e) {}
  }

  /* 选一个中文声音：优先普通话，其次任意中文声音 */
  function pickVoice() {
    if (!supported()) return;
    var list = [];
    try { list = synth.getVoices() || []; } catch (e) { list = []; }
    state.voices = list;
    var zh = list.filter(function (v) {
      return /^(zh|cmn)/i.test(v.lang || '') || /chinese|中文|普通话|國語|国语|Ting|Mei|Sin|Lan|Hui/i.test(v.name || '');
    });
    var prefer = ['zh-CN', 'zh_CN', 'zh-TW', 'zh_TW', 'zh-HK', 'zh_HK', 'zh'];
    var found = null;
    for (var i = 0; i < prefer.length && !found; i++) {
      for (var j = 0; j < zh.length; j++) {
        if (String(zh[j].lang || '').toLowerCase().indexOf(prefer[i].toLowerCase()) === 0) { found = zh[j]; break; }
      }
    }
    if (!found && zh.length) {
      found = zh.filter(function (v) { return v.localService; })[0] || zh[0];
    }
    state.voice = found || null;
  }

  /* 把页面文字变成适合朗读的中文口语 */
  function clean(text) {
    return String(text == null ? '' : text)
      .replace(/<br\s*\/?>/gi, '，')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '和')
      .replace(/&lt;/gi, '小于')
      .replace(/&gt;/gi, '大于')
      .replace(/&quot;/gi, '')
      .replace(/&#39;/gi, '')
      .replace(/[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF]/g, ' ')
      .replace(/kΩ/g, '千欧')
      .replace(/Ω/g, '欧姆')
      .replace(/mW/g, '毫瓦')
      .replace(/(\d)\s*mA\b/g, '$1毫安')
      .replace(/(\d)\s*V\b/g, '$1伏')
      .replace(/(\d)\s*A\b/g, '$1安')
      .replace(/正极\s*\+/g, '正极')
      .replace(/负极\s*[−-]/g, '负极')
      .replace(/[（(]\s*\+\s*[）)]/g, '正极')
      .replace(/\+/g, '正极')
      .replace(/[−]/g, '负极')
      .replace(/→/g, '到')
      .replace(/·/g, '，')
      .replace(/[“”]/g, '')
      .replace(/\s+/g, ' ')
      /* 去掉中文之间、以及中文和标点之间的多余空格 */
      .replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5！？。，、；：])/g, '$1')
      .replace(/(\d)\s+(?=[\u4e00-\u9fa5])/g, '$1')
      .trim();
  }

  function cancel() {
    state.speaking = false;
    if (synth) {
      try { synth.cancel(); } catch (e) {}
      /* Chrome 偶尔会卡在暂停状态，叫它继续一下 */
      try { if (synth.paused) synth.resume(); } catch (e) {}
    }
    emit();
  }

  var token = 0;

  function speak(text, opts) {
    opts = opts || {};
    if (!state.enabled || !supported()) return false;
    if (opts.auto && !state.gesture) return false;

    var t = clean(text);
    if (!t) return false;

    var now = Date.now();
    if (t === state.lastText && now - state.lastAt < (opts.dedupe || 450)) return false;

    /* 自动提示不要打断用户正在听的解释 */
    if (opts.auto && (state.speaking || (synth && synth.speaking))) return false;

    state.lastText = t;
    state.lastAt = now;

    var interrupt = opts.auto ? false : (opts.interrupt !== false);
    var busy = !!(synth && (synth.speaking || synth.pending));
    if (interrupt) cancel();

    var u = new global.SpeechSynthesisUtterance(t);
    u.lang = 'zh-CN';
    if (state.voice) u.voice = state.voice;
    u.rate = opts.rate || 0.98;
    u.pitch = opts.pitch || 1.05;
    u.volume = 1;

    var my = ++token;
    var started = false;
    u.onstart = function () { started = true; state.speaking = true; emit(); };
    u.onend = function () { if (my !== token) return; state.speaking = false; emit(); };
    u.onerror = function () { if (my !== token) return; state.speaking = false; emit(); };

    function fire() {
      if (my !== token || !state.enabled || !supported()) return false;
      try { synth.speak(u); return true; } catch (e) { return false; }
    }

    /* 刚 cancel 过时立刻 speak 会被有些浏览器吞掉，稍等一下再念 */
    if (interrupt && busy) setTimeout(fire, 120);
    else fire();

    /* 兜底：过一小会儿还没开始，多半是这句被浏览器吞了，重念一次。
       只对「用户主动点出来」的朗读重试；只要引擎说自己还在忙，就交给下一次点击去恢复。 */
    if (interrupt) {
      setTimeout(function () {
        if (my !== token || started || !state.enabled) return;
        if (synth.speaking || synth.pending) return;
        try { synth.cancel(); } catch (e) {}
        try { if (synth.paused) synth.resume(); } catch (e) {}
        setTimeout(fire, 120);
      }, 900);
    }

    return true;
  }

  function setEnabled(on) {
    state.enabled = !!on;
    savePref();
    if (!state.enabled) cancel();
    emit();
  }

  function isEnabled() { return state.enabled && supported(); }

  function toggle() {
    setEnabled(!state.enabled);
    return state.enabled;
  }

  /* 点击页面上带 data-speak 的文字，或普通按钮时朗读 */
  function onClick(e) {
    var target = e.target;
    if (!target || !target.closest) return;

    /* 页面自己的中文反馈刚刚说过话，就别再重复、别打断它 */
    if (Date.now() - state.lastAt < 260) return;

    var speakEl = target.closest('[data-speak]');
    if (speakEl) {
      var text = speakEl.getAttribute('data-speak');
      if (text) { speak(text); return; }
    }

    var btn = target.closest('button');
    if (!btn || btn.disabled || btn.hasAttribute('data-nospeak')) return;
    if (btn.closest('.part') || btn.closest('.terminal') || btn.closest('.part-tip')) return;
    if (btn.classList.contains('terminal') || btn.classList.contains('part-del') ||
        btn.classList.contains('modal-close') || btn.classList.contains('chip-info')) return;

    var label = btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.textContent || '';
    speak(label);
  }

  function init() {
    loadPref();
    if (!supported()) return;

    pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
    else synth.onvoiceschanged = pickVoice;
    /* 有些浏览器声音列表是异步加载的 */
    setTimeout(pickVoice, 300);
    setTimeout(pickVoice, 1200);

    var markGesture = function () { state.gesture = true; };
    document.addEventListener('pointerdown', markGesture, { capture: true, once: true });
    document.addEventListener('keydown', markGesture, { capture: true, once: true });

    document.addEventListener('click', onClick, false);
    global.addEventListener('beforeunload', cancel);
  }

  global.Voice = {
    state: state,
    init: init,
    speak: speak,
    cancel: cancel,
    clean: clean,
    supported: supported,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    toggle: toggle,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };
})(window);
