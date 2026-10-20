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
