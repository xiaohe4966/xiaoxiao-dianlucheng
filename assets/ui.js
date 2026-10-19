/* 小小电路城 —— DOM 渲染、面板、弹窗、音效可视化 */
(function (global) {
  'use strict';

  var el = {};
  var partEls = {};
  var wireVisuals = {};
  var lastSpokenProblem = '';
  var lastProblemCode = '';
  var explainTimer = null;
  var autoProblemTimer = null;

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
  function guideOf(type) { return (global.PART_GUIDES && PART_GUIDES[type]) || null; }
  function explainText(type, prefix) {
    var g = guideOf(type);
    if (!g) return prefix || '';
    return [prefix, g.what, g.how, g.tip].filter(Boolean).join(' ');
  }
  function explainType(type) {
    var g = guideOf(type);
    if (!g) return;
    var name = type === 'wire' ? '电线' : (PARTS[type] ? PARTS[type].name : type);
    speak(name + '。' + explainText(type));
  }
  function explainPart(part, prefix) {
    if (!part) return;
    var g = guideOf(part.type);
    if (!g) return;
    var text = [prefix, PARTS[part.type].name + '。' + g.what, g.how, g.tip].filter(Boolean).join(' ');
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
    el.emptyHint = $('emptyHint');
    el.statusText = $('statusText');
    el.statusExtra = $('statusExtra');
    el.doctorBubble = $('doctorBubble');
    el.meterValue = $('meterValue');
    el.meterBar = $('meterBar');
    el.meterNote = $('meterNote');
    el.taskList = $('taskList');
    el.inspectBody = $('inspectBody');
    el.btnRun = $('btnRun');
    el.runText = $('runText');
    el.btnUndo = $('btnUndo');
    el.btnSound = $('btnSound');
    el.btnVoice = $('btnVoice');
    el.voiceText = $('voiceText');
    el.btnHearProblem = $('btnHearProblem');
    el.btnListenDoctor = $('btnListenDoctor');
    el.statusPill = $('statusPill');
    el.doctorBubble = $('doctorBubble');
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
    on($('btnClear'), 'click', function () { App.clearBoard(); });
    on($('btnHelp'), 'click', showHelp);
    on($('btnExamples'), 'click', showExamples);
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
    on(el.btnHearProblem, 'click', function () { speakProblem(true); });
    on(el.btnListenDoctor, 'click', function () {
      speak(el.doctorBubble.getAttribute('data-speak') || el.doctorBubble.textContent || '');
    });
    on(el.statusPill, 'click', function () { speakProblem(true); });
    on($('zoomIn'), 'click', function () { setZoom(App.state.zoom + 0.2); });
    on($('zoomOut'), 'click', function () { setZoom(App.state.zoom - 0.2); });
    on($('zoomFit'), 'click', function () { setZoom(1); });

    on(el.modalRoot, 'click', function (e) {
      if (e.target.hasAttribute('data-close') || e.target.closest('.modal-close')) closeModal();
    });
    on(document, 'keydown', function (e) { if (e.key === 'Escape') { closeModal(); if (global.Interact) Interact.cancelWire(); } });

    on(el.partsLayer, 'pointerdown', function (e) {
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
      if (partEl && partEl.dataset.type !== 'switch') {
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
        UI.toast(label + '：' + (guideOf(type) ? guideOf(type).what : ''), 'good');
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
        '" title="接线点" style="left:' + t.x + 'px;top:' + t.y + 'px">' + (t.label || '') + '</button>';
    }).join('');
    return '<div class="part-body"></div>' + def.art(part) + terms +
      '<button class="part-del" title="删除">🗑️</button>' +
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
    node.classList.toggle('selected', !!(selectedId && selectedId === part.id));
    node.classList.toggle('is-led', part.type === 'led');
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
  function renderWires() {
    var sim = App.state.sim;
    var running = App.state.running;
    var sel = App.state.selection;
    var html = '';
    App.state.wires.forEach(function (w) {
      var ends = App.wireEnds(w); if (!ends) return;
      var info = sim && sim.wires[w.id];
      var cur = info ? info.current : 0;
      var active = running && Math.abs(cur) > 0.0008;
      var hot = running && Math.abs(cur) > CircuitSim.SHORT_A;
      var p1 = ends[0], p2 = ends[1], tmp;
      if (running && cur < -0.0008) { tmp = p1; p1 = p2; p2 = tmp; }
      var d = pathD(p1, p2);
      var dots = '';
      var g = '<g class="wire ' + (active ? 'active' : 'idle') + (hot ? ' hot' : '') +
        ((sel && sel.kind === 'wire' && sel.id === w.id) ? ' selected' : '') +
        '" data-wire="' + w.id + '" style="--wire:' + (w.color || '#c8bfa9') + '">' +
        '<path class="wire-hit" d="' + d + '"/>' +
        '<path class="wire-case" d="' + d + '"/>' +
        '<path class="wire-core" d="' + d + '"/>' +
        '<path class="wire-flow" d="' + d + '"/>' + dots +
        '</g>';
      html += g;
    });
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
      xg.setAttribute('transform', 'translate(' + r1(mid.x) + ' ' + r1(mid.y) + ')');
      var xc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      xc.setAttribute('r', '23');
      var xt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      xt.setAttribute('y', '8'); xt.setAttribute('text-anchor', 'middle');
      xt.textContent = '✕';
      var xtt = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      xtt.textContent = '删除这根电线';
      xg.appendChild(xtt); xg.appendChild(xc); xg.appendChild(xt);
      g.appendChild(xg);
      wireVisuals[g.dataset.wire] = { group: g, path: path, flow: wicket, dots: dots, length: len };
    });
  }
  function active0(info) { return Math.abs(info.current) > 0.0008; }
  function pathD(p1, p2) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / dist, ny = dx / dist;
    if (ny < 0) { nx = -nx; ny = -ny; }
    var sag = Math.max(18, Math.min(200, dist * 0.28));
    var mx = (p1.x + p2.x) / 2 + nx * sag, my = (p1.y + p2.y) / 2 + ny * sag;
    return 'M ' + r1(p1.x) + ' ' + r1(p1.y) + ' Q ' + r1(mx) + ' ' + r1(my) + ' ' + r1(p2.x) + ' ' + r1(p2.y);
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
  }

  /* ---------- 根据仿真结果更新零件外观 ---------- */
  function refreshFromSim() {
    var sim = App.state.sim, running = App.state.running;
    App.state.parts.forEach(function (p) {
      var node = partEls[p.id]; if (!node) return;
      var info = sim && sim.parts[p.id];
      var a = info ? Math.abs(info.current) : 0;
      var intensity = 0, spin = 1.2, on = false;
      if (running && info) {
        if (p.type === 'led') { intensity = Math.min(1.25, a / 0.012); on = a > 0.0008; }
        else if (p.type === 'lamp') { intensity = Math.min(1.25, a / 0.03); on = a > 0.001; }
        else if (p.type === 'buzzer') { intensity = Math.min(1, a / 0.02); on = a > 0.001; }
        else if (p.type === 'motor') {
          var speed = Math.min(1.5, a / 0.12); on = a > 0.002;
          spin = Math.max(0.22, 1.5 - speed * 0.9); intensity = Math.min(1, speed);
        } else if (p.type === 'diode') { on = a > 0.0008; intensity = Math.min(1, a / 0.05); }
        else if (p.type === 'resistor') { intensity = Math.min(0.8, info.power / 0.6); }
      }
      node.style.setProperty('--intensity', intensity.toFixed(2));
      node.style.setProperty('--spin', spin.toFixed(2) + 's');
      node.classList.toggle('is-on', !!on);
      node.classList.toggle('is-rev', !!(info && info.reversed));
      node.classList.toggle('is-short', !!(running && p.type === 'battery' && info && info.current > CircuitSim.SHORT_A));
      var badge = node.querySelector('.part-badge');
      if (badge) {
        if (running && info && info.reversed && (p.type === 'led' || p.type === 'diode')) {
          badge.textContent = p.type === 'led' ? '接反啦 🙃' : '接反啦';
          badge.className = 'part-badge show bad';
        } else if (running && p.type === 'led' && a > 0.004) {
          badge.textContent = '亮啦！';
          badge.className = 'part-badge show good';
        } else if (running && p.type === 'motor' && a > 0.01) {
          badge.textContent = '转起来！';
          badge.className = 'part-badge show good';
        } else {
          badge.className = 'part-badge';
        }
      }
    });
    renderWires();
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
    if (fault.code === 'open-switch') return '开关断开了';
    if (fault.code === 'reversed') return fault.type === 'led' ? 'LED 接反了' : '二极管接反了';
    if (fault.code === 'loose') {
      var lp = fault.partId && App.byId(fault.partId);
      return lp ? '「' + PARTS[lp.type].name + '」有个接线点没接电线' : '有接线点还没接电线';
    }
    if (fault.code === 'no-resistor') return 'LED 电流太大，加个电阻吧';
    if (fault.code === 'open') return '电路还没连成一个圈';
    if (fault.code === 'ok') return running ? '⚡ 电流正在跑' : '电路连好啦，可以通电';
    return running ? '⚡ 电流正在跑' : '点右上角「通电试试」';
  }
  function doctorFor(fault, sim) {
    var st = App.state;
    if (st.exploding) return '爆、爆炸啦！💥 快把直接连电池两头的电线拿掉，或者加一个灯泡、电阻、电机。';
    if (fault.code === 'short') return st.running
      ? '危险！电流抄近路，马上就要爆炸了！快断电！'
      : '这个电路短路啦：电线直接连了电池两头。通电会💥！加一个灯泡、电阻、电机或喇叭吧。';
    if (fault.code === 'no-battery') return '先放一节 <b>电池</b> 吧，它是电流小火车的发动机。';
    if (fault.code === 'open-switch') return '开关断开了，电流过不去。点一下开关，让它合上。';
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
    if (fault.code === 'no-resistor') return '<b>LED 电流太大啦！</b>它需要串一个电阻来保护，不然会烧坏。';
    if (fault.code === 'open') return '电路还没连成一个圈。检查一下：每个小圆点是不是都接上电线啦？';
    if (fault.code === 'ok') {
      if (!st.running) return '电路连好啦！按右上角「通电试试」吧。' + (st.presetNote ? ' ' + st.presetNote : '');
      if (hasActive(sim, 'led')) return '电流从电池 <b>+</b> 出发，经过电阻和 LED，再回到 <b>−</b>，LED 就亮啦！';
      if (hasActive(sim, 'motor')) return '电动机转起来啦！电流越大，转得越快。';
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
      ? (fault.code === 'ok' ? '电流像小火车一样在跑！' : statusTextFor(fault, st.running))
      : (fault.code === 'short' ? '短路很危险，断电检查一下吧' : '还没通电，电流在睡觉');
    renderTasks();
    renderInspector();
    autoProblemVoice(fault, sim);
  }
  function renderTasks() {
    if (!el.taskList) return;
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

  /* ---------- 选中零件面板 ---------- */
  function infoFor(partId) { var sim = App.state.sim; return sim && sim.parts[partId]; }
  function renderInspector() {
    var st = App.state, sel = st.selection, body = el.inspectBody;
    if (!sel) {
      body.innerHTML = '<p class="muted">点一个零件或一根电线，就能在这里看到它的小秘密。</p>';
      return;
    }
    if (sel.kind === 'wire') {
      var w = st.wires.find(function (x) { return x.id === sel.id; });
      if (!w) { body.innerHTML = '<p class="muted">这根电线已经不在啦。</p>'; return; }
      var info = st.sim && st.sim.wires[w.id];
      body.innerHTML =
        '<div class="inspect-title">🪢 电线</div>' +
        '<p class="inspect-desc">把两个零件连起来，电流才能通过。</p>' +
        '<p class="inspect-more">' + descFor('wire') + '</p>' +
        '<div class="readout">' + (info ? '<span>电流 <b>' + App.formatCurrent(info.current) + '</b></span>' : '') + '</div>' +
        '<div class="inspect-actions">' +
        '<button class="btn small" id="insSay">🔊 听讲解</button>' +
        '<button class="btn small danger" id="insDel">🗑️ 删掉这根电线</button></div>';
      on($('insDel'), 'click', function () { App.deleteSelection(); });
      on($('insSay'), 'click', function () { explainType('wire'); });
      return;
    }
    var part = App.byId(sel.id);
    if (!part) { body.innerHTML = '<p class="muted">这个零件已经不在啦。</p>'; return; }
    var def = PARTS[part.type], info2 = infoFor(part.id);
    var html = '<div class="inspect-title">' + iconFor(part.type) + ' ' + def.name + '</div>' +
      '<p class="inspect-desc">' + descFor(part.type) + '</p>' +
      '<p class="inspect-more">' + (guideOf(part.type) ? guideOf(part.type).tip : '') + '</p>';
    if (info2) {
      html += '<div class="readout"><span>电流 <b>' + App.formatCurrent(info2.current) + '</b></span>' +
        '<span>电压 <b>' + Math.abs(info2.vdrop).toFixed(2) + ' V</b></span>' +
        '<span>功率 <b>' + (info2.power * 1000).toFixed(0) + ' mW</b></span></div>';
    }
    if (part.type === 'battery') {
      html += '<div class="opt-row">' + [3, 4.5, 9].map(function (v) {
        return '<button class="opt' + (part.props.voltage === v ? ' on' : '') + '" data-voltage="' + v + '">' + v + 'V</button>';
      }).join('') + '</div>';
    } else if (part.type === 'resistor') {
      html += '<div class="opt-row">' + [100, 220, 1000].map(function (v) {
        return '<button class="opt' + (part.props.resistance === v ? ' on' : '') + '" data-res="' + v + '">' + App.fmtRes(v) + '</button>';
      }).join('') + '</div>';
    } else if (part.type === 'led') {
      html += '<div class="opt-row">' + ['#ff5d5d', '#22c55e', '#3b82f6', '#facc15', '#f8fafc'].map(function (c) {
        return '<button class="swatch' + (part.props.color === c ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '"></button>';
      }).join('') + '</div>';
    } else if (part.type === 'switch') {
      html += '<div class="opt-row"><button class="opt' + (part.props.closed ? ' on' : '') + '" id="swToggle">' +
        (part.props.closed ? '已合上 · 点我断开' : '已断开 · 点我合上') + '</button></div>';
    } else if (part.type === 'breadboard') {
      html += '<div class="readout"><span>红色 + 轨左右相通</span><span>蓝色 − 轨左右相通</span></div>';
    }
    html += '<div class="inspect-actions">' +
      '<button class="btn small" id="insSay">🔊 听讲解</button>' +
      '<button class="btn small danger" id="insDel">🗑️ 删掉这个零件</button></div>';
    body.innerHTML = html;
    on($('insDel'), 'click', function () { App.deleteSelection(); });
    on($('insSay'), 'click', function () { explainPart(part); });
    var sw = $('swToggle');
    if (sw) on(sw, 'click', function () { toggleSwitch(part); });
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
  function iconFor(type) {
    var map = { battery: '🔋', switch: '🎚️', resistor: '🧱', led: '💡', lamp: '🔆', buzzer: '🔊', diode: '▶️', motor: '🌀', breadboard: '🧰' };
    return map[type] || '🔩';
  }
  function descFor(type) {
    var map = {
      battery: '电的来源。+ 是正极，− 是负极，电流从 + 出来，回到 −。',
      switch: '像一座小桥，点一下可以断开或合上，控制电流过不过去。',
      resistor: '电流的减速带，保护 LED 不被太大的电流烧坏。',
      led: '长脚(+)接电池正极，短脚接负极，电流通过就会发光。',
      lamp: '灯丝被电流加热就发光。它自己会限制电流，可以直接接电池。',
      buzzer: '电流让里面的纸盆振动，就发出声音啦。',
      diode: '电流的单向门，只允许电流从三角形尖尖的方向通过。',
      motor: '电流通过线圈产生磁力，电机就转起来了。',
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
  }
  function updateUndo() { el.btnUndo.disabled = !App.state.past.length; }

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
    el.stageHolder.style.width = (App.STAGE_W * s) + 'px';
    el.stageHolder.style.height = (App.STAGE_H * s) + 'px';
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
    speak('砰！短路啦！电线把电池的正极和负极直接连起来了。电流走了没有障碍的近路。');
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
    el.modalCard.innerHTML = '<button class="modal-close" title="关闭" data-nospeak>✕</button>' + html;
    el.modalRoot.hidden = false;
    if (speakText) speak(speakText);
  }
  function closeModal() {
    el.modalRoot.hidden = true;
    el.modalCard.innerHTML = '';
    if (global.Voice) Voice.cancel();
  }
  function showHelp() {
    openModal(
      '<h2>怎么玩？</h2><p class="sub">给小朋友和大朋友的操作说明。点每一行，可以用中文念出来。</p>' +
      '<div class="help-list">' +
      '<div class="help-item" data-speak="第一步，放进零件。从左边零件箱拖到工作台，或者点一下零件，它会自己跳进去。"><span class="n">1</span><p><b>放进零件：</b>从左边零件箱拖到工作台，或者点一下零件，它会自己跳进去。点零件箱上的小问号，可以听它是做什么的。</p></div>' +
      '<div class="help-item" data-speak="第二步，连电线。点零件上的小圆点，再点另一个小圆点，就连好一根电线。点电线按钮，会提示所有接线点。"><span class="n">2</span><p><b>连电线：</b>点零件上的小圆点，再点另一个小圆点，就连好一根电线。（点「电线」按钮会提示所有接线点）</p></div>' +
      '<div class="help-item" data-speak="第三步，通电。按右上角通电试试，电线里会出现流动的小电流，LED、灯泡、电机、喇叭都会工作。"><span class="n">3</span><p><b>通电：</b>按右上角<b>「通电试试」</b>，电线里会出现流动的小电流，LED、灯泡、电机、喇叭都会工作。</p></div>' +
      '<div class="help-item" data-speak="第四步，修改和删除。拖动零件可以搬家。选中零件后点垃圾桶删除。点一下电线，中间会出现叉叉，再点它就可以删掉这根电线。按撤销都能找回。"><span class="n">4</span><p><b>修改和删除：</b>拖动零件可以搬家；选中零件后点 🗑️ 删除；点一下<b>电线</b>，中间会出现 <b>✕</b>，再点它就可以删掉这根电线；按「撤销」都能找回。</p></div>' +
      '<div class="help-item" data-speak="第五步，小心短路。电线不能直接把电池的正极和负极连起来。要在中间放一个灯泡、电阻、电机或者喇叭，不然会爆炸。"><span class="n">5</span><p><b>小心短路：</b>电线不能直接把电池的 + 和 − 连起来！要在中间放一个灯泡、电阻、电机或喇叭，不然会💥爆炸。</p></div>' +
      '<div class="help-item" data-speak="第六步，认一认零件。电池提供电，电阻像减速带，LED 长脚接正极，二极管是单向门，面包板的正极轨和负极轨左右相通。"><span class="n">6</span><p><b>认一认：</b>电池提供电；电阻像减速带；LED 长脚接 +；二极管是单向门；面包板的 + 轨和 − 轨左右相通。</p></div>' +
      '<div class="help-item" data-speak="第七步，听中文讲解。点任何一个零件，都会用中文告诉你它是干什么的。右边的小电会提示哪里有问题，点听问题按钮可以再听一遍。"><span class="n">7</span><p><b>听中文讲解：</b>点任何一个零件，都会用中文告诉你它是干什么的。右边的小电会提示哪里有问题，点「听问题」可以再听一遍。顶部的「朗读」按钮可以开关全站发音。</p></div>' +
      '</div>',
      '怎么玩？这里是给小朋友和大朋友的操作说明。点每一行，我都可以念给你听。'
    );
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
  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    el.toastRoot.appendChild(t);
    speak(msg, { auto: true });
    setTimeout(function () { t.classList.add('out'); }, 2200);
    setTimeout(function () { t.remove(); }, 2550);
  }

  global.UI = {
    init: init, el: el,
    renderAll: renderAll, renderParts: renderParts, renderWires: renderWires,
    refreshFromSim: refreshFromSim, select: select,
    updatePanels: updatePanels, renderTasks: renderTasks, renderInspector: renderInspector,
    updateRunButton: updateRunButton, setPowered: setPowered, setAlarm: setAlarm,
    updateSound: updateSound, updateVoice: updateVoice, updateUndo: updateUndo,
    applyZoom: applyZoom, playBoom: playBoom,
    openModal: openModal, closeModal: closeModal, toast: toast,
    speak: speak, speakProblem: speakProblem, explainType: explainType, explainPart: explainPart,
    partEls: partEls
  };
})(window);
