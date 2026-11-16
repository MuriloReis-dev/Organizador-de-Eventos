/* Armazenamento dos projetos (mapas) no navegador, via localStorage.
 * Cada mapa fica em uma chave própria; um índice leve alimenta a tela inicial.
 * Também cuida de normalizar/validar mapas importados. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Store = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INDEX_KEY = 'feirantes.v1.index';
  var MAP_KEY = 'feirantes.v1.map.';
  var VERSION = 1;
  var storage = null;

  function getStorage() {
    if (storage) return storage;
    try {
      var t = '__t';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      storage = window.localStorage;
    } catch (e) {
      // Navegação privada/bloqueado: guarda só em memória durante a sessão.
      var mem = {};
      storage = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; },
        volatile: true
      };
    }
    return storage;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  var DEFAULT_SETTINGS = {
    minAisle: 1.5,        // largura mínima de passagem (m)
    maxOutletDist: 10,    // distância máxima barraca→tomada (m)
    gateClearance: 1.5,   // espaço livre mínimo em entradas/saídas (m)
    grid: 0.5,            // passo da grade (m)
    snap: true,
    showGrid: true
  };

  var STALL_COLORS = ['#f2c46d', '#e9967a', '#9ccc9c', '#8fbcd9', '#c9a7e0', '#f0a8c0', '#d7d38b', '#b9b9b9'];

  function num(v, def, min, max) {
    v = Number(v);
    if (!isFinite(v)) return def;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 200) : ''; }
  function isImageData(s) { return typeof s === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s); }

  function normalizeItem(it) {
    if (!it || typeof it !== 'object') return null;
    var id = str(it.id, 40) || uid();
    switch (it.type) {
      case 'stall':
        return {
          id: id, type: 'stall', x: num(it.x, 0), y: num(it.y, 0),
          w: num(it.w, 3, 0.2, 500), h: num(it.h, 3, 0.2, 500), rot: num(it.rot, 0),
          name: str(it.name, 80), number: str(it.number, 20), product: str(it.product, 80),
          owner: str(it.owner, 80), needsPower: !!it.needsPower, notes: str(it.notes, 500),
          color: /^#[0-9a-fA-F]{6}$/.test(it.color) ? it.color : STALL_COLORS[0]
        };
      case 'zone':
        return {
          id: id, type: 'zone', kind: ['area', 'aisle', 'blocked'].indexOf(it.kind) >= 0 ? it.kind : 'area',
          shape: it.shape === 'circle' ? 'circle' : 'rect',
          x: num(it.x, 0), y: num(it.y, 0), w: num(it.w, 3, 0.2, 2000), h: num(it.h, 3, 0.2, 2000), rot: num(it.rot, 0),
          label: str(it.label, 80), blockType: str(it.blockType, 20) || 'other'
        };
      case 'line':
        return {
          id: id, type: 'line', kind: it.kind === 'guide' ? 'guide' : 'wall',
          x1: num(it.x1, 0), y1: num(it.y1, 0), x2: num(it.x2, 1), y2: num(it.y2, 0),
          thick: num(it.thick, 0.2, 0.05, 5)
        };
      case 'outlet':
        return {
          id: id, type: 'outlet', x: num(it.x, 0), y: num(it.y, 0), label: str(it.label, 80),
          stalls: Array.isArray(it.stalls) ? it.stalls.map(function (s) { return str(s, 40); }).filter(Boolean) : []
        };
      case 'gate':
        return {
          id: id, type: 'gate',
          kind: ['main', 'secondary', 'exit', 'staff', 'supplier'].indexOf(it.kind) >= 0 ? it.kind : 'main',
          x: num(it.x, 0), y: num(it.y, 0), rot: num(it.rot, 0), label: str(it.label, 80)
        };
      default:
        return null;
    }
  }

  /* Completa campos faltantes e descarta lixo. Serve para mapas salvos, importados e compartilhados. */
  function normalizeMap(m) {
    if (!m || typeof m !== 'object') throw new Error('Arquivo inválido.');
    var s = m.settings || {};
    var settings = {
      minAisle: num(s.minAisle, DEFAULT_SETTINGS.minAisle, 0, 20),
      maxOutletDist: num(s.maxOutletDist, DEFAULT_SETTINGS.maxOutletDist, 0, 500),
      gateClearance: num(s.gateClearance, DEFAULT_SETTINGS.gateClearance, 0, 20),
      grid: num(s.grid, DEFAULT_SETTINGS.grid, 0.05, 10),
      snap: s.snap !== false,
      showGrid: s.showGrid !== false
    };
    var items = (Array.isArray(m.items) ? m.items : []).slice(0, 5000).map(normalizeItem).filter(Boolean);
    var seen = {};
    items.forEach(function (it) { if (seen[it.id]) it.id = uid(); seen[it.id] = 1; });
    var now = Date.now();
    return {
      version: VERSION,
      id: str(m.id, 40) || uid(),
      name: str(m.name, 100) || 'Feira sem nome',
      width: num(m.width, 40, 1, 2000),
      height: num(m.height, 25, 1, 2000),
      bg: isImageData(m.bg) ? m.bg : null,
      settings: settings,
      items: items,
      createdAt: num(m.createdAt, now),
      updatedAt: num(m.updatedAt, now)
    };
  }

  function newMap(opts) {
    opts = opts || {};
    return normalizeMap({
      id: uid(), name: opts.name || 'Nova feira', width: opts.width || 40, height: opts.height || 25,
      bg: opts.bg || null, items: [], settings: {}
    });
  }

  function readIndex() {
    try {
      var raw = getStorage().getItem(INDEX_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeIndex(arr) { getStorage().setItem(INDEX_KEY, JSON.stringify(arr)); }

  function summary(m) {
    return {
      id: m.id, name: m.name, width: m.width, height: m.height, updatedAt: m.updatedAt, createdAt: m.createdAt,
      stalls: m.items.filter(function (i) { return i.type === 'stall'; }).length,
      hasBg: !!m.bg
    };
  }

  function list() {
    return readIndex().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  function load(id) {
    try {
      var raw = getStorage().getItem(MAP_KEY + id);
      return raw ? normalizeMap(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }

  /* Retorna { ok: true } ou { ok: false, error }. */
  function save(map) {
    try {
      map.updatedAt = Date.now();
      getStorage().setItem(MAP_KEY + map.id, JSON.stringify(map));
      var idx = readIndex().filter(function (x) { return x.id !== map.id; });
      idx.push(summary(map));
      writeIndex(idx);
      return { ok: true, volatile: !!getStorage().volatile };
    } catch (e) {
      var quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      return {
        ok: false,
        error: quota
          ? 'Sem espaço no navegador para salvar. Exporte um backup (JSON) e apague mapas antigos ou use uma foto menor.'
          : 'Não foi possível salvar: ' + (e && e.message ? e.message : e)
      };
    }
  }

  function remove(id) {
    getStorage().removeItem(MAP_KEY + id);
    writeIndex(readIndex().filter(function (x) { return x.id !== id; }));
  }

  /* Cópia independente de um mapa existente, para servir de base a uma nova feira. */
  function duplicate(id, newName) {
    var src = load(id);
    if (!src) return null;
    var copy = JSON.parse(JSON.stringify(src));
    var idMap = {};
    copy.id = uid();
    copy.name = newName || src.name + ' (cópia)';
    copy.createdAt = Date.now();
    copy.items.forEach(function (it) { var n = uid(); idMap[it.id] = n; it.id = n; });
    copy.items.forEach(function (it) {
      if (it.type === 'outlet') it.stalls = (it.stalls || []).map(function (s) { return idMap[s]; }).filter(Boolean);
    });
    var r = save(copy);
    return r.ok ? copy : null;
  }

  function exportJSON(map) {
    return JSON.stringify({ app: 'feirantes', version: VERSION, map: map }, null, 1);
  }

  /* Lê um JSON exportado (ou só o mapa). Devolve um mapa normalizado com id novo. */
  function parseImport(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('O arquivo não é um JSON válido.'); }
    var m = data && data.map ? data.map : data;
    if (!m || !Array.isArray(m.items)) throw new Error('Este arquivo não parece ser um mapa do FeiraMapa.');
    var map = normalizeMap(m);
    map.id = uid();
    map.createdAt = Date.now();
    return map;
  }

  /* Mapa de exemplo para quem está começando. */
  function demo() {
    var id = 0;
    function n() { return 'd' + (++id); }
    var items = [];
    function stall(x, y, w, h, name, number, product, power, color) {
      items.push({ id: n(), type: 'stall', x: x, y: y, w: w, h: h, rot: 0, name: name, number: number, product: product, owner: '', needsPower: power, notes: '', color: color });
    }
    items.push({ id: n(), type: 'zone', kind: 'aisle', shape: 'rect', x: 25, y: 14, w: 46, h: 2.4, rot: 0, label: 'Corredor central', blockType: 'other' });
    items.push({ id: n(), type: 'zone', kind: 'blocked', shape: 'circle', x: 8, y: 14, w: 3, h: 3, rot: 0, label: 'Árvore', blockType: 'tree' });
    items.push({ id: n(), type: 'zone', kind: 'blocked', shape: 'rect', x: 47, y: 4, w: 3, h: 4, rot: 0, label: 'Banheiros', blockType: 'wc' });
    var colors = STALL_COLORS;
    var names = [['Doces da Vó', 'Doces', true], ['Artesanato Luz', 'Artesanato', false], ['Pastel & Cia', 'Comida', true], ['Plantas Verde', 'Plantas', false], ['Café Colonial', 'Comida', true], ['Cerâmica', 'Artesanato', false]];
    for (var i = 0; i < 6; i++) {
      stall(7 + i * 8, 7.5, 4, 3, names[i][0], String(i + 1), names[i][1], names[i][2], colors[i]);
    }
    for (var j = 0; j < 5; j++) {
      stall(11 + j * 8, 21.5, 4, 3, 'Barraca ' + (7 + j), String(7 + j), j % 2 ? 'Roupas' : 'Frutas', j === 2, colors[(j + 3) % colors.length]);
    }
    var stallIds = items.filter(function (i) { return i.type === 'stall'; });
    items.push({ id: n(), type: 'outlet', x: 14, y: 11.5, label: 'Tomada A', stalls: [stallIds[0].id, stallIds[1].id] });
    items.push({ id: n(), type: 'outlet', x: 30, y: 11.5, label: 'Tomada B', stalls: [stallIds[2].id, stallIds[4].id] });
    items.push({ id: n(), type: 'gate', kind: 'main', x: 0.6, y: 14, rot: 90, label: 'Entrada principal' });
    items.push({ id: n(), type: 'gate', kind: 'exit', x: 49.4, y: 14, rot: 90, label: 'Saída' });
    items.push({ id: n(), type: 'gate', kind: 'supplier', x: 25, y: 0.6, rot: 180, label: 'Fornecedores' });
    items.push({ id: n(), type: 'line', kind: 'wall', x1: 0, y1: 0, x2: 50, y2: 0, thick: 0.3 });
    items.push({ id: n(), type: 'line', kind: 'wall', x1: 0, y1: 28, x2: 50, y2: 28, thick: 0.3 });
    var map = normalizeMap({ id: uid(), name: 'Exemplo — Feira de Artesanato', width: 50, height: 28, items: items, settings: {} });
    save(map);
    return map;
  }

  return {
    uid: uid, DEFAULT_SETTINGS: DEFAULT_SETTINGS, STALL_COLORS: STALL_COLORS,
    normalizeMap: normalizeMap, newMap: newMap, list: list, load: load, save: save, remove: remove,
    duplicate: duplicate, exportJSON: exportJSON, parseImport: parseImport, demo: demo,
    isVolatile: function () { return !!getStorage().volatile; }
  };
});
