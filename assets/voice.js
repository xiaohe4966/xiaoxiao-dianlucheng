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

  /* iPhone / iPad 上，speak 必须在用户点按的当下同步调用，不能先 setTimeout 再念 */
  function isIOS() {
    try {
      var nav = global.navigator || {};
      if (/iPad|iPhone|iPod/.test(nav.userAgent || '')) return true;
      return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
    } catch (e) { return false; }
  }

  function loadPref() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'off') state.enabled = false;
    } catch (e) {}
  }
  function savePref() {
    try { localStorage.setItem(KEY, state.enabled ? 'on' : 'off'); } catch (e) {}
  }

  /* 判断是不是中文声音。注意别用「Lan」这种短词去匹配，会把 Lana 之类的外语声音也拉进来 */
  function isZhVoice(v) {
    var lang = String(v && v.lang || '');
    if (/^(zh|cmn)([-_]|$)/i.test(lang)) return true;
    return /中文|普通话|國語|国语|Ting[- ]?Ting|婷婷|Mei[- ]?Jia|美嘉|Sin[- ]?Ji|善怡|Huihui|慧慧|Xiaoxiao|晓晓|Yaoyao|瑶瑶|Yunxi|云希/i.test(String(v && v.name || ''));
  }

  /* 给声音打分：普通话、本地、常用稳定音色优先；Eddy / Grandma 这类趣味音色排后面 */
  function voiceScore(v) {
    var s = 0;
    var lang = String(v.lang || '').toLowerCase();
    if (/^zh[-_]?cn|^cmn/.test(lang)) s += 40;
    else if (/^zh/.test(lang)) s += 22;
    if (v.localService) s += 20;
    if (v.default) s += 8;
    if (/Ting[- ]?Ting|婷婷|Mei[- ]?Jia|美嘉|Sin[- ]?Ji|善怡|Huihui|慧慧|Xiaoxiao|晓晓|Yaoyao|瑶瑶|Yunxi|云希|Google\s*(普通话|中文)/i.test(String(v.name || ''))) s += 50;
    if (/Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bahh|Bells|Boing|Bubbles|Cellos|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox/i.test(String(v.name || ''))) s -= 60;
    return s;
  }

  function pickVoice() {
    if (!supported()) return;
    var list = [];
    try { list = synth.getVoices() || []; } catch (e) { list = []; }
    state.voices = list;
    var zh = list.filter(isZhVoice);
    var best = null, bestScore = -999;
    for (var i = 0; i < zh.length; i++) {
      var sc = voiceScore(zh[i]);
      if (sc > bestScore) { bestScore = sc; best = zh[i]; }
    }
    state.voice = best || null;
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

  /* 长句拆成一小段一小段念：
     1. 避免 Chrome 念到十几秒就自己停住；
     2. 某一段被引擎吞掉时，只重试这一小段，不会整篇都没声。 */
  function splitSpeech(text) {
    var parts = String(text).match(/[^。！？!?；;\n]+[。！？!?；;]?/g) || [String(text)];
    var chunks = [];
    function push(s) {
      s = String(s || '').replace(/\s+/g, ' ').trim();
      if (s) chunks.push(s);
    }
    var cur = '';
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].replace(/\s+/g, ' ').trim();
      if (!s) continue;
      while (s.length > 46) {
        var cut = -1;
        for (var k = 46; k >= 18; k--) {
          if (/[，,、：:；;]/.test(s.charAt(k - 1))) { cut = k; break; }
        }
        if (cut < 0) cut = 46;
        if (cur) { push(cur); cur = ''; }
        push(s.slice(0, cut));
        s = s.slice(cut).trim();
      }
      if (cur && cur.length + s.length > 46) { push(cur); cur = ''; }
      cur += s;
    }
    if (cur) push(cur);
    return chunks;
  }

  var token = 0;       /* 整段朗读的编号，换一段朗读就作废旧回调 */
  var seq = null;      /* { token, chunks, i, opts } */
  var active = null;   /* { token, i, attempt, started, u } */
  var startTimer = null;
  var endTimer = null;

  function clearTimers() {
    if (startTimer) { clearTimeout(startTimer); startTimer = null; }
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
  }

  /* 清空内部队列。只有确实有声音在引擎里时才 cancel，
     避免「本来空闲，却因为多取消一次而把新句子一起吞掉」 */
  function stopEngine(doCancel) {
    clearTimers();
    active = null;
    seq = null;
    state.speaking = false;
    if (doCancel && synth) {
      try { synth.cancel(); } catch (e) {}
      try { if (synth.paused) synth.resume(); } catch (e) {}
    }
  }

  function cancel() {
    token++;
    stopEngine(true);
    emit();
  }

  function finish(my) {
    if (my !== token) return;
    clearTimers();
    active = null;
    seq = null;
    state.speaking = false;
    emit();
  }

  /* 重试也失败：停掉整段，别让 speaking 一直卡住；下一次点击还能重新来 */
  function fail(my) {
    if (my !== token) return;
    clearTimers();
    active = null;
    seq = null;
    state.speaking = false;
    if (synth) {
      try { synth.cancel(); } catch (e) {}
      try { if (synth.paused) synth.resume(); } catch (e) {}
    }
    emit();
  }

  function advance(my, i) {
    if (my !== token || !seq || seq.token !== my || seq.i !== i) return;
    clearTimers();
    active = null;
    seq.i++;
    if (seq.i >= seq.chunks.length) { finish(my); return; }
    setTimeout(function () {
      if (my !== token || !seq || seq.token !== my) return;
      speakCurrent(my);
    }, 60);
  }

  function retryOrFail(chunk, my, i, n) {
    if (my !== token || !seq || seq.token !== my || seq.i !== i) return;
    if (n >= 2) { fail(my); return; }
    clearTimers();
    active = null;
    if (synth) {
      try { synth.cancel(); } catch (e) {}
      try { if (synth.paused) synth.resume(); } catch (e) {}
    }
    setTimeout(function () {
      if (my !== token || !seq || seq.token !== my || seq.i !== i) return;
      attempt(chunk, my, i, n + 1);
    }, 220);
  }

  function speakCurrent(my) {
    if (my !== token || !seq || seq.token !== my) return;
    if (seq.i >= seq.chunks.length) { finish(my); return; }
    attempt(seq.chunks[seq.i], my, seq.i, 0);
  }

  function attempt(chunk, my, i, n) {
    if (my !== token || !seq || seq.token !== my) return;
    if (!state.enabled || !supported()) { fail(my); return; }
    var opts = seq.opts || {};
    /* 最后一次重试不再指定音色，让浏览器用它自己的中文默认音色：
       万一系统里选中的那个音色坏了、没下载全，还能换一个念出来。 */
    var useVoice = n >= 2 ? null : state.voice;
    var u = new global.SpeechSynthesisUtterance(chunk);
    u.lang = (useVoice && useVoice.lang) || 'zh-CN';
    if (useVoice) u.voice = useVoice;
    u.rate = opts.rate || 0.98;
    u.pitch = opts.pitch || 1.05;
    u.volume = 1;
    active = { token: my, i: i, attempt: n, started: false, u: u };

    function current() {
      return !!(active && active.token === my && active.i === i && active.attempt === n);
    }

    u.onstart = function () {
      if (!current()) return;
      active.started = true;
      state.speaking = true;
      clearTimers();
      /* 一直收不到 end 时的兜底：按字数估上限，别把后面的句子卡死 */
      var est = Math.max(4500, chunk.length * 240 + 3500);
      endTimer = setTimeout(function () {
        if (!current()) return;
        advance(my, i);
      }, est);
      emit();
    };
    u.onend = function () {
      if (!current()) return;
      advance(my, i);
    };
    u.onerror = function (ev) {
      if (!current()) return;
      var err = ev && ev.error ? ev.error : '';
      state.lastError = err;
      if (err === 'canceled' || err === 'interrupted') { fail(my); return; }
      retryOrFail(chunk, my, i, n);
    };

    /* 启动看门狗要在 speak 之前挂好；onstart 会把它清掉 */
    clearTimers();
    startTimer = setTimeout(function () {
      if (!current() || active.started) return;
      retryOrFail(chunk, my, i, n);
    }, 1600);

    try {
      synth.speak(u);
    } catch (e) {
      retryOrFail(chunk, my, i, n);
    }
  }

  function speak(text, opts) {
    opts = opts || {};
    if (!state.enabled || !supported()) return false;
    if (opts.auto && !state.gesture) return false;

    var t = clean(text);
    if (!t) return false;
    var chunks = splitSpeech(t);
    if (!chunks.length) return false;

    var now = Date.now();
    /* 自动提示去重；用户主动点「听讲解」不按文字去重，再点一次就一定要再念 */
    if (opts.auto && t === state.lastText && now - state.lastAt < (opts.dedupe || 450)) return false;

    /* 自动提示不要打断用户正在听的解释 */
    if (opts.auto && state.speaking) return false;

    state.lastText = t;
    state.lastAt = now;

    var my = ++token;
    var busy = !!(synth && (synth.speaking || synth.pending)) || !!(active && active.started);
    stopEngine(busy);
    seq = { token: my, chunks: chunks, i: 0, opts: opts };
    state.speaking = true;
    emit();

    /* 引擎空闲时立刻念，保留 iOS 的用户手势；
       cancel 过之后 Chrome 有时会把新句子一起吞掉，等 200ms 再念。 */
    if (!busy || isIOS()) {
      speakCurrent(my);
    } else {
      setTimeout(function () {
        if (my !== token || !seq || seq.token !== my) return;
        speakCurrent(my);
      }, 200);
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
    setTimeout(pickVoice, 3000);

    var markGesture = function () { state.gesture = true; };
    document.addEventListener('pointerdown', markGesture, { capture: true, once: true });
    document.addEventListener('keydown', markGesture, { capture: true, once: true });

    /* 从别的标签页回来时，Chrome 可能把朗读暂停了，轻轻恢复一下 */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      try { if (synth.paused) synth.resume(); } catch (e) {}
    });

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
