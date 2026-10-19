/* 小小电路城 —— 状态、电路运行、声音、示例 */
(function (global) {
  'use strict';

  var STAGE_W = 1200, STAGE_H = 760;
  var STORAGE_KEY = 'xiaoxiao-dianlucheng-v1';
  var SOUND_KEY = 'xiaoxiao-dianlucheng-sound';
  var WIRE_COLORS = ['#ff6b6b', '#4a90e2', '#2ec4b6', '#a78bfa', '#f59e0b', '#22c55e'];

  var state = {
    parts: [], wires: [], nextId: 1, selection: null,
    running: false, exploding: false, sim: null, diodeState: {},
    past: [], future: [], achieved: [],
    zoom: 1, fitScale: 1, scale: 1,
    sound: true, wireStart: null, shortTimer: null,
    burnt: {}, heat: {}, heatTimer: null, heatAt: 0,
    presetNote: '', firstRun: true
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
    state.wires.forEach(function (w) {
      if (!w.id) w.id = uid('w');
      if (!w.color) w.color = WIRE_COLORS[(parseInt(String(w.id).replace(/\D/g, ''), 10) || 0) % WIRE_COLORS.length];
    });
    state.parts.forEach(function (p) {
      if (!p.id) p.id = uid('p');
      var def = PARTS[p.type];
      if (def) {
        p.x = clamp(Math.round(p.x), 6, STAGE_W - def.w - 6);
        p.y = clamp(Math.round(p.y), 6, STAGE_H - def.h - 6);
      }
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
  function formatCurrent(a) {
    var v = Math.abs(a);
    if (v < 0.000001) return '0 mA';
    if (v < 0.001) return Math.round(v * 1000000) + ' µA';
    if (v < 1) return Math.round(v * 1000) + ' mA';
    return v.toFixed(2) + ' A';
  }
  function fmtRes(v) {
    v = Number(v) || 0;
    return v >= 1000 ? (v / 1000) + ' kΩ' : v + 'Ω';
  }

  /* ---------- 历史记录 / 本地保存 ---------- */
  function snapshot() {
    return JSON.stringify({ parts: state.parts, wires: state.wires, nextId: state.nextId, achieved: state.achieved, burnt: state.burnt });
  }
  function restore(json) {
    var d = JSON.parse(json);
    state.parts = d.parts || []; state.wires = d.wires || [];
    state.nextId = d.nextId || 1; state.achieved = d.achieved || [];
    state.burnt = d.burnt || {};
    state.heat = {};
    state.selection = null;
    releaseButtons();
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
    restore(state.past.pop());
    if (state.running) stopRun();
    UI.renderAll(); evaluate(); commit(); UI.toast('撤销啦 ↩️');
    UI.speak('撤销啦。');
  }
  function commit() {
    try { localStorage.setItem(STORAGE_KEY, snapshot()); } catch (e) {}
    UI.updateUndo();
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
    var w = { id: uid('w'), a: a, b: b, color: WIRE_COLORS[state.wires.length % WIRE_COLORS.length] };
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
  function clearBoard() {
    if (!state.parts.length && !state.wires.length) return;
    pushHistory();
    if (state.running) stopRun();
    state.parts = []; state.wires = []; state.selection = null;
    state.achieved = []; state.burnt = {}; state.heat = {};
    afterChange();
    UI.toast('清空啦，按「撤销」可以找回来');
    UI.speak('工作台清空啦。按撤销可以找回来。');
  }
  function duplicateProps(p) { return JSON.parse(JSON.stringify(p.props)); }

  function afterChange() {
    UI.renderAll();
    evaluate();
    commit();
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
      var w = null;
      if (sim.maxWire) {
        var wid = sim.maxWire.id;
        w = state.wires.find(function (q) { return q.id === wid; });
      }
      var bat = state.parts.find(function (p) { return p.type === 'battery'; });
      /* 找出近路上是谁：二极管和开关都不是用电器，没有它们才怪电线 */
      var carries = function (type) {
        for (var k = 0; k < state.parts.length; k++) {
          var cp = state.parts[k];
          if (cp.type !== type) continue;
          var cinfo = sim.parts[cp.id];
          if (cinfo && Math.abs(cinfo.current) > 0.5) return cp;
        }
        return null;
      };
      var diodeInLoop = carries('diode');
      var switchInLoop = carries('switch');
      var fuseInLoop = carries('fuse');
      var culprit = diodeInLoop || switchInLoop || fuseInLoop;
      var out = { code: 'short', wireId: w ? w.id : null, partId: culprit ? culprit.id : (bat ? bat.id : null) };
      if (fuseInLoop) {
        out.message = '短路啦！不过中间有保险丝——通电时它会先「啪」地熔断，替电池挡住大电流。这是它的工作，但也不要故意短路哦。';
        return out;
      }
      if (diodeInLoop) {
        out.message = '短路啦！二极管不是用电器，它只是一扇单向门。把它直接接在电池两头，电流就抄近路跑回去了，二极管会发烫烧坏。要在它旁边加一个灯泡、电阻、LED 或者电机。';
        return out;
      }
      if (switchInLoop) {
        out.message = '短路啦！开关把电池两头直接连起来啦，中间没有用电器。要加一个灯泡、电阻、LED 或者电机才行。';
        return out;
      }
      out.message = '短路啦！有一根电线直接把电池的正极和负极连起来了。快把中间的电线拿掉，或者在中间加一个灯泡、电阻、电机、喇叭。';
      return out;
    }
    if (sim && sim.totalCurrent > 0.00001) {
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
      }
    }
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
    { id: 'buzzer', icon: '🔊', label: '让喇叭唱起歌', type: 'buzzer', hint: '把喇叭接进电路，通电后它会发出声音。' }
  ];
  function checkTasks(sim) {
    TASKS.forEach(function (t) {
      if (state.achieved.indexOf(t.id) >= 0) return;
      var hit = state.parts.some(function (p) {
        var info = sim.parts[p.id];
        if (!info || p.type !== t.type) return false;
        if (t.back) return info.current < -0.0018;      /* 电流反着流 = 反转 */
        return Math.abs(info.current) > 0.0018;
      });
      if (hit) {
        state.achieved.push(t.id);
        UI.toast('太棒了！' + t.label + ' 🎉', 'good');
        audio.chime();
        UI.renderTasks();
        commit();
        UI.speak('太棒了！' + t.label + '，完成啦。');
      }
    });
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
    state.selection = null; state.achieved = []; state.diodeState = {};
    state.burnt = {}; state.heat = {};
    state.wires = preset.build();
    normalizeIds();
    state.presetNote = preset.note;
    UI.renderAll();
    evaluate();
    commit();
    UI.renderTasks();
    if (!silent) {
      UI.toast('已加载示例：' + preset.name + '（撤销可恢复）', 'good');
      UI.speak('加载示例：' + preset.name + '。' + preset.desc + ' ' + preset.note);
    }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    try { var s = localStorage.getItem(SOUND_KEY); if (s === 'off') state.sound = false; } catch (e) {}
    if (global.Voice) Voice.init();
    UI.init();
    var loaded = false;
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var d = JSON.parse(saved);
        if (d && d.parts && d.parts.length) {
          state.parts = d.parts; state.wires = d.wires || [];
          state.nextId = d.nextId || 1; state.achieved = d.achieved || [];
          state.burnt = d.burnt || {};
          normalizeIds();
          loaded = true;
        }
      }
    } catch (e) {}
    if (!loaded) loadPreset('led', true);
    else { releaseButtons(); UI.renderAll(); evaluate(); }
    UI.updateSound();
    UI.updateVoice();
    UI.updateUndo();
    /* 首次进入，等用户点过页面后，用中文打个招呼并读一下玩法 */
    var greet = function () {
      document.removeEventListener('pointerdown', greet, true);
      document.removeEventListener('keydown', greet, true);
      setTimeout(function () {
        UI.speak('欢迎来到小小电路城。点一个零件，我就告诉你它是做什么的。右上角可以通电试试。');
      }, 260);
    };
    document.addEventListener('pointerdown', greet, true);
    document.addEventListener('keydown', greet, true);
  }

  global.App = {
    STAGE_W: STAGE_W, STAGE_H: STAGE_H,
    state: state, TASKS: TASKS, PRESETS: PRESETS,
    byId: byId, defOf: defOf, termPos: termPos, wireEnds: wireEnds,
    formatCurrent: formatCurrent, fmtRes: fmtRes, clamp: clamp,
    pushHistory: pushHistory, undo: undo, commit: commit,
    makePart: makePart, addPart: addPart, createWire: createWire, findWire: findWire,
    deleteSelection: deleteSelection, deletePart: deletePart, clearBoard: clearBoard,
    afterChange: afterChange, evaluate: evaluate, diagnose: diagnose, termLabel: termLabel,
    startRun: startRun, stopRun: stopRun, toggleRun: toggleRun, setRunUI: setRunUI,
    loadPreset: loadPreset, audio: audio, init: init,
    duplicateProps: duplicateProps,
    repairPart: repairPart, stressOf: stressOf, worstStress: worstStress,
    burnVerb: burnVerb, releaseButtons: releaseButtons,
    specLimitText: specLimitText, specValueText: specValueText
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
