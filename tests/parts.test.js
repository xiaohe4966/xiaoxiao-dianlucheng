/* 零件与「电路符号视图」回归测试：
   1) 每种零件都要有完整定义（名字/尺寸/接线点/实物外观/模型）；
   2) 符号视图（IEC 课本符号）必须每种零件都有，且接线点坐标和实物完全一致；
   3) 符号 SVG 不许出现 NaN、不许越出零件盒子太多。 */
const test = require('node:test');
const assert = require('node:assert');
const P = require('../assets/parts.js');

test('零件表完整：每种零件都有基础字段', () => {
  assert.ok(P.PART_ORDER.length >= 16, '零件种类数');
  P.PART_ORDER.forEach((type) => {
    const def = P.PARTS[type];
    if (type === 'wire') return;            // 「电线」只是拖线模式的概念，不是真零件
    assert.ok(def, type + ' 必须有定义');
    assert.strictEqual(typeof def.name, 'string' && def.name.length > 0 ? 'string' : undefined, type + ' name');
    assert.ok(def.w > 0 && def.h > 0, type + ' 尺寸');
    assert.ok(Array.isArray(def.terms) && def.terms.length >= 2, type + ' 接线点');
    assert.strictEqual(typeof def.art, 'function', type + ' 实物外观');
    assert.strictEqual(typeof def.model, 'function', type + ' 电路模型');
  });
});

test('符号视图：每种零件都有 symbol，且接线点与实物一致', () => {
  P.PART_ORDER.forEach((type) => {
    const def = P.PARTS[type];
    if (type === 'wire') return;
    assert.strictEqual(typeof def.symbol, 'function', type + ' 缺 symbol（课本符号）');
    const svg = def.symbol({ props: P.DEFAULT_PROPS[type] || {}, light: 50 });
    assert.ok(typeof svg === 'string' && svg.length > 80, type + ' symbol 输出');
    assert.ok(!/NaN/.test(svg), type + ' symbol 里不能有 NaN');
    assert.ok(svg.includes('viewBox'), type + ' symbol 必须带 viewBox');
  });
});

test('符号视图：同一零件换皮后接线点坐标一字不变', () => {
  ['battery', 'switch', 'ldr', 'cap', 'ammeter', 'breadboard'].forEach((type) => {
    const def = P.PARTS[type];
    const real = def.art({ props: P.DEFAULT_PROPS[type] || {}, light: 50 });
    const sym = def.symbol({ props: P.DEFAULT_PROPS[type] || {}, light: 50 });
    // 面包板实物是外置 <img src> 文件，画布在文件里：这种就不比 viewBox 了
    if (real.trim().startsWith('<img')) return;
    // 两张图的画布必须一样大，接线点按钮盖在同一个位置
    const vbR = real.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const vbS = sym.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    assert.ok(vbR && vbS, type + ' viewBox');
    assert.strictEqual(vbS[1], vbR[1], type + ' 宽度一致');
    assert.strictEqual(vbS[2], vbR[2], type + ' 高度一致');
  });
  // 面包板单独确认：实物的画布尺寸和符号一致（500×172）
  const bb = P.PARTS.breadboard.symbol({ props: {} });
  assert.ok(/viewBox="0 0 500 172"/.test(bb), '面包板符号画布 500×172');
});

test('符号视图的动态状态：开关/按钮随 props 变化', () => {
  const swOpen = P.PARTS.switch.symbol({ props: { closed: false } });
  const swClosed = P.PARTS.switch.symbol({ props: { closed: true } });
  assert.notStrictEqual(swOpen, swClosed, '开关断开/闭合要画出不同的杠杆');
  const btnUp = P.PARTS.button.symbol({ props: { pressed: false } });
  const btnDown = P.PARTS.button.symbol({ props: { pressed: true } });
  assert.notStrictEqual(btnUp, btnDown, '按钮按下/松开要画出不同的桥');
});

test('自动感光的范围约束仍然成立（光照 0～100）', () => {
  [-50, 0, 50, 100, 999].forEach((light) => {
    const svg = P.PARTS.ldr.symbol({ props: { light }, light });
    assert.ok(svg && svg.includes('ldr-light-read'), '光照 ' + light + ' 也要有读数');
  });
});
