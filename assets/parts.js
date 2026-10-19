/* 小小电路城 —— 零件定义：外观 + 电气模型
   元件图形来自开源项目 Velxio（AGPL-3.0），面包板来自 Fritzing parts library（CC-BY-SA 3.0）。
   素材来源与许可详见项目根目录 CREDITS.md。 */
(function (global) {
  'use strict';

  var INK = '#22314a';
  var LEAD = '#8c8c8c';

  function svg(w, h, inner) {
    return '<svg class="art-svg" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }
  /* 直接使用 Velxio 搬来的 SVG 素材（assets/components/） */
  function img(name, x, y, w, h) {
    return '<img class="part-img" draggable="false" alt="" src="assets/components/' + name + '" ' +
      'style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px">';
  }

  var LED_FILES = {
    '#22c55e': 'led-green.svg',
    '#3b82f6': 'led-blue.svg',
    '#facc15': 'led-yellow.svg',
    '#f8fafc': 'led-white.svg'
  };
  function ledFile(color) { return LED_FILES[color] || 'led-red.svg'; }

  var PARTS = {

    battery: {
      name: '电池', short: '电池', w: 150, h: 94,
      terms: [{ id: 'neg', x: 14, y: 54, label: '−', tone: 'neg' },
              { id: 'pos', x: 136, y: 54, label: '+', tone: 'pos' }],
      model: function (p) { return { kind: 'source', p: 'pos', n: 'neg', v: p.props.voltage || 3, r: 0.18 }; },
      art: function (p) {
        var v = p.props.voltage || 3;
        var body = v >= 9 ? '#b03a2e' : '#336699';
        return svg(150, 94,
          '<line x1="14" y1="54" x2="30" y2="54" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<line x1="120" y1="54" x2="136" y2="54" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<rect x="30" y="14" width="90" height="74" rx="8" fill="' + body + '" stroke="#1f2a3a" stroke-width="3"/>' +
          '<rect x="36" y="20" width="78" height="12" rx="6" fill="#ffffff" opacity=".14"/>' +
          '<rect x="108" y="26" width="12" height="50" rx="3" fill="#1a1a1a" stroke="#1f2a3a" stroke-width="2"/>' +
          '<text x="70" y="30" text-anchor="middle" font-size="10.5" font-weight="800" fill="#ffffff" opacity=".85">电池</text>' +
          '<text x="70" y="55" text-anchor="middle" font-size="23" font-weight="900" fill="#ffffff">' + v + 'V</text>' +
          '<text x="98" y="78" text-anchor="middle" font-size="17" font-weight="900" fill="#ffffff">+</text>' +
          '<text x="44" y="78" text-anchor="middle" font-size="19" font-weight="900" fill="#ffffff">−</text>');
      }
    },

    switch: {
      name: '开关', short: '开关', w: 140, h: 86,
      terms: [{ id: 'a', x: 14, y: 58 }, { id: 'b', x: 126, y: 58 }],
      model: function (p) { return { kind: 'resistor', a: 'a', b: 'b', r: p.props.closed ? 0.02 : 1e12 }; },
      art: function (p) {
        var rot = p.props.closed ? 0 : -34;
        return svg(140, 86,
          '<text x="70" y="22" text-anchor="middle" font-size="12.5" font-weight="800" fill="#6b7280">开关 · ' + (p.props.closed ? '通' : '断') + '</text>' +
          '<line x1="14" y1="58" x2="24" y2="58" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<line x1="116" y1="58" x2="126" y2="58" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<rect x="24" y="34" width="92" height="44" rx="10" fill="#e3e8ee" stroke="#1f2a3a" stroke-width="3"/>' +
          '<circle cx="42" cy="58" r="8" fill="#9aa3ad" stroke="#1f2a3a" stroke-width="2.5"/>' +
          '<circle cx="98" cy="58" r="8" fill="#9aa3ad" stroke="#1f2a3a" stroke-width="2.5"/>' +
          '<g class="sw-lever" transform="rotate(' + rot + ' 42 58)">' +
          '<rect x="42" y="52" width="58" height="11" rx="5.5" fill="#f97316" stroke="#1f2a3a" stroke-width="2.5"/></g>');
      }
    },

    resistor: {
      name: '电阻', short: '电阻', w: 150, h: 58,
      terms: [{ id: 'a', x: 10, y: 30 }, { id: 'b', x: 140, y: 30 }],
      model: function (p) { return { kind: 'resistor', a: 'a', b: 'b', r: p.props.resistance || 100 }; },
      art: function (p) {
        return svg(150, 58,
          '<text x="75" y="52" text-anchor="middle" font-size="11.5" font-weight="800" fill="#7a6a52">' + fmtR(p.props.resistance) + '</text>') +
          img('resistor.svg', 12, 18.2, 126, 23.5);
      }
    },

    led: {
      name: 'LED 灯', short: 'LED', w: 132, h: 136,
      terms: [{ id: 'an', x: 16, y: 112, label: '+', tone: 'pos' }, { id: 'ca', x: 116, y: 112 }],
      model: function (p) { return { kind: 'diode', a: 'an', b: 'ca', rf: 110, rr: 1e9 }; },
      art: function (p) {
        var color = p.props.color || '#ff5d5d';
        return svg(132, 136,
          '<circle class="glow" cx="64" cy="42" r="30" style="fill:' + color + '" opacity="0"/>' +
          '<g class="rays" opacity="0" stroke="' + color + '" stroke-width="3.5" stroke-linecap="round">' +
          '<line x1="64" y1="3" x2="64" y2="11"/><line x1="30" y1="12" x2="37" y2="19"/>' +
          '<line x1="98" y1="12" x2="91" y2="19"/><line x1="16" y1="42" x2="25" y2="42"/>' +
          '<line x1="112" y1="42" x2="103" y2="42"/></g>' +
          '<path d="M56 86 L56 112 L16 112" fill="none" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<path d="M76 86 L76 112 L116 112" fill="none" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<text x="5" y="130" font-size="12" font-weight="800" fill="#dc2626">+</text>' +
          '<text x="66" y="133" text-anchor="middle" font-size="12" font-weight="800" fill="#7a6a52">LED</text>') +
          img(ledFile(color), 24, 4, 84, 105);
      }
    },

    lamp: {
      name: '小灯泡', short: '灯泡', w: 140, h: 126,
      terms: [{ id: 'a', x: 16, y: 108 }, { id: 'b', x: 124, y: 108 }],
      model: function () { return { kind: 'resistor', a: 'a', b: 'b', r: 70 }; },
      art: function () {
        return svg(140, 126,
          '<circle class="glow" cx="70" cy="46" r="34" fill="#ffd166" opacity="0"/>' +
          '<g class="rays" opacity="0" stroke="#ffb020" stroke-width="3.5" stroke-linecap="round">' +
          '<line x1="70" y1="4" x2="70" y2="12"/><line x1="30" y1="14" x2="36" y2="21"/>' +
          '<line x1="110" y1="14" x2="104" y2="21"/><line x1="14" y1="46" x2="23" y2="46"/>' +
          '<line x1="126" y1="46" x2="117" y2="46"/></g>' +
          '<path d="M16 108 V96 Q16 88 30 88 H50" fill="none" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<path d="M124 108 V96 Q124 88 110 88 H90" fill="none" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<circle class="lamp-glass" cx="70" cy="46" r="30" fill="#eaf4ff" stroke="' + INK + '" stroke-width="3"/>' +
          '<path d="M57 58 q6.5 -16 13 0 q6.5 16 13 0" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>' +
          '<rect x="50" y="76" width="40" height="18" rx="4" fill="#cbd5e1" stroke="' + INK + '" stroke-width="3"/>' +
          '<line x1="52" y1="82" x2="88" y2="82" stroke="#94a3b8" stroke-width="2.5"/>' +
          '<line x1="52" y1="88" x2="88" y2="88" stroke="#94a3b8" stroke-width="2.5"/>' +
          '<rect x="62" y="94" width="16" height="8" rx="3" fill="#94a3b8" stroke="' + INK + '" stroke-width="2"/>' +
          '<text x="70" y="120" text-anchor="middle" font-size="12" font-weight="800" fill="#7a6a52">灯泡</text>');
      }
    },

    buzzer: {
      name: '喇叭', short: '喇叭', w: 140, h: 112,
      terms: [{ id: 'a', x: 14, y: 92 }, { id: 'b', x: 126, y: 92 }],
      model: function () { return { kind: 'resistor', a: 'a', b: 'b', r: 85 }; },
      art: function () {
        return svg(140, 112,
          '<path d="M14 92 V86 Q14 82 24 82 H44" fill="none" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<path d="M126 92 V86 Q126 82 116 82 H96" fill="none" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<path class="wave" opacity="0" d="M108 34 q12 18 0 36" fill="none" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>' +
          '<path class="wave w2" opacity="0" d="M119 24 q19 28 0 56" fill="none" stroke="#0ea5e9" stroke-width="4" stroke-linecap="round"/>' +
          '<g class="buzz-body">' +
          '<circle cx="66" cy="52" r="34" fill="#475569" stroke="#1f2a3a" stroke-width="3"/>' +
          '<circle cx="66" cy="52" r="24" fill="#64748b"/>' +
          '<circle cx="66" cy="52" r="7" fill="#1e293b"/>' +
          '<circle cx="66" cy="30" r="4" fill="#94a3b8"/></g>' +
          '<text x="66" y="108" text-anchor="middle" font-size="12" font-weight="800" fill="#7a6a52">喇叭</text>');
      }
    },

    diode: {
      name: '二极管', short: '二极管', w: 134, h: 74,
      terms: [{ id: 'an', x: 12, y: 42, label: '+', tone: 'pos' }, { id: 'ca', x: 122, y: 42 }],
      model: function () { return { kind: 'diode', a: 'an', b: 'ca', rf: 8, rr: 1e9 }; },
      art: function () {
        return svg(134, 74,
          '<line x1="12" y1="42" x2="46" y2="42" stroke="#b8c2cc" stroke-width="5" stroke-linecap="round"/>' +
          '<line x1="88" y1="42" x2="122" y2="42" stroke="#b8c2cc" stroke-width="5" stroke-linecap="round"/>' +
          '<rect x="46" y="26" width="42" height="32" rx="5" fill="#2a2a2a" stroke="#111111" stroke-width="2"/>' +
          '<rect x="80" y="26" width="8" height="32" fill="#e6e6e6"/>' +
          '<polygon points="56,33 56,51 68,42" fill="#e2e8f0"/>' +
          '<text x="67" y="18" text-anchor="middle" font-size="11.5" font-weight="800" fill="#7a6a52">二极管</text>' +
          '<text x="4" y="60" font-size="12" font-weight="800" fill="#dc2626">+</text>');
      }
    },

    motor: {
      name: '电动机', short: '电机', w: 150, h: 124,
      terms: [{ id: 'a', x: 14, y: 106 }, { id: 'b', x: 136, y: 106 }],
      model: function () { return { kind: 'resistor', a: 'a', b: 'b', r: 20 }; },
      art: function () {
        return svg(150, 124,
          '<path d="M14 106 V96 Q14 88 28 88 H40" fill="none" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<path d="M136 106 V96 Q136 88 122 88 H106" fill="none" stroke="' + LEAD + '" stroke-width="5" stroke-linecap="round"/>' +
          '<rect x="34" y="34" width="78" height="54" rx="13" fill="#cfd4da" stroke="' + INK + '" stroke-width="3"/>' +
          '<rect x="34" y="34" width="14" height="54" rx="7" fill="#9aa3ad" stroke="' + INK + '" stroke-width="2.5"/>' +
          '<rect x="52" y="42" width="46" height="8" rx="4" fill="#ffffff" opacity=".5"/>' +
          '<line x1="112" y1="61" x2="126" y2="61" stroke="#6b7280" stroke-width="6" stroke-linecap="round"/>' +
          '<g class="motor-rotor"><path d="M133 48 q10 13 0 26 q-10 -13 0 -26" fill="#60a5fa" stroke="' + INK + '" stroke-width="2.5"/></g>' +
          '<text x="75" y="118" text-anchor="middle" font-size="12" font-weight="800" fill="#7a6a52">电机</text>');
      }
    },

    breadboard: {
      name: '面包板', short: '面包板', w: 500, h: 172,
      terms: [
        { id: 'vp1', x: 26, y: 31.7, label: '+', tone: 'pos' },
        { id: 'vp2', x: 474, y: 31.7, label: '+', tone: 'pos' },
        { id: 'vn1', x: 26, y: 147.3, label: '−', tone: 'neg' },
        { id: 'vn2', x: 474, y: 147.3, label: '−', tone: 'neg' }
      ],
      model: function () {
        return [
          { kind: 'resistor', a: 'vp1', b: 'vp2', r: 0.03 },
          { kind: 'resistor', a: 'vn1', b: 'vn2', r: 0.03 }
        ];
      },
      art: function () {
        return img('breadboard.svg', 10, 12, 480, 155);
      }
    }
  };

  function fmtR(v) {
    v = Number(v) || 0;
    if (v >= 1000) return (v / 1000) + 'kΩ';
    return v + 'Ω';
  }

  /* 零件箱按钮里的小图标 */
  var CHIP_ICONS = {
    battery: '<svg viewBox="0 0 64 40"><path d="M6 20h5M53 20h5" stroke="#8c8c8c" stroke-width="4" stroke-linecap="round"/><rect x="11" y="8" width="38" height="24" rx="6" fill="#336699" stroke="#22314a" stroke-width="3"/><rect x="45" y="13" width="8" height="14" rx="2" fill="#1a1a1a" stroke="#22314a" stroke-width="2"/><text x="28" y="25" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">3V</text></svg>',
    wire: '<svg viewBox="0 0 64 40"><path d="M8 30 C20 6, 44 34, 56 10" fill="none" stroke="#ff8a3d" stroke-width="6" stroke-linecap="round"/><circle cx="8" cy="30" r="4.5" fill="#fff" stroke="#22314a" stroke-width="2.5"/><circle cx="56" cy="10" r="4.5" fill="#fff" stroke="#22314a" stroke-width="2.5"/></svg>',
    switch: '<svg viewBox="0 0 64 40"><rect x="10" y="12" width="44" height="20" rx="5" fill="#e3e8ee" stroke="#22314a" stroke-width="3"/><circle cx="22" cy="22" r="4" fill="#9aa3ad" stroke="#22314a" stroke-width="2"/><circle cx="42" cy="22" r="4" fill="#9aa3ad" stroke="#22314a" stroke-width="2"/><rect x="22" y="19" width="22" height="6" rx="3" fill="#f97316" stroke="#22314a" stroke-width="2"/></svg>',
    resistor: '<svg viewBox="0 0 64 40"><path d="M6 20h8M50 20h8" stroke="#9aa7b8" stroke-width="4" stroke-linecap="round"/><rect x="14" y="12" width="36" height="16" rx="8" fill="#f0dcc0" stroke="#22314a" stroke-width="2.5"/><rect x="22" y="12" width="4" height="16" fill="#8b5cf6"/><rect x="30" y="12" width="4" height="16" fill="#ef4444"/><rect x="38" y="12" width="4" height="16" fill="#f59e0b"/></svg>',
    led: '<svg viewBox="0 0 64 40"><path d="M24 34v-5M40 34v-5" stroke="#9aa7b8" stroke-width="4" stroke-linecap="round"/><path d="M32 5c8 0 14 6 14 14v4H18v-4c0-8 6-14 14-14z" fill="#ff5d5d" stroke="#22314a" stroke-width="2.6"/><path d="M18 23h28v3H18z" fill="#e6e6e6" opacity=".8"/><circle cx="26" cy="13" r="3.6" fill="#fff" opacity=".65"/></svg>',
    lamp: '<svg viewBox="0 0 64 40"><circle cx="32" cy="16" r="12" fill="#eaf4ff" stroke="#22314a" stroke-width="2.6"/><path d="M27 21q5-8 10 0" fill="none" stroke="#f59e0b" stroke-width="2.4"/><rect x="26" y="28" width="12" height="7" rx="2" fill="#cbd5e1" stroke="#22314a" stroke-width="2.4"/></svg>',
    buzzer: '<svg viewBox="0 0 64 40"><circle cx="28" cy="20" r="14" fill="#475569" stroke="#22314a" stroke-width="3"/><circle cx="28" cy="20" r="8" fill="#64748b"/><circle cx="28" cy="20" r="3" fill="#1e293b"/><path d="M46 13q6 7 0 14" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/></svg>',
    diode: '<svg viewBox="0 0 64 40"><path d="M6 20h12M46 20h12" stroke="#b8c2cc" stroke-width="4" stroke-linecap="round"/><rect x="18" y="9" width="28" height="22" rx="4" fill="#2a2a2a" stroke="#111" stroke-width="2"/><rect x="39" y="9" width="7" height="22" fill="#e6e6e6"/></svg>',
    motor: '<svg viewBox="0 0 64 40"><rect x="10" y="12" width="34" height="20" rx="7" fill="#cfd4da" stroke="#22314a" stroke-width="2.6"/><rect x="10" y="12" width="7" height="20" rx="3.5" fill="#9aa3ad" stroke="#22314a" stroke-width="2"/><line x1="44" y1="22" x2="51" y2="22" stroke="#6b7280" stroke-width="4" stroke-linecap="round"/><path d="M54 17q4 5 0 10q-4 -5 0 -10" fill="#60a5fa" stroke="#22314a" stroke-width="1.8"/></svg>',
    breadboard: '<svg viewBox="0 0 64 40"><rect x="4" y="5" width="56" height="30" rx="5" fill="#d9d9d9" stroke="#22314a" stroke-width="2.5"/><line x1="10" y1="10" x2="54" y2="10" stroke="#ff0000" stroke-width="2"/><line x1="10" y1="14" x2="54" y2="14" stroke="#0000ff" stroke-width="2"/><line x1="10" y1="26" x2="54" y2="26" stroke="#0000ff" stroke-width="2"/><line x1="10" y1="30" x2="54" y2="30" stroke="#ff0000" stroke-width="2"/><rect x="14" y="17.5" width="36" height="5" rx="2" fill="#c9c9c9"/></svg>'
  };

  var DEFAULT_PROPS = {
    battery: { voltage: 3 },
    switch: { closed: true },
    resistor: { resistance: 100 },
    led: { color: '#ff5d5d' },
    lamp: {}, buzzer: {}, diode: {}, motor: {}, breadboard: {}
  };

  /* 每个零件的「小讲解」：点一下零件、点零件箱里的问号，都会用中文读出来 */
  var PART_GUIDES = {
    battery: {
      what: '电池是电流的发动机。它把电从正极 + 推出来，经过电线和小零件，再让电流回到负极 −。',
      how: '电线一头接电池的 +，另一头接 −，中间要经过用电器。',
      tip: '千万不要用一根电线直接把 + 和 − 连起来，那样会短路。真的电池会发烫，很危险。'
    },
    switch: {
      what: '开关是一座小桥。合上时电流能过去，断开时电流就过不去。',
      how: '两个接线柱分别接在电路里，点一下开关，就能合上或者断开。',
      tip: '电路不工作时，先看看开关是不是断开了。'
    },
    resistor: {
      what: '电阻是电流的减速带。它把电流变小，保护 LED 不被烧坏。',
      how: '电阻没有方向，随便哪一头接一边，通常和 LED 手拉手串在一起。',
      tip: '100 欧姆电流大，1 千欧电流小。LED 太亮或者烧坏时，换一个更大的电阻。'
    },
    led: {
      what: 'LED 是一种小灯泡，电流通过时它会发光，而且很省电。',
      how: '长脚是正极 +，接电池正极那一边；短脚接负极那一边。',
      tip: '接反了不会亮。一定要串一个电阻，不然它会烧坏。'
    },
    lamp: {
      what: '小灯泡里有一根灯丝。电流把灯丝烧得热热的，就发光了。',
      how: '两个接线柱没有方向，接在电路里就行。',
      tip: '灯泡自己会限制电流，可以直接接电池，但电压太高也会烧坏。'
    },
    buzzer: {
      what: '喇叭里面有纸盆。电流让它振动，就发出声音啦。',
      how: '两个接线柱接在电路里，电流越大，声音越响。',
      tip: '喇叭一直响会有点吵，可以在旁边加一个开关。'
    },
    diode: {
      what: '二极管是电流的单向门。它只让电流从三角形尖尖的方向过去。',
      how: '有 + 的一头接电流来的方向，另一头接电流要去的方向。',
      tip: '接反了电流就过不去，整个电路都不工作。'
    },
    motor: {
      what: '电动机里面有线圈。电流通过时会产生磁力，让电机转起来。',
      how: '两个接线柱接在电路里，电流越大，转得越快。',
      tip: '电机需要比较大的电流，电池很快就会累。'
    },
    breadboard: {
      what: '面包板是一块不用焊接的接线板，可以把电分给很多零件。',
      how: '红色 + 轨接电池正极，蓝色 − 轨接电池负极。同一排的小孔是相通的。',
      tip: '红色 + 轨和蓝色 − 轨，左右两边都是相通的。'
    },
    wire: {
      what: '电线是电流的小马路。它把零件和零件连起来，电流才能跑来跑去。',
      how: '点零件上的一个小圆点，再点另一个小圆点，就连好一根电线。',
      tip: '点一下电线，中间会出现叉叉，再点叉叉就能把电线删掉。'
    }
  };

  global.PARTS = PARTS;
  global.PART_GUIDES = PART_GUIDES;
  global.PART_ORDER = ['battery', 'wire', 'switch', 'resistor', 'led', 'lamp', 'buzzer', 'diode', 'motor', 'breadboard'];
  global.CHIP_ICONS = CHIP_ICONS;
  global.DEFAULT_PROPS = DEFAULT_PROPS;
  global.fmtR = fmtR;
})(window);
