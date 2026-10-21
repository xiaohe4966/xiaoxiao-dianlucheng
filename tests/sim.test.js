'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PARTS } = require('../assets/parts.js');
const sim = require('../assets/sim.js');

function part(id, type, props) {
  return { id, type, x: 0, y: 0, props: Object.assign({}, PARTS[type].model ? {} : {}, props || {}) };
}
function wire(id, a, ta, b, tb) {
  return { id, a: { part: a, term: ta }, b: { part: b, term: tb } };
}
function run(parts, wires, burnt) {
  return sim.simulate({
    parts,
    wires,
    defOf: p => PARTS[p.type],
    diodeState: {},
    burnt: burnt || {}
  });
}
const battery = (id, v) => part(id || 'b1', 'battery', { voltage: v || 3 });

test('一根电线直接连电池正负极 = 短路', () => {
  const r = run([battery()], [wire('w1', 'b1', 'pos', 'b1', 'neg')]);
  assert.equal(r.short, true);
  assert.equal(r.shortInfo.kind, 'conductor');
  assert.deepEqual(r.shortInfo.wireIds, ['w1']);
  assert.equal(r.batteries[0].partId, 'b1');
});

test('1Ω 电阻接 3V 电池是过载，不是短路', () => {
  const r = run(
    [battery(), part('r1', 'resistor', { resistance: 1 })],
    [wire('w1', 'b1', 'pos', 'r1', 'a'), wire('w2', 'r1', 'b', 'b1', 'neg')]
  );
  assert.equal(r.short, false);
  assert.ok(r.parts.r1.current > 2);
  assert.ok(r.parts.r1.power > PARTS.resistor.spec.maxW);
  assert.ok(r.maxLoadCurrent > 2);
});

test('LED 串 100Ω 电阻正常工作', () => {
  const r = run(
    [battery(), part('r1', 'resistor', { resistance: 100 }), part('d1', 'led', { color: '#ff5d5d' })],
    [wire('w1', 'b1', 'pos', 'r1', 'a'), wire('w2', 'r1', 'b', 'd1', 'an'), wire('w3', 'd1', 'ca', 'b1', 'neg')]
  );
  assert.equal(r.short, false);
  assert.ok(r.parts.d1.current > 0.008 && r.parts.d1.current < 0.02);
});

test('可变电阻算用电器，不会被当成短路', () => {
  const r = run(
    [battery(), part('p1', 'pot', { resistance: 500 }), part('d1', 'led')],
    [wire('w1', 'b1', 'pos', 'p1', 'a'), wire('w2', 'p1', 'b', 'd1', 'an'), wire('w3', 'd1', 'ca', 'b1', 'neg')]
  );
  assert.equal(r.short, false);
  assert.ok(r.parts.p1.current > 0.001);
  assert.ok(r.maxLoadCurrent > 0.001);
});

test('光敏电阻：越亮阻值越小，不是短路', () => {
  const build = light => [
    battery(), part('l1', 'ldr', { light: light }), part('d1', 'led')
  ];
  const wires = [
    wire('w1', 'b1', 'pos', 'l1', 'a'), wire('w2', 'l1', 'b', 'd1', 'an'),
    wire('w3', 'd1', 'ca', 'b1', 'neg')
  ];
  const dark = run(build(0), wires);
  const bright = run(build(100), wires);
  assert.equal(dark.short, false);
  assert.equal(bright.short, false);
  assert.ok(bright.parts.l1.current > dark.parts.l1.current * 50);
  assert.ok(bright.parts.d1.current > 0.0005);
});

test('二极管直接接电池两头 = 无负载短路', () => {
  const r = run(
    [battery(), part('d1', 'diode')],
    [wire('w1', 'b1', 'pos', 'd1', 'an'), wire('w2', 'd1', 'ca', 'b1', 'neg')]
  );
  assert.equal(r.short, true);
  assert.equal(r.shortInfo.kind, 'noload');
  assert.ok(r.shortInfo.partIds.includes('d1'));
});

test('保险丝直接接电池：短路，但保险丝在近路上', () => {
  const r = run(
    [battery(), part('f1', 'fuse')],
    [wire('w1', 'b1', 'pos', 'f1', 'a'), wire('w2', 'f1', 'b', 'b1', 'neg')]
  );
  assert.equal(r.short, true);
  assert.ok(r.shortInfo.partIds.includes('f1'));
});

test('合上的开关可以直接短路，断开就不会', () => {
  const closed = run(
    [battery(), part('s1', 'switch', { closed: true })],
    [wire('w1', 'b1', 'pos', 's1', 'a'), wire('w2', 's1', 'b', 'b1', 'neg')]
  );
  assert.equal(closed.short, true);
  assert.ok(closed.shortInfo.partIds.includes('s1'));

  const open = run(
    [battery(), part('s1', 'switch', { closed: false })],
    [wire('w1', 'b1', 'pos', 's1', 'a'), wire('w2', 's1', 'b', 'b1', 'neg')]
  );
  assert.equal(open.short, false);
  assert.ok(Math.abs(open.totalCurrent) < 1e-6);
});

test('电压表并联在电池两头只是小电流，不算短路', () => {
  const r = run(
    [battery(), part('v1', 'voltmeter')],
    [wire('w1', 'b1', 'pos', 'v1', 'a'), wire('w2', 'v1', 'b', 'b1', 'neg')]
  );
  assert.equal(r.short, false);
  assert.ok(r.totalCurrent < 0.0001);
});

test('电流表直接接电池两头 = 短路', () => {
  const r = run(
    [battery(), part('a1', 'ammeter')],
    [wire('w1', 'b1', 'pos', 'a1', 'a'), wire('w2', 'a1', 'b', 'b1', 'neg')]
  );
  assert.equal(r.short, true);
  assert.ok(r.shortInfo.partIds.includes('a1'));
});

test('两节同电压电池并联不会被误报短路', () => {
  const r = run(
    [battery('b1', 3), battery('b2', 3)],
    [wire('w1', 'b1', 'pos', 'b2', 'pos'), wire('w2', 'b1', 'neg', 'b2', 'neg')]
  );
  assert.equal(r.short, false);
  assert.ok(Math.abs(r.totalCurrent) < 0.01);
});

test('两节电池首尾相接形成大电流回路 = 短路', () => {
  const r = run(
    [battery('b1', 3), battery('b2', 3)],
    [wire('w1', 'b1', 'pos', 'b2', 'neg'), wire('w2', 'b2', 'pos', 'b1', 'neg')]
  );
  assert.equal(r.short, true);
});

test('烧坏的零件不导电，短路随之消失', () => {
  const r = run(
    [battery(), part('f1', 'fuse')],
    [wire('w1', 'b1', 'pos', 'f1', 'a'), wire('w2', 'f1', 'b', 'b1', 'neg')],
    { f1: { kind: 'current', value: 9, limit: 0.5 } }
  );
  assert.equal(r.short, false);
});

/* ---------- 电容：充电、挡直流、暂停冻结、冲击 ---------- */

function capSeries(dt, capsIn) {
  return sim.simulate({
    parts: [battery(), part('c1', 'cap', { uF: 4700 }), part('l1', 'lamp')],
    wires: [
      wire('w1', 'b1', 'pos', 'c1', 'a'),
      wire('w2', 'c1', 'b', 'l1', 'a'),
      wire('w3', 'l1', 'b', 'b1', 'neg')
    ],
    defOf: p => PARTS[p.type],
    diodeState: {},
    burnt: {},
    caps: capsIn || {},
    dt
  });
}

test('电容充电是渐进的：一拍只充一部分，电流越来越小', () => {
  let caps = {};
  let prevI = Infinity;
  let signs = { rising: 0, falling: 0 };
  for (let k = 0; k < 14; k++) {
    const r = capSeries(sim.CAP_DT, caps);
    const v = r.caps.c1;
    const i = r.parts.l1.current;
    if (k > 0) {
      if (v < 3) signs.rising++;
      if (i < prevI) signs.falling++;
      assert.ok(v < 3, '充电中存电要低于电池电压');
      assert.ok(i > 0 && i < 0.05, '充电电流保持在合理范围');
    }
    prevI = i;
    caps = r.caps;
  }
  assert.ok(signs.rising >= 12, '存电一路上不去会怪');
  assert.ok(signs.falling >= 12, '电流一路下不来会怪');
});

test('电容充满后挡住直流：电流趋近 0，存电接近电池电压', () => {
  let caps = {};
  for (let k = 0; k < 28; k++) caps = capSeries(sim.CAP_DT, caps).caps;
  const last = capSeries(sim.CAP_DT, caps);
  assert.ok(last.caps.c1 > 2.85, '存电应该几乎充满');
  assert.ok(Math.abs(last.parts.l1.current) < 0.0005, '挡住直流后电流几乎为 0');
  assert.ok(Math.abs(last.batteries[0].current) < 0.0005);
});

test('暂停（dt=0）时电容冻结存电量：不充电也不放电', () => {
  const r = capSeries(0, { c1: 2.5 });
  assert.equal(r.caps.c1, 2.5, '存电量一个字都不变');
  assert.ok(Math.abs(r.parts.l1.current) < 1e-9, '时间停了，电流也停了');
  assert.equal(r.short, false);

  const fresh = capSeries(0, {});
  assert.equal(fresh.caps.c1, 0, '没充过电的新电容不会凭空带电');
});

test('大电容直接并在电池两头：第一拍拉大电流想短路，存满就恢复安静', () => {
  const parts4cap = () => ([
    battery('b1', 3), part('c1', 'cap', { uF: 10000 }),
    part('c2', 'cap', { uF: 10000 }), part('c3', 'cap', { uF: 10000 }),
    part('c4', 'cap', { uF: 10000 })
  ]);
  const w4 = () => ([
    wire('w1', 'b1', 'pos', 'c1', 'a'), wire('w2', 'c1', 'b', 'b1', 'neg'),
    wire('w3', 'b1', 'pos', 'c2', 'a'), wire('w4', 'c2', 'b', 'b1', 'neg'),
    wire('w5', 'b1', 'pos', 'c3', 'a'), wire('w6', 'c3', 'b', 'b1', 'neg'),
    wire('w7', 'b1', 'pos', 'c4', 'a'), wire('w8', 'c4', 'b', 'b1', 'neg')
  ]);
  let caps = {};
  const first = sim.simulate({ parts: parts4cap(), wires: w4(), defOf: p => PARTS[p.type], diodeState: {}, burnt: {}, caps: {}, dt: sim.CAP_DT });
  /* 第一拍：电容像一根粗电线，电流一下子很大，还会触发「没有用电器」的提醒 */
  assert.equal(first.short, true);
  assert.equal(first.shortInfo.kind, 'noload');
  assert.ok(first.totalCurrent > 0.5, '第一股充电电流很大：' + first.totalCurrent.toFixed(3));
  // 充几拍以后电流应当掉下来（存满了就不冲了，也不再报警）
  let last;
  for (let k = 0; k < 12; k++) {
    last = sim.simulate({ parts: parts4cap(), wires: w4(), defOf: p => PARTS[p.type], diodeState: {}, burnt: {}, caps: caps, dt: sim.CAP_DT });
    caps = last.caps;
  }
  assert.equal(last.short, false, '存满后不再报警');
  assert.ok(Math.abs(last.totalCurrent) < 0.02, '存满后总电流几乎为 0：' + last.totalCurrent.toFixed(4));
  assert.ok(last.caps.c1 > 2.8 && Math.abs(last.caps.c1 - last.caps.c4) < 0.05, '四颗电容都要充到差不多的电压');
});

test('电容永远不烧坏（没有额定电流/额定功率上限）', () => {
  assert.ok(!PARTS.cap.spec.maxA && !PARTS.cap.spec.maxW, '电容不该有 maxA/maxW');
});
