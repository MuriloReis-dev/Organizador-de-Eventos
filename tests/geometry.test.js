/* Testes da lógica geométrica. Rodar com: node tests/geometry.test.js */
'use strict';
const assert = require('assert');
const Geo = require('../js/geometry.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('FALHOU  ' + name + '\n' + e.stack); process.exitCode = 1; }
}
const near = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) < t, a + ' != ' + b);

const base = () => ({
  width: 40, height: 25,
  settings: { minAisle: 1.5, maxOutletDist: 10, gateClearance: 1.5 },
  items: []
});
const stall = (id, x, y, w = 3, h = 3, extra = {}) =>
  Object.assign({ id, type: 'stall', x, y, w, h, rot: 0, name: id, number: id }, extra);
const codes = (m) => Geo.validate(m).map((i) => i.code).sort();

console.log('geometria');

test('retângulos encostados não são sobreposição', () => {
  const a = Geo.rectPoly(0, 0, 2, 2, 0), b = Geo.rectPoly(2, 0, 2, 2, 0);
  assert.strictEqual(Geo.polysOverlap(a, b), false);
  near(Geo.polyDistance(a, b), 0);
});

test('retângulos que se invadem sobrepõem', () => {
  assert.strictEqual(Geo.polysOverlap(Geo.rectPoly(0, 0, 2, 2, 0), Geo.rectPoly(1.5, 0, 2, 2, 0)), true);
});

test('rotação de 90° troca largura e altura', () => {
  const p = Geo.rectPoly(0, 0, 4, 2, 90), b = Geo.polyBounds(p);
  near(b.x1 - b.x0, 2); near(b.y1 - b.y0, 4);
});

test('rotação de 45° detecta sobreposição que caixas alinhadas não detectariam', () => {
  const a = Geo.rectPoly(0, 0, 2, 2, 45);
  const b = Geo.rectPoly(2.0, 0, 1, 1, 0); // canto do losango chega a x=1.414
  assert.strictEqual(Geo.polysOverlap(a, b), false);
  const c = Geo.rectPoly(1.7, 0, 1, 1, 0); // borda esquerda em 1.2 < 1.414
  assert.strictEqual(Geo.polysOverlap(a, c), true);
});

test('distância entre polígonos separados', () => {
  near(Geo.polyDistance(Geo.rectPoly(0, 0, 2, 2, 0), Geo.rectPoly(5, 0, 2, 2, 0)), 3);
});

test('ponto dentro / fora e distância', () => {
  const p = Geo.rectPoly(0, 0, 4, 4, 0);
  assert.strictEqual(Geo.pointInPoly(1, 1, p), true);
  assert.strictEqual(Geo.pointInPoly(3, 0, p), false);
  near(Geo.distPointPoly(5, 0, p), 3);
  near(Geo.distPointPoly(0, 0, p), 0);
});

test('parede vira polígono com espessura', () => {
  const b = Geo.polyBounds(Geo.linePoly(0, 0, 10, 0, 0.4));
  near(b.x1 - b.x0, 10); near(b.y1 - b.y0, 0.4);
});

test('snap e formatação pt-BR', () => {
  near(Geo.snap(1.26, 0.5), 1.5); near(Geo.snap(1.2, 0), 1.2);
  assert.ok(/3,5/.test(Geo.formatM(3.5)), Geo.formatM(3.5));
});

console.log('validações');

test('mapa vazio e barracas bem espaçadas não geram avisos', () => {
  const m = base();
  assert.deepStrictEqual(codes(m), []);
  m.items.push(stall('1', 5, 5), stall('2', 12, 5));
  assert.deepStrictEqual(codes(m), []);
});

test('barracas sobrepostas = erro', () => {
  const m = base(); m.items.push(stall('1', 5, 5), stall('2', 6, 5));
  const i = Geo.validate(m);
  assert.strictEqual(i[0].code, 'stall-overlap'); assert.strictEqual(i[0].level, 'error');
});

test('barracas coladas (lado a lado) são aceitas', () => {
  const m = base(); m.items.push(stall('1', 5, 5), stall('2', 8, 5));
  assert.deepStrictEqual(codes(m), []);
});

test('passagem estreita entre barracas', () => {
  const m = base(); m.items.push(stall('1', 5, 5), stall('2', 8.8, 5)); // vão de 0,8 m
  assert.deepStrictEqual(codes(m), ['narrow']);
  m.settings.minAisle = 0.5;
  assert.deepStrictEqual(codes(m), []);
});

test('barraca em área proibida = erro; em corredor = aviso; em área comum = ok', () => {
  const m = base();
  m.items.push(stall('1', 10, 10));
  m.items.push({ id: 'z', type: 'zone', kind: 'blocked', shape: 'circle', blockType: 'tree', x: 10, y: 10, w: 2, h: 2, rot: 0 });
  assert.deepStrictEqual(codes(m), ['blocked']);
  m.items[1] = { id: 'z', type: 'zone', kind: 'aisle', shape: 'rect', x: 10, y: 10, w: 10, h: 2, rot: 0, label: 'Central' };
  assert.deepStrictEqual(codes(m), ['in-aisle']);
  m.items[1] = { id: 'z', type: 'zone', kind: 'area', shape: 'rect', x: 10, y: 10, w: 10, h: 10, rot: 0 };
  assert.deepStrictEqual(codes(m), []);
});

test('corredor marcado estreito demais', () => {
  const m = base();
  m.items.push({ id: 'z', type: 'zone', kind: 'aisle', shape: 'rect', x: 10, y: 10, w: 10, h: 1, rot: 0 });
  assert.deepStrictEqual(codes(m), ['aisle-narrow']);
});

test('barraca atravessando parede = erro; guia não bloqueia', () => {
  const m = base();
  m.items.push(stall('1', 10, 10));
  m.items.push({ id: 'w', type: 'line', kind: 'wall', thick: 0.2, x1: 10, y1: 5, x2: 10, y2: 15 });
  assert.deepStrictEqual(codes(m), ['wall']);
  m.items[1].kind = 'guide';
  assert.deepStrictEqual(codes(m), []);
});

test('barraca fora do mapa', () => {
  const m = base(); m.items.push(stall('1', 39, 5));
  assert.deepStrictEqual(codes(m), ['outside']);
});

test('números repetidos', () => {
  const m = base();
  m.items.push(stall('1', 5, 5, 3, 3, { number: '7' }), stall('2', 15, 5, 3, 3, { number: '7' }));
  assert.deepStrictEqual(codes(m), ['dup-number']);
});

test('energia: sem tomada, tomada longe, tomada atribuída perto', () => {
  const m = base();
  m.items.push(stall('1', 5, 5, 3, 3, { needsPower: true }));
  assert.deepStrictEqual(codes(m), ['no-outlet']);
  m.items.push({ id: 'o1', type: 'outlet', x: 35, y: 20, stalls: [] });
  assert.deepStrictEqual(codes(m), ['far-outlet']);
  m.items.push({ id: 'o2', type: 'outlet', x: 8, y: 5, stalls: ['1'] });
  assert.deepStrictEqual(codes(m), []); // atribuída e perto: ok
  m.items[2].stalls = [];
  m.items[1].stalls = ['1']; // atribuída à distante
  assert.deepStrictEqual(codes(m), ['far-outlet']);
});

test('tomada embaixo de barraca fica inacessível', () => {
  const m = base();
  m.items.push(stall('1', 5, 5), { id: 'o', type: 'outlet', x: 5, y: 5, stalls: [] });
  assert.deepStrictEqual(codes(m), ['outlet-covered']);
});

test('entrada bloqueada por barraca próxima', () => {
  const m = base();
  m.items.push(stall('1', 10, 10), { id: 'g', type: 'gate', kind: 'main', x: 10, y: 12, rot: 0 }); // 0,5 m da borda
  assert.deepStrictEqual(codes(m), ['gate-blocked']);
  m.items[1].y = 20;
  assert.deepStrictEqual(codes(m), []);
});

test('erros vêm antes dos avisos', () => {
  const m = base();
  m.items.push(stall('1', 5, 5, 3, 3, { number: 'a' }), stall('2', 6, 5, 3, 3, { number: 'a' }));
  const l = Geo.validate(m).map((i) => i.level);
  assert.strictEqual(l[0], 'error');
});

test('desempenho: 300 barracas validam rápido', () => {
  const m = base(); m.width = 400; m.height = 400;
  for (let i = 0; i < 300; i++) m.items.push(stall('s' + i, (i % 20) * 5 + 3, Math.floor(i / 20) * 5 + 3, 2, 2));
  const t = Date.now(); Geo.validate(m);
  assert.ok(Date.now() - t < 1500, 'demorou ' + (Date.now() - t) + 'ms');
});

console.log('\n' + passed + ' testes passaram' + (process.exitCode ? ' (com falhas)' : '.'));
