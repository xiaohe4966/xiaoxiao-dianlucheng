/* 小小电路城 —— DOM 渲染、面板、弹窗、音效可视化 */
(function (global) {
  'use strict';

  var el = {};
  var partEls = {};
  var wireVisuals = {};
  /* 电线颜色按钮上的中文名字 */
  var WIRE_NAME_OF = {
    '#e11d48': '红色', '#2563eb': '蓝色', '#16a34a': '绿色', '#f97316': '橙色',
    '#7c3aed': '紫色', '#0d9488': '青色', '#ca8a04': '金黄色', '#92400e': '棕色',
    '#0ea5e9': '天蓝色', '#4d7c0f': '深绿色', '#334155': '灰色', '#a21caf': '粉紫色'
  };
  var lastWireSig = '';
  var lastWirePaths = null;
  var lastSpokenProblem = '';
  var lastProblemCode = '';
  var lastInspectKey = '';
  var lastTaskKey = null;
  var explainTimer = null;
  var autoProblemTimer = null;
  var quickKey = '';
  var wireHintShown = false;
  var modalReturnFocus = null;
  var lastToastText = '';
  var lastToastAt = 0;

  function $(id) { return document.getElementById(id); }
  function on(node, ev, fn) { if (node) node.addEventListener(ev, fn); }

  /* ---------- 中文朗读小工具 ---------- */
  function speak(text, opts) {
    if (global.Voice) return Voice.speak(text, opts);
    return false;
  }
  function speakAuto(text) {
    if (global.Voice) return Voice.speak(text, { auto: true });
    return false;
  }
  /* 用户主动点「听讲解 / 听问题」时，如果朗读被关掉了，就直接打开，
     避免明明点了「听」却一点声音都没有。 */
  function ensureVoice() {
    if (global.Voice && Voice.supported() && !Voice.isEnabled()) {
      Voice.setEnabled(true);
      updateVoice();
    }
  }
  function guideOf(type) { return (global.PART_GUIDES && PART_GUIDES[type]) || null; }
  function explainText(type, prefix) {
    var g = guideOf(type);
    if (!g) return prefix || '';
    return [prefix, g.what, g.how, g.tip].filter(Boolean).join(' ');
  }
  /* 额定值也要念出来：这就是「真实电路」里零件能承受的极限 */
  function specSayOf(part) {
    var t = global.specTextOf ? specTextOf(part) : '';
    return t ? '它的参数是：' + t.replace(/·/g, '，') + '。' : '';
  }
  function explainType(type) {
    var g = guideOf(type);
    if (!g) return;
    var name = type === 'wire' ? '电线' : (PARTS[type] ? PARTS[type].name : type);
    var spec = '';
    if (type === 'wire') spec = '电线能通过的电流大约是 1 安培。';
    else if (PARTS[type]) spec = specSayOf({ type: type, props: (global.DEFAULT_PROPS && DEFAULT_PROPS[type]) || {} });
    speak(name + '。' + explainText(type) + ' ' + spec);
  }
  function explainPart(part, prefix) {
    if (!part) return;
    var g = guideOf(part.type);
    if (!g) return;
    var burnt = App.state.burnt && App.state.burnt[part.id];
    var text = [prefix, PARTS[part.type].name + '。' + g.what, g.how, g.tip, specSayOf(part),
      burnt ? '它现在烧坏了，点「换一个新的」就能继续玩。' : ''].filter(Boolean).join(' ');
    speak(text);
    renderInspector();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    el.partsGrid = $('partsGrid');
    el.partsLayer = $('partsLayer');
    el.wireLayer = $('wireLayer');
    el.effectsLayer = $('effectsLayer');
    el.stage = $('stage');
    el.stageHolder = $('stageHolder');
    el.boardCanvas = $('boardCanvas');
    el.boardPanel = $('boardPanel');
    el.partQuick = $('partQuick');
    el.emptyHint = $('emptyHint');
    el.statusText = $('statusText');
    el.statusExtra = $('statusExtra');
    el.doctorBubble = $('doctorBubble');
    el.meterValue = $('meterValue');
    el.meterBar = $('meterBar');
    el.meterNote = $('meterNote');
    el.taskList = $('taskList');
    el.inspectBody = $('inspectBody');
    el.inspectCard = $('inspectCard');
    el.btnRun = $('btnRun');
    el.runText = $('runText');
    el.btnUndo = $('btnUndo');
    el.btnRedo = $('btnRedo');
    el.btnShare = $('btnShare');
    el.btnWireStyle = $('btnWireStyle');
    el.btnWireLabels = $('btnWireLabels');
    el.btnSound = $('btnSound');
    el.btnVoice = $('btnVoice');
    el.btnVoiceSlow = $('btnVoiceSlow');
    el.btnVoiceAgain = $('btnVoiceAgain');
    el.voiceText = $('voiceText');
    el.btnHearProblem = $('btnHearProblem');
    el.btnListenDoctor = $('btnListenDoctor');
    el.statusPill = $('statusPill');
    el.doctorBubble = $('doctorBubble');
    el.guideBody = $('guideBody');
    el.guideProgress = $('guideProgress');
    el.logList = $('logList');
    el.btnLogClear = $('btnLogClear');
    el.modalRoot = $('modalRoot');
    el.modalCard = $('modalCard');
    el.toastRoot = $('toastRoot');

    el.wireLayer.innerHTML = '<defs></defs><g class="wires" id="wiresGroup"></g><g class="previews" id="previewGroup"></g>';
    el.wiresGroup = $('wiresGroup');
    el.previewGroup = $('previewGroup');

    renderPalette();
    renderTasks();

    on($('btnRun'), 'click', function () { App.toggleRun(); });
    on(el.btnUndo, 'click', function () { App.undo(); });
    on(el.btnRedo, 'click', function () { App.redo(); });
    on(el.btnShare, 'click', function () { App.shareCircuit(); });
    on($('btnClear'), 'click', function () { App.clearBoard(); });
    on($('btnHelp'), 'click', showHelp);
    on($('btnExamples'), 'click', showExamples);
    on($('btnHospital'), 'click', showHospital);
    on($('btnLogRecord'), 'click', function () { App.recordMeasurement(); });
    on(el.btnLogClear, 'click', function () { App.clearLog(); });
    on(el.btnWireLabels, 'click', function () { App.setWireLabels(!App.state.wireLabels); });
    on(el.btnWireStyle, 'click', function () {
      App.setWireStyle(App.state.wireStyle === 'ortho' ? 'curve' : 'ortho');
    });
    on(el.btnSound, 'click', function () {
      App.audio.setEnabled(!App.state.sound);
      try { localStorage.setItem('xiaoxiao-dianlucheng-sound', App.state.sound ? 'on' : 'off'); } catch (e) {}
      updateSound();
      if (App.state.sound) App.audio.click();
      App.evaluate();
    });
    on(el.btnVoice, 'click', function () {
      if (global.Voice) {
        var on = Voice.toggle();
        updateVoice();
        if (on) Voice.speak('中文朗读打开啦。点一个零件，我就告诉你它是做什么的。');
        else UI.toast('中文朗读关掉啦');
      }
    });
    on(el.btnHearProblem, 'click', function () { ensureVoice(); speakProblem(true); });
    on(el.btnVoiceSlow, 'click', function () {
      if (!global.Voice || !Voice.supported()) return;
      ensureVoice();
      var next = !Voice.state.slow;
      Voice.setSlow(next);
      updateVoiceSlow();
      UI.toast(next ? '朗读变慢啦 🐢' : '朗读恢复正常速度');
      Voice.speak(next ? '好的，我念慢一点。' : '恢复正常速度啦。');
    });
    on(el.btnVoiceAgain, 'click', function () {
      if (!global.Voice || !Voice.supported()) return;
      ensureVoice();
      if (!Voice.state.lastText) { UI.toast('我还没有念过话呢，先点一个零件吧'); return; }
      Voice.repeat();
    });
    on(el.btnListenDoctor, 'click', function () {
      ensureVoice();
      speak(el.doctorBubble.getAttribute('data-speak') || el.doctorBubble.textContent || '');
    });
    on(el.statusPill, 'click', function () { ensureVoice(); speakProblem(true); });
    on($('zoomIn'), 'click', function () { setZoom(App.state.zoom + 0.2); });
    on($('zoomOut'), 'click', function () { setZoom(App.state.zoom - 0.2); });
    on($('zoomFit'), 'click', function () { fitToContent(); });
    /* 触控板双指捏合 / 按住 Ctrl 滚轮：在电路板上缩放 */
    el.boardCanvas.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(App.state.zoom * (e.deltaY < 0 ? 1.12 : 0.89));
    }, { passive: false });
    el.boardCanvas.addEventListener('scroll', scheduleQuickPosition, { passive: true });
    on(el.partQuick, 'focusout', function () {
      setTimeout(function () {
        if (el.partQuick.hidden) return;
        renderInspector();
        if (!el.partQuick.contains(document.activeElement)) renderQuickEditor();
      }, 0);
    });
    on(el.partQuick, 'keydown', function (e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      var sel = App.state.selection;
      var id = sel && sel.kind === 'part' ? sel.id : null;
      select(null);
      if (id && partEls[id] && partEls[id].focus) partEls[id].focus();
    });

    on(el.modalRoot, 'click', function (e) {
      if (e.target.hasAttribute('data-close') || e.target.closest('.modal-close')) closeModal();
    });
    on(el.modalRoot, 'keydown', function (e) {
      if (e.key !== 'Tab' || el.modalRoot.hidden) return;
      var f = Array.prototype.filter.call(
        el.modalCard.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        function (n) { return !n.disabled && n.offsetParent !== null; }
      );
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    on(document, 'keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!el.modalRoot.hidden) closeModal();
      if (global.Interact) Interact.cancelWire();
    });

    var pressX = 0, pressY = 0;
    on(el.partsLayer, 'pointerdown', function (e) {
      pressX = e.clientX; pressY = e.clientY;
      var term = e.target.closest('.terminal');
      if (term) { Interact.startTerminal(e, term); return; }
      var del = e.target.closest('.part-del');
      if (del) { e.stopPropagation(); App.deletePart(del.closest('.part').dataset.id); return; }
      var partEl = e.target.closest('.part');
      if (partEl) Interact.startPartDrag(e, partEl);
    });
    /* 点一下零件：中文讲解它是干什么的 */
    on(el.partsLayer, 'click', function (e) {
      if (e.target.closest('.terminal') || e.target.closest('.part-del')) return;
      var partEl = e.target.closest('.part');
      if (!partEl) return;
      /* 拖完零件松手时浏览器也可能补一个 click：别把拖动当成点击去讲解、去滚面板 */
      if (Math.abs(e.clientX - pressX) > 6 || Math.abs(e.clientY - pressY) > 6) return;
      if (explainTimer) { clearTimeout(explainTimer); explainTimer = null; }
      var id = partEl.dataset.id;
      explainTimer = setTimeout(function () {
        explainTimer = null;
        var part = App.byId(id);
        if (!part) return;
        select({ kind: 'part', id: id });
        var info = infoFor(id);
        var extra = '';
        if (info && App.state.running && Math.abs(info.current) > 0.0008) {
          extra = '现在它里面有' + App.formatCurrent(info.current) + '的电流。';
        }
        explainPart(part, extra);
      }, 230);
    });
    on(el.partsLayer, 'dblclick', function (e) {
      if (explainTimer) { clearTimeout(explainTimer); explainTimer = null; }
      var term = e.target.closest('.terminal');
      if (term) return;
      var partEl = e.target.closest('.part');
      /* 开关和按钮要用手按，双击不删它们，免得按两下就没了 */
      if (partEl && partEl.dataset.type !== 'switch' && partEl.dataset.type !== 'button') {
        App.deletePart(partEl.dataset.id);
      }
    });
    /* 键盘连线：Tab 到接线点，按回车选第一个点，再 Tab + 回车选第二个点 */
    on(el.partsLayer, 'click', function (e) {
      var term = e.target.closest('.terminal');
      if (!term || e.detail !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (Interact.chooseTerminal) Interact.chooseTerminal(term);
    });
    /* 键盘选中零件：回车听讲解，Delete 删除 */
    on(el.partsLayer, 'keydown', function (e) {
      var partEl = e.target.closest('.part');
      if (!partEl || e.target !== partEl) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var part = App.byId(partEl.dataset.id);
        if (!part) return;
        select({ kind: 'part', id: part.id });
        explainPart(part);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        App.deletePart(partEl.dataset.id);
      }
    });
    on(el.wiresGroup, 'click', function (e) {
      var x = e.target.closest('.wire-x');
      if (x) {
        var wg = x.closest('.wire');
        if (wg) { App.state.selection = { kind: 'wire', id: wg.dataset.wire }; App.deleteSelection(); }
        return;
      }
      var g = e.target.closest('.wire');
      if (g) {
        select({ kind: 'wire', id: g.dataset.wire });
        var w = App.state.wires.find(function (q) { return q.id === g.dataset.wire; });
        var wi = w && App.state.sim && App.state.sim.wires[w.id];
        var t = guideOf('wire');
        var extra2 = wi && App.state.running && Math.abs(wi.current) > 0.0008
          ? '这根电线里现在有' + App.formatCurrent(wi.current) + '的电流。' : '';
        speak('电线。' + (t ? t.what + ' ' + t.how + ' ' + t.tip : '') + ' ' + extra2);
        /* 第一次点电线时，告诉小朋友怎么删掉它 */
        if (!wireHintShown) {
          wireHintShown = true;
          UI.toast('点电线中间的 ✕ 就能删掉它，也可以按 Delete 键', 'good', { silent: true });
        }
      }
    });
    on(el.stage, 'pointerdown', function (e) {
      if (e.target.closest('.part') || e.target.closest('.wire')) return;
      select(null);
      if (global.Interact) Interact.cancelWire();
    });

    on(global, 'resize', applyZoom);
    if (global.ResizeObserver) new ResizeObserver(applyZoom).observe(el.boardCanvas);
    if (global.Interact) Interact.init();
    requestAnimationFrame(function () { applyZoom(); tick(0); });
  }

  /* ---------- 零件箱 ---------- */
  function renderPalette() {
    el.partsGrid.innerHTML = '';
    PART_ORDER.forEach(function (type) {
      var wrap = document.createElement('div');
      wrap.className = 'chip-wrap';

      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'part-chip' + (type === 'wire' ? ' tool-chip' : '');
      chip.dataset.type = type;
      chip.setAttribute('data-nospeak', '1');
      var icon = CHIP_ICONS[type] || '';
      var label = type === 'wire' ? '电线' : (PARTS[type] ? PARTS[type].short : type);
      var badge = type === 'wire' ? '<span class="chip-badge">点我</span>' : '';
      chip.innerHTML = badge + icon + '<span>' + label + '</span>';
      on(chip, 'pointerdown', function (e) { Interact.startSpawn(e, type, chip); });
      /* 键盘用户按回车 / 空格时，浏览器发出的是 detail=0 的 click */
      on(chip, 'click', function (e) {
        if (e.detail !== 0) return;
        e.preventDefault();
        if (type === 'wire') { toggleWireMode(chip); return; }
        if (Interact.placeFromPalette) Interact.placeFromPalette(type);
      });

      var info = document.createElement('button');
      info.type = 'button';
      info.className = 'chip-info';
      info.dataset.nospeak = '1';
      info.title = '听一听' + label + '是做什么的';
      info.setAttribute('aria-label', '听一听' + label + '是做什么的');
      info.textContent = '?';
      on(info, 'pointerdown', function (e) { e.stopPropagation(); });
      on(info, 'click', function (e) {
        e.stopPropagation();
        App.audio.click();
        explainType(type);
        UI.toast(label + '：' + (guideOf(type) ? guideOf(type).what : ''), 'good', { silent: true });
      });

      wrap.appendChild(chip);
      wrap.appendChild(info);
      el.partsGrid.appendChild(wrap);
    });
  }

  /* ---------- 渲染零件 ---------- */
  function partSig(part) { return JSON.stringify(part.props); }
  function partInner(part) {
    var def = PARTS[part.type];
    var terms = def.terms.map(function (t) {
      return '<button class="terminal' + (t.tone ? ' t-' + t.tone : '') + '" data-part="' + part.id + '" data-term="' + t.id +
        '" title="接线点" aria-label="' + def.name + '的接线点 ' + (t.label || t.id) +
        '，按回车开始连线" style="left:' + t.x + 'px;top:' + t.y + 'px">' + (t.label || '') + '</button>';
    }).join('');
    return '<div class="part-body"></div>' + def.art(part) + terms +
      '<button class="part-del" title="删除" tabindex="-1">🗑️</button>' +
      '<span class="part-badge"></span>';
  }
  function syncPartEl(part, selectedId) {
    var node = partEls[part.id];
    if (!node) {
      node = document.createElement('div');
      node.className = 'part';
      node.dataset.id = part.id;
      node.dataset.type = part.type;
      partEls[part.id] = node;
      el.partsLayer.appendChild(node);
      node.innerHTML = partInner(part);
      node._sig = partSig(part);
    } else if (node.dataset.type !== part.type || node._sig !== partSig(part)) {
      node.dataset.type = part.type;
      node.innerHTML = partInner(part);
      node._sig = partSig(part);
    }
    var def = PARTS[part.type];
    node.style.left = part.x + 'px';
    node.style.top = part.y + 'px';
    node.style.width = def.w + 'px';
    node.style.height = def.h + 'px';
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', def.name + '，按回车听讲解，按 Delete 删除');
    var delBtn = node.querySelector('.part-del');
    if (delBtn) delBtn.tabIndex = selectedId === part.id ? 0 : -1;
    node.classList.toggle('selected', !!(selectedId && selectedId === part.id));
    node.classList.toggle('is-led', part.type === 'led');
    node.classList.toggle('is-pressed', part.type === 'button' && !!part.props.pressed);
    if (part.type === 'led') {
      node.style.setProperty('--led-color', part.props.color || '#ff5d5d');
      node.style.setProperty('--glow-color', part.props.color || '#ff5d5d');
    }
  }
  function renderParts() {
    var seen = {};
    var sel = App.state.selection;
    var selId = sel && sel.kind === 'part' ? sel.id : null;
    App.state.parts.forEach(function (p) { seen[p.id] = 1; syncPartEl(p, selId); });
    Object.keys(partEls).forEach(function (id) {
      if (!seen[id]) { partEls[id].remove(); delete partEls[id]; }
    });
  }
  /* 仿真时每 120ms 会刷新一次外观，但零件没动、电流方向没变时，
     电线的走法不用重新算。这个签名就是用来复用上一次的路径的。 */
  function wireRenderSig() {
    var s = (App.state.wireStyle || 'curve') + '|';
    App.state.parts.forEach(function (p) {
      s += p.id + ':' + p.type + ':' + p.x + ':' + p.y + ';';
    });
    s += '|';
    App.state.wires.forEach(function (w) {
      var info = App.state.sim && App.state.sim.wires[w.id];
      var rev = App.state.running && info && info.current < -0.0008 ? -1 : 1;
      s += w.id + ':' + w.a.part + '.' + w.a.term + ':' + w.b.part + '.' + w.b.term + ':' + rev + ';';
    });
    return s;
  }
  function renderWires() {
    var sim = App.state.sim;
    var running = App.state.running;
    var sel = App.state.selection;
    var fault = App.state.lastFault;
    var shortWire = {};
    if ((running || App.state.exploding) && fault && fault.code === 'short') {
      (fault.wireIds || []).forEach(function (id) { shortWire[id] = 1; });
    }
    var html = '';
    var sig = wireRenderSig();
    var useCache = !!(lastWirePaths && lastWireSig === sig);
    if (useCache) {
      for (var ci = 0; ci < App.state.wires.length; ci++) {
        if (!lastWirePaths[App.state.wires[ci].id]) { useCache = false; break; }
      }
    }
    var paths = useCache ? lastWirePaths : {};
    var used = [], usedCells = {};
    var items = [];
    App.state.wires.forEach(function (w) {
      var ends = App.wireEnds(w); if (!ends) return;
      var info = sim && sim.wires[w.id];
      var cur = info ? info.current : 0;
      var active = running && Math.abs(cur) > 0.0008;
      var hot = (running || App.state.exploding) && Math.abs(cur) > CircuitSim.SHORT_A;
      var d = useCache ? paths[w.id] : null;
      if (!d) {
        var p1 = ends[0], p2 = ends[1], fromPart = w.a.part, toPart = w.b.part, tmp;
        if (running && cur < -0.0008) {
          tmp = p1; p1 = p2; p2 = tmp;
          tmp = fromPart; fromPart = toPart; toPart = tmp;
        }
        var skip = {}; skip[w.a.part] = 1; skip[w.b.part] = 1;
        var ownRects = [];
        [w.a.part, w.b.part].forEach(function (id) {
          var part = App.byId(id); if (!part) return;
          var def = PARTS[part.type]; if (!def || part.type === 'breadboard') return;
          ownRects.push({ x1: part.x - 9, y1: part.y - 9, x2: part.x + def.w + 9, y2: part.y + def.h + 9 });
        });
        d = pathD(p1, p2, wireObstacles(skip), {
          fromPart: fromPart, toPart: toPart, ownRects: ownRects,
          used: used, usedCells: usedCells
        });
        paths[w.id] = d;
      }
      items.push({ w: w, d: d, info: info, active: active, hot: hot });
    });

    /* 找出两根电线交叉的地方：
       横竖线模式：上面那根线在交叉处拱一个小桥；
       曲线模式：在下面那根线上开一个小口，看起来像跨过去。 */
    var ptsArr = items.map(function (it) { return wirePathPts(it.d); });
    var hopLists = items.map(function () { return null; });
    var gapHtml = items.map(function () { return ''; });
    for (var ai = 0; ai < items.length; ai++) {
      for (var bi = ai + 1; bi < items.length; bi++) {
        var xs = crossingPoints(ptsArr[ai], ptsArr[bi]);
        for (var xi = 0; xi < xs.length; xi++) {
          var x = xs[xi];
          if (App.state.wireStyle === 'ortho') {
            if (!hopLists[bi]) hopLists[bi] = [];
            hopLists[bi].push({ i: x.bi, t: x.tb });
          } else {
            var gd = gapPathAt(ptsArr[ai], x.ai, x);
            if (gd) gapHtml[ai] += '<path class="wire-gap" d="' + gd + '"/>';
          }
        }
      }
    }

    var html = '';
    items.forEach(function (it, idx) {
      var d = it.d;
      var gap = gapHtml[idx] || '';
      if (App.state.wireStyle === 'ortho' && hopLists[idx] && hopLists[idx].length) {
        var hop = orthoHopD(ptsArr[idx], hopLists[idx]);
        d = hop.d;
        gap += hop.gaps.filter(Boolean).map(function (g) { return '<path class="wire-gap" d="' + g + '"/>'; }).join('');
      }
      var g = '<g class="wire ' + (it.active ? 'active' : 'idle') + (it.hot ? ' hot' : '') +
        (shortWire[it.w.id] ? ' short-path' : '') +
        ((sel && sel.kind === 'wire' && sel.id === it.w.id) ? ' selected' : '') +
        '" data-wire="' + it.w.id + '" style="--wire:' + (it.w.color || '#c8bfa9') + '">' +
        '<path class="wire-hit" d="' + d + '"/>' +
        '<path class="wire-case" d="' + d + '"/>' +
        '<path class="wire-core" d="' + d + '"/>' +
        '<path class="wire-flow" d="' + d + '"/>' + gap +
        '</g>';
      html += g;
    });

    /* 几根线接在同一个接线柱上时，画一个实心小圆点，和真实电路图一样 */
    var junction = {};
    App.state.wires.forEach(function (w) {
      ['a', 'b'].forEach(function (k) {
        var key = w[k].part + '|' + w[k].term;
        junction[key] = (junction[key] || 0) + 1;
      });
    });
    var jDots = '';
    Object.keys(junction).forEach(function (key) {
      if (junction[key] < 2) return;
      var arr = key.split('|');
      var part = App.byId(arr[0]);
      if (!part) return;
      var p = App.termPos(part, arr[1]);
      if (!p) return;
      jDots += '<circle class="junction-dot" cx="' + r1(p.x) + '" cy="' + r1(p.y) + '" r="5"/>';
    });
    if (jDots) html += '<g class="wire-junctions">' + jDots + '</g>';

    lastWireSig = sig;
    lastWirePaths = paths;
    el.wiresGroup.innerHTML = html;
    wireVisuals = {};
    Array.prototype.forEach.call(el.wiresGroup.querySelectorAll('.wire'), function (g) {
      var path = g.querySelector('.wire-core');
      var wicket = g.querySelector('.wire-flow');
      var len = 0;
      try { len = path.getTotalLength(); } catch (e) { len = 0; }
      var count = Math.max(1, Math.min(7, Math.round(len / 110)));
      var dots = [];
      for (var i = 0; i < count; i++) {
        var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('r', '4.4'); c.setAttribute('class', 'flow-dot');
        g.appendChild(c); dots.push(c);
      }
      var info = sim && sim.wires[g.dataset.wire];
      if (info && active0(info)) {
        wicket.style.animationDuration = Math.max(0.16, 0.5 - Math.min(Math.abs(info.current), 0.3) * 1.1) + 's';
      }
      // 选中的电线中间显示一个「✕」删除按钮
      var mid = { x: 0, y: 0 };
      try { mid = path.getPointAtLength(len / 2); } catch (e) {}
      var xg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      xg.setAttribute('class', 'wire-x');
      /* 缩小看全图时，把 ✕ 放大一点，保证在屏幕上是差不多大的 */
      var xk = Math.max(1, Math.min(3, 1 / (App.state.scale || 1)));
      xg.setAttribute('transform', 'translate(' + r1(mid.x) + ' ' + r1(mid.y) + ') scale(' + xk.toFixed(2) + ')');
      var xc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      xc.setAttribute('r', '23');
      var xt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      xt.setAttribute('y', '8'); xt.setAttribute('text-anchor', 'middle');
      xt.textContent = '✕';
      var xtt = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      xtt.textContent = '删除这根电线';
      xg.appendChild(xtt); xg.appendChild(xc); xg.appendChild(xt);
      g.appendChild(xg);
      /* 电流标签：缩放时反向放大，保证屏幕上的字号差不多 */
      if (App.state.wireLabels && running && info && Math.abs(info.current) > 0.0008 &&
          !(sel && sel.kind === 'wire' && sel.id === g.dataset.wire)) {
        var lg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        lg.setAttribute('class', 'wire-label');
        lg.setAttribute('transform', 'translate(' + r1(mid.x) + ' ' + r1(mid.y) + ') scale(' + xk.toFixed(2) + ')');
        var lr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        lr.setAttribute('x', '-31'); lr.setAttribute('y', '-40');
        lr.setAttribute('width', '62'); lr.setAttribute('height', '22');
        lr.setAttribute('rx', '9');
        var lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lt.setAttribute('x', '0'); lt.setAttribute('y', '-24');
        lt.setAttribute('text-anchor', 'middle');
        lt.textContent = App.formatCurrent(info.current);
        lg.appendChild(lr); lg.appendChild(lt);
        g.appendChild(lg);
      }
      wireVisuals[g.dataset.wire] = { group: g, path: path, flow: wicket, dots: dots, length: len };
    });
  }
  function active0(info) { return Math.abs(info.current) > 0.0008; }
  /* 电线要绕开零件，不要从零件底下穿过去，不然看不清线路怎么走。
     做法：从默认的「往下垂」开始，一点点加大下垂；再试往上拱。
     哪条曲线穿过的零件最少就用哪条，0 分就是完美路线。 */
  function wireObstacles(skip) {
    var list = [];
    App.state.parts.forEach(function (p) {
      if (skip && skip[p.id]) return;
      var def = PARTS[p.type]; if (!def) return;
      list.push({ x1: p.x - 9, y1: p.y - 9, x2: p.x + def.w + 9, y2: p.y + def.h + 9 });
    });
    return list;
  }
  function curvePoints(p1, p2, mx, my) {
    var pts = [], i, t, mt;
    for (i = 1; i < 15; i++) {
      t = i / 15; mt = 1 - t;
      pts.push({
        x: mt * mt * p1.x + 2 * mt * t * mx + t * t * p2.x,
        y: mt * mt * p1.y + 2 * mt * t * my + t * t * p2.y
      });
    }
    return pts;
  }
  /* 给曲线打分：穿过零件、跑出工作台都算「不好」，0 分就是完美路线 */
  function curveScore(pts, rects) {
    var score = 0;
    for (var i = 0; i < pts.length; i++) {
      var q = pts[i];
      if (q.x < 8 || q.x > 1192 || q.y < 8 || q.y > 752) { score += 2; continue; }
      for (var j = 0; j < rects.length; j++) {
        var r = rects[j];
        if (q.x > r.x1 && q.x < r.x2 && q.y > r.y1 && q.y < r.y2) { score++; break; }
      }
    }
    return score;
  }
  function curvePathD(p1, p2, rects) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / dist, ny = dx / dist;
    if (ny < 0) { nx = -nx; ny = -ny; }
    var base = Math.max(18, Math.min(200, dist * 0.28));
    var cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
    var mx = cx + nx * base, my = cy + ny * base;
    if (rects && rects.length) {
      var mults = [1, 1.5, 2, 2.7, 3.5, 4.5, 6];
      var side, i, best = 1e9;
      for (side = 0; side < 2; side++) {
        var sign = side === 0 ? 1 : -1;      /* 先往下垂，再试往上拱 */
        for (i = 0; i < mults.length; i++) {
          var sag = base * mults[i];
          var tx = cx + nx * sag * sign, ty = cy + ny * sag * sign;
          var sc = curveScore(curvePoints(p1, p2, tx, ty), rects);
          if (sc < best) { best = sc; mx = tx; my = ty; }
          if (!best) break;
        }
        if (!best) break;
      }
      /* 实在绕不开（比如零件围成一圈），就用「挡住最少」的那条曲线 */
    }
    return 'M ' + r1(p1.x) + ' ' + r1(p1.y) + ' Q ' + r1(mx) + ' ' + r1(my) + ' ' + r1(p2.x) + ' ' + r1(p2.y);
  }

  /* ---------- 横竖走线（正交 / 曼哈顿布线） ----------
     小朋友线一多就容易看花。这个模式让电线只走横线和竖线：
     1. 先从接线柱往外伸一小段，避免从零件里面钻出来；
     2. 先生成几条简单的 L 形 / Z 形路线；
     3. 用「穿零件、跑出工作台、和别的线重叠、拐弯太多」给它们打分；
     4. 简单路线都绕不开时，再用小网格 A* 找一条真正绕过零件的路。 */
  function termNormal(partId, p) {
    var part = App.byId(partId);
    if (!part) return null;
    var def = PARTS[part.type];
    if (!def) return null;
    /* 面包板的接线点在板子里面，上下出线更像真实的杜邦线 */
    if (part.type === 'breadboard') {
      return { x: 0, y: p.y < part.y + def.h / 2 ? -1 : 1 };
    }
    var dl = Math.abs(p.x - part.x);
    var dr = Math.abs(p.x - (part.x + def.w));
    var dt = Math.abs(p.y - part.y);
    var db = Math.abs(p.y - (part.y + def.h));
    var m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: -1, y: 0 };
    if (m === dr) return { x: 1, y: 0 };
    if (m === dt) return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  }
  function facingNormal(p, q) {
    var dx = q.x - p.x, dy = q.y - p.y;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? 1 : -1, y: 0 };
    return { x: 0, y: dy >= 0 ? 1 : -1 };
  }
  function sameNum(a, b) { return Math.abs(a - b) < 0.01; }
  function cleanOrtho(pts) {
    var out = [], i;
    for (i = 0; i < pts.length; i++) {
      var p = { x: r1(pts[i].x), y: r1(pts[i].y) };
      if (!out.length || !sameNum(p.x, out[out.length - 1].x) || !sameNum(p.y, out[out.length - 1].y)) out.push(p);
    }
    for (i = 1; i < out.length - 1;) {
      var a = out[i - 1], b = out[i], c = out[i + 1];
      var sameX = sameNum(a.x, b.x) && sameNum(b.x, c.x);
      var sameY = sameNum(a.y, b.y) && sameNum(b.y, c.y);
      var forward = sameX ? (c.y - b.y) * (b.y - a.y) >= 0 : (c.x - b.x) * (b.x - a.x) >= 0;
      var reverseLen = sameX ? Math.min(Math.abs(b.y - a.y), Math.abs(c.y - b.y)) :
        (sameY ? Math.min(Math.abs(b.x - a.x), Math.abs(c.x - b.x)) : 0);
      /* 很短的「回头路」只是网格对齐留下的小毛刺，直接抹平；
         真正绕过障碍的大幅折返要保留。 */
      if ((sameX || sameY) && (forward || reverseLen < 6)) out.splice(i, 1);
      else i++;
    }
    return out;
  }
  function pointsToPath(pts) {
    var d = 'M ' + r1(pts[0].x) + ' ' + r1(pts[0].y);
    for (var i = 1; i < pts.length; i++) d += ' L ' + r1(pts[i].x) + ' ' + r1(pts[i].y);
    return d;
  }
  /* 把电线路径还原成点列，用来找「两根线在哪里交叉」 */
  function wirePathPts(d) {
    var nums = String(d || '').match(/-?\d+(?:\.\d+)?/g) || [];
    if (nums.length < 2) return [];
    var pts = [{ x: +nums[0], y: +nums[1] }], i;
    var q = /Q\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/.exec(d);
    if (q) {
      var p1 = pts[0], m = { x: +q[1], y: +q[2] }, p2 = { x: +q[3], y: +q[4] };
      for (i = 1; i < 12; i++) {
        var t = i / 12, mt = 1 - t;
        pts.push({
          x: mt * mt * p1.x + 2 * mt * t * m.x + t * t * p2.x,
          y: mt * mt * p1.y + 2 * mt * t * m.y + t * t * p2.y
        });
      }
      pts.push(p2);
      return pts;
    }
    for (i = 2; i + 1 < nums.length; i += 2) pts.push({ x: +nums[i], y: +nums[i + 1] });
    return pts;
  }
  function segLen(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function segSegX(p1, p2, p3, p4) {
    var d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    var d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    var den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) return null;
    var t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
    var u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: p1.x + t * d1x, y: p1.y + t * d1y, ta: t, tb: u };
  }
  /* 两根电线在哪里交叉（离两边端点太近的不算，那是接线柱） */
  function crossingPoints(A, B) {
    var out = [], i, j;
    if (A.length < 2 || B.length < 2) return out;
    for (i = 0; i < A.length - 1; i++) {
      for (j = 0; j < B.length - 1; j++) {
        var la = segLen(A[i], A[i + 1]), lb = segLen(B[j], B[j + 1]);
        if (la < 14 || lb < 14) continue;
        var x = segSegX(A[i], A[i + 1], B[j], B[j + 1]);
        if (!x) continue;
        if (x.ta * la < 8 || (1 - x.ta) * la < 8) continue;
        if (x.tb * lb < 8 || (1 - x.tb) * lb < 8) continue;
        out.push({ x: x.x, y: x.y, ai: i, ta: x.ta, bi: j, tb: x.tb });
      }
    }
    return out;
  }
  /* 曲线模式下：在下面那根线上开一个小口，上面的线「跨」过去 */
  function gapPathAt(pts, segIdx, point) {
    if (!point || !isFinite(point.x) || !isFinite(point.y) || !pts || !pts[segIdx] || !pts[segIdx + 1]) {
      console.warn('gapPathAt bad', segIdx, point, pts && pts.length);
      return '';
    }
    var a = pts[segIdx], b = pts[segIdx + 1];
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len, half = 9;
    return 'M ' + r1(point.x - ux * half) + ' ' + r1(point.y - uy * half) +
      ' L ' + r1(point.x + ux * half) + ' ' + r1(point.y + uy * half);
  }
  /* 横竖模式下：上面那根线在交叉处拱一个小桥 */
  function orthoHopD(pts, crossings) {
    if (!crossings || !crossings.length) return { d: pointsToPath(pts), gaps: [] };
    var bySeg = {};
    crossings.forEach(function (c) {
      if (!bySeg[c.i]) bySeg[c.i] = [];
      bySeg[c.i].push(c);
    });
    var out = 'M ' + r1(pts[0].x) + ' ' + r1(pts[0].y);
    var gaps = [], i, k;
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var dx = b.x - a.x, dy = b.y - a.y;
      var len = segLen(a, b) || 1;
      var ux = dx / len, uy = dy / len;
      var list = (bySeg[i] || []).slice().sort(function (p, q) { return p.t - q.t; });
      var lastEnd = 0;
      for (k = 0; k < list.length; k++) {
        var c = list[k];
        var at = c.t * len;
        var cp = { x: a.x + dx * c.t, y: a.y + dy * c.t };
        if (at < 10 || at > len - 17) { gaps.push(gapPathAt(pts, i, cp)); continue; }
        if (at < lastEnd + 22) { gaps.push(gapPathAt(pts, i, cp)); continue; }
        var p1 = cp;
        var p2 = { x: p1.x + ux * 16, y: p1.y + uy * 16 };
        out += ' L ' + r1(p1.x) + ' ' + r1(p1.y);
        out += ' A 8 8 0 0 0 ' + r1(p2.x) + ' ' + r1(p2.y);
        lastEnd = at + 16;
      }
      out += ' L ' + r1(b.x) + ' ' + r1(b.y);
    }
    return { d: out, gaps: gaps };
  }
  function orthoSegments(pts) {
    var segs = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (sameNum(a.x, b.x) && sameNum(a.y, b.y)) continue;
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, h: sameNum(a.y, b.y) });
    }
    return segs;
  }
  function segHitsRect(s, r) {
    if (s.h) {
      var y = s.y1;
      if (y <= r.y1 || y >= r.y2) return false;
      return Math.max(s.x1, s.x2) > r.x1 + 0.01 && Math.min(s.x1, s.x2) < r.x2 - 0.01;
    }
    var x = s.x1;
    if (x <= r.x1 || x >= r.x2) return false;
    return Math.max(s.y1, s.y2) > r.y1 + 0.01 && Math.min(s.y1, s.y2) < r.y2 - 0.01;
  }
  function segClear(x1, y1, x2, y2, rects) {
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (sameNum(y1, y2)) {
        if (y1 > r.y1 && y1 < r.y2 &&
            Math.max(x1, x2) > r.x1 + 0.01 && Math.min(x1, x2) < r.x2 - 0.01) return false;
      } else if (sameNum(x1, x2)) {
        if (x1 > r.x1 && x1 < r.x2 &&
            Math.max(y1, y2) > r.y1 + 0.01 && Math.min(y1, y2) < r.y2 - 0.01) return false;
      }
    }
    return true;
  }
  function pointBlocked(x, y, rects) {
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (x > r.x1 && x < r.x2 && y > r.y1 && y < r.y2) return true;
    }
    return false;
  }
  function segOverlapLen(a, b) {
    if (a.h && b.h && Math.abs(a.y1 - b.y1) < 6) {
      var lo = Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
      var hi = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2));
      return Math.max(0, hi - lo);
    }
    if (!a.h && !b.h && Math.abs(a.x1 - b.x1) < 6) {
      var lo2 = Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
      var hi2 = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2));
      return Math.max(0, hi2 - lo2);
    }
    return 0;
  }
  function segPerpCross(a, b) {
    if (a.h === b.h) return false;
    var h = a.h ? a : b, v = a.h ? b : a;
    return v.x1 > Math.min(h.x1, h.x2) + 0.01 && v.x1 < Math.max(h.x1, h.x2) - 0.01 &&
      h.y1 > Math.min(v.y1, v.y2) + 0.01 && h.y1 < Math.max(v.y1, v.y2) - 0.01;
  }
  function scoreOrthoPath(pts, rects, ownRects, used) {
    var segs = orthoSegments(pts);
    var hits = 0, out = 0, overlap = 0, cross = 0, length = 0, i, j, s;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      length += Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
      /* 电线头两小段是「从接线柱伸出来」的，自己的零件不算挡路；
         但别的零件、以及中间所有路段都要躲开。 */
      for (j = 0; j < rects.length; j++) {
        if (segHitsRect(s, rects[j])) { hits++; break; }
      }
      if (ownRects && ownRects.length && i > 0 && i < segs.length - 1) {
        for (j = 0; j < ownRects.length; j++) {
          if (segHitsRect(s, ownRects[j])) { hits++; break; }
        }
      }
      if (Math.min(s.x1, s.x2) < 4 || Math.max(s.x1, s.x2) > 1196 ||
          Math.min(s.y1, s.y2) < 4 || Math.max(s.y1, s.y2) > 756) out++;
    }
    if (used && used.length) {
      for (i = 1; i < segs.length - 1; i++) {
        for (j = 0; j < used.length; j++) {
          overlap += segOverlapLen(segs[i], used[j]);
          if (segPerpCross(segs[i], used[j])) cross++;
        }
      }
    }
    /* 自己的线也不能来回叠在一起，否则看起来像打了个小圈 */
    var selfOverlap = 0;
    for (i = 0; i < segs.length; i++) {
      for (j = i + 1; j < segs.length; j++) selfOverlap += segOverlapLen(segs[i], segs[j]);
    }
    var bends = Math.max(0, pts.length - 2);
    return {
      pts: pts, segs: segs, hits: hits, out: out, overlap: overlap, cross: cross,
      selfOverlap: selfOverlap, length: length, bends: bends,
      score: hits * 120000 + out * 4000 + overlap * 2.2 + cross * 14 +
        selfOverlap * 50 + bends * 28 + length * 0.06
    };
  }
  function uniqNums(vals) {
    var arr = [], i;
    for (i = 0; i < vals.length; i++) {
      if (typeof vals[i] === 'number' && isFinite(vals[i])) arr.push(vals[i]);
    }
    arr.sort(function (a, b) { return a - b; });
    var out = [];
    for (i = 0; i < arr.length; i++) {
      var v = r1(arr[i]);
      if (!out.length || Math.abs(v - out[out.length - 1]) > 0.01) out.push(v);
    }
    return out;
  }
  function uniqLanes(vals, lo, hi) {
    var out = [], seen = {}, i;
    for (i = 0; i < vals.length; i++) {
      var v = r1(vals[i]);
      if (!isFinite(v) || v < lo || v > hi) continue;
      var k = String(v);
      if (seen[k]) continue;
      seen[k] = 1;
      out.push(v);
    }
    return out;
  }
  function buildOrthoCandidates(p1, p2, n1, n2, rects, ownRects, used) {
    /* 接线柱常常缩在零件边缘里面一点，伸出来的线头要够长，
       才能完全离开「零件 + 9px 安全边」，后面的正交路线才好走。
       两个接线柱离得很近时，线头自动缩短，避免两根线头互相越过、走出小回头路。 */
    var ddx = p2.x - p1.x, ddy = p2.y - p1.y;
    var dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    var stub = Math.min(30, Math.max(4, dist * 0.25), Math.max(4, dist / 2 - 1));
    var a = { x: r1(p1.x + n1.x * stub), y: r1(p1.y + n1.y * stub) };
    var b = { x: r1(p2.x + n2.x * stub), y: r1(p2.y + n2.y * stub) };
    var list = [], seen = {};
    function add(mid) {
      var pts = cleanOrtho([p1].concat(mid, [p2]));
      if (pts.length < 2) return;
      var d = pointsToPath(pts);
      if (seen[d]) return;
      seen[d] = 1;
      list.push(scoreOrthoPath(pts, rects, ownRects, used));
    }
    if (sameNum(a.x, b.x) || sameNum(a.y, b.y)) add([a, b]);
    add([a, { x: b.x, y: a.y }, b]);
    add([a, { x: a.x, y: b.y }, b]);
    var midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    var box = {
      x1: Math.min(a.x, b.x) - 220, x2: Math.max(a.x, b.x) + 220,
      y1: Math.min(a.y, b.y) - 220, y2: Math.max(a.y, b.y) + 220
    };
    var xl = [midX - 60, midX - 30, midX, midX + 30, midX + 60];
    var yl = [midY - 60, midY - 30, midY, midY + 30, midY + 60];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (r.x2 < box.x1 || r.x1 > box.x2 || r.y2 < box.y1 || r.y1 > box.y2) continue;
      xl.push(r.x1 - 16, r.x2 + 16);
      yl.push(r.y1 - 16, r.y2 + 16);
    }
    xl.push(18, 1182); yl.push(18, 742);
    xl = uniqLanes(xl, 8, 1192); yl = uniqLanes(yl, 8, 752);
    xl.forEach(function (x) { add([a, { x: x, y: a.y }, { x: x, y: b.y }, b]); });
    yl.forEach(function (y) { add([a, { x: a.x, y: y }, { x: b.x, y: y }, b]); });
    return { a: a, b: b, list: list };
  }
  function cellKey(x, y) { return Math.floor(x / 14) + ',' + Math.floor(y / 14); }
  function markOrthoUsed(pts, opts) {
    if (!opts) return;
    var segs = orthoSegments(pts), i;
    if (opts.used) for (i = 0; i < segs.length; i++) opts.used.push(segs[i]);
    if (!opts.usedCells) return;
    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      var len = Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
      var steps = Math.max(1, Math.ceil(len / 8));
      for (var j = 0; j <= steps; j++) {
        var t = j / steps;
        opts.usedCells[cellKey(s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t)] = 1;
      }
    }
  }
  function heapPush(heap, state, pri) {
    var i = heap.length;
    heap.push({ n: state, p: pri });
    while (i > 0) {
      var up = (i - 1) >> 1;
      if (heap[up].p <= heap[i].p) break;
      var t = heap[up]; heap[up] = heap[i]; heap[i] = t;
      i = up;
    }
  }
  function heapPop(heap) {
    if (!heap.length) return null;
    var top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      var i = 0;
      while (true) {
        var l = i * 2 + 1, r = l + 1, small = i;
        if (l < heap.length && heap[l].p < heap[small].p) small = l;
        if (r < heap.length && heap[r].p < heap[small].p) small = r;
        if (small === i) break;
        var t = heap[i]; heap[i] = heap[small]; heap[small] = t;
        i = small;
      }
    }
    return top;
  }
  /* 小网格 A*：只在简单路线都绕不开零件时使用 */
  function routeGrid(a, b, rects, opts) {
    var xs = [], ys = [], i;
    for (i = 12; i <= 1188; i += 20) xs.push(i);
    for (i = 12; i <= 748; i += 20) ys.push(i);
    xs.push(a.x, b.x); ys.push(a.y, b.y);
    xs = uniqNums(xs); ys = uniqNums(ys);
    var sx = xs.indexOf(a.x), sy = ys.indexOf(a.y);
    var gx = xs.indexOf(b.x), gy = ys.indexOf(b.y);
    if (sx < 0 || sy < 0 || gx < 0 || gy < 0) return null;
    if (pointBlocked(a.x, a.y, rects) || pointBlocked(b.x, b.y, rects)) return null;
    var nx = xs.length, ny = ys.length, xx, yy;
    var blocked = new Uint8Array(nx * ny);
    for (yy = 0; yy < ny; yy++) {
      for (xx = 0; xx < nx; xx++) {
        if (pointBlocked(xs[xx], ys[yy], rects)) blocked[yy * nx + xx] = 1;
      }
    }
    var start = sy * nx + sx, goal = gy * nx + gx;
    if (start === goal) return cleanOrtho([a, b]);
    var total = nx * ny * 4;
    var dist = new Float64Array(total); dist.fill(Infinity);
    var prev = new Int32Array(total); prev.fill(-1);
    var heap = [], d0;
    var h0 = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    for (d0 = 0; d0 < 4; d0++) {
      var s0 = start * 4 + d0;
      dist[s0] = 0;
      heapPush(heap, s0, h0);
    }
    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    var TURN = 26, OVER = 4, finalState = -1;
    while (heap.length) {
      var st = heapPop(heap);
      if (!st) break;
      if (st.p > dist[st.n] + 0.001) continue;
      var node = st.n >> 2, dir = st.n & 3;
      if (node === goal) { finalState = st.n; break; }
      var ix = node % nx, iy = (node / nx) | 0;
      for (var k = 0; k < 4; k++) {
        var jx = ix + dirs[k][0], jy = iy + dirs[k][1];
        if (jx < 0 || jx >= nx || jy < 0 || jy >= ny) continue;
        var jn = jy * nx + jx;
        if (blocked[jn]) continue;
        var x1 = xs[ix], y1 = ys[iy], x2 = xs[jx], y2 = ys[jy];
        if (!segClear(x1, y1, x2, y2, rects)) continue;
        var turn = k === dir ? 0 : TURN;
        var nearEnd = Math.abs(x2 - a.x) + Math.abs(y2 - a.y) < 10 ||
                      Math.abs(x2 - b.x) + Math.abs(y2 - b.y) < 10;
        var occ = 0;
        if (!nearEnd && opts && opts.usedCells) {
          if (opts.usedCells[cellKey((x1 + x2) / 2, (y1 + y2) / 2)]) occ += OVER;
          if (opts.usedCells[cellKey(x2, y2)]) occ += OVER;
        }
        /* 尽量别和已经画好的电线并排贴在一起；接线柱附近的共用线头除外 */
        var ov = 0;
        if (!nearEnd && opts && opts.used && opts.used.length) {
          var edgeSeg = { x1: x1, y1: y1, x2: x2, y2: y2, h: sameNum(y1, y2) };
          for (var ui = 0; ui < opts.used.length; ui++) ov += segOverlapLen(edgeSeg, opts.used[ui]);
        }
        var nd = dist[st.n] + Math.abs(x2 - x1) + Math.abs(y2 - y1) + turn + occ + ov * 2.2;
        var ns = jn * 4 + k;
        if (nd < dist[ns] - 0.001) {
          dist[ns] = nd; prev[ns] = st.n;
          heapPush(heap, ns, nd + Math.abs(b.x - x2) + Math.abs(b.y - y2));
        }
      }
    }
    if (finalState < 0) return null;
    var nodes = [], cur = finalState;
    while (cur !== -1) { nodes.push(cur >> 2); cur = prev[cur]; }
    nodes.reverse();
    var pts = [];
    for (i = 0; i < nodes.length; i++) {
      var ni = nodes[i], px = xs[ni % nx], py = ys[(ni / nx) | 0];
      if (!pts.length || !sameNum(px, pts[pts.length - 1].x) || !sameNum(py, pts[pts.length - 1].y)) {
        pts.push({ x: px, y: py });
      }
    }
    return cleanOrtho(pts);
  }
  function orthoPathD(p1, p2, rects, opts) {
    opts = opts || {};
    var n1 = opts.n1 || (opts.fromPart ? termNormal(opts.fromPart, p1) : null);
    var n2 = opts.n2 || (opts.toPart ? termNormal(opts.toPart, p2) : null);
    if (!n1 || (!n1.x && !n1.y)) n1 = facingNormal(p1, p2);
    if (!n2 || (!n2.x && !n2.y)) n2 = facingNormal(p2, p1);
    var otherRects = rects || [];
    var ownRects = opts.ownRects || [];
    var allRects = otherRects.slice();
    for (var i = 0; i < ownRects.length; i++) allRects.push(ownRects[i]);
    var built = buildOrthoCandidates(p1, p2, n1, n2, otherRects, ownRects, opts.used);
    var best = null, j;
    for (j = 0; j < built.list.length; j++) {
      if (!best || built.list[j].score < best.score) best = built.list[j];
    }
    if (!best || best.hits > 0 || best.out > 0 || best.overlap > 4) {
      var grid = routeGrid(built.a, built.b, allRects, opts);
      if (grid && grid.length) {
        var pts = cleanOrtho([p1].concat(grid, [p2]));
        var cand = scoreOrthoPath(pts, otherRects, ownRects, opts.used);
        if (!best || cand.hits < best.hits ||
            (cand.hits === best.hits && cand.out < best.out) ||
            (cand.hits === best.hits && cand.out === best.out && cand.score < best.score)) {
          best = cand;
        }
      }
    }
    if (!best) return curvePathD(p1, p2, otherRects);
    markOrthoUsed(best.pts, opts);
    return pointsToPath(best.pts);
  }
  function pathD(p1, p2, rects, opts) {
    if (App.state.wireStyle === 'ortho') return orthoPathD(p1, p2, rects, opts);
    return curvePathD(p1, p2, rects);
  }
  function r1(v) { return Math.round(v * 10) / 10; }

  function renderAll() {
    renderParts();
    renderWires();
    el.emptyHint.hidden = App.state.parts.length > 0;
  }
  function select(sel) {
    App.state.selection = sel;
    var selId = sel && sel.kind === 'part' ? sel.id : null;
    Object.keys(partEls).forEach(function (id) { partEls[id].classList.toggle('selected', id === selId); });
    renderWires();
    renderInspector();
    renderQuickEditor();
  }

  /* ---------- 根据仿真结果更新零件外观 ---------- */
  function refreshFromSim() {
    var sim = App.state.sim, running = App.state.running;
    var faultNow = App.state.lastFault;
    var shortParts = {};
    if ((running || App.state.exploding) && faultNow && faultNow.code === 'short') {
      (faultNow.partIds || []).forEach(function (id) { shortParts[id] = 1; });
      if (faultNow.partId) shortParts[faultNow.partId] = 1;
    }
    App.state.parts.forEach(function (p) {
      var node = partEls[p.id]; if (!node) return;
      var info = sim && sim.parts[p.id];
      var a = info ? Math.abs(info.current) : 0;
      var intensity = 0, spin = 1.2, on = false, back = false;
      if (running && info) {
        if (p.type === 'led') { intensity = Math.min(1.25, a / 0.012); on = a > 0.0008; }
        else if (p.type === 'lamp') { intensity = Math.min(1.25, a / 0.03); on = a > 0.001; }
        else if (p.type === 'buzzer') { intensity = Math.min(1, a / 0.02); on = a > 0.001; }
        else if (p.type === 'motor') {
          var speed = Math.min(1.5, a / 0.12); on = a > 0.002;
          spin = Math.max(0.22, 1.5 - speed * 0.9); intensity = Math.min(1, speed);
          back = info.current < -0.0002;      /* 电流反着流 = 电机反转 */
        } else if (p.type === 'diode') { on = a > 0.0008; intensity = Math.min(1, a / 0.05); }
        else if (p.type === 'resistor' || p.type === 'pot') { intensity = Math.min(0.8, Math.abs(info.power) / 0.6); }
      }
      var burnt = !!(App.state.burnt && App.state.burnt[p.id]);
      var heat = (App.state.heat && App.state.heat[p.id]) || 0;
      if (burnt) { intensity = 0; on = false; back = false; }
      node.style.setProperty('--intensity', intensity.toFixed(2));
      node.style.setProperty('--spin', spin.toFixed(2) + 's');
      node.style.setProperty('--heat', Math.min(1, heat).toFixed(2));
      node.classList.toggle('is-on', !!on);
      node.classList.toggle('is-back', !!back);
      node.classList.toggle('is-burnt', burnt);
      node.classList.toggle('is-hot', !burnt && heat > 0.02);
      node.classList.toggle('is-rev', !!(info && info.reversed) && !burnt);
      node.classList.toggle('is-short-path', !!shortParts[p.id] && !burnt);
      /* 电流表和电压表上的数字：断电时显示 0 */
      if (p.type === 'ammeter' || p.type === 'voltmeter') {
        var read = node.querySelector('.meter-read');
        if (read) {
          var liveRead = running && info && !burnt;
          if (p.type === 'ammeter') read.textContent = liveRead ? App.formatCurrent(info.current) : '0 mA';
          else read.textContent = liveRead ? Math.abs(info.vdrop).toFixed(2) + ' V' : '0.00 V';
        }
      }
      var live = running || App.state.exploding;   /* 爆炸动画期间也要继续提示是谁短路 */
      var battLoad = 0;
      if (p.type === 'battery' && sim && sim.batteries) {
        sim.batteries.forEach(function (b) { if (b.partId === p.id) battLoad = b.current; });
      }
      var battShort = !!(live && p.type === 'battery' && battLoad > CircuitSim.SHORT_A);
      var culpritShort = !!(live && faultNow && faultNow.code === 'short' && faultNow.partId === p.id);
      node.classList.toggle('is-short', battShort || culpritShort);
      var badge = node.querySelector('.part-badge');
      if (badge) {
        if (burnt) {
          badge.textContent = burnWord(p) + '啦 💨';
          badge.className = 'part-badge show burnt';
        } else if (heat > 0.15) {
          badge.textContent = '好烫！♨️';
          badge.className = 'part-badge show hot';
        } else if (running && info && info.reversed && (p.type === 'led' || p.type === 'diode')) {
          badge.textContent = p.type === 'led' ? '接反啦 🙃' : '接反啦';
          badge.className = 'part-badge show bad';
        } else if (running && p.type === 'led' && a > 0.004) {
          badge.textContent = '亮啦！';
          badge.className = 'part-badge show good';
        } else if (running && p.type === 'motor' && a > 0.01) {
          badge.textContent = info.current < 0 ? '反转 ⟲' : '正转 ⟳';
          badge.className = 'part-badge show good';
        } else {
          badge.className = 'part-badge';
        }
      }
    });
    renderWires();
  }
  /* 保险丝是「熔断」，别的零件是「烧坏」 */
  function burnWord(part) { return App.burnVerb ? App.burnVerb(part) : '烧坏'; }
  /* 按住 / 松开按钮（按住才通电） */
  function pressButton(part, on) {
    if (!part || !part.props) return;
    if (part.type !== 'button') return;
    if (!!part.props.pressed === !!on) return;
    part.props.pressed = !!on;
    var node = partEls[part.id];
    if (node) node.classList.toggle('is-pressed', !!on);
    var btn = $('insPress');
    if (btn) {
      btn.classList.toggle('on', !!on);
      btn.textContent = on ? '👆 正在通电…' : '👆 按住通电';
    }
    App.evaluate();
  }
  /* 过热 / 烧坏时的即时外观（通电时每 0.12 秒刷新一次，不重画电线） */
  function updateHeat() {
    App.state.parts.forEach(function (p) {
      var node = partEls[p.id]; if (!node) return;
      var burnt = !!(App.state.burnt && App.state.burnt[p.id]);
      var heat = (App.state.heat && App.state.heat[p.id]) || 0;
      node.style.setProperty('--heat', Math.min(1, heat).toFixed(2));
      node.classList.toggle('is-burnt', burnt);
      node.classList.toggle('is-hot', !burnt && heat > 0.02);
      var badge = node.querySelector('.part-badge');
      if (!badge) return;
      if (burnt) {
        badge.textContent = burnWord(p) + '啦 💨';
        badge.className = 'part-badge show burnt';
      } else if (heat > 0.15) {
        badge.textContent = '好烫！♨️';
        badge.className = 'part-badge show hot';
      } else if (/burnt|hot/.test(badge.className)) {
        badge.className = 'part-badge';
      }
    });
  }

  /* ---------- 动画：电线里的小电流点 ---------- */
  var lastTick = 0;
  function tick(now) {
    if (App.state.running && !App.state.exploding) {
      var sim = App.state.sim;
      Object.keys(wireVisuals).forEach(function (id) {
        var v = wireVisuals[id], info = sim && sim.wires[id];
        if (!v || !v.length || !info) return;
        var a = Math.abs(info.current);
        if (a < 0.0008) return;
        var speed = 130 + Math.min(a, 0.6) * 620;
        var n = v.dots.length;
        for (var i = 0; i < n; i++) {
          var t = (now / 1000 * speed + i * (v.length / n)) % v.length;
          var pt = v.path.getPointAtLength(t);
          v.dots[i].setAttribute('cx', pt.x);
          v.dots[i].setAttribute('cy', pt.y);
        }
      });
      lastTick = now;
    }
    requestAnimationFrame(tick);
  }

  /* ---------- 状态栏 / 小电博士 / 电流表 ---------- */
  function statusTextFor(fault, running) {
    if (fault.code === 'short') return running ? '⚠️ 短路！电流太大' : '⚠️ 短路警告：通电会爆炸';
    if (fault.code === 'no-battery') return '还没有电池';
    if (fault.code === 'open-switch') {
      var osp = fault.partId && App.byId(fault.partId);
      return osp && osp.type === 'button' ? '按钮还没按住' : '开关断开了';
    }
    if (fault.code === 'reversed') return fault.type === 'led' ? 'LED 接反了' : '二极管接反了';
    if (fault.code === 'loose') {
      var lp = fault.partId && App.byId(fault.partId);
      return lp ? '「' + PARTS[lp.type].name + '」有个接线点没接电线' : '有接线点还没接电线';
    }
    if (fault.code === 'overload') {
      var op = fault.partId && App.byId(fault.partId);
      var opName = op ? (PARTS[op.type].short || PARTS[op.type].name) : '零件';
      return '⚠️ ' + opName + '过载 ' + App.specValueText(fault) + '（额定 ' + App.specLimitText(fault) + '）';
    }
    if (fault.code === 'burnt') {
      var bp = fault.partId && App.byId(fault.partId);
      return '💨 ' + (bp ? (PARTS[bp.type].short || PARTS[bp.type].name) : '零件') + (bp ? burnWord(bp) : '烧坏') + '了';
    }
    if (fault.code === 'open') return '电路还没连成一个圈';
    if (fault.code === 'ok') return running ? (fault.tiny ? '⚡ 电流太小啦' : '⚡ 电流正在跑') : '电路连好啦，可以通电';
    return running ? '⚡ 电流正在跑' : '点右上角「通电试试」';
  }
  function doctorFor(fault, sim) {
    var st = App.state;
    if (st.exploding) return '爆、爆炸啦！💥 快把直接连电池两头的电线拿掉，或者加一个灯泡、电阻、电机。';
    if (fault.code === 'short') {
      var cp = fault.partId && App.byId(fault.partId);
      if (cp && cp.type === 'diode') {
        return st.running
          ? '危险！二极管把电池两头抄近路啦，它马上就要发烫烧坏，快断电！'
          : '<b>二极管不是用电器</b>，它只是一扇单向门，不消耗电。把它直接接在电池两头等于短路，通电会💥。要在电路里加一个灯泡、电阻、LED 或电机。';
      }
      if (cp && cp.type === 'switch') {
        return st.running
          ? '危险！开关把电池两头直接连起来啦，电流抄了近路，快断电！'
          : '开关把电池两头直接连起来啦，中间没有用电器，等于短路。通电会💥，加一个灯泡、电阻、LED 或电机吧。';
      }
      return st.running
        ? '危险！电流抄近路，马上就要爆炸了！快断电！'
        : '这个电路短路啦：电线直接连了电池两头。通电会💥！加一个灯泡、电阻、电机或喇叭吧。';
    }
    if (fault.code === 'no-battery') return '先放一节 <b>电池</b> 吧，它是电流小火车的发动机。';
    if (fault.code === 'open-switch') {
      var osp = fault.partId && App.byId(fault.partId);
      if (osp && osp.type === 'button') return '<b>按钮还没按住。</b>按住它，电流才能过去；松开就断开。';
      return '开关断开了，电流过不去。点一下开关，让它合上。';
    }
    if (fault.code === 'reversed') return fault.type === 'led'
      ? '<b>LED 接反啦！</b>长脚（+）要接电池正极，短脚接负极。'
      : '二极管接反啦，电流只能从三角形尖尖的方向过去哦。';
    if (fault.code === 'loose') {
      var lp = fault.partId && App.byId(fault.partId);
      if (lp) {
        var termName = App.termLabel ? App.termLabel(lp, fault.term) : '接线点';
        return '<b>「' + PARTS[lp.type].name + '」的' + termName + '还没接电线。</b>点这个小圆点，再点另一个小圆点，把它连起来。';
      }
    }
    if (fault.code === 'overload') {
      return (st.running ? '<b>危险，快断电！</b>' : '') + fault.message +
        (st.running ? ' 再不停下来，它马上就要烧坏了！' : ' 通电就会烧坏，先改一改吧。');
    }
    if (fault.code === 'burnt') {
      return '<b>' + fault.message + '</b>';
    }
    if (fault.code === 'open') return '电路还没连成一个圈。检查一下：每个小圆点是不是都接上电线啦？';
    if (fault.code === 'ok') {
      if (!st.running) return '电路连好啦！按右上角「通电试试」吧。' + (st.presetNote ? ' ' + st.presetNote : '');
      if (fault.tiny) {
        var hasVm = st.parts.some(function (p) { return p.type === 'voltmeter'; });
        return '电路是通的，但电流只有 <b>' + App.formatCurrent(sim ? sim.totalCurrent : 0) + '</b>，小得点不亮灯。' +
          (hasVm
            ? '<b>电压表内阻很大</b>，要并联在零件两边，不能串进电路里哦。'
            : '检查一下是不是电阻太大，或者哪里接触不好。');
      }
      if (hasActive(sim, 'led')) return '电流从电池 <b>+</b> 出发，经过电阻和 LED，再回到 <b>−</b>，LED 就亮啦！';
      if (hasActive(sim, 'motor')) {
        var m = App.state.parts.find(function (p) {
          var i = sim && sim.parts[p.id];
          return p.type === 'motor' && i && Math.abs(i.current) > 0.0018;
        });
        var mi = m && sim.parts[m.id];
        if (mi && mi.current < 0) return '电动机<b>反转</b>啦！两根线对调，电流反着流，它就反着转。';
        return '电动机转起来啦！电流越大，转得越快。把两根线对调，它就会反转。';
      }
      if (hasActive(sim, 'buzzer')) return '喇叭在唱歌：电流让纸盆振动，就发出声音啦。';
      if (hasActive(sim, 'lamp')) return '灯丝被电流加热，就发光啦。灯泡自己会限制电流。';
      return '电路通啦！电流像小火车一样跑起来了。';
    }
    if (st.presetNote) return st.presetNote;
    return '我是小电！点零件上的小圆点，再点另一个小圆点，就能连电线啦。';
  }
  function plainText(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '');
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }
  /* 把「哪里有问题」用中文念出来：手动点按钮，或状态变化时自动提示一次 */
  function speakProblem(force) {
    var st = App.state, fault = st.lastFault || { code: 'idle' }, sim = st.sim;
    var text;
    if (fault.code === 'ok') {
      text = st.running
        ? '现在电路是通的，电流正在跑。' + plainText(doctorFor(fault, sim))
        : '电路连好啦，还没有通电。按右上角的通电试试，就能看到电流跑起来。';
    } else {
      text = '我来看看哪里有问题。' + plainText(doctorFor(fault, sim));
    }
    if (force) speak(text);
    else speakAuto(text);
  }
  function autoProblemVoice(fault, sim) {
    var st = App.state;
    var code = fault ? fault.code : 'idle';
    var key = code + '|' + (fault && fault.partId ? fault.partId : '') + '|' + (fault && fault.term ? fault.term : '') +
      '|' + st.running + '|' + st.parts.length + '|' + st.wires.length;
    if (key === lastProblemCode) return;
    lastProblemCode = key;
    if (!st.parts.length || st.exploding) return;
    if (code === 'ok' && !st.running) return;
    if (code === 'idle') return;
    /* 等小朋友停一下再说，避免拖动时一直念 */
    if (autoProblemTimer) clearTimeout(autoProblemTimer);
    autoProblemTimer = setTimeout(function () {
      autoProblemTimer = null;
      if (App.state.exploding) return;
      speakProblem(false);
    }, 1400);
  }
  function hasActive(sim, type) {
    return App.state.parts.some(function (p) {
      var info = sim && sim.parts[p.id];
      return p.type === type && info && Math.abs(info.current) > 0.0018;
    });
  }
  function updatePanels() {
    var st = App.state, fault = st.lastFault || { code: 'idle' }, sim = st.sim;
    st.statusText = st.statusText || '';
    var statusText = statusTextFor(fault, st.running);
    el.statusText.textContent = statusText;
    el.statusPill.setAttribute('data-speak', '状态：' + statusText + '。点我听一听哪里有问题。');
    el.statusPill.title = '点我听一听哪里有问题';
    var activeCount = st.parts.filter(function (p) { var i = sim && sim.parts[p.id]; return i && Math.abs(i.current) > 0.001; }).length;
    el.statusExtra.textContent = st.running && sim
      ? activeCount + ' 个零件在工作 · ' + App.formatCurrent(sim.totalCurrent)
      : (st.parts.length ? st.parts.length + ' 个零件 · ' + st.wires.length + ' 根电线' : '');
    var doctorHtml = doctorFor(fault, sim);
    el.doctorBubble.innerHTML = doctorHtml;
    el.doctorBubble.setAttribute('data-speak', plainText(doctorHtml));
    el.doctorBubble.title = '点我听小电说一遍';

    var cur = sim ? sim.totalCurrent : 0;
    el.meterValue.textContent = App.formatCurrent(cur);
    var pct = cur <= 0 ? 0 : App.clamp(Math.log10(cur * 1000 + 1) / Math.log10(2500) * 100, 5, 100);
    el.meterBar.style.width = pct + '%';
    el.meterNote.textContent = st.running
      ? (fault.code === 'ok' && !fault.tiny ? '电流像小火车一样在跑！' : statusTextFor(fault, st.running))
      : (fault.code === 'short' ? '短路很危险，断电检查一下吧'
        : (fault.code === 'burnt' ? '零件烧坏了，点它换一个新的' : '还没通电，电流在睡觉'));
    renderTasks();
    renderInspector();
    renderQuickEditor();
    autoProblemVoice(fault, sim);
  }
  function renderTasks() {
    if (!el.taskList) return;
    /* 任务完成状态没变就不要重建；仿真每 120ms 刷新一次，
       重建会让小朋友点任务时点空，也会把语音点击打断。 */
    var key = (App.state.achieved || []).join(',');
    if (key === lastTaskKey && el.taskList.children.length) return;
    lastTaskKey = key;
    el.taskList.innerHTML = App.TASKS.map(function (t) {
      var done = App.state.achieved.indexOf(t.id) >= 0;
      return '<div class="task' + (done ? ' done' : '') + '" data-speak="' +
        (done ? '已完成：' : '还没完成：') + t.label + '。' + (t.hint || '') + '">' +
        '<span class="check">✓</span><span>' + t.icon + ' ' + t.label + '</span></div>';
    }).join('');
    Array.prototype.forEach.call(el.taskList.querySelectorAll('.task'), function (n) {
      on(n, 'click', function () {
        var text = n.getAttribute('data-speak') || n.textContent;
        speak(text);
      });
    });
  }

  /* ---------- 引导搭建 ---------- */
  function renderGuide() {
    if (!el.guideBody) return;
    var st = App.state;
    var steps = App.GUIDE_STEPS || [];
    var step = App.guideStep ? App.guideStep() : null;
    if (st.guide && st.guide.active && step) {
      if (el.guideProgress) el.guideProgress.textContent = (st.guide.step + 1) + ' / ' + steps.length;
      el.guideBody.innerHTML =
        '<div class="guide-step"><span class="guide-icon">' + step.icon + '</span>' +
        '<div><b>' + step.title + '</b><p>' + step.tip + '</p></div></div>' +
        '<div class="guide-actions">' +
        '<button class="btn small" id="guideSkip" type="button">跳过这步</button>' +
        '<button class="btn small ghost" id="guideStop" type="button">关掉引导</button></div>';
      on($('guideSkip'), 'click', function () { App.skipGuideStep(); });
      on($('guideStop'), 'click', function () { App.stopGuide(); });
      return;
    }
    if (st.guide && steps.length && st.guide.step >= steps.length) {
      if (el.guideProgress) el.guideProgress.textContent = '完成';
      el.guideBody.innerHTML = '<p class="guide-done">🎉 你已经搭出了一个会亮的 LED 电路，已经是小小电路工程师啦！</p>' +
        '<button class="btn small good" id="guideAgain" type="button">再搭一次</button>';
      on($('guideAgain'), 'click', function () { App.startGuide(); });
      return;
    }
    if (el.guideProgress) el.guideProgress.textContent = '';
    el.guideBody.innerHTML = '<p class="guide-intro">跟着小电，一步一步放电池、电阻和 LED，连成一个会亮的电路。</p>' +
      '<button class="btn small" id="guideStart" type="button">🧭 开始搭</button>';
    on($('guideStart'), 'click', function () { App.startGuide(); });
  }

  /* ---------- 实验记录 ---------- */
  function renderLog() {
    if (!el.logList) return;
    var log = App.state.log || [];
    if (el.btnLogClear) el.btnLogClear.hidden = !log.length;
    if (!log.length) {
      el.logList.innerHTML = '<p class="log-empty">通电后点「记下读数」，就能像科学家一样记录实验啦。</p>';
      return;
    }
    el.logList.innerHTML = log.map(function (x) {
      var d = new Date(x.at || Date.now());
      var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
      var time = hh + ':' + mm;
      var volt = Number(x.voltage) > 0 ? Number(x.voltage).toFixed(1) + 'V · ' : '';
      var text = '实验记录 ' + time + '：总电流 ' + App.formatCurrent(x.current) + '，' +
        volt + (x.active || 0) + ' 个零件在工作。';
      return '<div class="log-item" data-speak="' + text + '">' +
        '<span class="log-time">' + time + '</span>' +
        '<b>' + App.formatCurrent(x.current) + '</b>' +
        '<span class="log-meta">' + volt + (x.active || 0) + ' 个工作</span></div>';
    }).join('');
    Array.prototype.forEach.call(el.logList.querySelectorAll('.log-item'), function (n) {
      on(n, 'click', function () { speak(n.getAttribute('data-speak') || n.textContent); });
    });
  }

  /* ---------- 电路医院 ---------- */
  function showHospital() {
    var ids = Object.keys(App.HOSPITAL || {});
    openModal(
      '<h2>🏥 电路医院</h2><p class="sub">这里有生病的电路。点一个病例，帮小电修好它，完成后会有奖励。</p>' +
      '<div class="case-grid">' +
      ids.map(function (id) {
        var c = App.HOSPITAL[id];
        return '<button class="case-card" type="button" data-case="' + id + '" data-speak="' +
          c.name + '。' + c.desc + ' 你的任务是：' + c.goal + '">' +
          '<span class="case-icon">' + c.icon + '</span><b>' + c.name + '</b>' +
          '<span>' + c.desc + '</span><em>任务：' + c.goal + '</em></button>';
      }).join('') +
      '</div>',
      '电路医院。这里有生病的电路，点一个病例，帮小电修好它。'
    );
    Array.prototype.forEach.call(el.modalCard.querySelectorAll('[data-case]'), function (b) {
      on(b, 'click', function () { App.loadCase(b.dataset.case); closeModal(); });
    });
  }

  /* ---------- 确认框 ---------- */
  function confirm(title, message, onOk) {
    openModal(
      '<h2>' + title + '</h2><p class="sub">' + message + '</p>' +
      '<div class="confirm-actions">' +
      '<button class="btn ghost" id="cfCancel" type="button">再想想</button>' +
      '<button class="btn run" id="cfOk" type="button">好呀</button></div>'
    );
    on($('cfCancel'), 'click', closeModal);
    var ok = $('cfOk');
    if (ok) {
      on(ok, 'click', function () { closeModal(); onOk(); });
      if (ok.focus) ok.focus();
    }
  }

  /* ---------- 选中零件面板 ---------- */
  function infoFor(partId) {
    var sim = App.state.sim;
    var info = sim && sim.parts[partId];
    if (!info || !sim || !sim.batteries) return info;
    /* 电池的电流走的是内部支路，sim.parts 里恒为 0；
       面板和讲解要显示真实的输出电流、端电压和功率。 */
    var part = App.byId(partId);
    if (part && part.type === 'battery') {
      var b = null;
      for (var i = 0; i < sim.batteries.length; i++) {
        if (sim.batteries[i].partId === partId) { b = sim.batteries[i]; break; }
      }
      if (b) {
        var copy = {};
        for (var k in info) {
          if (Object.prototype.hasOwnProperty.call(info, k)) copy[k] = info[k];
        }
        copy.current = b.current;
        copy.vdrop = b.voltage;
        copy.power = b.power;
        return copy;
      }
    }
    return info;
  }

  /* 面板里哪些东西一变就必须整个重建（按钮、控件、烧坏提示、参数行）。
     电流 / 电压 / 功率这种每 120ms 都在变的数字不算在里面，用 updateInspectorLive 原地改，
     这样仿真运行时不会一直重建按钮，小朋友点「听讲解」就不会点空。 */
  function inspectKey(sel) {
    var st = App.state;
    if (!sel) return 'none';
    if (sel.kind === 'wire') {
      var w = st.wires.find(function (x) { return x.id === sel.id; });
      if (!w) return 'wire-gone|' + sel.id;
      var wi = st.sim && st.sim.wires[w.id];
      return 'wire|' + w.id + '|' + (wi ? '1' : '0');
    }
    var part = App.byId(sel.id);
    if (!part) return 'part-gone|' + sel.id;
    var info = infoFor(part.id);
    var b = st.burnt[part.id];
    var bkey = b ? [b.kind, b.valueText, b.limitText].join('|') : '';
    var props = '';
    try { props = JSON.stringify(part.props || {}); } catch (e) { props = ''; }
    return 'part|' + part.id + '|' + part.type + '|' + (info ? '1' : '0') + '|' + props + '|' + bkey;
  }

  function updateInspectorLive(sel) {
    if (!sel) return;
    var st = App.state;
    var info = sel.kind === 'wire'
      ? (st.sim && st.sim.wires[sel.id])
      : (sel.kind === 'part' ? infoFor(sel.id) : null);
    var body = el.inspectBody;
    if (!body || !info) return;
    var cur = body.querySelector('[data-live="current"]');
    if (cur) cur.textContent = App.formatCurrent(info.current);
    if (sel.kind !== 'part') return;
    var vol = body.querySelector('[data-live="voltage"]');
    if (vol) vol.textContent = Math.abs(info.vdrop).toFixed(2) + ' V';
    var pow = body.querySelector('[data-live="power"]');
    if (pow) pow.textContent = (info.power * 1000).toFixed(0) + ' mW';
    var dir = body.querySelector('[data-live="dir"]');
    if (dir) {
      var part = App.byId(sel.id);
      if (part && part.type === 'motor') {
        var c = info.current;
        dir.textContent = Math.abs(c) < 0.002 ? '停着' : (c > 0 ? '正转 ⟳' : '反转 ⟲');
      }
    }
  }

  function renderInspector() {
    var st = App.state, sel = st.selection, body = el.inspectBody;
    /* 正在拖滑块 / 在输入框里打数字的时候不要重建面板，不然会松手、数字会被清掉 */
    var activeEl = document.activeElement;
    if (sel && sel.kind === 'part' && activeEl &&
        ((activeEl.id === 'potRange' && activeEl.dataset.part === sel.id) ||
         (activeEl.id === 'ldrRange' && activeEl.dataset.part === sel.id) ||
         (activeEl.id === 'resInput' && activeEl.dataset.part === sel.id) ||
         (el.partQuick && quickEditing(el.partQuick)))) return;
    var key = inspectKey(sel);
    if (key === lastInspectKey) { updateInspectorLive(sel); return; }
    lastInspectKey = key;
    if (!sel) {
      body.innerHTML = '<p class="muted">点一个零件或一根电线，就能在这里看到它的小秘密。</p>';
      return;
    }
    if (sel.kind === 'wire') {
      var w = st.wires.find(function (x) { return x.id === sel.id; });
      if (!w) { body.innerHTML = '<p class="muted">这根电线已经不在啦。</p>'; return; }
      var info = st.sim && st.sim.wires[w.id];
      var chips = (App.wireColors || []).map(function (c) {
        var on = (w.color || '') === c ? ' active' : '';
        return '<button type="button" class="wire-color-chip' + on + '" data-color="' + c + '" style="--chip:' + c + '" title="' + (WIRE_NAME_OF[c] || '换颜色') + '"></button>';
      }).join('');
      body.innerHTML =
        '<div class="inspect-title">🪢 电线</div>' +
        '<p class="inspect-desc">把两个零件连起来，电流才能通过。</p>' +
        '<p class="inspect-more">' + descFor('wire') + '</p>' +
        '<div class="readout">' + (info ? '<span>电流 <b data-live="current">' + App.formatCurrent(info.current) + '</b></span>' : '') + '</div>' +
        '<p class="spec-line">📏 载流约 1A，电阻很小</p>' +
        '<div class="color-row" data-nospeak>' + chips + '</div>' +
        '<div class="inspect-actions">' +
        '<button class="btn small" id="insSay">🔊 听讲解</button>' +
        '<button class="btn small danger" id="insDel">🗑️ 删掉这根电线</button></div>';
      Array.prototype.forEach.call(body.querySelectorAll('.wire-color-chip'), function (chip) {
        on(chip, 'click', function () {
          if (App.setWireColor(w.id, chip.dataset.color)) lastInspectKey = '';
          renderInspector();
        });
      });
      on($('insDel'), 'click', function () { App.deleteSelection(); });
      on($('insSay'), 'click', function () { ensureVoice(); explainType('wire'); });
      return;
    }
    var part = App.byId(sel.id);
    if (!part) { body.innerHTML = '<p class="muted">这个零件已经不在啦。</p>'; return; }
    var def = PARTS[part.type], info2 = infoFor(part.id);
    var html = '<div class="inspect-title">' + iconFor(part.type) + ' ' + def.name + '</div>' +
      '<p class="inspect-desc">' + descFor(part.type) + '</p>' +
      '<p class="inspect-more">' + (guideOf(part.type) ? guideOf(part.type).tip : '') + '</p>';
    if (info2) {
      html += '<div class="readout"><span>电流 <b data-live="current">' + App.formatCurrent(info2.current) + '</b></span>' +
        '<span>电压 <b data-live="voltage">' + Math.abs(info2.vdrop).toFixed(2) + ' V</b></span>' +
        '<span>功率 <b data-live="power">' + (info2.power * 1000).toFixed(0) + ' mW</b></span>';
      if (part.type === 'motor') {
        var dcur = info2.current;
        var dirTxt = Math.abs(dcur) < 0.002 ? '停着' : (dcur > 0 ? '正转 ⟳' : '反转 ⟲');
        html += '<span>转向 <b data-live="dir">' + dirTxt + '</b></span>';
      }
      html += '</div>';
    }
    var specTxt = global.specTextOf ? specTextOf(part) : '';
    if (specTxt) html += '<p class="spec-line">📏 ' + specTxt + '</p>';
    var burntInfo = App.state.burnt[part.id];
    if (burntInfo) {
      html += '<p class="burn-line">💨 已经' + burnWord(part) + '了：' + (burntInfo.kind === 'power' ? '功率' : '电流') +
        '到了 ' + (burntInfo.valueText || '') + '，超过额定的 ' + (burntInfo.limitText || '') +
        '。换一个新的才能继续工作。</p>';
    }
    if (part.type === 'battery') {
      html += '<div class="opt-row">' + [3, 4.5, 9].map(function (v) {
        return '<button class="opt' + (part.props.voltage === v ? ' on' : '') + '" data-voltage="' + v + '">' + v + 'V</button>';
      }).join('') + '</div>';
    } else if (part.type === 'resistor') {
      var resNow = Number(part.props.resistance) || 100;
      html += '<div class="opt-row">' + [10, 47, 100, 220, 1000].map(function (v) {
        return '<button class="opt' + (resNow === v ? ' on' : '') + '" data-res="' + v + '">' + App.fmtRes(v) + '</button>';
      }).join('') + '</div>' +
        '<div class="res-edit"><span class="res-label">阻值</span><input type="number" id="resInput" data-part="' + part.id + '" inputmode="numeric" min="1" max="1000000" step="10" value="' + resNow + '" aria-label="输入电阻值">' +
        '<span class="unit">Ω</span><button class="opt" id="resApply">改好啦</button></div>' +
        '<p class="inspect-desc">也可以自己填阻值（1Ω～1MΩ），按回车或点「改好啦」。</p>';
    } else if (part.type === 'led') {
      html += '<div class="opt-row">' + ['#ff5d5d', '#22c55e', '#3b82f6', '#facc15', '#f8fafc'].map(function (c) {
        return '<button class="swatch' + (part.props.color === c ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '"></button>';
      }).join('') + '</div>';
    } else if (part.type === 'switch') {
      html += '<div class="opt-row"><button class="opt' + (part.props.closed ? ' on' : '') + '" id="swToggle">' +
        (part.props.closed ? '已合上 · 点我断开' : '已断开 · 点我合上') + '</button></div>';
    } else if (part.type === 'ldr') {
      var lightNow = Number(part.props.light);
      if (!(lightNow >= 0)) lightNow = 50;
      var ldrR = Math.round(Number(PARTS.ldr.model(part).r) || 0);
      html += '<div class="pot-row">' +
        '<div class="pot-slider">' +
        '<input type="range" id="ldrRange" data-part="' + part.id + '" min="0" max="100" step="1" value="' + lightNow + '" aria-label="拖动改变光照强度">' +
        '<div class="pot-scale"><span>🌑 很暗</span><span>☀️ 很亮</span></div>' +
        '</div>' +
        '<span class="pot-val" id="ldrVal">' + lightNow + '%<br>' + App.fmtRes(ldrR) + '</span></div>' +
        '<p class="inspect-desc">光越亮，光敏电阻的阻值越小。把它和 LED 串起来，就能做一个「天黑才亮」的小灯。</p>';
    } else if (part.type === 'pot') {
      var rv = Number(part.props.resistance);
      if (!(rv >= 0)) rv = 500;
      html += '<div class="pot-row">' +
        '<div class="pot-slider">' +
        '<input type="range" id="potRange" data-part="' + part.id + '" min="0" max="1000" step="10" value="' + rv + '" aria-label="拖动改变电阻大小">' +
        '<div class="pot-scale"><span>最小 0Ω</span><span>最大 1kΩ</span></div>' +
        '</div>' +
        '<span class="pot-val" id="potVal">' + App.fmtRes(rv) + '</span></div>' +
        '<p class="inspect-desc">拖动滑块改变电阻：往左调小，往右调大。电阻小，电流大，灯更亮。</p>';
    } else if (part.type === 'button') {
      html += '<div class="opt-row"><button class="opt" id="insPress">👆 按住通电</button></div>' +
        '<p class="inspect-desc">按住它电流才通过，松开手就断开。</p>';
    } else if (part.type === 'motor') {
      html += '<div class="opt-row"><button class="opt" id="motorRev">🔄 调换两根线（反转）</button></div>' +
        '<p class="inspect-desc">直流电机把两根线对调，就会反着转。</p>';
    } else if (part.type === 'fuse') {
      html += '<p class="inspect-desc">把它像开关一样串在电路里。电流超过额定值，它会「啪」地熔断，保护电池。</p>';
    } else if (part.type === 'ammeter') {
      html += '<p class="inspect-desc">要「串」在电路里，电流从它身上流过，它才量得出来。</p>';
    } else if (part.type === 'voltmeter') {
      html += '<p class="inspect-desc">要「并联」在零件两边：两根线分别接零件的两头，就能量出它的电压。</p>';
    } else if (part.type === 'breadboard') {
      html += '<div class="readout"><span>红色 + 轨左右相通</span><span>蓝色 − 轨左右相通</span></div>';
    }
    html += '<div class="inspect-actions">' +
      (burntInfo ? '<button class="btn small good" id="insRepair">🔧 换一个新的</button>' : '') +
      '<button class="btn small" id="insSay">🔊 听讲解</button>' +
      '<button class="btn small danger" id="insDel">🗑️ 删掉这个零件</button></div>';
    body.innerHTML = html;
    on($('insDel'), 'click', function () { App.deleteSelection(); });
    on($('insSay'), 'click', function () { ensureVoice(); explainPart(part); });
    var rp = $('insRepair');
    if (rp) on(rp, 'click', function () { App.repairPart(part.id); });
    var sw = $('swToggle');
    if (sw) on(sw, 'click', function () { toggleSwitch(part); });
    /* 电位器：拖动滑块改电阻。拖动时不要重建面板（见 renderInspector 开头的判断） */
    var range = $('potRange');
    if (range) {
      var potDirty = false;
      var settlePot = function () {
        if (!potDirty) return;
        potDirty = false;
        App.commit();
        renderParts();
        App.audio.click();
        speak('电阻调到' + App.fmtRes(part.props.resistance) + '。');
      };
      on(range, 'input', function () {
        var rv = Number(range.value);
        if (!potDirty && rv !== Number(part.props.resistance)) { potDirty = true; App.pushHistory(); }
        part.props.resistance = rv;
        var lab = $('potVal');
        if (lab) lab.textContent = App.fmtRes(part.props.resistance);
        renderParts();
        App.evaluate();
      });
      on(range, 'change', settlePot);
      on(range, 'pointerup', settlePot);
      on(range, 'pointercancel', settlePot);
      on(range, 'keyup', function (e) { if (QUICK_KEYS[e.key]) settlePot(); });
      on(range, 'blur', settlePot);
    }
    /* 光敏电阻：拖滑块调整光照，阻值会跟着变 */
    var ldrRange = $('ldrRange');
    if (ldrRange) {
      var ldrDirty = false;
      var settleLdr = function () {
        if (!ldrDirty) return;
        ldrDirty = false;
        App.commit();
        renderParts();
        App.audio.click();
        speak('光照调到 ' + part.props.light + '%。光敏电阻现在是' +
          App.fmtRes(Math.round(Number(PARTS.ldr.model(part).r) || 0)) + '。');
      };
      on(ldrRange, 'input', function () {
        var light = Number(ldrRange.value);
        if (!ldrDirty && light !== Number(part.props.light)) { ldrDirty = true; App.pushHistory(); }
        part.props.light = light;
        var lab = $('ldrVal');
        if (lab) lab.innerHTML = part.props.light + '%<br>' + App.fmtRes(Math.round(Number(PARTS.ldr.model(part).r) || 0));
        renderParts();
        App.evaluate();
      });
      on(ldrRange, 'change', settleLdr);
      on(ldrRange, 'pointerup', settleLdr);
      on(ldrRange, 'pointercancel', settleLdr);
      on(ldrRange, 'keyup', function (e) { if (QUICK_KEYS[e.key]) settleLdr(); });
      on(ldrRange, 'blur', settleLdr);
    }
    /* 电阻：自己填一个阻值（1Ω～1MΩ） */
    var resInput = $('resInput');
    if (resInput) {
      var applyRes = function () {
        var v = Number(resInput.value);
        if (!isFinite(v) || v <= 0) {
          toast('请输入大于 0 的数字', null, { silent: true });
          speak('请输入一个大于零的电阻值。');
          return;
        }
        v = Math.round(Math.max(1, Math.min(1000000, v)));
        if (v === Number(part.props.resistance)) { renderInspector(); return; }
        App.pushHistory();
        part.props.resistance = v;
        App.afterChange();
        App.audio.click();
        speak('电阻改成' + App.fmtRes(v) + '啦。');
        /* 先让输入框失焦，面板才会重建、显示出新的阻值 */
        if (resInput.blur) resInput.blur();
        renderInspector();
      };
      on(resInput, 'keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); applyRes(); }
      });
      var resBtn = $('resApply');
      if (resBtn) on(resBtn, 'click', applyRes);
    }
    /* 按钮：按住才通电。松手的监听挂在 window 上，面板重建也不怕 */
    var press = $('insPress');
    if (press) {
      on(press, 'pointerdown', function (e) {
        e.preventDefault();
        pressButton(part, true);
        var up = function () {
          global.removeEventListener('pointerup', up);
          global.removeEventListener('pointercancel', up);
          pressButton(part, false);
        };
        global.addEventListener('pointerup', up);
        global.addEventListener('pointercancel', up);
      });
    }
    /* 电机：把两根接线对调，转向就反过来 */
    var mr = $('motorRev');
    if (mr) on(mr, 'click', function () { reverseMotorWires(part); });
    Array.prototype.forEach.call(body.querySelectorAll('[data-voltage]'), function (b) {
      on(b, 'click', function () { changeProp(part, 'voltage', parseFloat(b.dataset.voltage)); });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-res]'), function (b) {
      on(b, 'click', function () { changeProp(part, 'resistance', parseFloat(b.dataset.res)); });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-color]'), function (b) {
      on(b, 'click', function () { changeProp(part, 'color', b.dataset.color); });
    });
  }
  function changeProp(part, key, value) {
    if (part.props[key] === value) return;
    App.pushHistory();
    part.props[key] = value;
    App.afterChange();
    App.audio.click();
    if (key === 'voltage') speak('电池改成' + value + '伏。');
    else if (key === 'resistance') speak('电阻改成' + App.fmtRes(value) + '。');
    else if (key === 'color') speak('LED 换颜色啦。');
  }
  function toggleSwitch(part) {
    App.pushHistory();
    part.props.closed = !part.props.closed;
    App.afterChange();
    App.audio.click();
    speak(part.props.closed ? '开关合上啦，电流可以通过。' : '开关断开啦，电流过不去。');
    renderInspector();
  }

  /* ---------- 零件上方的快捷参数面板 ---------- */
  var QUICK_TYPES = { battery: 1, resistor: 1, ldr: 1, pot: 1, led: 1, switch: 1, motor: 1 };
  var QUICK_HINTS = {
    battery: '选电压', resistor: '调阻值', ldr: '调光照',
    pot: '调电阻', led: '选颜色', switch: '通 / 断', motor: '正转 / 反转'
  };
  var QUICK_KEYS = {
    ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
    Home: 1, End: 1, PageUp: 1, PageDown: 1
  };
  var LED_COLOR_NAMES = {
    '#ff5d5d': '红色', '#22c55e': '绿色', '#3b82f6': '蓝色', '#facc15': '黄色', '#f8fafc': '白色'
  };
  /* 正在拖滑块 / 输入数字时不要重建面板，不然会松手、数字会被清掉 */
  function quickEditing(node) {
    var a = document.activeElement;
    if (!a || !node.contains(a)) return false;
    var tag = (a.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || a.isContentEditable;
  }
  function quickKeyFor(part) {
    var burnt = App.state.burnt && App.state.burnt[part.id] ? 'b' : '';
    return part.id + '|' + part.type + '|' + burnt;
  }
  function quickBody(part) {
    var p = part.props || {};
    if (part.type === 'battery') {
      var bv = Number(p.voltage) || 3;
      return '<div class="pq-chips" role="group" aria-label="选择电池电压">' + [3, 4.5, 9].map(function (v) {
        return '<button type="button" class="pq-chip' + (bv === v ? ' on' : '') + '" data-qvoltage="' + v +
          '" data-qkeep="voltage-' + v + '" aria-pressed="' + (bv === v ? 'true' : 'false') + '">' + v + 'V</button>';
      }).join('') + '</div>';
    }
    if (part.type === 'resistor') {
      var rv = Number(p.resistance) || 100;
      return '<div class="pq-chips" role="group" aria-label="常用阻值">' + [10, 47, 100, 220, 1000].map(function (v) {
        return '<button type="button" class="pq-chip' + (rv === v ? ' on' : '') + '" data-qres="' + v +
          '" data-qkeep="res-' + v + '" aria-pressed="' + (rv === v ? 'true' : 'false') + '">' + App.fmtRes(v) + '</button>';
      }).join('') + '</div>' +
        '<div class="pq-res-edit"><span class="pq-unit">阻值</span>' +
        '<input type="number" id="qResInput" data-qkeep="res-input" inputmode="numeric" min="1" max="1000000" step="10" value="' + rv + '" aria-label="输入电阻值">' +
        '<span class="pq-unit">Ω</span>' +
        '<button type="button" class="pq-apply" id="qResApply" data-qkeep="res-apply">好了</button></div>';
    }
    if (part.type === 'led') {
      var color = p.color || '#ff5d5d';
      return '<div class="pq-swatches" role="group" aria-label="选择 LED 颜色">' + ['#ff5d5d', '#22c55e', '#3b82f6', '#facc15', '#f8fafc'].map(function (c) {
        var name = LED_COLOR_NAMES[c] || '颜色';
        return '<button type="button" class="pq-swatch' + (color === c ? ' on' : '') + '" data-qcolor="' + c +
          '" data-qkeep="led-' + c.replace('#', '') + '" style="background:' + c + '" aria-label="' + name +
          '" title="' + name + '" aria-pressed="' + (color === c ? 'true' : 'false') + '"></button>';
      }).join('') + '</div>';
    }
    if (part.type === 'switch') {
      var closed = !!p.closed;
      return '<button type="button" class="pq-toggle' + (closed ? ' on' : '') + '" id="qSwToggle" data-qkeep="switch" aria-pressed="' +
        (closed ? 'true' : 'false') + '"><span class="pq-led" aria-hidden="true"></span><span>' +
        (closed ? '已合上 · 点我断开' : '已断开 · 点我合上') + '</span></button>';
    }
    if (part.type === 'motor') {
      return '<button type="button" class="pq-btn" id="qMotorRev" data-qkeep="motor-rev">🔄 调换两根线，反转电机</button>';
    }
    if (part.type === 'ldr') {
      var light = Number(p.light);
      if (!(light >= 0)) light = 50;
      light = Math.max(0, Math.min(100, Math.round(light)));
      var lr = Number(PARTS.ldr.model(part).r) || 0;
      return '<div class="pq-slider"><span class="pq-side" aria-hidden="true">🌑</span>' +
        '<input type="range" id="qLdrRange" data-qkeep="ldr-range" min="0" max="100" step="1" value="' + light +
        '" aria-label="光照强度" aria-valuetext="光照 ' + light + '%，电阻约 ' + App.fmtRes(Math.round(lr)) + '">' +
        '<span class="pq-side" aria-hidden="true">☀️</span></div>' +
        '<div class="pq-scale"><span>很暗</span><span>很亮</span></div>' +
        '<div class="pq-live"><b id="qLdrLight">光照 ' + light + '%</b><span id="qLdrRes">电阻约 ' + App.fmtRes(Math.round(lr)) + '</span></div>';
    }
    var rv2 = Number(p.resistance);
    if (!(rv2 >= 0)) rv2 = 500;
    return '<div class="pq-slider"><span class="pq-side pq-side-txt" aria-hidden="true">小</span>' +
      '<input type="range" id="qPotRange" data-qkeep="pot-range" min="0" max="1000" step="10" value="' + rv2 +
      '" aria-label="电阻大小" aria-valuetext="' + App.fmtRes(rv2) + '">' +
      '<span class="pq-side pq-side-txt" aria-hidden="true">大</span></div>' +
      '<div class="pq-scale"><span>0Ω</span><span>1kΩ</span></div>' +
      '<div class="pq-live"><b id="qPotVal">' + App.fmtRes(rv2) + '</b><span>拖动滑块调电阻</span></div>';
  }
  /* 同一个零件的参数变了：只刷新现有控件，不重建面板，键盘焦点不会丢 */
  function refreshQuickEditor(part, node) {
    var p = part.props || {};
    var each = function (sel, fn) {
      Array.prototype.forEach.call(node.querySelectorAll(sel), fn);
    };
    if (part.type === 'battery') {
      var bv = Number(p.voltage) || 3;
      each('[data-qvoltage]', function (b) {
        var on = Number(b.dataset.qvoltage) === bv;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    } else if (part.type === 'resistor') {
      var rv = Number(p.resistance) || 100;
      each('[data-qres]', function (b) {
        var on = Number(b.dataset.qres) === rv;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var resInput = node.querySelector('#qResInput');
      if (resInput && document.activeElement !== resInput) resInput.value = rv;
    } else if (part.type === 'led') {
      var color = p.color || '#ff5d5d';
      each('[data-qcolor]', function (b) {
        var on = b.dataset.qcolor === color;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    } else if (part.type === 'switch') {
      var sw = node.querySelector('#qSwToggle');
      var closed = !!p.closed;
      if (sw) {
        sw.classList.toggle('on', closed);
        sw.setAttribute('aria-pressed', closed ? 'true' : 'false');
        var label = sw.lastElementChild;
        if (label) label.textContent = closed ? '已合上 · 点我断开' : '已断开 · 点我合上';
      }
    } else if (part.type === 'ldr') {
      var light = Number(p.light);
      if (!(light >= 0)) light = 50;
      light = Math.max(0, Math.min(100, Math.round(light)));
      var rr = Math.round(Number(PARTS.ldr.model(part).r) || 0);
      var range = node.querySelector('#qLdrRange');
      if (range) {
        if (document.activeElement !== range) range.value = light;
        range.setAttribute('aria-valuetext', '光照 ' + light + '%，电阻约 ' + App.fmtRes(rr));
      }
      var lab = node.querySelector('#qLdrLight');
      if (lab) lab.textContent = '光照 ' + light + '%';
      var resLab = node.querySelector('#qLdrRes');
      if (resLab) resLab.textContent = '电阻约 ' + App.fmtRes(rr);
    } else if (part.type === 'pot') {
      var rv2 = Number(p.resistance);
      if (!(rv2 >= 0)) rv2 = 500;
      var potRange = node.querySelector('#qPotRange');
      if (potRange) {
        if (document.activeElement !== potRange) potRange.value = rv2;
        potRange.setAttribute('aria-valuetext', App.fmtRes(rv2));
      }
      var potLab = node.querySelector('#qPotVal');
      if (potLab) potLab.textContent = App.fmtRes(rv2);
    }
  }
  /* 快捷面板拖滑块时右侧面板不重建（否则会丢焦点），只把读数同步过去 */
  function syncInspectorSlider(kind, partId, value, html, text) {
    var range = $(kind === 'ldr' ? 'ldrRange' : 'potRange');
    var label = $(kind === 'ldr' ? 'ldrVal' : 'potVal');
    if (range && range.dataset.part === partId) {
      range.value = value;
      range.setAttribute('aria-valuetext', text || html.replace(/<br>/g, '，'));
    }
    if (label) label.innerHTML = html;
  }
  function bindQuickEditor(part, node) {
    var close = node.querySelector('[data-pq-close]');
    on(close, 'click', function () {
      select(null);
      var pn = partEls[part.id];
      if (pn && pn.focus) pn.focus();
    });
    var repair = node.querySelector('#qRepair');
    if (repair) on(repair, 'click', function () { App.repairPart(part.id); });
    Array.prototype.forEach.call(node.querySelectorAll('[data-qvoltage]'), function (b) {
      on(b, 'click', function () { changeProp(part, 'voltage', parseFloat(b.dataset.qvoltage)); });
    });
    Array.prototype.forEach.call(node.querySelectorAll('[data-qres]'), function (b) {
      on(b, 'click', function () { changeProp(part, 'resistance', parseFloat(b.dataset.qres)); });
    });
    Array.prototype.forEach.call(node.querySelectorAll('[data-qcolor]'), function (b) {
      on(b, 'click', function () { changeProp(part, 'color', b.dataset.qcolor); });
    });
    var sw = node.querySelector('#qSwToggle');
    if (sw) on(sw, 'click', function () { toggleSwitch(part); });
    var mr = node.querySelector('#qMotorRev');
    if (mr) on(mr, 'click', function () { reverseMotorWires(part); });
    var ldrRange = node.querySelector('#qLdrRange');
    if (ldrRange) {
      var ldrDirty = false;
      var beginLdr = function (next) {
        if (ldrDirty || next === Number(part.props.light)) return;
        ldrDirty = true;
        App.pushHistory();
      };
      var settleLdr = function () {
        if (!ldrDirty) return;
        ldrDirty = false;
        App.commit();
        renderParts();
        renderInspector();
        App.audio.click();
        speak('光照调到 ' + Math.round(part.props.light) + '%。光敏电阻现在是' +
          App.fmtRes(Math.round(Number(PARTS.ldr.model(part).r) || 0)) + '。');
      };
      on(ldrRange, 'input', function () {
        var light = Number(ldrRange.value);
        beginLdr(light);
        part.props.light = light;
        var rr = Math.round(Number(PARTS.ldr.model(part).r) || 0);
        var lab = node.querySelector('#qLdrLight');
        var resLab = node.querySelector('#qLdrRes');
        if (lab) lab.textContent = '光照 ' + light + '%';
        if (resLab) resLab.textContent = '电阻约 ' + App.fmtRes(rr);
        ldrRange.setAttribute('aria-valuetext', '光照 ' + light + '%，电阻约 ' + App.fmtRes(rr));
        syncInspectorSlider('ldr', part.id, light, light + '%<br>' + App.fmtRes(rr));
        renderParts();
        App.evaluate();
      });
      on(ldrRange, 'change', settleLdr);
      on(ldrRange, 'pointerup', settleLdr);
      on(ldrRange, 'pointercancel', settleLdr);
      on(ldrRange, 'keyup', function (e) { if (QUICK_KEYS[e.key]) settleLdr(); });
      on(ldrRange, 'blur', settleLdr);
    }
    var potRange = node.querySelector('#qPotRange');
    if (potRange) {
      var potDirty = false;
      var beginPot = function (next) {
        if (potDirty || next === Number(part.props.resistance)) return;
        potDirty = true;
        App.pushHistory();
      };
      var settlePot = function () {
        if (!potDirty) return;
        potDirty = false;
        App.commit();
        renderParts();
        renderInspector();
        App.audio.click();
        speak('电阻调到' + App.fmtRes(part.props.resistance) + '。');
      };
      on(potRange, 'input', function () {
        var rv = Number(potRange.value);
        beginPot(rv);
        part.props.resistance = rv;
        var lab = node.querySelector('#qPotVal');
        if (lab) lab.textContent = App.fmtRes(rv);
        potRange.setAttribute('aria-valuetext', App.fmtRes(rv));
        syncInspectorSlider('pot', part.id, rv, App.fmtRes(rv));
        renderParts();
        App.evaluate();
      });
      on(potRange, 'change', settlePot);
      on(potRange, 'pointerup', settlePot);
      on(potRange, 'pointercancel', settlePot);
      on(potRange, 'keyup', function (e) { if (QUICK_KEYS[e.key]) settlePot(); });
      on(potRange, 'blur', settlePot);
    }
    var resInput = node.querySelector('#qResInput');
    if (resInput) {
      var applyRes = function () {
        var v = Number(resInput.value);
        if (!isFinite(v) || v <= 0) {
          toast('请输入 1Ω～1MΩ 之间的数字', null, { silent: true });
          speak('请输入一个大于零的电阻值。');
          if (resInput.focus) resInput.focus();
          return;
        }
        v = Math.round(Math.max(1, Math.min(1000000, v)));
        if (v === Number(part.props.resistance)) { resInput.value = v; return; }
        App.pushHistory();
        part.props.resistance = v;
        if (resInput.blur) resInput.blur();
        App.afterChange();
        App.audio.click();
        speak('电阻改成' + App.fmtRes(v) + '啦。');
        renderQuickEditor();
        var again = node.querySelector('#qResInput');
        if (again && again.focus) {
          try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); }
        }
      };
      on(resInput, 'keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); applyRes(); }
      });
      var resBtn = node.querySelector('#qResApply');
      if (resBtn) on(resBtn, 'click', applyRes);
    }
  }
  function renderQuickEditor() {
    var node = el.partQuick;
    if (!node) return;
    var st = App.state;
    var sel = st.selection;
    var part = sel && sel.kind === 'part' ? App.byId(sel.id) : null;
    if (!part || !QUICK_TYPES[part.type] || st.exploding) { hideQuickEditor(); return; }
    if (quickEditing(node)) return;
    var key = quickKeyFor(part);
    if (key === quickKey && !node.hidden && node.innerHTML) {
      refreshQuickEditor(part, node);
      positionQuickEditor();
      return;
    }
    var def = PARTS[part.type];
    var burnt = !!(st.burnt && st.burnt[part.id]);
    var active = document.activeElement;
    var keep = active && node.contains(active) ? active.getAttribute('data-qkeep') : '';
    var body = burnt
      ? '<button type="button" class="pq-btn good" id="qRepair" data-qkeep="repair">🔧 换一个新的</button>'
      : quickBody(part);
    quickKey = key;
    node.setAttribute('aria-label', def.name + '快捷参数');
    node.innerHTML =
      '<div class="pq-head">' +
      '<span class="pq-title">' + iconFor(part.type) + ' ' + def.name + '</span>' +
      '<span class="pq-hint">' + (burnt ? '已经坏了' : (QUICK_HINTS[part.type] || '')) + '</span>' +
      '<button type="button" class="pq-close" data-pq-close aria-label="收起参数" title="收起参数">✕</button>' +
      '</div>' +
      '<div class="pq-body">' + body + '</div>';
    node.style.visibility = 'hidden';
    node.hidden = false;
    bindQuickEditor(part, node);
    positionQuickEditor();
    node.style.visibility = '';
    if (keep) {
      var again = node.querySelector('[data-qkeep="' + keep + '"]');
      if (again && again.focus) {
        try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); }
      }
    }
  }
  function hideQuickEditor() {
    quickKey = '';
    if (!el.partQuick) return;
    el.partQuick.hidden = true;
    el.partQuick.classList.remove('offscreen');
    el.partQuick.innerHTML = '';
  }
  function scheduleQuickPosition() {
    if (!el.partQuick || el.partQuick.hidden) return;
    positionQuickEditor();
  }
  /* 面板锚在零件正上方；上面放不下就放到下面，再不行就贴住工作台边缘 */
  function positionQuickEditor() {
    var node = el.partQuick;
    if (!node || node.hidden) return;
    var panel = el.boardPanel, canvas = el.boardCanvas;
    if (!panel || !canvas) return;
    var sel = App.state.selection;
    var partNode = sel && sel.kind === 'part' ? partEls[sel.id] : null;
    if (!partNode) { node.classList.add('offscreen'); return; }
    var pr = partNode.getBoundingClientRect();
    var cr = canvas.getBoundingClientRect();
    var panelRect = panel.getBoundingClientRect();
    var view = {
      left: cr.left, top: cr.top,
      right: cr.left + canvas.clientWidth,
      bottom: cr.top + canvas.clientHeight
    };
    if (pr.right < view.left - 24 || pr.left > view.right + 24 ||
        pr.bottom < view.top - 24 || pr.top > view.bottom + 24) {
      node.classList.add('offscreen');
      return;
    }
    node.classList.remove('offscreen');
    var w = node.offsetWidth, h = node.offsetHeight;
    if (!w || !h) return;
    var gap = 18;
    var minTop = view.top - panelRect.top + 6;
    var minLeft = view.left - panelRect.left + 6;
    var maxLeft = view.right - panelRect.left - w - 6;
    if (maxLeft < minLeft) {
      minLeft = 6;
      maxLeft = Math.max(6, panelRect.width - w - 6);
    }
    var above = pr.top - panelRect.top - h - gap;
    var below = pr.bottom - panelRect.top + gap;
    var fitsAbove = above >= minTop;
    var fitsBelow = below + h <= view.bottom - panelRect.top - 6;
    var belowMode;
    if (fitsAbove) belowMode = false;
    else if (fitsBelow) belowMode = true;
    else belowMode = (view.bottom - pr.bottom) > (pr.top - view.top);
    var maxTop = Math.max(minTop, view.bottom - panelRect.top - h - 6);
    var top = belowMode ? below : above;
    top = Math.max(minTop, Math.min(top, maxTop));
    var cx = pr.left + pr.width / 2;
    var left = cx - panelRect.left - w / 2;
    left = Math.max(minLeft, Math.min(left, maxLeft));
    node.classList.toggle('below', belowMode);
    node.style.left = Math.round(left) + 'px';
    node.style.top = Math.round(top) + 'px';
    var arrowX = Math.round(cx - panelRect.left - left);
    arrowX = Math.max(20, Math.min(w - 20, arrowX));
    node.style.setProperty('--arrow-x', arrowX + 'px');
  }

  /* 把电机的两根线对调：直流电机反接就会反转 */
  function reverseMotorWires(part) {
    var wA = 0, wB = 0, touched = 0;
    App.state.wires.forEach(function (w) {
      if (w.a.part === part.id && (w.a.term === 'a' || w.a.term === 'b')) { touched++; if (w.a.term === 'a') wA++; else wB++; }
      if (w.b.part === part.id && (w.b.term === 'a' || w.b.term === 'b')) { touched++; if (w.b.term === 'a') wA++; else wB++; }
    });
    if (!wA || !wB) {
      UI.toast('先把电机的两个接线点都接上电线');
      speak('电机的两个接线点都要接上电线，才能换方向。');
      return;
    }
    App.pushHistory();
    App.state.wires.forEach(function (w) {
      if (w.a.part === part.id && (w.a.term === 'a' || w.a.term === 'b')) w.a.term = w.a.term === 'a' ? 'b' : 'a';
      if (w.b.part === part.id && (w.b.term === 'a' || w.b.term === 'b')) w.b.term = w.b.term === 'a' ? 'b' : 'a';
    });
    App.afterChange();
    App.audio.click();
    var info = infoFor(part.id);
    var txt = '两根线对调好啦。';
    if (App.state.running && info) txt += info.current < -0.0005 ? '电机反转啦，反着转呢。' : (Math.abs(info.current) < 0.0005 ? '现在电机没转。' : '电机正转着。');
    speak(txt);
    UI.toast('🔄 ' + txt, 'good', { silent: true });
  }
  function iconFor(type) {
    var map = {
      battery: '🔋', switch: '🎚️', button: '🔘', resistor: '🧱', ldr: '☀️', pot: '🎛️', led: '💡', lamp: '🔆',
      buzzer: '🔊', diode: '▶️', fuse: '🧯', motor: '🌀', breadboard: '🧰',
      ammeter: '<span class="ico-badge">A</span>', voltmeter: '<span class="ico-badge v">V</span>'
    };
    return map[type] || '🔩';
  }
  function descFor(type) {
    var map = {
      battery: '电的来源。+ 是正极，− 是负极，电流从 + 出来，回到 −。',
      switch: '像一座小桥，点一下可以断开或合上，控制电流过不过去。',
      button: '按住才通电的开关，一松手就断开。',
      resistor: '电流的减速带，保护 LED 不被太大的电流烧坏。',
      ldr: '光敏电阻：光越亮，阻值越小；用手遮住它，阻值就会变大。',
      pot: '可以拧大拧小的电阻，用来调灯的亮度。',
      led: '长脚(+)接电池正极，短脚接负极，电流通过就会发光。',
      lamp: '灯丝被电流加热就发光。它自己会限制电流，可以直接接电池。',
      buzzer: '电流让里面的纸盆振动，就发出声音啦。',
      diode: '电流的单向门，只允许电流从三角形尖尖的方向通过。',
      fuse: '电路的保险卫士：电流太大它就先熔断，保护电池和别的零件。',
      motor: '电流通过线圈产生磁力，电机就转起来了。两根线对调，它就会反转。',
      ammeter: '串在电路里，显示流过它的电流有多大。',
      voltmeter: '并联在零件两边，显示它两端的电压有多大。',
      breadboard: '面包板上的红色 + 轨和蓝色 − 轨，左右两边是相通的，可以分电。',
      wire: '电流的小马路。把两个零件的接线点连起来，电流才能通过。'
    };
    return map[type] || '';
  }

  /* ---------- 运行按钮 / 状态 ---------- */
  function updateRunButton() {
    var on = App.state.running;
    el.btnRun.classList.toggle('running', on);
    el.btnRun.querySelector('.run-ico').textContent = on ? '⏸' : '▶';
    el.runText.textContent = on ? '断电' : '通电试试';
  }
  function setPowered(on) { el.boardPanel.classList.toggle('powered', on); }
  function setAlarm(on) { el.boardPanel.classList.toggle('alarm', on); }
  function updateSound() {
    el.btnSound.querySelector('span').textContent = App.state.sound ? '🔊' : '🔇';
    el.btnSound.setAttribute('aria-pressed', App.state.sound ? 'true' : 'false');
  }
  function updateVoice() {
    if (!el.btnVoice) return;
    var supported = global.Voice && Voice.supported();
    var on = supported && Voice.state.enabled;
    el.btnVoice.classList.toggle('off', !on);
    el.btnVoice.querySelector('span').textContent = on ? '🔈' : '🔇';
    if (el.voiceText) el.voiceText.textContent = supported ? (on ? '朗读' : '静音') : '不支持';
    el.btnVoice.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.btnVoice.title = supported
      ? (on ? '中文朗读已打开，点一下关闭' : '中文朗读已关闭，点一下打开')
      : '这个浏览器不支持语音朗读';
    if (!supported) el.btnVoice.disabled = true;
    updateVoiceSlow();
  }
  function updateVoiceSlow() {
    if (!el.btnVoiceSlow) return;
    var slow = !!(global.Voice && Voice.state.slow);
    el.btnVoiceSlow.classList.toggle('active', slow);
    el.btnVoiceSlow.setAttribute('aria-pressed', slow ? 'true' : 'false');
    el.btnVoiceSlow.title = slow
      ? '现在是慢速朗读，点一下恢复正常速度'
      : '朗读慢一点，适合刚学话的小朋友';
  }
  function updateWireStyle() {
    if (!el.btnWireStyle) return;
    var ortho = App.state.wireStyle === 'ortho';
    el.btnWireStyle.classList.toggle('active', ortho);
    el.btnWireStyle.setAttribute('aria-pressed', ortho ? 'true' : 'false');
    el.btnWireStyle.title = ortho
      ? '横竖走线已打开：电线横平竖直、自动避开零件；点一下换回弯弯的曲线'
      : '把电线排成横竖走线，自动避开零件、看起来更整齐';
  }
  function updateWireLabels() {
    if (!el.btnWireLabels) return;
    var on = !!App.state.wireLabels;
    el.btnWireLabels.classList.toggle('active', on);
    el.btnWireLabels.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.btnWireLabels.title = on
      ? '电流标签已打开：通电后每根电线上会显示电流；点一下关掉'
      : '打开后，通电时每根电线上会显示电流';
  }
  function updateUndo() {
    if (el.btnUndo) el.btnUndo.disabled = !App.state.past.length;
    if (el.btnRedo) el.btnRedo.disabled = !App.state.future || !App.state.future.length;
  }

  /* ---------- 缩放 ---------- */
  function setZoom(z) { App.state.zoom = App.clamp(z, 0.6, 3); applyZoom(); }
  function applyZoom() {
    var c = el.boardCanvas;
    if (!c || !c.clientWidth) return;
    var fit = Math.min((c.clientWidth - 18) / App.STAGE_W, (c.clientHeight - 18) / App.STAGE_H);
    fit = Math.max(0.18, fit);
    App.state.fitScale = fit;
    var s = fit * App.state.zoom;
    App.state.scale = s;
    el.stage.style.transform = 'scale(' + s + ')';
    /* 接线点在小屏 / 缩小看全图时「反向放大」一点，保证屏幕上的大小差不多，方便小朋友点 */
    el.stage.style.setProperty('--inv', Math.min(2.2, Math.max(1, 1 / s)).toFixed(3));
    el.stageHolder.style.width = (App.STAGE_W * s) + 'px';
    el.stageHolder.style.height = (App.STAGE_H * s) + 'px';
    /* 缩放变化时，选中的电线要重画，✕ 才能保持合适大小 */
    if (App.state.selection && App.state.selection.kind === 'wire') renderWires();
    scheduleQuickPosition();
  }
  function contentBounds() {
    var st = App.state;
    if (!st.parts.length) return null;
    var x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    st.parts.forEach(function (p) {
      var def = PARTS[p.type];
      if (!def) return;
      x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x + def.w); y2 = Math.max(y2, p.y + def.h);
    });
    if (x2 < x1) return null;
    return { x1: x1, y1: y1, x2: x2, y2: y2, w: x2 - x1, h: y2 - y1 };
  }
  /* 把镜头拉近到「所有零件都在画面里」，小屏上特别有用 */
  function fitToContent() {
    var c = el.boardCanvas;
    if (!c || !c.clientWidth) return;
    var b = contentBounds();
    if (!b) {
      App.state.zoom = 1;
      applyZoom();
      c.scrollLeft = 0; c.scrollTop = 0;
      return;
    }
    var s0 = Math.min((c.clientWidth - 18) / App.STAGE_W, (c.clientHeight - 18) / App.STAGE_H);
    s0 = Math.max(0.18, s0);
    var zx = (c.clientWidth - 56) / Math.max(40, b.w * s0);
    var zy = (c.clientHeight - 56) / Math.max(40, b.h * s0);
    App.state.zoom = App.clamp(Math.min(zx, zy), 0.6, 3);
    applyZoom();
    var s = App.state.scale || 1;
    var cx = (b.x1 + b.x2) / 2 * s, cy = (b.y1 + b.y2) / 2 * s;
    var maxX = Math.max(0, c.scrollWidth - c.clientWidth);
    var maxY = Math.max(0, c.scrollHeight - c.clientHeight);
    c.scrollLeft = App.clamp(cx - c.clientWidth / 2, 0, maxX);
    c.scrollTop = App.clamp(cy - c.clientHeight / 2, 0, maxY);
  }

  /* ---------- 爆炸特效 ---------- */
  function playBoom(sim, fault) {
    var x = App.STAGE_W / 2, y = App.STAGE_H / 2;
    if (sim && sim.maxWire) {
      var w = App.state.wires.find(function (q) { return q.id === sim.maxWire.id; });
      if (w) {
        var ends = App.wireEnds(w);
        if (ends) { x = (ends[0].x + ends[1].x) / 2; y = (ends[0].y + ends[1].y) / 2 + 30; }
      }
    } else {
      var bat = App.state.parts.find(function (p) { return p.type === 'battery'; });
      if (bat) { x = bat.x + 70; y = bat.y + 80; }
    }
    var boom = document.createElement('div');
    boom.className = 'boom';
    boom.style.left = x + 'px';
    boom.style.top = y + 'px';
    var html = '<div class="boom-flash"></div><div class="boom-ring"></div>';
    for (var i = 0; i < 14; i++) {
      var a = Math.round(-90 + (Math.random() * 300 - 150));
      var d = Math.round(90 + Math.random() * 170);
      html += '<div class="spark" style="--a:' + a + 'deg;--d:' + d + 'px;animation-delay:' + (Math.random() * 0.12).toFixed(2) + 's"></div>';
    }
    for (var j = 0; j < 3; j++) {
      html += '<div class="smoke" style="left:' + (-30 + Math.random() * 60) + 'px;top:' + (-30 + Math.random() * 50) + 'px;animation-delay:' + (j * 0.12) + 's"></div>';
    }
    html += '<div class="boom-label">💥 砰！短路啦！</div>';
    boom.innerHTML = html;
    el.effectsLayer.appendChild(boom);
    var why = fault && fault.message
      ? fault.message.replace(/^短路啦！/, '')
      : '电线把电池的正极和负极直接连起来了，电流走了没有障碍的近路。';
    speak('砰！短路啦！' + why);
    var canvas = el.boardCanvas;
    canvas.classList.add('shake');
    var batEl = el.partsLayer.querySelector('.part[data-type="battery"]');
    if (batEl) batEl.classList.add('burnt');
    setTimeout(function () {
      boom.remove();
      canvas.classList.remove('shake');
      if (batEl) batEl.classList.remove('burnt');
    }, 2600);
  }

  /* ---------- 弹窗 ---------- */
  function openModal(html, speakText) {
    modalReturnFocus = document.activeElement;
    el.modalCard.innerHTML = '<button class="modal-close" title="关闭" data-nospeak>✕</button>' + html;
    el.modalRoot.hidden = false;
    if (speakText) speak(speakText);
    setTimeout(function () {
      if (el.modalRoot.hidden || el.modalCard.contains(document.activeElement)) return;
      var f = el.modalCard.querySelector('.modal-close');
      if (f && f.focus) f.focus();
    }, 30);
  }
  function closeModal() {
    el.modalRoot.hidden = true;
    el.modalCard.innerHTML = '';
    if (global.Voice) Voice.cancel();
    if (modalReturnFocus && modalReturnFocus.focus) {
      try { modalReturnFocus.focus(); } catch (e) {}
    }
    modalReturnFocus = null;
  }
  function showHelp() {
    openModal(
      '<h2>怎么玩？</h2><p class="sub">给小朋友和大朋友的操作说明。点每一行，可以用中文念出来。</p>' +
      '<div class="help-list">' +
      '<div class="help-item" data-speak="第一步，放进零件。从左边零件箱拖到工作台，或者点一下零件，它会自己跳进去。"><span class="n">1</span><p><b>放进零件：</b>从左边零件箱拖到工作台，或者点一下零件，它会自己跳进去。点零件箱上的小问号，可以听它是做什么的。</p></div>' +
      '<div class="help-item" data-speak="第二步，连电线。点零件上的小圆点，再点另一个小圆点，就连好一根电线。点电线按钮，会提示所有接线点。"><span class="n">2</span><p><b>连电线：</b>点零件上的小圆点，再点另一个小圆点，就连好一根电线。（点「电线」按钮会提示所有接线点）</p></div>' +
      '<div class="help-item" data-speak="第三步，通电。按右上角通电试试，电线里会出现流动的小电流，LED、灯泡、电机、喇叭都会工作。"><span class="n">3</span><p><b>通电：</b>按右上角<b>「通电试试」</b>，电线里会出现流动的小电流，LED、灯泡、电机、喇叭都会工作。</p></div>' +
      '<div class="help-item" data-speak="第四步，修改和删除。点一下可以调节的零件，它的头顶上会冒出快捷旋钮，拖滑块、点选项，马上就能调。拖动零件可以搬家。选中零件后点垃圾桶删除。点一下电线，中间会出现叉叉，再点它就可以删掉这根电线。按撤销都能找回。"><span class="n">4</span><p><b>修改和删除：</b>点一下电池、电阻、光敏电阻、可变电阻、LED、开关或电机，<b>零件头顶会冒出快捷旋钮</b>，拖滑块、点选项就能马上调；拖动零件可以搬家；选中零件后点 🗑️ 删除；点一下<b>电线</b>，中间会出现 <b>✕</b>，再点它就可以删掉这根电线；按「撤销」都能找回。</p></div>' +
      '<div class="help-item" data-speak="第五步，小心短路。电线不能直接把电池的正极和负极连起来。要在中间放一个灯泡、电阻、电机或者喇叭，不然会爆炸。"><span class="n">5</span><p><b>小心短路：</b>电线不能直接把电池的 + 和 − 连起来！要在中间放一个灯泡、电阻、电机或喇叭，不然会💥爆炸。</p></div>' +
      '<div class="help-item" data-speak="第六步，真实电路里，每个零件都有额定值。LED 额定 20 毫安，电阻额定四分之一瓦，二极管额定 200 毫安，保险丝额定 0.5 安培。电流超过额定值，零件就会发烫冒烟，然后烧坏。保险丝则会自己熔断，保护电池。烧坏以后，点它，再点换一个新的，就能继续玩。"><span class="n">6</span><p><b>零件会烧坏：</b>每个零件都有<b>额定值</b>：LED 20mA、电阻 1/4W、二极管 200mA、保险丝 0.5A……电流超了就会♨️发烫，然后💨烧坏（保险丝是「啪」地熔断，保护大家）。烧坏了点它，再点<b>「🔧 换一个新的」</b>，或者按撤销。</p></div>' +
      '<div class="help-item" data-speak="第七步，认一认零件。电池提供电，电阻像减速带，LED 长脚接正极，二极管是单向门，按钮要按住才通，可变电阻能拧大拧小，保险丝会保护电路，电流表要串联、电压表要并联，面包板的正极轨和负极轨左右相通。"><span class="n">7</span><p><b>认一认：</b>电池提供电；电阻像减速带；LED 长脚接 +；二极管是单向门；<b>按钮</b>要按住才通；<b>可变电阻</b>能拧大拧小；<b>保险丝</b>保护电路；<b>电流表</b>串联、<b>电压表</b>并联；面包板的 + 轨和 − 轨左右相通。</p></div>' +
      '<div class="help-item" data-speak="第八步，听中文讲解。点任何一个零件，都会用中文告诉你它是干什么的。右边的小电会提示哪里有问题，点听问题按钮可以再听一遍。"><span class="n">8</span><p><b>听中文讲解：</b>点任何一个零件，都会用中文告诉你它是干什么的。右边的小电会提示哪里有问题，点「听问题」可以再听一遍。顶部的「朗读」按钮可以开关全站发音。</p></div>' +
      '<div class="help-item" data-speak="第九步，分享和记录。按分享按钮可以复制一个链接，朋友打开就能看到你的电路。通电以后点记下读数，可以把电流和电压记在实验记录里。"><span class="n">9</span><p><b>分享和记录：</b>按「📤 分享」复制链接，朋友打开就能看到你的电路；通电后点「记下读数」，把电流和电压记进实验记录。</p></div>' +
      '</div>' +
      (App.hasBackup && App.hasBackup()
        ? '<div class="modal-actions"><button class="btn small ghost" id="helpRestore" type="button">♻️ 恢复清空前的电路</button></div>'
        : ''),
      '怎么玩？这里是给小朋友和大朋友的操作说明。点每一行，我都可以念给你听。'
    );
    var hr = $('helpRestore');
    if (hr) on(hr, 'click', function () { closeModal(); App.restoreBackup(); });
  }
  function showExamples() {
    openModal(
      '<h2>示例电路</h2><p class="sub">点一个看看它是怎么工作的（加载后可以按「撤销」恢复）</p>' +
      '<div class="example-grid">' +
      Object.keys(App.PRESETS).map(function (id) {
        var p = App.PRESETS[id];
        return '<button class="example' + (p.danger ? ' danger' : '') + '" data-preset="' + id + '" data-speak="' +
          p.name + '。' + p.desc + ' ' + (p.note || '') + '">' +
          '<span class="ex-icon">' + p.icon + '</span><b>' + p.name + '</b><span>' + p.desc + '</span></button>';
      }).join('') +
      '</div>',
      '这里有几个示例电路。点一个，看看它是怎么工作的。'
    );
    Array.prototype.forEach.call(el.modalCard.querySelectorAll('[data-preset]'), function (b) {
      on(b, 'click', function () { App.loadPreset(b.dataset.preset); closeModal(); });
    });
  }

  /* ---------- 提示气泡 ---------- */
  function toast(msg, type, opts) {
    var now = Date.now();
    if (msg === lastToastText && now - lastToastAt < 1300) return;
    lastToastText = msg;
    lastToastAt = now;
    while (el.toastRoot.children.length >= 4) el.toastRoot.firstChild.remove();
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    el.toastRoot.appendChild(t);
    /* silent：这条提示已经有别的语音在讲了，就不要再念一遍 */
    if (!(opts && opts.silent)) speak(msg, { auto: true });
    setTimeout(function () { t.classList.add('out'); }, 2200);
    setTimeout(function () { t.remove(); }, 2550);
  }

  global.UI = {
    init: init, el: el,
    renderAll: renderAll, renderParts: renderParts, renderWires: renderWires,
    refreshFromSim: refreshFromSim, updateHeat: updateHeat, select: select,
    updatePanels: updatePanels, renderTasks: renderTasks, renderInspector: renderInspector,
    renderQuickEditor: renderQuickEditor, positionQuickEditor: positionQuickEditor,
    scheduleQuickPosition: scheduleQuickPosition,
    updateRunButton: updateRunButton, setPowered: setPowered, setAlarm: setAlarm,
    updateSound: updateSound, updateVoice: updateVoice, updateUndo: updateUndo,
    updateWireStyle: updateWireStyle, updateWireLabels: updateWireLabels,
    renderGuide: renderGuide, renderLog: renderLog, showHospital: showHospital, confirm: confirm,
    applyZoom: applyZoom, fitToContent: fitToContent, contentBounds: contentBounds,
    setZoom: setZoom, playBoom: playBoom,
    openModal: openModal, closeModal: closeModal, toast: toast,
    speak: speak, speakAuto: speakAuto, speakProblem: speakProblem, explainType: explainType, explainPart: explainPart,
    pressButton: pressButton, reverseMotorWires: reverseMotorWires,
    pathD: pathD, wireObstacles: wireObstacles,
    partEls: partEls
  };
})(window);
