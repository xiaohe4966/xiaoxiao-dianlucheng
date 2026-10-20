/* 小小电路城 —— 状态、电路运行、声音、示例 */
(function (global) {
  'use strict';

  var STAGE_W = 1200, STAGE_H = 760;
  var STORAGE_KEY = 'xiaoxiao-dianlucheng-v1';
  var STORAGE_VERSION = 2;
  var BACKUP_KEY = 'xiaoxiao-dianlucheng-backup';
  var LOG_KEY = 'xiaoxiao-dianlucheng-log';
  var SOUND_KEY = 'xiaoxiao-dianlucheng-sound';
  var WIRE_STYLE_KEY = 'xiaoxiao-dianlucheng-wire-style';
  var WIRE_LABELS_KEY = 'xiaoxiao-dianlucheng-wire-labels';
  var MAX_PARTS = 80, MAX_WIRES = 240;
  /* 12 种差别明显的电线颜色：新电线优先挑没用过的，
     如果两根电线靠得近或者交叉，就挑颜色差得最远的，避免看混 */
  var WIRE_COLORS = [
    '#e11d48', '#2563eb', '#16a34a', '#f97316',
    '#7c3aed', '#0d9488', '#ca8a04', '#92400e',
    '#0ea5e9', '#4d7c0f', '#334155', '#a21caf'
  ];

  var state = {
    parts: [], wires: [], nextId: 1, selection: null,
    running: false, exploding: false, sim: null, diodeState: {},
    past: [], future: [], achieved: [],
    zoom: 1, fitScale: 1, scale: 1,
    sound: true, wireStart: null, shortTimer: null,
    wireStyle: 'curve', wireLabels: false,
    burnt: {}, heat: {}, heatTimer: null, heatAt: 0,
    presetNote: '', firstRun: true,
    log: [], guide: { active: false, step: 0 }, hospital: null,
    shareLoaded: false
  };

  /* ---------- 小工具 ---------- */
  function byId(id) { for (var i = 0; i < state.parts.length; i++) if (state.parts[i].id === id) return state.parts[i]; return null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function uid(prefix) { return prefix + (state.nextId++); }
  function normalizeIds() {
    var max = 0;
    function scan(list) {
      list.forEach(function (o) {
        var m = /(\d+)$/.exec(o.id || '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
    }
    scan(state.parts); scan(state.wires);
    state.nextId = Math.max(state.nextId, max + 1);
    /* 先给零件编号，电线配色时才能按位置判断「离得近不近」 */
    state.parts.forEach(function (p) {
      if (!p.id) p.id = uid('p');
      var def = PARTS[p.type];
      if (def) {
        p.x = clamp(Math.round(p.x), 6, STAGE_W - def.w - 6);
        p.y = clamp(Math.round(p.y), 6, STAGE_H - def.h - 6);
      }
    });
    state.wires.forEach(function (w) {
      if (!w.id) w.id = uid('w');
      if (!w.color) w.color = pickWireColor(w.a, w.b);
    });
  }
  function defOf(p) { return PARTS[p.type]; }
  function termPos(part, termId) {
    var def = defOf(part), list = def.terms, i;
    for (i = 0; i < list.length; i++) if (list[i].id === termId) return { x: part.x + list[i].x, y: part.y + list[i].y };
    return { x: part.x, y: part.y };
  }
  function wireEnds(w) {
    var pa = byId(w.a.part), pb = byId(w.b.part);
    if (!pa || !pb) return null;
    return [termPos(pa, w.a.term), termPos(pb, w.b.term)];
  }
  /* ---------- 电线配色 ---------- */
  function hexRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return { r: 128, g: 128, b: 128 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  /* 人眼对绿色最敏感，红蓝次之，用加权距离判断「颜色差得远不远」 */
  function colorDist(a, b) {
    var x = hexRgb(a), y = hexRgb(b);
    var dr = x.r - y.r, dg = x.g - y.g, db = x.b - y.b;
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
  }
  function ptSegDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    var t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    var qx = x1 + t * dx, qy = y1 + t * dy;
    return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
  }
  function segsCross(a, b) {
    function orient(x1, y1, x2, y2, x3, y3) {
      return (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
    }
    var o1 = orient(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
    var o2 = orient(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
    var o3 = orient(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
    var o4 = orient(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
    return o1 * o2 < 0 && o3 * o4 < 0;
  }
  function segSegDist(a, b) {
    if (segsCross(a, b)) return 0;
    return Math.min(
      ptSegDist(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2),
      ptSegDist(a.x2, a.y2, b.x1, b.y1, b.x2, b.y2),
      ptSegDist(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2),
      ptSegDist(b.x2, b.y2, a.x1, a.y1, a.x2, a.y2)
    );
  }
  function pickWireColor(a, b) {
    var pa = byId(a.part), pb = byId(b.part);
    if (!pa || !pb) return WIRE_COLORS[state.wires.length % WIRE_COLORS.length];
    var ea = termPos(pa, a.term), eb = termPos(pb, b.term);
    var seg = { x1: ea.x, y1: ea.y, x2: eb.x, y2: eb.y };
    var used = {}, count = {}, near = [];
    state.wires.forEach(function (w) {
      if (!w.color) return;
      used[w.color] = 1;
      count[w.color] = (count[w.color] || 0) + 1;
      var ends = wireEnds(w);
      if (!ends) return;
      var d = segSegDist(seg, { x1: ends[0].x, y1: ends[0].y, x2: ends[1].x, y2: ends[1].y });
      if (d < 56) near.push(w.color);
    });
    var best = WIRE_COLORS[0], bestScore = -Infinity;
    WIRE_COLORS.forEach(function (c) {
      var minD = 9999, i;
      for (i = 0; i < near.length; i++) minD = Math.min(minD, colorDist(c, near[i]));
      if (!near.length) minD = 0;
      var score = minD * 1.5 + (used[c] ? 0 : 80) - (count[c] || 0) * 6;
      if (score > bestScore) { bestScore = score; best = c; }
    });
    return best;
  }
  function formatCurrent(a) {
    var v = Math.abs(a);
    if (v < 0.000001) return '0 mA';
    if (v < 0.001) return Math.round(v * 1000000) + ' µA';
    if (v < 1) return Math.round(v * 1000) + ' mA';
    return v.toFixed(2) + ' A';
  }
  function fmtRes(v) {
    v = Number(v) || 0;
    if (v >= 1000000) return (v / 1000000) + ' MΩ';
    return v >= 1000 ? (v / 1000) + ' kΩ' : v + 'Ω';
  }

  /* ---------- 历史记录 / 本地保存 ---------- */
  function snapshot() {
    return JSON.stringify({
      v: STORAGE_VERSION,
      parts: state.parts, wires: state.wires, nextId: state.nextId,
      achieved: state.achieved, burnt: state.burnt
    });
  }
  /* 本地存档和分享链接都可能来自旧版本或者被改坏。
     读进来之前先逐项检查：类型、接线柱、重复编号、越界坐标全部收拾干净，
     坏掉的东西直接丢掉，绝不让一份脏数据把整个页面卡住。 */
  function sanitizeSnapshot(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    var parts = [], byId = {}, used = {};
    var rawParts = Array.isArray(d.parts) ? d.parts.slice(0, MAX_PARTS) : [];
    rawParts.forEach(function (raw, i) {
      if (!raw || typeof raw !== 'object') return;
      var def = PARTS[raw.type];
      if (!def) return;
      var id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : 'p' + (i + 1);
      while (used[id]) id = id + 'x';
      used[id] = 1;
      var x = Number(raw.x), y = Number(raw.y);
      var props = sanitizeProps(raw.type, raw.props);
      var part = {
        id: id, type: raw.type,
        x: isFinite(x) ? clamp(Math.round(x), 0, STAGE_W - def.w) : 60,
        y: isFinite(y) ? clamp(Math.round(y), 0, STAGE_H - def.h) : 60,
        props: props
      };
      parts.push(part);
      byId[part.id] = part;
    });
    var wires = [], wireSeen = {};
    var rawWires = Array.isArray(d.wires) ? d.wires.slice(0, MAX_WIRES) : [];
    rawWires.forEach(function (raw, i) {
      if (!raw || typeof raw !== 'object' || !raw.a || !raw.b) return;
      var pa = byId[raw.a.part], pb = byId[raw.b.part];
      if (!pa || !pb) return;
      var da = PARTS[pa.type], db = PARTS[pb.type];
      var ta = da.terms.some(function (t) { return t.id === raw.a.term; });
      var tb = db.terms.some(function (t) { return t.id === raw.b.term; });
      if (!ta || !tb) return;
      if (raw.a.part === raw.b.part && raw.a.term === raw.b.term) return;
      var key = [raw.a.part, raw.a.term, raw.b.part, raw.b.term].sort().join('|');
      if (wireSeen[key]) return;
      wireSeen[key] = 1;
      var id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : 'w' + (i + 1);
      while (used[id]) id = id + 'x';
      used[id] = 1;
      var wire = {
        id: id,
        a: { part: raw.a.part, term: raw.a.term },
        b: { part: raw.b.part, term: raw.b.term }
      };
      if (typeof raw.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(raw.color)) wire.color = raw.color;
      wires.push(wire);
    });
    var max = 0;
    parts.concat(wires).forEach(function (o) {
      var m = /(\d+)$/.exec(o.id || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    var nextId = Math.max(Number(d.nextId) || 1, max + 1);
    var achieved = (Array.isArray(d.achieved) ? d.achieved : [])
      .filter(function (id) { return typeof id === 'string'; })
      .slice(0, 60);
    var burnt = {};
    if (d.burnt && typeof d.burnt === 'object' && !Array.isArray(d.burnt)) {
      Object.keys(d.burnt).forEach(function (id) {
        if (byId[id] && d.burnt[id] && typeof d.burnt[id] === 'object') burnt[id] = d.burnt[id];
      });
    }
    return { parts: parts, wires: wires, nextId: nextId, achieved: achieved, burnt: burnt };
  }
  function sanitizeProps(type, raw) {
    var props = Object.assign({}, DEFAULT_PROPS[type] || {});
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      Object.keys(raw).forEach(function (k) {
        if (typeof raw[k] === 'string' && raw[k].length > 80) return;
        props[k] = raw[k];
      });
    }
    if (type === 'battery') {
      var v = Number(props.voltage);
      props.voltage = isFinite(v) ? clamp(v, 0.5, 24) : 3;
    } else if (type === 'resistor') {
      var r = Number(props.resistance);
      props.resistance = isFinite(r) ? clamp(Math.round(r), 1, 1000000) : 100;
    } else if (type === 'pot') {
      var pv = Number(props.resistance);
      props.resistance = isFinite(pv) ? clamp(Math.round(pv), 0, 1000) : 500;
    } else if (type === 'ldr') {
      var light = Number(props.light);
      props.light = isFinite(light) ? clamp(Math.round(light), 0, 100) : 50;
    } else if (type === 'led') {
      if (!/^#[0-9a-f]{6}$/i.test(String(props.color || ''))) props.color = '#ff5d5d';
    }
    if ('closed' in props) props.closed = !!props.closed;
    if ('pressed' in props) props.pressed = false;
    return props;
  }
  function restore(json) {
    var d = null;
    try { d = sanitizeSnapshot(typeof json === 'string' ? JSON.parse(json) : json); } catch (e) { d = null; }
    if (!d) return false;
    state.parts = d.parts; state.wires = d.wires;
    state.nextId = d.nextId; state.achieved = d.achieved;
    state.burnt = d.burnt;
    state.heat = {};
    state.selection = null;
    releaseButtons();
    return true;
  }
  /* 按钮是「按住才通」的，松开手 / 刷新页面都要回到断开状态 */
  function releaseButtons() {
    state.parts.forEach(function (p) {
      if (p.type === 'button' && p.props) p.props.pressed = false;
    });
  }
  function pushHistory() {
    state.presetNote = '';
    state.past.push(snapshot());
    if (state.past.length > 60) state.past.shift();
    state.future.length = 0;
  }
  function undo() {
    if (!state.past.length) { UI.toast('没有可以撤销的啦'); return; }
    state.future.push(snapshot());
    if (state.future.length > 60) state.future.shift();
    if (!restore(state.past.pop())) { state.past = []; UI.toast('这一步恢复不了啦'); return; }
    if (state.running) stopRun();
    UI.renderAll(); evaluate(); commit(); UI.toast('撤销啦 ↩️');
    UI.speak('撤销啦。');
    UI.fitToContent();
  }
  function redo() {
    if (!state.future.length) { UI.toast('没有可以重做的啦'); return; }
    state.past.push(snapshot());
    if (state.past.length > 60) state.past.shift();
    if (!restore(state.future.pop())) { state.future = []; UI.toast('这一步恢复不了啦'); return; }
    if (state.running) stopRun();
    UI.renderAll(); evaluate(); commit(); UI.toast('重做啦 ↪️');
    UI.speak('重做啦。');
    UI.fitToContent();
  }
  function commit() {
    try { localStorage.setItem(STORAGE_KEY, snapshot()); } catch (e) {}
    UI.updateUndo();
  }
  function backupCurrent() {
    try { localStorage.setItem(BACKUP_KEY, snapshot()); } catch (e) {}
  }
  function hasBackup() {
    try { return !!localStorage.getItem(BACKUP_KEY); } catch (e) { return false; }
  }
  function restoreBackup() {
    try {
      var raw = localStorage.getItem(BACKUP_KEY);
      if (!raw || !restore(raw)) { UI.toast('还没有可以恢复的备份'); return; }
      if (state.running) stopRun();
      UI.renderAll(); evaluate(); commit(); UI.fitToContent();
      UI.toast('恢复上一次清空前的电路啦', 'good');
      UI.speak('恢复上一次清空前的电路啦。');
    } catch (e) {
      UI.toast('备份读不出来啦');
    }
  }

  /* ---------- 分享链接 ---------- */
  function encodeShare() {
    var payload = JSON.stringify({
      v: STORAGE_VERSION, parts: state.parts, wires: state.wires, nextId: state.nextId
    });
    return btoa(unescape(encodeURIComponent(payload)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeShare(code) {
    try {
      var s = String(code || '').replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      var json = decodeURIComponent(escape(atob(s)));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }
  function shareCircuit() {
    if (!state.parts.length) {
      UI.toast('先搭一个电路，再分享给朋友吧');
      return;
    }
    var url = location.origin + location.pathname + location.search + '#c=' + encodeShare();
    var done = function () {
      UI.toast('分享链接复制好啦，发给朋友试试', 'good');
      UI.speak('分享链接复制好啦。朋友打开就能看到你的电路。');
    };
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { promptShare(url); });
    } else {
      promptShare(url);
    }
  }
  function promptShare(url) {
    try {
      if (global.prompt('复制这个链接发给朋友：', url)) UI.toast('分享链接准备好啦', 'good');
    } catch (e) {}
  }
  function loadSharedHash() {
    var m = /(?:^|[#&])c=([^&]+)/.exec(location.hash || '');
    if (!m) return false;
    var data = decodeShare(m[1]);
    if (!data) return false;
    var d = sanitizeSnapshot(data);
    if (!d || !d.parts.length) return false;
    try {
      var old = localStorage.getItem(STORAGE_KEY);
      if (old) localStorage.setItem(BACKUP_KEY, old);
    } catch (e) {}
    state.parts = d.parts; state.wires = d.wires; state.nextId = d.nextId;
    state.achieved = []; state.burnt = {}; state.heat = {};
    state.presetNote = '这是朋友分享的电路，可以随便改。';
    state.shareLoaded = true;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return true;
  }

  /* ---------- 实验记录 ---------- */
  function loadLog() {
    try {
      var d = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      if (Array.isArray(d)) state.log = d.filter(function (x) { return x && isFinite(x.current); }).slice(0, 24);
    } catch (e) { state.log = []; }
  }
  function saveLog() {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(state.log)); } catch (e) {}
  }
  function recordMeasurement() {
    var sim = state.sim;
    if (!state.parts.length) { UI.toast('先搭一个电路再记录吧'); return; }
    if (!sim) return;
    if (!state.running || sim.totalCurrent <= 0.0000005) {
      UI.toast('先通电，让电流跑起来，再记下读数');
      UI.speak('先通电，等电流跑起来，再记下读数。');
      return;
    }
    var battery = sim.batteries.length ? Math.abs(sim.batteries[0].current) : 0;
    var battV = 0;
    state.parts.forEach(function (p) {
      if (p.type !== 'battery') return;
      var b = sim.batteries.find(function (q) { return q.partId === p.id; });
      if (b) battV = Math.max(battV, b.voltage);
    });
    var active = state.parts.filter(function (p) {
      var info = sim.parts[p.id];
      return info && Math.abs(info.current) > 0.001;
    }).length;
    state.log.unshift({
      at: Date.now(),
      current: sim.totalCurrent,
      battery: battery,
      voltage: battV,
      active: active,
      parts: state.parts.length,
      wires: state.wires.length
    });
    state.log = state.log.slice(0, 24);
    saveLog();
    UI.renderLog();
    UI.toast('📝 记下读数：' + formatCurrent(sim.totalCurrent), 'good');
    UI.speak('记下读数。现在总电流是' + formatCurrent(sim.totalCurrent) + '。');
  }
  function clearLog() {
    if (!state.log.length) return;
    state.log = [];
    saveLog();
    UI.renderLog();
    UI.toast('实验记录清空啦');
  }

  /* ---------- 零件 / 电线操作 ---------- */
  function makePart(type, x, y, props) {
    var def = PARTS[type];
    var p = {
      id: uid('p'), type: type,
      x: clamp(Math.round(x), 6, STAGE_W - def.w - 6),
      y: clamp(Math.round(y), 6, STAGE_H - def.h - 6),
      props: Object.assign({}, DEFAULT_PROPS[type] || {}, props || {})
    };
    state.parts.push(p);
    return p;
  }
  function addPart(type, x, y, props) {
    pushHistory();
    var p = makePart(type, x, y, props);
    state.selection = { kind: 'part', id: p.id };
    afterChange();
    var def = PARTS[type];
    var g = global.PART_GUIDES && PART_GUIDES[type];
    if (g) UI.speak(def.name + '放好啦。' + g.what);
    return p;
  }
  function findWire(a, b) {
    return state.wires.find(function (w) {
      return (w.a.part === a.part && w.a.term === a.term && w.b.part === b.part && w.b.term === b.term) ||
             (w.a.part === b.part && w.a.term === b.term && w.b.part === a.part && w.b.term === a.term);
    });
  }
  function createWire(a, b) {
    if (a.part === b.part && a.term === b.term) return null;
    var exists = findWire(a, b);
    if (exists) { state.selection = { kind: 'wire', id: exists.id }; UI.toast('这两个圆点已经连好啦'); return exists; }
    pushHistory();
    var w = { id: uid('w'), a: a, b: b, color: pickWireColor(a, b) };
    state.wires.push(w);
    state.selection = { kind: 'wire', id: w.id };
    afterChange();
    UI.speak('电线接好啦。');
    return w;
  }
  function deleteSelection() {
    if (!state.selection) return;
    var sel = state.selection;
    pushHistory();
    if (sel.kind === 'part') {
      state.wires = state.wires.filter(function (w) { return w.a.part !== sel.id && w.b.part !== sel.id; });
      state.parts = state.parts.filter(function (p) { return p.id !== sel.id; });
      delete state.burnt[sel.id];
      delete state.heat[sel.id];
    } else {
      state.wires = state.wires.filter(function (w) { return w.id !== sel.id; });
    }
    state.selection = null;
    afterChange();
    UI.toast('删掉啦，按「撤销」可以找回来');
    UI.speak(sel.kind === 'part' ? '零件删掉啦。按撤销可以找回来。' : '电线删掉啦。按撤销可以找回来。');
  }
  function deletePart(id) {
    state.selection = { kind: 'part', id: id };
    deleteSelection();
  }
  function clearBoard(force) {
    if (!state.parts.length && !state.wires.length) return;
    if (!force) {
      var doClear = function () { clearBoard(true); };
      if (UI.confirm) {
        UI.confirm('清空工作台？', '工作台会变干净。清空以后，按「撤销」或者到「玩法」里找备份，都能找回来。', doClear);
      } else if (global.confirm('清空工作台？清空后可以撤销。')) {
        doClear();
      }
      return;
    }
    backupCurrent();
    pushHistory();
    if (state.running) stopRun();
    state.parts = []; state.wires = []; state.selection = null;
    state.burnt = {}; state.heat = {};
    state.guide = { active: false, step: 0 };
    state.hospital = null;
    afterChange();
    UI.renderGuide();
    UI.toast('清空啦，按「撤销」可以找回来');
    UI.speak('工作台清空啦。按撤销可以找回来。');
  }
  function duplicateProps(p) { return JSON.parse(JSON.stringify(p.props)); }

  function afterChange() {
    UI.renderAll();
    evaluate();
    commit();
  }

  /* 横竖走线：只改电线的画法，不改变电路连接，所以不进撤销历史 */
  function setWireStyle(style, opts) {
    style = style === 'ortho' ? 'ortho' : 'curve';
    if (state.wireStyle === style) {
      UI.updateWireStyle();
      return style;
    }
    state.wireStyle = style;
    try { localStorage.setItem(WIRE_STYLE_KEY, style); } catch (e) {}
    UI.renderWires();
    UI.updateWireStyle();
    if (!(opts && opts.silent)) {
      UI.speak(style === 'ortho'
        ? '好呀，电线现在都走横线和竖线，会自动绕开零件，还会尽量错开，看起来更整齐。再点一下就能变回弯弯的线。'
        : '电线变回弯弯的曲线啦。想整齐一点，就再点一下横竖线。');
    }
    return style;
  }

  function setWireLabels(on) {
    state.wireLabels = !!on;
    try { localStorage.setItem(WIRE_LABELS_KEY, state.wireLabels ? 'on' : 'off'); } catch (e) {}
    UI.updateWireLabels();
    UI.renderWires();
    if (state.wireLabels) {
      UI.toast('电线电流标签打开啦，通电后能看到每根线里的电流', 'good');
      UI.speak('电线电流标签打开啦。通电以后，每根电线上会显示流过它的电流。');
    } else {
      UI.speak('电线电流标签关掉啦。');
    }
  }

  /* ---------- 额定值 / 过热 ---------- */
  /* 每个零件的额定值（在 parts.js 的 spec 里声明）：电流或者功率，超了就会发烫 */
  function stressOf(part, info) {
    var spec = PARTS[part.type] && PARTS[part.type].spec;
    if (!spec || !info) return null;
    var list = [];
    if (spec.maxA) {
      var a = Math.abs(info.current);
      if (a > 0.0002) list.push({ kind: 'current', value: a, limit: spec.maxA, ratio: a / spec.maxA });
    }
    if (spec.maxW) {
      var w = Math.abs(info.power);
      if (w > 0.0002) list.push({ kind: 'power', value: w, limit: spec.maxW, ratio: w / spec.maxW });
    }
    if (!list.length) return null;
    list.sort(function (x, y) { return y.ratio - x.ratio; });
    return list[0];
  }
  function specLimitText(st) {
    return st.kind === 'power'
      ? (st.limit >= 1 ? st.limit + ' W' : Math.round(st.limit * 1000) + ' mW')
      : formatCurrent(st.limit);
  }
  function specValueText(st) {
    return st.kind === 'power'
      ? (st.value >= 1 ? st.value.toFixed(2) + ' W' : Math.round(st.value * 1000) + ' mW')
      : formatCurrent(st.value);
  }
  /* 找出当前电路里最「吃力」的零件 */
  function worstStress() {
    var sim = state.sim; if (!sim) return null;
    var best = null;
    state.parts.forEach(function (p) {
      if (state.burnt[p.id]) return;
      var st = stressOf(p, sim.parts[p.id]);
      if (st && (!best || st.ratio > best.st.ratio)) best = { part: p, st: st };
    });
    return best;
  }
  function burnVerb(part) { return part && part.type === 'fuse' ? '熔断' : '烧坏'; }
  function burnSpeech(part, st) {
    var name = (PARTS[part.type] && PARTS[part.type].short) || '零件';
    var why = st.kind === 'power'
      ? '它要消耗 ' + specValueText(st) + '，超过了 ' + specLimitText(st) + ' 的额定功率。'
      : '里面流过了 ' + specValueText(st) + '，超过了 ' + specLimitText(st) + ' 的额定电流。';
    if (part.type === 'fuse') {
      return '保险丝熔断啦！' + why + '它自己断开，是为了保护电池和别的零件。点它，再点「换一个新的」，就能继续玩。';
    }
    return '哎呀，' + name + '烧坏啦！' + why + '点它，再点「换一个新的」；或者按撤销。';
  }
  function burn(part, st) {
    if (state.burnt[part.id]) return;
    pushHistory();
    state.burnt[part.id] = {
      kind: st.kind, value: st.value, limit: st.limit,
      limitText: specLimitText(st), valueText: specValueText(st),
      at: Date.now()
    };
    state.heat[part.id] = 1;
    audio.fizzle();
    UI.toast('💨 ' + ((PARTS[part.type] && PARTS[part.type].short) || '零件') + burnVerb(part) + '啦！', 'bad');
    UI.speak(burnSpeech(part, st));
    evaluate();
    commit();       /* 把「烧坏了」记下来，刷新页面也还在 */
  }
  function repairPart(id) {
    if (!state.burnt[id]) return;
    var part = byId(id);
    pushHistory();
    delete state.burnt[id];
    state.heat[id] = 0;
    audio.click();
    afterChange();
    UI.speak('换好啦，崭新的' + ((part && PARTS[part.type] && PARTS[part.type].short) || '零件') + '。再通电试试吧。');
    UI.toast('🔧 换好啦！', 'good');
  }
  /* 一边通电一边看谁在发烫：撑过 0.7 秒才烧坏，超 3 倍立刻烧坏。
     短路的时候别的零件交给爆炸，只有保险丝还会「啪」一下熔断——它本来就是干这个的。 */
  function thermalTick() {
    if (!state.running || state.exploding) return;
    var sim = state.sim; if (!sim) return;
    var shorted = !!sim.short;
    var now = Date.now();
    var dt = Math.min(250, now - (state.heatAt || now));
    state.heatAt = now;
    state.parts.forEach(function (p) {
      if (state.burnt[p.id]) return;
      if (shorted && p.type !== 'fuse') return;
      var st = stressOf(p, sim.parts[p.id]);
      if (!st || st.ratio <= 1) {
        state.heat[p.id] = Math.max(0, (state.heat[p.id] || 0) - dt / 900);
        return;
      }
      if (st.ratio >= 3) { burn(p, st); return; }
      var h = (state.heat[p.id] || 0) + (dt / 700) * Math.min(2, st.ratio);
      state.heat[p.id] = h;
      if (h >= 1) burn(p, st);
    });
    UI.updateHeat();
  }
  function startHeatTimer() {
    stopHeatTimer();
    state.heatAt = Date.now();
    state.heatTimer = setInterval(thermalTick, 120);
  }
  function stopHeatTimer() {
    if (state.heatTimer) { clearInterval(state.heatTimer); state.heatTimer = null; }
  }

  /* ---------- 运行 / 停止 ---------- */
  function setRunUI(on) {
    state.running = on;
    UI.updateRunButton();
    UI.setPowered(on);
    if (on) startHeatTimer();
    else {
      stopHeatTimer();
      audio.stopAll();
      UI.setAlarm(false);
    }
  }
  function startRun() {
    if (state.exploding) return;
    audio.ensure();
    audio.click();
    setRunUI(true);
    evaluate();
    if (state.lastFault && state.lastFault.code === 'ok') {
      UI.speak('通电啦！' + (state.presetNote || '看看电流有没有跑起来。'));
    } else {
      UI.speak('通电试试。咦，我来帮你看看哪里有问题。');
    }
  }
  function stopRun() {
    if (state.shortTimer) { clearTimeout(state.shortTimer); state.shortTimer = null; }
    setRunUI(false);
    state.heat = {};
    UI.refreshFromSim();
    UI.updateHeat();
    UI.updatePanels();
    UI.speak('断电啦。');
  }
  function toggleRun() { state.running ? stopRun() : startRun(); }

  /* ---------- 分析电路 ---------- */
  function pointInfo(sim, partId) { return sim && sim.parts[partId]; }
  function termLabel(part, termId) {
    var def = PARTS[part.type];
    var t = def && def.terms ? def.terms.find(function (x) { return x.id === termId; }) : null;
    if (!t) return '接线点';
    if (t.label === '+') return '正极';
    if (t.label === '−' || t.label === '-') return '负极';
    return '接线点';
  }
  function wireCountAt(partId, termId) {
    return state.wires.filter(function (w) {
      return (w.a.part === partId && w.a.term === termId) || (w.b.part === partId && w.b.term === termId);
    }).length;
  }
  function overloadFault(part, st) {
    var name = (PARTS[part.type] && PARTS[part.type].short) || '零件';
    var msg;
    if (st.kind === 'power') {
      msg = name + '要消耗 ' + specValueText(st) + '，超过额定的 ' + specLimitText(st) +
        '，它会发烫、冒烟，然后烧坏。换一个阻值更大的电阻，或者把电池电压降下来。';
    } else if (part.type === 'led') {
      msg = 'LED 里有 ' + specValueText(st) + '，超过额定的 ' + specLimitText(st) +
        '，很快会烧坏。要串一个 100Ω 以上的电阻保护它；已经有了的话，换一个更大的电阻。';
    } else if (part.type === 'diode') {
      msg = '二极管里有 ' + specValueText(st) + '，超过额定的 ' + specLimitText(st) +
        '。二极管不是用电器，电流太大它会烧坏，要在它旁边串一个灯泡、电阻、LED 或者电机。';
    } else if (part.type === 'fuse') {
      msg = '保险丝里有 ' + specValueText(st) + '，超过额定的 ' + specLimitText(st) +
        '，它马上就会熔断。它在保护电池——不过也要想想，是不是哪里接错了？';
    } else {
      msg = name + '里有 ' + specValueText(st) + '，超过额定的 ' + specLimitText(st) +
        '，会越来越烫，然后烧坏。是不是电池电压太高啦？';
    }
    return { code: 'overload', partId: part.id, kind: st.kind, value: st.value, limit: st.limit, message: msg };
  }
  function diagnose(sim) {
    var hasBattery = state.parts.some(function (p) { return p.type === 'battery'; });
    if (!hasBattery) {
      return {
        code: 'no-battery',
        message: '还没有电池。先放一节电池吧，它是电流小火车的发动机。'
      };
    }
    var burntPart = state.parts.find(function (p) { return state.burnt[p.id]; });
    if (burntPart) {
      var bd = state.burnt[burntPart.id] || {};
      var bname = (PARTS[burntPart.type] && PARTS[burntPart.type].short) || '零件';
      var isFuse = burntPart.type === 'fuse';
      return {
        code: 'burnt', partId: burntPart.id,
        message: '「' + bname + '」' + burnVerb(burntPart) + '啦！它' + (bd.kind === 'power' ? '要消耗 ' : '里面流过了 ') +
          (bd.valueText || '太大') + '，超过了额定的 ' + (bd.limitText || '额定值') +
          (isFuse
            ? '，所以就熔断了。它替电池挡住了大电流，保护了其他零件——点它一下，再点「🔧 换一个新的」就能继续玩。'
            : '，所以烧断了。点它一下，再点「🔧 换一个新的」；或者按撤销。')
      };
    }
    if (sim && sim.short) {
      var info = sim.shortInfo || {};
      var pathWireIds = (info.wireIds || []).slice();
      var pathPartIds = (info.partIds || []).slice();
      var wid = pathWireIds[0] || (sim.maxWire && sim.maxWire.id);
      var w = wid ? state.wires.find(function (q) { return q.id === wid; }) : null;
      var bat = state.parts.find(function (p) { return p.type === 'battery'; });
      var inPath = function (type) {
        for (var k = 0; k < pathPartIds.length; k++) {
          var pp = byId(pathPartIds[k]);
          if (pp && pp.type === type) return pp;
        }
        return null;
      };
      /* 二极管不是导线，属于「电流只走非用电器」的另一类短路 */
      var carries = function (type) {
        for (var k = 0; k < state.parts.length; k++) {
          var cp = state.parts[k];
          if (cp.type !== type) continue;
          var cinfo = sim.parts[cp.id];
          if (cinfo && Math.abs(cinfo.current) > 0.5) return cp;
        }
        return null;
      };
      var diodeInLoop = info.kind === 'noload' ? carries('diode') : null;
      var fuseInLoop = inPath('fuse');
      var switchInLoop = inPath('switch');
      var ammeterInLoop = inPath('ammeter');
      var boardInLoop = inPath('breadboard');
      var culprit = fuseInLoop || diodeInLoop || switchInLoop || ammeterInLoop || boardInLoop;
      var out = {
        code: 'short', wireId: w ? w.id : null, wireIds: pathWireIds, partIds: pathPartIds,
        partId: culprit ? culprit.id : (bat ? bat.id : null)
      };
      if (fuseInLoop) {
        out.message = '短路啦！不过中间有保险丝——通电时它会先「啪」地熔断，替电池挡住大电流。这是它的工作，但也不要故意短路哦。';
        return out;
      }
      if (diodeInLoop) {
        out.message = '短路啦！二极管不是用电器，它只是一扇单向门。把它直接接在电池两头，电流就抄近路跑回去了，二极管会发烫烧坏。要在它旁边加一个灯泡、电阻、LED 或者电机。';
        return out;
      }
      if (ammeterInLoop) {
        out.message = '短路啦！电流表的内阻非常小，直接接在电池两头就等于一根电线，电流会大得吓人。电流表要「串」在电路里，不能并到电池两头。';
        return out;
      }
      if (switchInLoop) {
        out.message = '短路啦！开关把电池两头直接连起来啦，中间没有用电器。要加一个灯泡、电阻、LED 或者电机才行。';
        return out;
      }
      if (boardInLoop) {
        out.message = '短路啦！面包板的红色 + 轨和蓝色 − 轨被连在一起了。检查一下，是不是有电线同时接到了两条电源轨上？';
        return out;
      }
      out.message = pathWireIds.length > 1
        ? '短路啦！几根电线接起来，把电池的正极和负极直接连上了。快把中间的电线拿掉，或者在中间加一个灯泡、电阻、电机、喇叭。'
        : '短路啦！有一根电线直接把电池的正极和负极连起来了。快把中间的电线拿掉，或者在中间加一个灯泡、电阻、电机、喇叭。';
      return out;
    }
    /* 0.5µA 以上就算「电路通了」：1MΩ 电阻配 3V 电池只有约 1.2µA，
       不能误判成「还没连成一个圈」 */
    if (sim && sim.totalCurrent > 0.0000005) {
      var worst = worstStress();
      if (worst && worst.st.ratio > 1) return overloadFault(worst.part, worst.st);
      /* 电流小到 1mA 以下：电路是通的，但什么也带不动（常见于电压表串进了电路） */
      return { code: 'ok', tiny: sim.totalCurrent < 0.001 };
    }
    var i, p;
    for (i = 0; i < state.parts.length; i++) {
      p = state.parts[i];
      if (p.type === 'switch' && !p.props.closed) {
        return {
          code: 'open-switch', partId: p.id,
          message: '开关断开了，电流过不去。点一下开关，让它合上。'
        };
      }
    }
    for (i = 0; i < state.parts.length; i++) {
      p = state.parts[i];
      if (p.type === 'button' && !p.props.pressed) {
        return {
          code: 'open-switch', partId: p.id, button: true,
          message: '按钮还没按下去，电流过不去。按住按钮，它才会通电；松开就断开。'
        };
      }
    }
    for (i = 0; i < state.parts.length; i++) {
      p = state.parts[i];
      if (p.type !== 'led' && p.type !== 'diode') continue;
      var info = pointInfo(sim, p.id);
      if (info && info.reversed) {
        return {
          code: 'reversed', partId: p.id, type: p.type,
          message: p.type === 'led'
            ? 'LED 接反了。长脚是正极，要接电池正极那一边；短脚接负极。'
            : '二极管接反了。电流只能从三角形尖尖的方向过去，把它转个方向吧。'
        };
      }
    }
    /* 找出还没接电线的接线点，告诉小朋友问题在哪里 */
    for (i = 0; i < state.parts.length; i++) {
      p = state.parts[i];
      var def = PARTS[p.type];
      for (var j = 0; j < def.terms.length; j++) {
        var t = def.terms[j];
        if (wireCountAt(p.id, t.id) === 0) {
          return {
            code: 'loose', partId: p.id, term: t.id,
            message: '「' + def.name + '」的' + termLabel(p, t.id) + '还没有接电线。点这个小圆点，再点另一个小圆点，把它连起来。'
          };
        }
      }
    }
    return {
      code: 'open',
      message: '电路还没连成一个圈。检查一下：是不是每个小圆点都接上电线啦？电流要从电池正极出发，绕一圈回到负极。'
    };
  }

  function evaluate() {
    if (state.exploding) return;
    var sim = CircuitSim.simulate({
      parts: state.parts, wires: state.wires,
      defOf: defOf, diodeState: state.diodeState, burnt: state.burnt
    });
    state.diodeState = sim.diodeState;
    state.sim = sim;
    state.lastFault = diagnose(sim);

    if (state.running) {
      if (sim.short) {
        UI.setAlarm(true);
        if (!state.shortTimer) {
          state.shortTimer = setTimeout(function () {
            state.shortTimer = null;
            if (state.running) explode(sim);
          }, 720);
        }
      } else {
        if (state.shortTimer) { clearTimeout(state.shortTimer); state.shortTimer = null; }
        UI.setAlarm(false);
        audio.update(sim);
        checkTasks(sim);
        checkHospital(sim);
      }
    }
    checkGuide(sim);
    UI.refreshFromSim();
    UI.updatePanels();
  }

  /* ---------- 短路爆炸 ---------- */
  function explode(sim) {
    state.exploding = true;
    setRunUI(false);
    state.heat = {};
    UI.setAlarm(true);
    UI.refreshFromSim();       /* 爆炸期间也让电池 / 惹祸的零件保持红色提示 */
    audio.boom();
    UI.playBoom(sim, state.lastFault);
    UI.toast('砰！短路啦！电流走了没有障碍的近路', 'bad');
    setTimeout(function () {
      state.exploding = false;
      UI.setAlarm(false);
      evaluate();
    }, 2600);
  }

  /* ---------- 小挑战 ---------- */
  var TASKS = [
    { id: 'led', icon: '💡', label: '点亮 LED 灯', type: 'led', hint: '放一个电池、一个电阻和一个 LED，连成一个圈，再通电。' },
    { id: 'lamp', icon: '🔆', label: '点亮小灯泡', type: 'lamp', hint: '电池、开关和小灯泡连成一个圈，按通电试试。' },
    { id: 'motor', icon: '🌀', label: '让电机转起来', type: 'motor', hint: '把电机接在电池和开关中间，通电后它就会转。' },
    { id: 'motorRev', icon: '🔄', label: '让电机反转', type: 'motor', back: true, hint: '点中电机，再点「🔄 调换两根线（反转）」，它就会反着转。' },
    { id: 'buzzer', icon: '🔊', label: '让喇叭唱起歌', type: 'buzzer', hint: '把喇叭接进电路，通电后它会发出声音。' },
    {
      id: 'diode', icon: '🚪', label: '让电流穿过二极管', type: 'diode',
      hint: '二极管像一扇单向门，三角形尖尖的方向就是电流能过去的方向。把它和电阻、LED 串成一个圈，再通电。',
      test: function (p, info, sim) {
        return !sim.short && !state.burnt[p.id] && info.conducting && Math.abs(info.current) > 0.0018;
      }
    },
    {
      id: 'ammeter', icon: '🅰️', label: '用电流表测电流', type: 'ammeter',
      hint: '把电流表串进电路，和零件手拉手，表盘上就会显示流过它的电流。',
      test: function (p, info, sim) {
        return !sim.short && sim.totalCurrent > 0.002 && Math.abs(info.current) > 0.001;
      }
    },
    {
      id: 'voltmeter', icon: '⚡', label: '用电压表测电压', type: 'voltmeter',
      hint: '把电压表并联在零件两边，测它两端的电压；不要把它串进电路里。',
      test: function (p, info, sim) {
        return !sim.short && sim.totalCurrent > 0.002 && Math.abs(info.vdrop) > 0.5;
      }
    },
    {
      id: 'twoLamps', icon: '💡', label: '点亮两个灯泡',
      hint: '放两个灯泡，串联或者并联都行，让它们同时亮起来。',
      when: function (sim) {
        if (sim.short) return false;
        var n = 0;
        state.parts.forEach(function (p) {
          var info = sim.parts[p.id];
          if (p.type === 'lamp' && info && Math.abs(info.current) > 0.0018) n++;
        });
        return n >= 2;
      }
    },
    {
      id: 'parallel', icon: '🧲', label: '让并联灯泡更亮',
      hint: '把两个灯泡并联，每个灯泡都拿到完整电压，电流会比串联时更大。',
      when: function (sim) {
        if (sim.short) return false;
        var bright = 0;
        state.parts.forEach(function (p) {
          var info = sim.parts[p.id];
          if (p.type === 'lamp' && info && info.current > 0.03) bright++;
        });
        return bright >= 2;
      }
    },
    {
      id: 'measure', icon: '🧪', label: '电流电压一起测',
      hint: '电流表串进电路，电压表并在一个零件两边，同时读出电流和电压，像工程师一样检测电路。',
      when: function (sim) {
        if (sim.short || sim.totalCurrent < 0.002) return false;
        var hasA = state.parts.some(function (p) {
          var info = sim.parts[p.id];
          return p.type === 'ammeter' && info && Math.abs(info.current) > 0.001;
        });
        var hasV = state.parts.some(function (p) {
          var info = sim.parts[p.id];
          return p.type === 'voltmeter' && info && Math.abs(info.vdrop) > 0.5;
        });
        return hasA && hasV;
      }
    }
  ];
  /* ---------- 小电带你搭 ---------- */
  var GUIDE_STEPS = [
    {
      title: '放一节电池', icon: '🔋',
      tip: '从零件箱点一下电池，它会跳到工作台中间。电池是电流的发动机。',
      test: function () { return state.parts.some(function (p) { return p.type === 'battery'; }); }
    },
    {
      title: '放一个电阻', icon: '🧱',
      tip: '电阻是电流的减速带。点零件箱里的「电阻」，把它放在电池旁边。',
      test: function () { return state.parts.some(function (p) { return p.type === 'resistor'; }); }
    },
    {
      title: '放一个 LED', icon: '💡',
      tip: 'LED 会发光。长脚是正极，短脚是负极，等一会儿连线时别接反。',
      test: function () { return state.parts.some(function (p) { return p.type === 'led'; }); }
    },
    {
      title: '连成一个圈', icon: '🪢',
      tip: '点电池 +、开关、电阻、LED 上的小圆点，把电池正极 → 电阻 → LED → 电池负极连成一圈。',
      test: function (sim) {
        return !!(sim && !sim.short && sim.totalCurrent > 0.0000005);
      }
    },
    {
      title: '通电，让 LED 亮', icon: '⚡',
      tip: '按右上角「通电试试」。看到电流小点在跑、LED 亮起来，就成功啦！',
      test: function (sim) {
        return !!(state.running && sim && !sim.short && state.parts.some(function (p) {
          var info = sim.parts[p.id];
          return p.type === 'led' && info && Math.abs(info.current) > 0.0018;
        }));
      }
    }
  ];
  function guideStep() {
    if (!state.guide.active) return null;
    return GUIDE_STEPS[state.guide.step] || null;
  }
  function checkGuide(sim) {
    if (!state.guide.active) return;
    sim = sim || state.sim;
    var moved = false, guard = 0;
    while (state.guide.active && guard++ < GUIDE_STEPS.length + 1) {
      var step = GUIDE_STEPS[state.guide.step];
      if (!step) break;
      if (!step.test(sim)) break;
      state.guide.step++;
      moved = true;
      if (state.guide.step >= GUIDE_STEPS.length) {
        state.guide.active = false;
        audio.chime();
        UI.toast('🎉 你跟着小电搭好啦！', 'good');
        UI.speak('太棒啦！你跟着小电，把电池、电阻和 LED 连成了一个圈，还点亮了 LED。你已经是小小电路工程师啦！');
        break;
      }
      var next = GUIDE_STEPS[state.guide.step];
      UI.toast(next.icon + ' 下一步：' + next.title, 'good', { silent: true });
      UI.speak('下一步，' + next.title + '。' + next.tip);
    }
    if (moved) UI.renderGuide();
  }
  function startGuide(force) {
    if (state.guide.active) { UI.toast('已经在带你搭啦，看右边的提示'); return; }
    if (!force && state.parts.length) {
      var go = function () { startGuide(true); };
      if (UI.confirm) {
        UI.confirm('从空白开始搭？', '现在的电路会先留一份备份，也能按「撤销」找回来。', go);
      } else if (global.confirm('从空白开始搭？现在的电路可以撤销找回。')) {
        go();
      }
      return;
    }
    if (force) {
      backupCurrent();
      pushHistory();
      if (state.running) stopRun();
      state.parts = []; state.wires = []; state.nextId = 1;
      state.selection = null; state.burnt = {}; state.heat = {};
      state.diodeState = {}; state.hospital = null;
      state.guide = { active: false, step: 0 };
      UI.renderAll();
      evaluate();
      commit();
      UI.fitToContent();
    }
    state.guide = { active: true, step: 0 };
    state.hospital = null;
    UI.renderGuide();
    var step = GUIDE_STEPS[0];
    UI.toast('🧭 小电带你搭：' + step.title, 'good', { silent: true });
    UI.speak('好呀，我来带你搭一个会亮的 LED 电路。第一步，' + step.title + '。' + step.tip);
    checkGuide(state.sim);
  }
  function skipGuideStep() {
    if (!state.guide.active) return;
    state.guide.step++;
    if (state.guide.step >= GUIDE_STEPS.length) {
      state.guide.active = false;
      UI.renderGuide();
      UI.toast('引导结束啦，接下来可以自己随便玩');
      UI.speak('引导结束啦。接下来你可以自己随便玩。');
      return;
    }
    var next = GUIDE_STEPS[state.guide.step];
    UI.renderGuide();
    UI.toast('跳到：' + next.title);
    UI.speak('好，那先看这一步：' + next.title + '。' + next.tip);
    checkGuide(state.sim);
  }
  function stopGuide() {
    state.guide.active = false;
    UI.renderGuide();
    UI.toast('引导关掉啦，想再听就点「开始」');
  }

  /* ---------- 电路医院 ---------- */
  var HOSPITAL = {
    ledReverse: {
      name: 'LED 怎么不亮？', icon: '💡',
      desc: '电池、开关、电阻、LED 都接好了，可是 LED 一点光都没有。',
      goal: '找出问题，让 LED 亮起来。',
      build: function () {
        var bat = makePart('battery', 70, 300), sw = makePart('switch', 300, 301),
            r = makePart('resistor', 520, 310), led = makePart('led', 760, 285);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', r, 'a'),
                pwire(r, 'b', led, 'ca'), pwire(led, 'an', bat, 'neg')];
      },
      check: function (sim) {
        return state.parts.some(function (p) {
          var info = sim.parts[p.id];
          return p.type === 'led' && info && info.current > 0.0018 && !sim.short;
        });
      },
      hint: '点中 LED，看看它的长脚（+）是不是接到了电池正极那一边。接反了就不会亮。'
    },
    missingWire: {
      name: '还差一根电线', icon: '🪢',
      desc: '零件都摆好了，电线也接了大半，但电路还没有连成一个圈。',
      goal: '把缺的那根电线接上，让 LED 亮起来。',
      build: function () {
        var bat = makePart('battery', 70, 300), sw = makePart('switch', 300, 301),
            r = makePart('resistor', 520, 310), led = makePart('led', 760, 285);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', r, 'a'), pwire(r, 'b', led, 'an')];
      },
      check: function (sim) {
        return state.parts.some(function (p) {
          var info = sim.parts[p.id];
          return p.type === 'led' && info && info.current > 0.0018 && !sim.short;
        });
      },
      hint: '看看每个小圆点是不是都接了电线。LED 的短脚那边好像还空着。'
    },
    shorted: {
      name: '危险的短路', icon: '💥',
      desc: '有人用一根电线把电池的正极和负极直接连起来了，通电就会爆炸。',
      goal: '拆掉短路，接一个用电器，让电流乖乖工作。',
      build: function () {
        var bat = makePart('battery', 300, 300);
        return [pwire(bat, 'pos', bat, 'neg')];
      },
      check: function (sim) {
        return !!(state.running && sim && !sim.short && sim.totalCurrent > 0.0005);
      },
      hint: '先删掉电池两头那根危险的电线，再放一个灯泡、电阻、LED 或电机，重新连成一个圈。'
    },
    hotLamp: {
      name: '灯泡烫得厉害', icon: '🔆',
      desc: '9V 电池直接接在小灯泡上，灯泡亮是亮，可是电流超过了它的额定值。',
      goal: '让灯泡安全地亮起来，不要过载。',
      build: function () {
        var bat = makePart('battery', 100, 300, { voltage: 9 }), lamp = makePart('lamp', 560, 282);
        return [pwire(bat, 'pos', lamp, 'a'), pwire(lamp, 'b', bat, 'neg')];
      },
      check: function (sim) {
        if (!state.running || !sim || sim.short) return false;
        var lamp = state.parts.find(function (p) { return p.type === 'lamp'; });
        var info = lamp && sim.parts[lamp.id];
        if (!info || info.current <= 0.001) return false;
        return !(worstStress() && worstStress().st.ratio > 1);
      },
      hint: '小灯泡额定大约 80mA。把电池换成 3V，它就能安全地亮；也可以在电路里串一个合适的电阻。'
    }
  };
  function loadCase(id) {
    var c = HOSPITAL[id];
    if (!c) return;
    if (state.running) stopRun();
    pushHistory();
    state.parts = []; state.wires = []; state.nextId = 1;
    state.selection = null; state.burnt = {}; state.heat = {}; state.diodeState = {};
    state.wires = c.build();
    normalizeIds();
    state.hospital = id;
    state.guide = { active: false, step: 0 };
    state.presetNote = '电路医院：' + c.goal;
    UI.renderAll();
    evaluate();
    commit();
    UI.renderGuide();
    UI.fitToContent();
    UI.toast('🏥 电路医院：' + c.name, 'good', { silent: true });
    UI.speak('电路医院。' + c.desc + ' 你的任务是：' + c.goal);
  }
  function checkHospital(sim) {
    if (!state.hospital || !state.running) return;
    var c = HOSPITAL[state.hospital];
    if (!c || !c.check || !c.check(sim)) return;
    var name = c.name;
    state.hospital = null;
    state.presetNote = '电路医院的任务完成啦！';
    audio.chime();
    UI.toast('🏥 修好啦！' + name + ' 🎉', 'good');
    UI.speak('修好啦！你解决了「' + name + '」。真像一位小小电路医生！');
    UI.renderGuide();
  }

  function checkTasks(sim) {
    var won = [];
    TASKS.forEach(function (t) {
      if (state.achieved.indexOf(t.id) >= 0) return;
      var hit = t.when ? t.when(sim) : state.parts.some(function (p) {
        var info = sim.parts[p.id];
        if (!info || p.type !== t.type) return false;
        if (t.test) return t.test(p, info, sim);
        if (t.back) return info.current < -0.0018;      /* 电流反着流 = 反转 */
        return Math.abs(info.current) > 0.0018;
      });
      if (hit) {
        state.achieved.push(t.id);
        won.push(t);
        UI.toast('太棒了！' + t.label + ' 🎉', 'good', { silent: true });
        audio.chime();
      }
    });
    if (!won.length) return;
    UI.renderTasks();
    commit();
    var names = won.map(function (t) { return t.label; }).join('、');
    UI.speak(won.length > 1 ? '太棒了！你完成了：' + names + '。' : '太棒了！' + names + '，完成啦。');
  }

  /* ---------- 声音 ---------- */
  var audio = (function () {
    var ctx = null, loops = {};
    function ensure() {
      if (!ctx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function can() { return state.sound && ensure(); }
    function tone(freq, dur, type, gain) {
      if (!can()) return;
      var o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain || 0.08, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function startLoop(id, freq, type, gain) {
      if (!can()) return;
      if (loops[id]) { loops[id].osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.04); return; }
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.value = 0;
      g.gain.setTargetAtTime(gain || 0.03, ctx.currentTime, 0.05);
      o.connect(g); g.connect(ctx.destination); o.start();
      loops[id] = { osc: o, gain: g };
    }
    function stopLoop(id) {
      var L = loops[id]; if (!L) return;
      delete loops[id];
      if (!ctx) return;
      L.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      setTimeout(function () { try { L.osc.stop(); } catch (e) {} }, 260);
    }
    function stopAll() { Object.keys(loops).forEach(stopLoop); }
    return {
      ensure: ensure, stopAll: stopAll,
      setEnabled: function (on) { state.sound = on; if (!on) stopAll(); },
      click: function () { tone(660, 0.06, 'triangle', 0.05); },
      chime: function () { tone(784, 0.16, 'sine', 0.07); setTimeout(function () { tone(1046, 0.24, 'sine', 0.07); }, 130); },
      boom: function () {
        if (!can()) return;
        var t = ctx.currentTime, i, buf = ctx.createBuffer(1, ctx.sampleRate * 0.7, ctx.sampleRate), d = buf.getChannelData(0);
        for (i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
        var src = ctx.createBufferSource(); src.buffer = buf;
        var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        var g = ctx.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(t);
        var o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.55);
        og.gain.setValueAtTime(0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.connect(og); og.connect(ctx.destination); o.start(t); o.stop(t + 0.65);
      },
      /* 零件烧坏的声音：一声「嘶——啪」 */
      fizzle: function () {
        if (!can()) return;
        var t = ctx.currentTime, i;
        var buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.42), ctx.sampleRate), d = buf.getChannelData(0);
        for (i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.4);
        var src = ctx.createBufferSource(); src.buffer = buf;
        var f = ctx.createBiquadFilter(); f.type = 'bandpass';
        f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(320, t + 0.4);
        f.Q.value = 0.9;
        var g = ctx.createGain(); g.gain.setValueAtTime(0.26, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(t);
        var o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'square'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(58, t + 0.25);
        og.gain.setValueAtTime(0.1, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(og); og.connect(ctx.destination); o.start(t); o.stop(t + 0.32);
      },
      update: function (sim) {
        if (!state.sound) { stopAll(); return; }
        var buzz = null, motor = null;
        state.parts.forEach(function (p) {
          var info = sim.parts[p.id]; if (!info) return;
          var a = Math.abs(info.current);
          if (p.type === 'buzzer' && a > 0.002) buzz = { f: 480 + Math.min(a * 2600, 900), g: Math.min(0.035, 0.012 + a * 0.2) };
          if (p.type === 'motor' && a > 0.004) motor = { f: 65 + Math.min(a * 260, 130), g: 0.022 };
        });
        if (buzz) startLoop('buzz', buzz.f, 'square', buzz.g); else stopLoop('buzz');
        if (motor) startLoop('hum', motor.f, 'sawtooth', motor.g); else stopLoop('hum');
      }
    };
  })();

  /* ---------- 示例电路 ---------- */
  function pwire(pa, ta, pb, tb) { return { a: { part: pa.id, term: ta }, b: { part: pb.id, term: tb } }; }
  var PRESETS = {
    led: {
      name: '点亮 LED', icon: '💡', desc: '电池 → 开关 → 电阻 → LED，电阻会保护 LED。',
      note: '电流从电池的 + 出发，经过电阻和 LED，再回到 −。',
      build: function () {
        var bat = makePart('battery', 60, 300), sw = makePart('switch', 292, 301),
            r = makePart('resistor', 512, 310), led = makePart('led', 752, 285);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', r, 'a'), pwire(r, 'b', led, 'an'), pwire(led, 'ca', bat, 'neg')];
      }
    },
    lamp: {
      name: '点亮小灯泡', icon: '🔆', desc: '灯泡自己会限制电流，可以直接连电池。',
      note: '灯丝被电流加热，就发光啦。',
      build: function () {
        var bat = makePart('battery', 100, 300), sw = makePart('switch', 340, 301), lamp = makePart('lamp', 620, 282);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', lamp, 'a'), pwire(lamp, 'b', bat, 'neg')];
      }
    },
    motor: {
      name: '让电机转', icon: '🌀', desc: '电流让电机里的线圈转起来。',
      note: '电流越大，电机转得越快。直流电机还有个本事：把两根线对调，它就会反着转，点电机再点「🔄 调换两根线（反转）」试试。',
      build: function () {
        var bat = makePart('battery', 100, 300), sw = makePart('switch', 340, 301), m = makePart('motor', 620, 280);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', m, 'a'), pwire(m, 'b', bat, 'neg')];
      }
    },
    fade: {
      name: '调光灯', icon: '🎛️', desc: '用可变电阻拧大拧小，LED 就变亮变暗。',
      note: '点中可变电阻，拖动滑块就能改电阻：电阻小，电流大，灯更亮。',
      build: function () {
        var bat = makePart('battery', 60, 300), sw = makePart('switch', 292, 301),
            pot = makePart('pot', 500, 300, { resistance: 100 }), led = makePart('led', 760, 285);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', pot, 'a'), pwire(pot, 'b', led, 'an'), pwire(led, 'ca', bat, 'neg')];
      }
    },
    fuse: {
      name: '保险丝保护', icon: '🧯', desc: '电线直接连电池两头，可是中间有保险丝。',
      note: '通电试试：保险丝会「啪」地熔断，替电池挡住大电流。这就是它的工作。',
      build: function () {
        var bat = makePart('battery', 160, 300), f = makePart('fuse', 420, 300);
        return [pwire(bat, 'pos', f, 'a'), pwire(f, 'b', bat, 'neg')];
      }
    },
    buzzer: {
      name: '让喇叭唱歌', icon: '🔊', desc: '电流让喇叭里的纸盆振动，就发出声音。',
      note: '回到 − 的电流越多，喇叭越响。',
      build: function () {
        var bat = makePart('battery', 100, 300), sw = makePart('switch', 340, 301), bz = makePart('buzzer', 620, 288);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', bz, 'a'), pwire(bz, 'b', bat, 'neg')];
      }
    },
    diode: {
      name: '二极管单向门', icon: '🚪', desc: '电流只能从二极管的正极进、负极出，像一扇单向门。',
      note: '二极管把电流的方向管得死死的：接反了，电流就过不去，LED 不会亮。它还会吃掉大约 0.7V 电压。',
      build: function () {
        var bat = makePart('battery', 50, 300), sw = makePart('switch', 260, 308),
            r = makePart('resistor', 450, 328, { resistance: 47 }),
            d = makePart('diode', 660, 316), led = makePart('led', 850, 280);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', r, 'a'), pwire(r, 'b', d, 'an'),
                pwire(d, 'ca', led, 'an'), pwire(led, 'ca', bat, 'neg')];
      }
    },
    meters: {
      name: '电流电压一起测', icon: '🧪', desc: '电流表串在电路里，电压表并在 LED 两边，同时读出电流和电压。',
      note: '电流表要串联，电压表要并联。这样就能像工程师一样检测电路：电流多大、零件两端的电压多大。',
      build: function () {
        var bat = makePart('battery', 50, 290), sw = makePart('switch', 240, 298),
            r = makePart('resistor', 420, 318),
            a = makePart('ammeter', 600, 280), led = makePart('led', 800, 270),
            v = makePart('voltmeter', 900, 480);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', r, 'a'), pwire(r, 'b', a, 'a'),
                pwire(a, 'b', led, 'an'), pwire(led, 'ca', bat, 'neg'),
                pwire(v, 'a', led, 'an'), pwire(v, 'b', led, 'ca')];
      }
    },
    series: {
      name: '串联两个灯泡', icon: '🔗', desc: '两个灯泡手拉手串在一条路上，电流只有一条路可走。',
      note: '串联时电流处处一样大。两个灯泡一起分担电压，所以每个都暗一些；拿掉一个，整条路就断了。',
      build: function () {
        var bat = makePart('battery', 60, 300), sw = makePart('switch', 280, 301),
            l1 = makePart('lamp', 470, 282), l2 = makePart('lamp', 700, 282);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', l1, 'a'),
                pwire(l1, 'b', l2, 'a'), pwire(l2, 'b', bat, 'neg')];
      }
    },
    parallel: {
      name: '并联两个灯泡', icon: '🧲', desc: '两个灯泡各走一条路，再一起回到电池。',
      note: '并联时每个灯泡都拿到完整的电压，所以更亮；拿掉一个，另一个还会亮。家里的电灯大多是并联的。',
      build: function () {
        var bat = makePart('battery', 60, 300), sw = makePart('switch', 280, 301),
            l1 = makePart('lamp', 500, 220), l2 = makePart('lamp', 500, 430);
        return [pwire(bat, 'pos', sw, 'a'), pwire(sw, 'b', l1, 'a'), pwire(sw, 'b', l2, 'a'),
                pwire(l1, 'b', bat, 'neg'), pwire(l2, 'b', bat, 'neg')];
      }
    },
    short: {
      name: '短路危险实验', icon: '💥', danger: true,
      desc: '只用一根电线把电池两头连起来，通电会爆炸！',
      note: '这里没有用电器，电流太大啦！现实中电池会发烫，非常危险，不要模仿。',
      build: function () {
        var bat = makePart('battery', 160, 320);
        return [pwire(bat, 'pos', bat, 'neg')];
      }
    }
  };

  function loadPreset(id, silent) {
    var preset = PRESETS[id]; if (!preset) return;
    if (state.running) stopRun();
    pushHistory();
    state.parts = []; state.wires = []; state.nextId = 1;
    state.selection = null; state.diodeState = {};
    state.burnt = {}; state.heat = {};
    state.hospital = null;
    state.wires = preset.build();
    normalizeIds();
    state.presetNote = preset.note;
    UI.renderAll();
    evaluate();
    commit();
    UI.renderTasks();
    UI.renderGuide();
    UI.fitToContent();
    if (!silent) {
      UI.toast('已加载示例：' + preset.name + '（撤销可恢复）', 'good');
      UI.speak('加载示例：' + preset.name + '。' + preset.desc + ' ' + preset.note);
    }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    try { var s = localStorage.getItem(SOUND_KEY); if (s === 'off') state.sound = false; } catch (e) {}
    try { if (localStorage.getItem(WIRE_STYLE_KEY) === 'ortho') state.wireStyle = 'ortho'; } catch (e) {}
    try { if (localStorage.getItem(WIRE_LABELS_KEY) === 'on') state.wireLabels = true; } catch (e) {}
    loadLog();
    if (global.Voice) Voice.init();
    UI.init();
    var loaded = false;
    try {
      if (loadSharedHash()) {
        loaded = true;
        state.achieved = [];
        commit();
      }
    } catch (e) {}
    try {
      if (!loaded) {
        var saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          var d = sanitizeSnapshot(JSON.parse(saved));
          if (d && d.parts.length) {
            state.parts = d.parts; state.wires = d.wires;
            state.nextId = d.nextId; state.achieved = d.achieved;
            state.burnt = d.burnt;
            loaded = true;
          }
        }
      }
    } catch (e) {
      try { localStorage.setItem(BACKUP_KEY, localStorage.getItem(STORAGE_KEY) || ''); } catch (e2) {}
    }
    if (!loaded) loadPreset('led', true);
    else { releaseButtons(); UI.renderAll(); evaluate(); }
    UI.updateSound();
    UI.updateVoice();
    UI.updateWireStyle();
    UI.updateUndo();
    UI.renderGuide();
    UI.renderLog();
    UI.updateWireLabels();
    requestAnimationFrame(function () { UI.fitToContent(); });
    if (state.shareLoaded) {
      UI.toast('打开朋友分享的电路啦', 'good', { silent: true });
      UI.speakAuto('打开朋友分享的电路啦。可以随便改，也可以再分享给别人。');
      state.shareLoaded = false;
    }
    registerServiceWorker();
    /* 首次进入，等用户点过页面后，用中文打个招呼并读一下玩法 */
    var greet = function () {
      document.removeEventListener('pointerdown', greet, true);
      document.removeEventListener('keydown', greet, true);
      setTimeout(function () {
        /* 用自动朗读：如果小朋友第一下已经点开某个零件的讲解，
           打招呼就不要把它打断；没人说话时再念欢迎语。 */
        UI.speakAuto('欢迎来到小小电路城。点一个零件，我就告诉你它是做什么的。右上角可以通电试试。');
      }, 260);
    };
    document.addEventListener('pointerdown', greet, true);
    document.addEventListener('keydown', greet, true);
  }

  function registerServiceWorker() {
    if (!global.navigator || !('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    var go = function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    };
    if (document.readyState === 'complete') go();
    else global.addEventListener('load', go, { once: true });
  }

  global.App = {
    STAGE_W: STAGE_W, STAGE_H: STAGE_H,
    state: state, TASKS: TASKS, PRESETS: PRESETS, HOSPITAL: HOSPITAL, GUIDE_STEPS: GUIDE_STEPS,
    byId: byId, defOf: defOf, termPos: termPos, wireEnds: wireEnds,
    formatCurrent: formatCurrent, fmtRes: fmtRes, clamp: clamp,
    pushHistory: pushHistory, undo: undo, redo: redo, commit: commit,
    backupCurrent: backupCurrent, hasBackup: hasBackup, restoreBackup: restoreBackup,
    shareCircuit: shareCircuit,
    makePart: makePart, addPart: addPart, createWire: createWire, findWire: findWire,
    deleteSelection: deleteSelection, deletePart: deletePart, clearBoard: clearBoard,
    afterChange: afterChange, evaluate: evaluate, diagnose: diagnose, termLabel: termLabel,
    startRun: startRun, stopRun: stopRun, toggleRun: toggleRun, setRunUI: setRunUI,
    loadPreset: loadPreset, loadCase: loadCase, audio: audio, init: init, setWireStyle: setWireStyle,
    setWireLabels: setWireLabels,
    recordMeasurement: recordMeasurement, clearLog: clearLog,
    startGuide: startGuide, skipGuideStep: skipGuideStep, stopGuide: stopGuide, guideStep: guideStep,
    duplicateProps: duplicateProps,
    repairPart: repairPart, stressOf: stressOf, worstStress: worstStress,
    burnVerb: burnVerb, releaseButtons: releaseButtons,
    specLimitText: specLimitText, specValueText: specValueText
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
