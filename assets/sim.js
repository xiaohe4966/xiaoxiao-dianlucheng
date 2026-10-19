/* 小小电路城 —— 电路求解器（修改节点法）
 * 把每个零件的内部当成电阻 / 电压源 / 二极管，
 * 解出节点电压，再算每根电线和每个零件里的电流。
 */
(function (global) {
  'use strict';

  var WIRE_R = 0.05;      // 每根电线的电阻
  var SHORT_A = 2.0;      // 超过这个电流就算短路
  var LEAK_G = 1e-9;      // 防止孤岛矩阵奇异

  function tkey(partId, termId) { return partId + '::' + termId; }

  /* 高斯消元（带主元） */
  function solveLinear(A, b) {
    var n = b.length, i, r, c, col, pivot, f, tmp;
    for (col = 0; col < n; col++) {
      pivot = col;
      for (r = col + 1; r < n; r++) {
        if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
      }
      if (pivot !== col) {
        tmp = A[col]; A[col] = A[pivot]; A[pivot] = tmp;
        tmp = b[col]; b[col] = b[pivot]; b[pivot] = tmp;
      }
      var pv = A[col][col];
      if (Math.abs(pv) < 1e-14) continue;
      for (r = 0; r < n; r++) {
        if (r === col) continue;
        f = A[r][col] / pv;
        if (f === 0) continue;
        for (c = col; c < n; c++) A[r][c] -= f * A[col][c];
        b[r] -= f * b[col];
      }
    }
    var x = new Float64Array(n);
    for (i = 0; i < n; i++) {
      x[i] = Math.abs(A[i][i]) > 1e-14 ? b[i] / A[i][i] : 0;
    }
    return x;
  }

  function zeros(n) {
    var A = new Array(n);
    for (var i = 0; i < n; i++) A[i] = new Float64Array(n);
    return A;
  }

  /* 生成一个零件内部的电路模型（可能有多段） */
  function partEdges(part, def) {
    if (!def || !def.model) return [];
    var m = def.model(part);
    return Array.isArray(m) ? m : [m];
  }

  /**
   * simulate({parts, wires, defOf, diodeState})
   * 返回 {terminalV, parts:{id:{...}}, wires:{id:{current}}, batteries, totalCurrent, short, diodeState, maxWire}
   */
  function simulate(opts) {
    var parts = opts.parts || [];
    var wires = opts.wires || [];
    var defOf = opts.defOf;
    var prevDiode = opts.diodeState || {};

    /* 1. 给每个接线柱编号 */
    var idx = new Map(), keys = [];
    function node(k) {
      if (!idx.has(k)) { idx.set(k, keys.length); keys.push(k); }
      return idx.get(k);
    }
    var partById = new Map();
    parts.forEach(function (p) {
      partById.set(p.id, p);
      var def = defOf(p);
      (def.terms || []).forEach(function (t) { node(tkey(p.id, t.id)); });
    });
    var validWires = wires.filter(function (w) {
      return partById.has(w.a.part) && partById.has(w.b.part);
    });
    var N = keys.length;

    /* 2. 收集元件边 */
    var batteryEdges = [];
    parts.forEach(function (p) {
      partEdges(p, defOf(p)).forEach(function (e, k) {
        if (e.kind === 'source') {
          batteryEdges.push({ part: p, e: e, k: k, p: node(tkey(p.id, e.p)), n: node(tkey(p.id, e.n)) });
        }
      });
    });
    var B = batteryEdges.length;
    var size = N + B;

    var diodeKeys = [];
    var diodeOn = {};
    var it, i, j;
    for (it = 0; it < 10; it++) {
      var A = zeros(size), b = new Float64Array(size);

      /* 小漏电，保证每个孤岛都有参考 */
      for (i = 0; i < N; i++) A[i][i] += LEAK_G;

      /* 普通电阻 */
      parts.forEach(function (p) {
        partEdges(p, defOf(p)).forEach(function (e) {
          var R;
          if (e.kind === 'resistor') R = Math.max(e.r, 1e-4);
          else if (e.kind === 'diode') {
            var dk = p.id + ':' + e.a + '-' + e.b;
            if (!(dk in diodeOn)) diodeOn[dk] = (dk in prevDiode) ? prevDiode[dk] : true;
            if (diodeKeys.indexOf(dk) < 0) diodeKeys.push(dk);
            R = diodeOn[dk] ? Math.max(e.rf || 10, 1e-4) : Math.max(e.rr || 1e9, 1e3);
          } else return;
          var g = 1 / R;
          var a = node(tkey(p.id, e.a)), c = node(tkey(p.id, e.b));
          A[a][a] += g; A[c][c] += g; A[a][c] -= g; A[c][a] -= g;
        });
      });

      /* 电线 */
      validWires.forEach(function (w) {
        var g = 1 / WIRE_R;
        var a = node(tkey(w.a.part, w.a.term)), c = node(tkey(w.b.part, w.b.term));
        if (a === c) return;
        A[a][a] += g; A[c][c] += g; A[a][c] -= g; A[c][a] -= g;
      });

      /* 电池：v(p)-v(n) - R*i = V */
      batteryEdges.forEach(function (bat, k) {
        var ki = N + k;
        A[bat.p][ki] += 1; A[bat.n][ki] -= 1;
        A[ki][bat.p] += 1; A[ki][bat.n] -= 1;
        A[ki][ki] -= (bat.e.r || 0.18);
        b[ki] = bat.e.v || 3;
      });

      /* 接地：把 0 号节点钉在 0V */
      if (N > 0) {
        for (j = 0; j < size; j++) A[0][j] = 0;
        A[0][0] = 1; b[0] = 0;
      }

      var x = solveLinear(A, b);

      /* 3. 根据电压更新二极管通断状态 */
      var changed = false;
      parts.forEach(function (p) {
        partEdges(p, defOf(p)).forEach(function (e) {
          if (e.kind !== 'diode') return;
          var dk = p.id + ':' + e.a + '-' + e.b;
          var a = node(tkey(p.id, e.a)), c = node(tkey(p.id, e.b));
          var vd = x[a] - x[c];
          var shouldOn = vd > 0.02;
          if (!!diodeOn[dk] !== shouldOn) { diodeOn[dk] = shouldOn; changed = true; }
        });
      });
      if (!changed || it === 9) {
        /* 保存最后解 */
        var result = buildResult(x, N, parts, validWires, batteryEdges, defOf, node, tkey, diodeOn, diodeKeys);
        return result;
      }
    }
  }

  function buildResult(x, N, parts, wires, batteries, defOf, node, tkey, diodeOn, diodeKeys) {
    var res = {
      terminalV: new Map(), parts: {}, wires: {}, batteries: [],
      totalCurrent: 0, short: false, maxWire: null, diodeState: {}
    };
    for (var i = 0; i < N; i++) {
      // keys not kept here; store by node index instead
    }
    // 把节点电压按编号记录，下面用 node() 重新取
    res.v = x;
    res.nodeOf = function (partId, termId) { var n = node(tkey(partId, termId)); return n < N ? x[n] : 0; };

    var maxAbs = 0;
    parts.forEach(function (p) {
      var info = {
        current: 0, vdrop: 0, power: 0, conducting: false, reversed: false,
        brightness: 0, speed: 0, volume: 0, heat: 0, terminalV: {}
      };
      var def = defOf(p);
      (def.terms || []).forEach(function (t) { info.terminalV[t.id] = res.nodeOf(p.id, t.id); });
      partEdges(p, def).forEach(function (e) {
        var a = node(tkey(p.id, e.a)), c = node(tkey(p.id, e.b));
        var va = x[a], vc = x[c];
        var I = 0, R = 1;
        if (e.kind === 'resistor') { R = Math.max(e.r, 1e-4); I = (va - vc) / R; }
        else if (e.kind === 'diode') {
          var dk = p.id + ':' + e.a + '-' + e.b;
          var on = !!diodeOn[dk];
          R = on ? Math.max(e.rf, 1e-4) : Math.max(e.rr, 1e3);
          I = (va - vc) / R;
          info.conducting = info.conducting || on;
          if (!on && (va - vc) < -0.4) info.reversed = true;
        } else return;
        if (Math.abs(I) > Math.abs(info.current)) info.current = I;
        info.vdrop = va - vc;
        info.power += I * I * R;
      });
      if (p.type === 'led' || p.type === 'lamp' || p.type === 'buzzer' || p.type === 'motor' || p.type === 'diode') {
        var a2 = Math.abs(info.current);
        info.brightness = Math.min(1.35, a2 / 0.02);
        info.speed = Math.min(1.5, a2 / 0.12);
        info.volume = Math.min(1, a2 / 0.03);
      }
      info.heat = Math.min(1, info.power / 0.5);
      res.parts[p.id] = info;
    });

    wires.forEach(function (w) {
      var a = node(tkey(w.a.part, w.a.term)), c = node(tkey(w.b.part, w.b.term));
      var I = a === c ? 0 : (x[a] - x[c]) / WIRE_R;
      res.wires[w.id] = { current: I };
      if (Math.abs(I) > maxAbs) { maxAbs = Math.abs(I); res.maxWire = { id: w.id, current: I }; }
      if (Math.abs(I) > SHORT_A) res.short = true;
    });

    batteries.forEach(function (bat, k) {
      var iBranch = x[N + k];       // 电池内部 p→n 的电流（充电为正）
      var load = -iBranch;          // 对外输出电流
      var rec = {
        partId: bat.part.id, current: load,
        voltage: x[bat.p] - x[bat.n],
        power: Math.abs(load * (x[bat.p] - x[bat.n]))
      };
      res.batteries.push(rec);
      if (load > 0) res.totalCurrent += load;
      if (load > SHORT_A) res.short = true;
    });

    diodeKeys.forEach(function (dk) { res.diodeState[dk] = diodeOn[dk]; });
    res.nodeCount = N;
    return res;
  }

  global.CircuitSim = {
    simulate: simulate,
    WIRE_R: WIRE_R,
    SHORT_A: SHORT_A
  };
})(window);
