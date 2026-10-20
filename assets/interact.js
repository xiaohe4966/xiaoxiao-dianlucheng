/* 小小电路城 —— 拖放、连线、键盘交互 */
(function (global) {
  'use strict';

  var drag = null;

  function toStage(cx, cy) {
    var r = UI.el.stage.getBoundingClientRect();
    var s = App.state.scale || 1;
    return { x: (cx - r.left) / s, y: (cy - r.top) / s };
  }
  function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }

  function init() {
    global.addEventListener('pointermove', onMove, { passive: false });
    global.addEventListener('pointerup', onUp);
    global.addEventListener('pointercancel', onUp);
    global.addEventListener('keydown', onKey);
    document.addEventListener('contextmenu', function (e) {
      if (e.target.closest('.part') || e.target.closest('.wire')) e.preventDefault();
    });
  }

  /* ---------- 从零件箱拖出 / 点击放入 ---------- */
  function startSpawn(e, type, chip) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    if (App.state.exploding) return;
    if (type === 'wire') { toggleWireMode(chip); return; }
    var def = PARTS[type];
    var ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML = CHIP_ICONS[type] || '';
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    document.body.appendChild(ghost);
    drag = { kind: 'spawn', type: type, ghost: ghost, sx: e.clientX, sy: e.clientY, moved: false };
  }

  function freeSpot(def) {
    var cands = [], x, y;
    for (y = 60; y < App.STAGE_H - def.h - 30; y += 54) {
      for (x = 60; x < App.STAGE_W - def.w - 30; x += 54) {
        cands.push({ x: x, y: y, d: dist(x + def.w / 2, y + def.h / 2, App.STAGE_W / 2, App.STAGE_H / 2 - 20) });
      }
    }
    cands.sort(function (a, b) { return a.d - b.d; });
    for (var i = 0; i < cands.length; i++) {
      var ok = App.state.parts.every(function (p) {
        var pd = PARTS[p.type];
        return !(cands[i].x < p.x + pd.w + 16 && cands[i].x + def.w + 16 > p.x &&
                 cands[i].y < p.y + pd.h + 16 && cands[i].y + def.h + 16 > p.y);
      });
      if (ok) return cands[i];
    }
    return { x: 480, y: 300 };
  }

  /* ---------- 拖动零件 ---------- */
  function startPartDrag(e, partEl) {
    if (e.button !== undefined && e.button !== 0) return;
    if (App.state.exploding) return;
    var part = App.byId(partEl.dataset.id);
    if (!part) return;
    e.preventDefault();
    UI.select({ kind: 'part', id: part.id });
    var p = toStage(e.clientX, e.clientY);
    drag = {
      kind: 'part', id: part.id, el: partEl,
      dx: p.x - part.x, dy: p.y - part.y,
      sx: e.clientX, sy: e.clientY, moved: false, history: false,
      pressed: false
    };
    /* 按钮：一按下去就通电，松手才断开 */
    if (part.type === 'button') {
      UI.pressButton(part, true);
      drag.pressed = true;
    }
  }

  /* ---------- 连线 ---------- */
  function startTerminal(e, termEl) {
    if (e.button !== undefined && e.button !== 0) return;
    if (App.state.exploding) return;
    e.preventDefault(); e.stopPropagation();
    var t = { part: termEl.dataset.part, term: termEl.dataset.term };
    var ws = App.state.wireStart;
    if (ws && (ws.part !== t.part || ws.term !== t.term)) { finishWire(ws, t); return; }
    if (ws) { cancelWire(); return; }
    App.state.wireStart = t;
    termEl.classList.add('armed');
    drag = { kind: 'wire', sx: e.clientX, sy: e.clientY, moved: false };
    showPreview(t, toStage(e.clientX, e.clientY));
    setTargets(true);
  }
  function finishWire(a, b) {
    cancelWire();
    App.createWire(a, b);
    if (App.state.running) App.evaluate();
  }
  function cancelWire() {
    App.state.wireStart = null;
    drag = drag && drag.kind === 'wire' ? null : drag;
    Array.prototype.forEach.call(document.querySelectorAll('.terminal.armed'), function (n) { n.classList.remove('armed'); });
    Array.prototype.forEach.call(document.querySelectorAll('.terminal.hover-target'), function (n) { n.classList.remove('hover-target'); });
    UI.el.previewGroup.innerHTML = '';
    if (!App.state.wireMode) setTargets(false);
  }
  function setTargets(on) {
    Array.prototype.forEach.call(document.querySelectorAll('.terminal'), function (n) { n.classList.toggle('wire-target', on); });
  }
  function showPreview(from, to, target) {
    var pa = App.byId(from.part);
    if (!pa) return;
    var p1 = App.termPos(pa, from.term);
    var fromDef = PARTS[pa.type];
    var skip = {}; skip[from.part] = 1;
    var ownRects = [];
    if (fromDef && pa.type !== 'breadboard') {
      ownRects.push({ x1: pa.x - 9, y1: pa.y - 9, x2: pa.x + fromDef.w + 9, y2: pa.y + fromDef.h + 9 });
    }
    var toPartId = null;
    if (target && !(target.part === from.part && target.term === from.term)) {
      var pb = App.byId(target.part);
      if (pb) {
        var pbDef = PARTS[pb.type];
        to = App.termPos(pb, target.term);
        skip[pb.id] = 1;
        toPartId = pb.id;
        if (pbDef && pb.type !== 'breadboard') {
          ownRects.push({ x1: pb.x - 9, y1: pb.y - 9, x2: pb.x + pbDef.w + 9, y2: pb.y + pbDef.h + 9 });
        }
      }
    }
    var d = UI.pathD(p1, to, UI.wireObstacles(skip), {
      fromPart: from.part, toPart: toPartId, ownRects: ownRects
    });
    UI.el.previewGroup.innerHTML = '<path class="preview-path" d="' + d + '"/>';
  }
  function toggleWireMode(chip) {
    var on = !App.state.wireMode;
    App.state.wireMode = on;
    chip.classList.toggle('active', on);
    setTargets(on);
    UI.toast(on ? '点一个小圆点，再点另一个小圆点，就连好啦' : '已退出连线提示');
    App.audio.click();
  }
  /* 键盘选接线点：回车选第一个点，再 Tab 到另一个点按回车 */
  function chooseTerminal(termEl) {
    if (App.state.exploding) return;
    var t = { part: termEl.dataset.part, term: termEl.dataset.term };
    var ws = App.state.wireStart;
    if (ws && (ws.part !== t.part || ws.term !== t.term)) { finishWire(ws, t); return; }
    if (ws) { cancelWire(); return; }
    App.state.wireStart = t;
    termEl.classList.add('armed');
    setTargets(true);
    var part = App.byId(t.part);
    if (part) showPreview(t, App.termPos(part, t.term));
    UI.toast('选好一个接线点啦，再选另一个接线点', 'good', { silent: true });
    UI.speak('选好一个接线点啦。再选另一个接线点，就连成一根电线。');
  }
  function placeFromPalette(type) {
    if (App.state.exploding || !PARTS[type]) return;
    var spot = freeSpot(PARTS[type]);
    App.addPart(type, spot.x, spot.y);
  }

  /* ---------- 指针移动 / 抬起 ---------- */
  function onMove(e) {
    if (!drag) return;
    if (e.cancelable) e.preventDefault();
    if (drag.kind === 'spawn') {
      drag.ghost.style.left = e.clientX + 'px';
      drag.ghost.style.top = e.clientY + 'px';
      if (dist(e.clientX, e.clientY, drag.sx, drag.sy) > 5) drag.moved = true;
      return;
    }
    if (drag.kind === 'part') {
      var part = App.byId(drag.id); if (!part) return;
      if (dist(e.clientX, e.clientY, drag.sx, drag.sy) > 4) {
        drag.moved = true;
        if (!drag.history) { App.pushHistory(); drag.history = true; }
      }
      if (!drag.moved) return;
      var def = PARTS[part.type];
      var p = toStage(e.clientX, e.clientY);
      part.x = App.clamp(Math.round(p.x - drag.dx), 4, App.STAGE_W - def.w - 4);
      part.y = App.clamp(Math.round(p.y - drag.dy), 4, App.STAGE_H - def.h - 4);
      drag.el.style.left = part.x + 'px';
      drag.el.style.top = part.y + 'px';
      UI.renderWires();
      if (UI.scheduleQuickPosition) UI.scheduleQuickPosition();
      drag.el.classList.add('dragging');
      return;
    }
    if (drag.kind === 'wire') {
      if (dist(e.clientX, e.clientY, drag.sx, drag.sy) > 6) drag.moved = true;
      var ws = App.state.wireStart; if (!ws) return;
      var pt = toStage(e.clientX, e.clientY);
      var t = terminalAt(e.clientX, e.clientY);
      var target = t ? { part: t.dataset.part, term: t.dataset.term } : null;
      showPreview(ws, pt, target);
      Array.prototype.forEach.call(document.querySelectorAll('.terminal.hover-target'), function (n) { n.classList.remove('hover-target'); });
      if (t && !(t.dataset.part === ws.part && t.dataset.term === ws.term)) t.classList.add('hover-target');
    }
  }

  function terminalAt(cx, cy) {
    var node = document.elementFromPoint(cx, cy);
    return node ? node.closest('.terminal') : null;
  }

  function onUp(e) {
    if (!drag) return;
    var d = drag;
    if (d.kind === 'spawn') {
      d.ghost.remove();
      var overBoard = pointInBoard(e.clientX, e.clientY);
      if (overBoard) {
        var p = toStage(e.clientX, e.clientY);
        var def = PARTS[d.type];
        App.addPart(d.type, p.x - def.w / 2, p.y - def.h / 2);
      } else if (!d.moved) {
        var spot = freeSpot(PARTS[d.type]);
        App.addPart(d.type, spot.x, spot.y);
      }
      drag = null;
      return;
    }
    if (d.kind === 'part') {
      d.el.classList.remove('dragging');
      var held = App.byId(d.id);
      if (d.pressed && held) UI.pressButton(held, false);
      if (d.moved) {
        App.commit();
        if (App.state.running) App.evaluate();
      } else {
        var part = App.byId(d.id);
        if (part && part.type === 'switch') {
          App.pushHistory();
          part.props.closed = !part.props.closed;
          App.afterChange();
          App.audio.click();
          UI.renderInspector();
        }
      }
      drag = null;
      return;
    }
    if (d.kind === 'wire') {
      var ws = App.state.wireStart;
      var t = terminalAt(e.clientX, e.clientY);
      if (ws && t && !(t.dataset.part === ws.part && t.dataset.term === ws.term)) {
        finishWire(ws, { part: t.dataset.part, term: t.dataset.term });
      } else if (d.moved) {
        cancelWire();
      } else if (ws) {
        UI.el.previewGroup.innerHTML = '';
      }
      drag = null;
    }
  }

  function pointInBoard(cx, cy) {
    var r = UI.el.boardCanvas.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  }

  /* ---------- 键盘 ---------- */
  function onKey(e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!UI.el.modalRoot.hidden) return;
    /* 焦点在按钮 / 零件 / 接线点上时，空格属于这个控件，不能偷偷给电路通断电 */
    if (e.target.closest && e.target.closest('button, a, [role="button"], [contenteditable="true"]')) return;
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) App.redo();
      else App.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      App.redo();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && App.state.selection) {
      e.preventDefault();
      App.deleteSelection();
      return;
    }
    if (e.key === ' ' && !mod) {
      e.preventDefault();
      App.toggleRun();
    }
  }

  global.Interact = {
    init: init,
    startSpawn: startSpawn,
    startPartDrag: startPartDrag,
    startTerminal: startTerminal,
    cancelWire: cancelWire,
    chooseTerminal: chooseTerminal,
    placeFromPalette: placeFromPalette,
    freeSpot: freeSpot
  };
})(window);
