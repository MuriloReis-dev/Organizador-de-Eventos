/* Editor do mapa: desenha tudo em SVG, em metros, e trata mouse/toque/teclado.
 * Não conhece a interface ao redor (painéis, telas): conversa com ela por callbacks. */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var G = root.Geo, S = root.Store;
  var FONT = 'Segoe UI, system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';

  var COL = {
    stallStroke: '#6b5a3c', areaFill: '#dfe9d2', areaStroke: '#86a56b',
    aisleFill: 'rgba(74,134,197,.16)', aisleStroke: '#4a86c5',
    blockStroke: '#c0392b', wall: '#3b3a37', guide: '#8a8577',
    outlet: '#f5c518', outletStroke: '#8a6d00', link: '#b98a00',
    err: '#d32f2f', warn: '#f08c00', sel: '#1565c0', hl: '#7b1fa2', measure: '#d81b60',
    ink: '#2b2a26'
  };
  var GATE_COL = { main: '#2e7d32', secondary: '#00897b', exit: '#c62828', staff: '#1565c0', supplier: '#ef6c00' };

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  /* Traço com espessura em pixels (não muda com o zoom). data-sw permite refazer na exportação. */
  function stroke(node, color, px, dash) {
    node.setAttribute('stroke', color);
    node.setAttribute('stroke-width', px);
    node.setAttribute('vector-effect', 'non-scaling-stroke');
    node.setAttribute('data-sw', px);
    if (dash) node.setAttribute('stroke-dasharray', dash);
    return node;
  }
  function tf(x, y, rot) { return 'translate(' + x + ' ' + y + ')' + (rot ? ' rotate(' + rot + ')' : ''); }
  function iconR(k) { return Math.max(0.35, 10 / k); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function near90(rot) { var r = Math.abs(((rot % 180) + 180) % 180); return Math.abs(r - 90) < 45; }
  function label(parent, text, x, y, fs, k, opts) {
    opts = opts || {};
    var t = el('text', {
      x: x, y: y, 'font-size': fs, 'font-family': FONT, 'font-weight': opts.weight || '600',
      'text-anchor': 'middle', 'dominant-baseline': 'central', fill: opts.fill || COL.ink,
      'pointer-events': 'none'
    }, parent);
    if (opts.halo) {
      t.setAttribute('stroke', '#fff'); t.setAttribute('stroke-width', 3 / k);
      t.setAttribute('paint-order', 'stroke'); t.setAttribute('stroke-linejoin', 'round');
    }
    t.textContent = text;
    return t;
  }

  /* ---------- construtores dos elementos do mapa ---------- */

  function buildStall(it, k, parent) {
    var g = el('g', { transform: tf(it.x, it.y, it.rot), 'data-id': it.id, 'data-type': 'stall' }, parent);
    var r = el('rect', { x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, rx: 0.05, fill: it.color }, g);
    stroke(r, COL.stallStroke, 1.5);
    var cid = 'clip-' + it.id;
    var cp = el('clipPath', { id: cid }, g);
    el('rect', { x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h }, cp);
    var inner = el('g', { 'clip-path': 'url(#' + cid + ')', 'pointer-events': 'none' }, g);
    var up = el('g', { transform: 'rotate(' + (-(it.rot || 0)) + ')' }, inner);

    var lines = [];
    if (it.number) lines.push({ t: it.number, w: '700', s: 1 });
    if (it.name) lines.push({ t: it.name, w: '600', s: 0.78 });
    if (it.product) lines.push({ t: it.product, w: '400', s: 0.62 });
    if (lines.length) {
      var sw = near90(it.rot) ? it.h : it.w, sh = near90(it.rot) ? it.w : it.h;
      var base = Math.min(1.1, Math.min(sw, sh) * 0.3);
      lines.forEach(function (l) { l.fs = Math.min(base * l.s, (sw * 0.92) / (Math.max(1, l.t.length) * 0.56)); });
      var total = lines.reduce(function (a, l) { return a + l.fs * 1.25; }, 0);
      if (total > sh * 0.95) { var f = (sh * 0.95) / total; lines.forEach(function (l) { l.fs *= f; }); total *= f; }
      if (Math.min.apply(null, lines.map(function (l) { return l.fs; })) * k >= 5) {
        var y = -total / 2;
        lines.forEach(function (l) {
          y += (l.fs * 1.25) / 2;
          label(up, l.t, 0, y, l.fs, k, { weight: l.w });
          y += (l.fs * 1.25) / 2;
        });
      }
    }
    if (it.needsPower) {
      var fi = Math.min(0.9, Math.max(0.35, Math.min(it.w, it.h) * 0.25));
      var ic = el('g', { transform: tf(it.w / 2 - fi * 0.7, -it.h / 2 + fi * 0.7) + ' rotate(' + (-(it.rot || 0)) + ')' }, inner);
      label(ic, '⚡', 0, 0, fi, k, { weight: '400' });
    }
    return g;
  }

  function buildZone(it, k, parent) {
    var g = el('g', { transform: tf(it.x, it.y, it.rot), 'data-id': it.id, 'data-type': 'zone' }, parent);
    function shape(attrs) {
      return it.shape === 'circle'
        ? el('ellipse', Object.assign({ cx: 0, cy: 0, rx: it.w / 2, ry: it.h / 2 }, attrs), g)
        : el('rect', Object.assign({ x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h }, attrs), g);
    }
    var text;
    if (it.kind === 'blocked') {
      var s = shape({ fill: 'url(#hatch)' }); stroke(s, COL.blockStroke, 1.5);
      text = G.blockLabel(it);
    } else if (it.kind === 'aisle') {
      var a = shape({ fill: COL.aisleFill }); stroke(a, COL.aisleStroke, 1.5, '6 4');
      text = it.label || 'Corredor';
    } else {
      var f = shape({ fill: COL.areaFill, 'fill-opacity': 0.55, 'pointer-events': 'none' });
      stroke(f, COL.areaStroke, 1.5, '2 3');
      // área ampla: só clica na borda, para não atrapalhar o resto do mapa
      var hit = shape({ fill: 'none', stroke: 'transparent', 'pointer-events': 'stroke' });
      hit.setAttribute('stroke-width', 14); hit.setAttribute('vector-effect', 'non-scaling-stroke');
      text = it.label || '';
    }
    if (text) {
      var sw = near90(it.rot) ? it.h : it.w;
      var fs = Math.min(1, Math.max(0.3, Math.min(it.w, it.h) * 0.22), (sw * 0.95) / (text.length * 0.56));
      if (fs * k >= 5) {
        var up = el('g', { transform: 'rotate(' + (-(it.rot || 0)) + ')', 'pointer-events': 'none' }, g);
        label(up, text, 0, 0, fs, k, { fill: it.kind === 'blocked' ? '#8e2a1f' : it.kind === 'aisle' ? '#255a8e' : '#4d6b35', halo: true });
      }
    }
    return g;
  }

  function buildLine(it, k, parent) {
    var g = el('g', { 'data-id': it.id, 'data-type': 'line' }, parent);
    var hit = el('line', { x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2, stroke: 'transparent', 'stroke-width': Math.max(it.kind === 'wall' ? it.thick : 0, 12 / k) }, g);
    hit.setAttribute('pointer-events', 'stroke');
    if (it.kind === 'wall') {
      el('line', { x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2, stroke: COL.wall, 'stroke-width': it.thick, 'pointer-events': 'none' }, g);
    } else {
      var l = el('line', { x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2, 'pointer-events': 'none' }, g);
      stroke(l, COL.guide, 1.5, '7 5');
    }
    return g;
  }

  function buildOutlet(it, k, parent) {
    var r = iconR(k);
    var g = el('g', { transform: tf(it.x, it.y), 'data-id': it.id, 'data-type': 'outlet' }, parent);
    var c = el('circle', { r: r, fill: COL.outlet }, g); stroke(c, COL.outletStroke, 1.5);
    label(g, '⚡', 0, 0, r * 1.3, k, { weight: '400' });
    if (it.label) label(g, it.label, 0, r + 9 / k, 10 / k, k, { halo: true });
    return g;
  }

  function buildGate(it, k, parent) {
    var r = iconR(k) * 1.1, color = GATE_COL[it.kind] || GATE_COL.main;
    var g = el('g', { 'data-id': it.id, 'data-type': 'gate' }, parent);
    var rot = el('g', { transform: tf(it.x, it.y, it.rot) }, g);
    var c = el('circle', { r: r, fill: color }, rot); stroke(c, '#fff', 1.5);
    var s = r * 0.62;
    el('path', { d: 'M0,' + (-s) + ' L' + (s * 0.8) + ',' + (s * 0.05) + ' L' + (s * 0.28) + ',' + (s * 0.05) + ' L' + (s * 0.28) + ',' + s + ' L' + (-s * 0.28) + ',' + s + ' L' + (-s * 0.28) + ',' + (s * 0.05) + ' L' + (-s * 0.8) + ',' + (s * 0.05) + ' Z', fill: '#fff', 'pointer-events': 'none' }, rot);
    var text = it.label || G.GATE_TYPES[it.kind];
    if (text) label(el('g', { transform: tf(it.x, it.y) }, g), text, 0, r + 10 / k, 11 / k, k, { halo: true, fill: color });
    return g;
  }

  var BUILDERS = { stall: buildStall, zone: buildZone, line: buildLine, outlet: buildOutlet, gate: buildGate };

  function drawOrder(it) {
    if (it.type === 'zone') return it.kind === 'area' ? 0 : it.kind === 'aisle' ? 1 : 2;
    return { line: 3, stall: 5, outlet: 6, gate: 7 }[it.type] || 8;
  }

  /* Silhueta de um item (para realces e avisos), em coordenadas do mapa. */
  function outline(it, k, parent, color, px, fill) {
    var poly = G.itemPoly(it), n;
    if (poly) {
      n = el('polygon', { points: poly.map(function (p) { return p.x + ',' + p.y; }).join(' '), fill: fill || 'none', 'pointer-events': 'none' });
    } else {
      n = el('circle', { cx: it.x, cy: it.y, r: iconR(k) * 1.5, fill: fill || 'none', 'pointer-events': 'none' });
    }
    stroke(n, color, px);
    n.setAttribute('stroke-linejoin', 'round');
    parent.appendChild(n);
    return n;
  }

  /* ---------- Editor ---------- */

  function Editor(svg, opts) {
    this.svg = svg;
    this.opts = opts || {};
    this.map = null;
    this.readOnly = false;
    this.tool = 'select';
    this.sticky = false;
    this.selId = null;
    this.view = { x: 0, y: 0, k: 10 };
    this.past = []; this.future = [];
    this.measure = null;
    this.highlight = [];
    this.issues = [];
    this.pointers = {};
    this.drag = null;
    this.hover = null;
    this.spaceDown = false;
    this.lastStall = { w: 3, h: 3 };
    this._txn = null; this._lastKey = null; this._lastKeyT = 0; this._raf = 0; this._needsFit = false;

    svg.innerHTML = '';
    svg.setAttribute('xmlns', NS);
    var defs = el('defs', null, svg);
    var pat = el('pattern', { id: 'hatch', width: 0.6, height: 0.6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 0.6, height: 0.6, fill: 'rgba(192,57,43,.08)' }, pat);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 0.6, stroke: 'rgba(192,57,43,.55)', 'stroke-width': 0.1 }, pat);
    this.gWorld = el('g', null, svg);
    this.gBg = el('g', null, this.gWorld);
    this.gGrid = el('g', null, this.gWorld);
    this.gItems = el('g', null, this.gWorld);
    this.gUi = el('g', null, this.gWorld);
    this.gDefs = defs;

    var self = this;
    svg.style.touchAction = 'none';
    svg.addEventListener('pointerdown', function (e) { self.onDown(e); });
    svg.addEventListener('pointermove', function (e) { self.onMove(e); });
    svg.addEventListener('pointerup', function (e) { self.onUp(e); });
    svg.addEventListener('pointercancel', function (e) { self.onUp(e, true); });
    svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    svg.addEventListener('wheel', function (e) { self.onWheel(e); }, { passive: false });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { if (self._needsFit && self.map) self.fit(); }).observe(svg);
    }
  }

  var P = Editor.prototype;

  P.emit = function (name) {
    var f = this.opts[name];
    if (f) f.apply(null, Array.prototype.slice.call(arguments, 1));
  };

  /* ---- carregar / estado ---- */

  P.load = function (map, o) {
    o = o || {};
    this.map = map;
    this.readOnly = !!o.readOnly;
    this.past = []; this.future = [];
    this.selId = null; this.measure = null; this.highlight = [];
    this.tool = 'select'; this.sticky = false;
    this._txn = null; this._lastKey = null;
    var last = map.items.filter(function (i) { return i.type === 'stall'; }).pop();
    this.lastStall = last ? { w: last.w, h: last.h } : { w: 3, h: 3 };
    this.issues = G.validate(map);
    this.fit();
    this.emit('onTool', this.tool, this.sticky);
    this.emit('onSelect', null);
    this.emit('onIssues', this.issues);
    this.emit('onHistory');
  };

  P.getItem = function (id) {
    if (!this.map) return null;
    for (var i = 0; i < this.map.items.length; i++) if (this.map.items[i].id === id) return this.map.items[i];
    return null;
  };
  P.getSelected = function () { return this.selId ? this.getItem(this.selId) : null; };

  P.snapshot = function () { return JSON.stringify(this.map.items); };
  P.restore = function (snap) { this.map.items = JSON.parse(snap); if (this.selId && !this.getItem(this.selId)) this.selId = null; };

  P.snapIf = function (v) {
    var s = this.map.settings;
    return s.snap ? G.snap(v, s.grid) : v;
  };

  P.afterChange = function (source) {
    this.issues = G.validate(this.map);
    this.render();
    this.emit('onChange', this.map, source || 'edit');
    this.emit('onIssues', this.issues);
    this.emit('onHistory');
  };

  P.schedule = function () {
    var self = this;
    if (this._raf) return;
    this._raf = requestAnimationFrame(function () {
      self._raf = 0;
      self.issues = G.validate(self.map);
      self.render();
      self.emit('onIssues', self.issues);
    });
  };

  /* ---- histórico ---- */

  P.pushHistory = function (snap) {
    this.past.push(snap);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
  };
  P.beginTxn = function () {
    this._txn = this.snapshot();
    this._issuesBefore = this.issueKeys();
  };
  P.endTxn = function (id) {
    var txn = this._txn; this._txn = null;
    if (txn == null) return;
    if (txn !== this.snapshot()) {
      this.pushHistory(txn);
      this.afterChange('edit');
      if (id) this.warnAbout(id);
    } else {
      this.render();
    }
  };
  P.issueKeys = function () {
    var o = {};
    G.validate(this.map).forEach(function (i) { o[i.code + ':' + i.ids.slice().sort().join(',')] = 1; });
    return o;
  };
  P.warnAbout = function (id) {
    var before = this._issuesBefore || {};
    var fresh = this.issues.filter(function (i) {
      return i.ids.indexOf(id) >= 0 && !before[i.code + ':' + i.ids.slice().sort().join(',')];
    });
    if (fresh.length) {
      var extra = fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' aviso' + (fresh.length > 2 ? 's' : '') + ')' : '';
      this.emit('onToast', fresh[0].message + extra, fresh[0].level);
    }
  };

  /* Executa uma alteração desfazível. `key` agrupa digitações seguidas em um único passo. */
  P.mutate = function (fn, key, source) {
    if (this.readOnly) return;
    var before = this.snapshot();
    this._issuesBefore = this.issueKeys();
    fn();
    if (before === this.snapshot()) return;
    var t = Date.now();
    if (!(key && key === this._lastKey && t - this._lastKeyT < 1200)) this.pushHistory(before);
    this._lastKey = key || null; this._lastKeyT = t;
    this.afterChange(source);
  };

  P.undo = function () {
    if (this.readOnly || !this.past.length) return;
    this.future.push(this.snapshot());
    this.restore(this.past.pop());
    this._lastKey = null;
    this.afterChange('history'); this.emit('onSelect', this.getSelected());
  };
  P.redo = function () {
    if (this.readOnly || !this.future.length) return;
    this.past.push(this.snapshot());
    this.restore(this.future.pop());
    this._lastKey = null;
    this.afterChange('history'); this.emit('onSelect', this.getSelected());
  };
  P.canUndo = function () { return !this.readOnly && this.past.length > 0; };
  P.canRedo = function () { return !this.readOnly && this.future.length > 0; };

  /* ---- seleção e edição ---- */

  P.select = function (id) {
    if (id === this.selId) return;
    this.selId = id;
    this.render();
    this.emit('onSelect', this.getSelected());
  };

  P.updateSelected = function (patch, key) {
    var it = this.getSelected(); if (!it) return;
    var self = this;
    this.mutate(function () {
      Object.keys(patch).forEach(function (k) {
        var v = patch[k];
        if (typeof it[k] === 'number') {
          v = Number(v);
          if (!isFinite(v)) return;
          if (k === 'w' || k === 'h') v = Math.max(0.2, v);
          if (k === 'thick') v = clamp(v, 0.05, 5);
        }
        it[k] = v;
      });
      if (it.type === 'stall' && ('w' in patch || 'h' in patch)) self.lastStall = { w: it.w, h: it.h };
    }, key || 'prop:' + Object.keys(patch).join(','), 'form');
  };

  P.assignStallToOutlet = function (stallId, outletId) {
    this.mutate(function () {
      this.map.items.forEach(function (o) {
        if (o.type !== 'outlet') return;
        o.stalls = (o.stalls || []).filter(function (s) { return s !== stallId; });
        if (o.id === outletId) o.stalls.push(stallId);
      });
    }.bind(this), null, 'form');
  };

  P.deleteSelected = function () {
    var it = this.getSelected(); if (!it || this.readOnly) return;
    var id = it.id, self = this;
    this.mutate(function () {
      self.map.items = self.map.items.filter(function (x) { return x.id !== id; });
      self.map.items.forEach(function (o) {
        if (o.type === 'outlet') o.stalls = (o.stalls || []).filter(function (s) { return s !== id; });
      });
      self.selId = null;
    });
    this.emit('onSelect', null);
  };

  P.duplicateSelected = function () {
    var it = this.getSelected(); if (!it || this.readOnly) return;
    var copy = JSON.parse(JSON.stringify(it)), self = this;
    copy.id = S.uid();
    if (copy.type === 'line') { copy.x1 += 1; copy.y1 += 1; copy.x2 += 1; copy.y2 += 1; }
    else { copy.x += 1; copy.y += 1; }
    if (copy.type === 'stall' && copy.number) copy.number = this.nextStallNumber();
    if (copy.type === 'outlet') copy.stalls = [];
    this.mutate(function () { self.map.items.push(copy); self.selId = copy.id; });
    this.emit('onSelect', copy);
  };

  P.rotateSelected = function (deg) {
    var it = this.getSelected(); if (!it || it.type === 'line' || it.type === 'outlet') return;
    var self = this;
    this.mutate(function () {
      var r = (((it.rot || 0) + deg) % 360 + 360) % 360;
      it.rot = r > 180 ? r - 360 : r;
      if (it.type !== 'gate') { /* mantém o centro */ }
    }, 'rot', 'form');
  };

  P.nudgeSelected = function (dx, dy) {
    var it = this.getSelected(); if (!it) return;
    this.mutate(function () {
      if (it.type === 'line') { it.x1 += dx; it.x2 += dx; it.y1 += dy; it.y2 += dy; }
      else { it.x = G.round2(it.x + dx); it.y = G.round2(it.y + dy); }
    }, 'nudge', 'form');
  };

  P.nextStallNumber = function () {
    var max = 0;
    this.map.items.forEach(function (i) {
      if (i.type === 'stall' && /^\d+$/.test(i.number || '')) max = Math.max(max, parseInt(i.number, 10));
    });
    return String(max + 1);
  };

  /* ---- mapa: configurações, fundo ---- */

  P.setSettings = function (patch) {
    Object.assign(this.map.settings, patch);
    this.afterChange('map');
  };
  P.setMapInfo = function (patch) {
    ['name', 'width', 'height'].forEach(function (k) { if (k in patch) this.map[k] = patch[k]; }, this);
    this.afterChange('map');
  };
  P.setBackground = function (dataUrl) { this.map.bg = dataUrl || null; this.afterChange('map'); };

  P.setTool = function (tool, sticky) {
    if (this.readOnly && ['select', 'measure'].indexOf(tool) < 0) return;
    this.tool = tool;
    this.sticky = !!sticky && tool !== 'select';
    this.drag = null;
    if (tool !== 'measure' && tool !== 'select') this.measure = null;
    if (tool !== 'select') this.selId = null, this.emit('onSelect', null);
    this.svg.style.cursor = tool === 'select' ? '' : 'crosshair';
    this.render();
    this.emit('onTool', this.tool, this.sticky);
  };
  P.clearMeasure = function () { this.measure = null; this.render(); };

  P.setHighlight = function (ids) { this.highlight = ids || []; this.render(); };

  /* ---- vista (zoom / pan) ---- */

  P.size = function () { var r = this.svg.getBoundingClientRect(); return { w: r.width, h: r.height }; };

  P.fit = function () {
    var s = this.size();
    if (s.w < 10 || s.h < 10) { this._needsFit = true; return; }
    this._needsFit = false;
    var pad = Math.min(40, s.w * 0.06);
    var k = Math.min((s.w - 2 * pad) / this.map.width, (s.h - 2 * pad) / this.map.height);
    this.view.k = clamp(k, 0.05, 400);
    this.view.x = (s.w - this.map.width * this.view.k) / 2;
    this.view.y = (s.h - this.map.height * this.view.k) / 2;
    this.render(); this.emit('onView', this.view.k);
  };

  P.zoomAt = function (factor, cx, cy) {
    var v = this.view, k = clamp(v.k * factor, 0.05, 400);
    var wx = (cx - v.x) / v.k, wy = (cy - v.y) / v.k;
    v.k = k; v.x = cx - wx * k; v.y = cy - wy * k;
    this.render(); this.emit('onView', k);
  };
  P.zoomBy = function (factor) { var s = this.size(); this.zoomAt(factor, s.w / 2, s.h / 2); };

  P.centerOn = function (id) {
    var it = this.getItem(id); if (!it) return;
    var poly = G.itemPoly(it), cx, cy;
    if (poly) { var b = G.polyBounds(poly); cx = (b.x0 + b.x1) / 2; cy = (b.y0 + b.y1) / 2; } else { cx = it.x; cy = it.y; }
    var s = this.size();
    this.view.k = clamp(Math.max(this.view.k, 14), 0.05, 400);
    this.view.x = s.w / 2 - cx * this.view.k;
    this.view.y = s.h / 2 - cy * this.view.k;
    this.render(); this.emit('onView', this.view.k);
  };

  P.toWorld = function (e) {
    var r = this.svg.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.view.x) / this.view.k, y: (e.clientY - r.top - this.view.y) / this.view.k };
  };

  /* ---- entrada: ponteiro ---- */

  P.onWheel = function (e) {
    if (!this.map) return;
    e.preventDefault();
    var r = this.svg.getBoundingClientRect();
    var f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    this.zoomAt(f, e.clientX - r.left, e.clientY - r.top);
  };

  P.cancelDrag = function () {
    if (this.drag && this._txn != null) { this.restore(this._txn); this._txn = null; this.afterChange('history'); }
    this.drag = null;
  };

  P.onDown = function (e) {
    if (!this.map) return;
    try { this.svg.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
    this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(this.pointers);
    if (ids.length === 2) { this.cancelDrag(); this.startPinch(); return; }
    if (ids.length > 2) return;
    if (e.button === 2) e.preventDefault();

    var p = this.toWorld(e);
    if (e.button === 1 || e.button === 2 || this.spaceDown) { this.startPan(e); return; }

    if (this.tool === 'select') {
      var h = e.target.closest && e.target.closest('[data-handle]');
      var hit = e.target.closest && e.target.closest('[data-id]');
      var sel = this.getSelected();
      if (h && sel && !this.readOnly) { this.startHandle(h.getAttribute('data-handle'), sel, p); return; }
      if (hit) {
        this.select(hit.getAttribute('data-id'));
        var it = this.getSelected();
        if (it && !this.readOnly) this.drag = { type: 'move', id: it.id, p0: p, item0: JSON.parse(JSON.stringify(it)), sx: e.clientX, sy: e.clientY, moved: false };
        return;
      }
      this.select(null);
      this.startPan(e);
      return;
    }

    if (this.tool === 'measure') {
      var q = { x: this.snapIf(p.x), y: this.snapIf(p.y) };
      if (!this.measure || this.measure.b) this.measure = { a: q, b: null, cur: q };
      else this.measure.b = q;
      this.render();
      return;
    }

    if (this.readOnly) return;
    var sp = { x: this.snapIf(p.x), y: this.snapIf(p.y) };
    if (this.tool === 'outlet' || this.tool === 'gate') { this.placePoint(sp, e.shiftKey); return; }
    this.drag = { type: 'draw', tool: this.tool, p0: sp, p1: sp, shift: e.shiftKey };
    this.render();
  };

  P.startPan = function (e) {
    this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
    this.svg.style.cursor = 'grabbing';
  };

  P.startHandle = function (h, it, p) {
    this.drag = { type: h === 'rot' ? 'rotate' : /^p[12]$/.test(h) ? 'endpoint' : 'resize', h: h, id: it.id, item0: JSON.parse(JSON.stringify(it)), moved: true };
    this.beginTxn();
  };

  P.startPinch = function () {
    var ids = Object.keys(this.pointers), a = this.pointers[ids[0]], b = this.pointers[ids[1]];
    this.drag = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  P.onMove = function (e) {
    if (!this.map) return;
    if (this.pointers[e.pointerId]) this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var d = this.drag, p = this.toWorld(e);
    this.hover = p;

    if (d && d.type === 'pinch') {
      var ids = Object.keys(this.pointers);
      if (ids.length < 2) return;
      var a = this.pointers[ids[0]], b = this.pointers[ids[1]];
      var nd = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var r = this.svg.getBoundingClientRect();
      this.view.x += mx - d.mx; this.view.y += my - d.my;
      if (d.d > 0) this.zoomAt(nd / d.d, mx - r.left, my - r.top); else this.render();
      d.d = nd; d.mx = mx; d.my = my;
      return;
    }
    if (!d) {
      if (this.tool === 'measure' && this.measure && !this.measure.b) {
        this.measure.cur = { x: this.snapIf(p.x), y: this.snapIf(p.y) };
        this.render();
      }
      return;
    }

    if (d.type === 'pan') {
      this.view.x = d.vx + (e.clientX - d.sx); this.view.y = d.vy + (e.clientY - d.sy);
      this.render();
    } else if (d.type === 'move') {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
        d.moved = true; this.beginTxn();
      }
      this.applyMove(d, p);
      this.schedule();
    } else if (d.type === 'resize') { this.applyResize(d, p, e); this.schedule(); }
    else if (d.type === 'rotate') { this.applyRotate(d, p, e); this.schedule(); }
    else if (d.type === 'endpoint') { this.applyEndpoint(d, p, e); this.schedule(); }
    else if (d.type === 'draw') {
      d.p1 = { x: this.snapIf(p.x), y: this.snapIf(p.y) }; d.shift = e.shiftKey;
      if (d.tool === 'wall' || d.tool === 'guide') d.p1 = this.constrainAngle(d.p0, d.p1, e.shiftKey);
      this.render();
    }
  };

  P.constrainAngle = function (a, b, on) {
    if (!on) return b;
    var ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y);
    var s = Math.PI / 12; ang = Math.round(ang / s) * s;
    return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
  };

  P.applyMove = function (d, p) {
    var it = this.getItem(d.id), i0 = d.item0, dx = p.x - d.p0.x, dy = p.y - d.p0.y;
    if (!it) return;
    if (it.type === 'line') {
      var s = this.map.settings, sdx = s.snap ? G.snap(dx, s.grid) : dx, sdy = s.snap ? G.snap(dy, s.grid) : dy;
      it.x1 = i0.x1 + sdx; it.x2 = i0.x2 + sdx; it.y1 = i0.y1 + sdy; it.y2 = i0.y2 + sdy;
    } else {
      it.x = G.round2(this.snapIf(i0.x + dx)); it.y = G.round2(this.snapIf(i0.y + dy));
    }
  };

  P.applyResize = function (d, p) {
    var it = this.getItem(d.id), i0 = d.item0; if (!it) return;
    var hs = d.h.split(',').map(Number), hx = hs[0], hy = hs[1];
    var l = G.rotatePoint(p.x - i0.x, p.y - i0.y, -(i0.rot || 0));
    var left = -i0.w / 2, right = i0.w / 2, top = -i0.h / 2, bottom = i0.h / 2, min = 0.2;
    var st = this.map.settings, stp = st.snap ? st.grid : 0;
    if (hx === 1) right = Math.max(left + min, l.x); else if (hx === -1) left = Math.min(right - min, l.x);
    if (hy === 1) bottom = Math.max(top + min, l.y); else if (hy === -1) top = Math.min(bottom - min, l.y);
    var w = right - left, h = bottom - top;
    if (stp) { w = Math.max(stp, G.snap(w, stp)); h = Math.max(stp, G.snap(h, stp)); }
    if (hx === 1) right = left + w; else if (hx === -1) left = right - w;
    if (hy === 1) bottom = top + h; else if (hy === -1) top = bottom - h;
    if (it.shape === 'circle' && hx !== 0 && hy !== 0) { // círculo: mantém proporção pelos cantos
      var m = Math.max(w, h);
      if (hx === 1) right = left + m; else left = right - m;
      if (hy === 1) bottom = top + m; else top = bottom - m;
    }
    var c = G.rotatePoint((left + right) / 2, (top + bottom) / 2, i0.rot || 0);
    it.w = G.round2(right - left); it.h = G.round2(bottom - top);
    it.x = G.round2(i0.x + c.x); it.y = G.round2(i0.y + c.y);
    if (it.type === 'stall') this.lastStall = { w: it.w, h: it.h };
  };

  P.applyRotate = function (d, p, e) {
    var it = this.getItem(d.id), i0 = d.item0; if (!it) return;
    var ang = (Math.atan2(p.y - i0.y, p.x - i0.x) * 180) / Math.PI + 90;
    if (this.map.settings.snap || e.shiftKey) ang = Math.round(ang / (e.shiftKey ? 15 : 5)) * (e.shiftKey ? 15 : 5);
    ang = ((ang % 360) + 360) % 360;
    it.rot = ang > 180 ? ang - 360 : ang;
  };

  P.applyEndpoint = function (d, p, e) {
    var it = this.getItem(d.id), i0 = d.item0; if (!it) return;
    var q = { x: this.snapIf(p.x), y: this.snapIf(p.y) };
    if (d.h === 'p1') { q = this.constrainAngle({ x: i0.x2, y: i0.y2 }, q, e.shiftKey); it.x1 = q.x; it.y1 = q.y; }
    else { q = this.constrainAngle({ x: i0.x1, y: i0.y1 }, q, e.shiftKey); it.x2 = q.x; it.y2 = q.y; }
  };

  P.onUp = function (e, cancelled) {
    delete this.pointers[e.pointerId];
    var d = this.drag;
    if (!d) return;
    if (d.type === 'pinch') { if (Object.keys(this.pointers).length < 2) this.drag = null; return; }
    this.drag = null;
    this.svg.style.cursor = this.tool === 'select' ? '' : 'crosshair';
    if (cancelled) { if (this._txn != null) { this.restore(this._txn); this._txn = null; this.afterChange('history'); } else this.render(); return; }
    if (d.type === 'pan') { this.render(); return; }
    if (d.type === 'move') { if (d.moved) this.endTxn(d.id); return; }
    if (d.type === 'resize' || d.type === 'rotate' || d.type === 'endpoint') {
      this.endTxn(d.id);
      this.emit('onSelect', this.getSelected());
      return;
    }
    if (d.type === 'draw') this.finishDraw(d, e.shiftKey || d.shift);
  };

  /* ---- criar elementos ---- */

  P.finishSticky = function (keep) {
    if (!(this.sticky || keep)) { this.tool = 'select'; this.svg.style.cursor = ''; this.emit('onTool', 'select', false); }
  };

  P.addItem = function (it) {
    var self = this;
    this.mutate(function () { self.map.items.push(it); self.selId = it.id; });
    this.issues = G.validate(this.map);
    this.warnAbout(it.id);
    this.emit('onSelect', it);
  };

  P.placePoint = function (p, keep) {
    var it;
    if (this.tool === 'outlet') {
      var n = this.map.items.filter(function (i) { return i.type === 'outlet'; }).length;
      it = { id: S.uid(), type: 'outlet', x: G.round2(p.x), y: G.round2(p.y), label: 'Tomada ' + (n + 1), stalls: [] };
    } else {
      var kinds = this.map.items.filter(function (i) { return i.type === 'gate'; }).map(function (i) { return i.kind; });
      var kind = kinds.indexOf('main') < 0 ? 'main' : kinds.indexOf('exit') < 0 ? 'exit' : 'secondary';
      it = { id: S.uid(), type: 'gate', kind: kind, x: G.round2(p.x), y: G.round2(p.y), rot: 0, label: '' };
      // aponta para dentro do mapa a partir da borda mais próxima
      var m = this.map, dl = p.x, dr = m.width - p.x, dt = p.y, db = m.height - p.y, mn = Math.min(dl, dr, dt, db);
      it.rot = mn === dl ? 90 : mn === dr ? -90 : mn === dt ? 180 : 0;
      if (kind === 'exit') it.rot += 180;
      it.rot = ((it.rot + 180) % 360) - 180;
    }
    this.addItem(it);
    this.finishSticky(keep);
  };

  P.finishDraw = function (d, keep) {
    var a = d.p0, b = d.p1, dx = b.x - a.x, dy = b.y - a.y, tool = d.tool;
    var it, click = Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3;
    var self = this;

    if (tool === 'wall' || tool === 'guide') {
      if (Math.hypot(dx, dy) < 0.3) { this.emit('onToast', 'Arraste no mapa para desenhar a linha.', 'info'); this.render(); return; }
      it = { id: S.uid(), type: 'line', kind: tool, x1: G.round2(a.x), y1: G.round2(a.y), x2: G.round2(b.x), y2: G.round2(b.y), thick: tool === 'wall' ? 0.2 : 0.1 };
    } else {
      var w, h, cx, cy;
      var defs = { stall: this.lastStall, rect: { w: 4, h: 3 }, circle: { w: 3, h: 3 }, aisle: { w: 10, h: 2 }, blocked: { w: 2, h: 2 } }[tool];
      if (click) { w = defs.w; h = defs.h; cx = a.x; cy = a.y; }
      else {
        w = Math.max(0.3, Math.abs(dx)); h = Math.max(0.3, Math.abs(dy));
        if (tool === 'circle') { w = h = Math.max(w, h); }
        cx = a.x + (dx < 0 ? -w / 2 : w / 2); cy = a.y + (dy < 0 ? -h / 2 : h / 2);
      }
      w = G.round2(w); h = G.round2(h); cx = G.round2(cx); cy = G.round2(cy);
      if (tool === 'stall') {
        var count = this.map.items.filter(function (i) { return i.type === 'stall'; }).length;
        it = { id: S.uid(), type: 'stall', x: cx, y: cy, w: w, h: h, rot: 0, name: '', number: this.nextStallNumber(), product: '', owner: '', needsPower: false, notes: '', color: S.STALL_COLORS[count % S.STALL_COLORS.length] };
        this.lastStall = { w: w, h: h };
      } else {
        it = { id: S.uid(), type: 'zone', kind: tool === 'aisle' ? 'aisle' : tool === 'blocked' ? 'blocked' : 'area', shape: tool === 'circle' ? 'circle' : 'rect', x: cx, y: cy, w: w, h: h, rot: 0, label: '', blockType: 'other' };
      }
    }
    this.addItem(it);
    this.finishSticky(keep);
    self.render();
  };

  /* ---- teclado ---- */

  P.onKey = function (e) {
    if (!this.map) return false;
    var k = e.key, ctrl = e.ctrlKey || e.metaKey, step = this.map.settings.snap ? this.map.settings.grid : 0.1;
    if (k === ' ') { this.spaceDown = true; this.svg.style.cursor = 'grab'; return true; }
    if (ctrl && (k === 'z' || k === 'Z')) { e.shiftKey ? this.redo() : this.undo(); return true; }
    if (ctrl && (k === 'y' || k === 'Y')) { this.redo(); return true; }
    if (ctrl && (k === 'd' || k === 'D')) { this.duplicateSelected(); return true; }
    if (ctrl) return false;
    var tools = { v: 'select', b: 'stall', r: 'rect', c: 'circle', l: 'guide', w: 'wall', a: 'aisle', x: 'blocked', t: 'outlet', e: 'gate', m: 'measure' };
    var lower = k.length === 1 ? k.toLowerCase() : k;
    if (tools[lower] && !this.readOnly || (this.readOnly && (lower === 'v' || lower === 'm'))) { this.setTool(tools[lower], e.shiftKey); return true; }
    if (k === 'Escape') { this.measure = null; this.setTool('select'); this.select(null); return true; }
    if (k === 'Delete' || k === 'Backspace') { this.deleteSelected(); return true; }
    if (k === '[' || k === ']') { this.rotateSelected(k === ']' ? 15 : -15); return true; }
    if (k.indexOf('Arrow') === 0 && this.selId && !this.readOnly) {
      var s = e.shiftKey ? 1 : step;
      this.nudgeSelected(k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0, k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0);
      return true;
    }
    if (k === '+' || k === '=') { this.zoomBy(1.25); return true; }
    if (k === '-') { this.zoomBy(0.8); return true; }
    if (k === '0') { this.fit(); return true; }
    return false;
  };
  P.onKeyUp = function (e) {
    if (e.key === ' ') { this.spaceDown = false; this.svg.style.cursor = this.tool === 'select' ? '' : 'crosshair'; }
  };

  /* ---- desenho ---- */

  P.render = function () {
    var m = this.map; if (!m) return;
    var k = this.view.k, v = this.view;
    this.gWorld.setAttribute('transform', 'translate(' + v.x + ' ' + v.y + ') scale(' + k + ')');

    // fundo + folha do mapa
    this.gBg.innerHTML = '';
    var sheet = el('rect', { x: 0, y: 0, width: m.width, height: m.height, fill: '#fffdf8' }, this.gBg);
    sheet.setAttribute('pointer-events', 'none');
    if (m.bg) el('image', { href: m.bg, x: 0, y: 0, width: m.width, height: m.height, preserveAspectRatio: 'none', 'pointer-events': 'none' }, this.gBg);

    // grade (some quando ficaria densa demais)
    this.gGrid.innerHTML = '';
    var g = m.settings.grid;
    if (m.settings.showGrid && g * k >= 7) {
      var path = [], x, y, big = g * k < 14 ? 2 : 1;
      for (x = 0; x <= m.width + 1e-6; x += g) path.push('M' + x + ' 0V' + m.height);
      for (y = 0; y <= m.height + 1e-6; y += g) path.push('M0 ' + y + 'H' + m.width);
      if (path.length < 6000) {
        var gp = el('path', { d: path.join(''), fill: 'none', opacity: m.bg ? 0.35 : 0.5 }, this.gGrid);
        stroke(gp, '#d9d2c0', 0.6 * big / big);
        gp.setAttribute('pointer-events', 'none');
      }
    }
    var border = el('rect', { x: 0, y: 0, width: m.width, height: m.height, fill: 'none', 'pointer-events': 'none' }, this.gGrid);
    stroke(border, '#8d8677', 1.5);

    // elementos
    this.gItems.innerHTML = '';
    this.buildItems(this.gItems, k);

    // camada de interface
    this.gUi.innerHTML = '';
    this.buildUi(k);
  };

  P.buildItems = function (parent, k) {
    var items = this.map.items.slice().sort(function (a, b) { return drawOrder(a) - drawOrder(b); });
    var stallsById = {};
    items.forEach(function (i) { if (i.type === 'stall') stallsById[i.id] = i; });
    var linked = false;
    items.forEach(function (it) {
      if (!linked && drawOrder(it) >= 6) { linked = true; this.buildLinks(parent, stallsById); }
      var b = BUILDERS[it.type]; if (b) b(it, k, parent);
    }, this);
    if (!linked) this.buildLinks(parent, stallsById);
  };

  /* Linhas pontilhadas tomada → barracas atribuídas. */
  P.buildLinks = function (parent, stallsById) {
    this.map.items.forEach(function (o) {
      if (o.type !== 'outlet') return;
      (o.stalls || []).forEach(function (sid) {
        var s = stallsById[sid]; if (!s) return;
        var l = el('line', { x1: o.x, y1: o.y, x2: s.x, y2: s.y, 'pointer-events': 'none', opacity: 0.8 }, parent);
        stroke(l, COL.link, 1.5, '2 3');
      });
    });
  };

  P.buildUi = function (k) {
    var ui = this.gUi, self = this, m = this.map;

    // avisos
    var level = {};
    this.issues.forEach(function (i) {
      i.ids.forEach(function (id) { if (level[id] !== 'error') level[id] = i.level; });
    });
    Object.keys(level).forEach(function (id) {
      var it = self.getItem(id); if (!it) return;
      var c = level[id] === 'error' ? COL.err : COL.warn;
      outline(it, k, ui, c, 2.5, level[id] === 'error' ? 'rgba(211,47,47,.14)' : 'rgba(240,140,0,.10)');
    });

    // busca
    this.highlight.forEach(function (id) {
      var it = self.getItem(id); if (!it) return;
      var o = outline(it, k, ui, COL.hl, 3.5, 'rgba(123,31,162,.12)');
      o.setAttribute('class', 'hl');
    });

    // seleção
    var sel = this.getSelected();
    if (sel) this.buildSelection(sel, k);

    // pré-visualização ao desenhar
    var d = this.drag;
    if (d && d.type === 'draw') {
      var a = d.p0, b = d.p1;
      if (d.tool === 'wall' || d.tool === 'guide') {
        var l = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'pointer-events': 'none' }, ui);
        stroke(l, COL.sel, 2, '6 4');
        label(ui, G.formatM(G.dist(a.x, a.y, b.x, b.y)), (a.x + b.x) / 2, (a.y + b.y) / 2 - 12 / k, 12 / k, k, { halo: true, fill: COL.sel });
      } else {
        var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
        if (d.tool === 'circle') { w = h = Math.max(w, h); x = b.x < a.x ? a.x - w : a.x; y = b.y < a.y ? a.y - h : a.y; }
        var r = d.tool === 'circle'
          ? el('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, fill: 'rgba(21,101,192,.10)', 'pointer-events': 'none' }, ui)
          : el('rect', { x: x, y: y, width: w, height: h, fill: 'rgba(21,101,192,.10)', 'pointer-events': 'none' }, ui);
        stroke(r, COL.sel, 2, '6 4');
        if (w > 0 || h > 0) label(ui, G.formatM(w) + ' × ' + G.formatM(h), x + w / 2, y - 12 / k, 12 / k, k, { halo: true, fill: COL.sel });
      }
    }

    // régua
    var ms = this.measure;
    if (ms) {
      var e2 = ms.b || ms.cur || ms.a;
      var ml = el('line', { x1: ms.a.x, y1: ms.a.y, x2: e2.x, y2: e2.y, 'pointer-events': 'none' }, ui);
      stroke(ml, COL.measure, 2, ms.b ? null : '6 4');
      [ms.a, e2].forEach(function (pt) {
        var c = el('circle', { cx: pt.x, cy: pt.y, r: 4 / k, fill: COL.measure, 'pointer-events': 'none' }, ui); c.setAttribute('stroke', '#fff');
      });
      var dd = G.dist(ms.a.x, ms.a.y, e2.x, e2.y);
      label(ui, G.formatM(dd), (ms.a.x + e2.x) / 2, (ms.a.y + e2.y) / 2 - 13 / k, 13 / k, k, { halo: true, fill: COL.measure, weight: '700' });
    }
  };

  P.buildSelection = function (it, k) {
    var ui = this.gUi, ro = this.readOnly;
    if (it.type === 'line') {
      outline(it, k, ui, COL.sel, 1.5).setAttribute('stroke-dasharray', '5 3');
      if (!ro) [['p1', it.x1, it.y1], ['p2', it.x2, it.y2]].forEach(function (p) {
        var c = el('circle', { cx: p[1], cy: p[2], r: 6 / k, fill: '#fff', 'data-handle': p[0], style: 'cursor:move' }, ui);
        stroke(c, COL.sel, 2);
      });
      return;
    }
    var g = el('g', { transform: tf(it.x, it.y, it.rot || 0) }, ui);
    var hw, hh;
    if (it.type === 'stall' || it.type === 'zone') { hw = it.w / 2; hh = it.h / 2; }
    else { hw = hh = iconR(k) * 1.5; }
    var r = el('rect', { x: -hw, y: -hh, width: hw * 2, height: hh * 2, fill: 'none', 'pointer-events': 'none' }, g);
    stroke(r, COL.sel, 1.5, '5 3');
    if (ro) return;
    var s = 9 / k;
    if (it.type === 'stall' || it.type === 'zone') {
      var cur = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', '', 'ew-resize', 'nesw-resize', 'ns-resize', 'nwse-resize'];
      var idx = 0;
      for (var iy = -1; iy <= 1; iy++) for (var ix = -1; ix <= 1; ix++, idx++) {
        if (!ix && !iy) continue;
        var hnd = el('rect', { x: ix * hw - s / 2, y: iy * hh - s / 2, width: s, height: s, fill: '#fff', 'data-handle': ix + ',' + iy, style: 'cursor:' + cur[idx] }, g);
        stroke(hnd, COL.sel, 1.5);
      }
    }
    if (it.type !== 'outlet') {
      var off = hh + 26 / k;
      var ln = el('line', { x1: 0, y1: -hh, x2: 0, y2: -off, 'pointer-events': 'none' }, g); stroke(ln, COL.sel, 1.5);
      var rc = el('circle', { cx: 0, cy: -off, r: 6.5 / k, fill: COL.sel, 'data-handle': 'rot', style: 'cursor:grab' }, g);
      rc.setAttribute('stroke', '#fff');
    }
  };

  /* ---- exportação: SVG limpo (sem alças, avisos ou realces) ---- */

  P.exportSvg = function (pxPerM, opts) {
    opts = opts || {};
    var m = this.map, W = m.width, H = m.height;
    var svg = el('svg', { xmlns: NS, viewBox: '0 0 ' + W + ' ' + H, width: Math.round(W * pxPerM), height: Math.round(H * pxPerM) });
    svg.setAttribute('font-family', FONT);
    var defs = this.gDefs.cloneNode(true); svg.appendChild(defs);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }, svg);
    if (m.bg) el('image', { href: m.bg, x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none' }, svg);
    var gi = el('g', null, svg);
    this.buildItems(gi, pxPerM);
    if (opts.issues) {
      var self = this, lv = {};
      this.issues.forEach(function (i) { i.ids.forEach(function (id) { if (lv[id] !== 'error') lv[id] = i.level; }); });
      Object.keys(lv).forEach(function (id) { var it = self.getItem(id); if (it) outline(it, pxPerM, gi, lv[id] === 'error' ? COL.err : COL.warn, 2.5); });
    }
    var bd = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'none' }, svg); stroke(bd, '#8d8677', 1.5);
    // traços em px viram traços em metros na escala da exportação
    Array.prototype.forEach.call(svg.querySelectorAll('[data-sw]'), function (n) {
      n.removeAttribute('vector-effect');
      n.setAttribute('stroke-width', (parseFloat(n.getAttribute('data-sw')) / pxPerM).toFixed(4));
      var da = n.getAttribute('stroke-dasharray');
      if (da) n.setAttribute('stroke-dasharray', da.split(' ').map(function (x) { return (parseFloat(x) / pxPerM).toFixed(4); }).join(' '));
      n.removeAttribute('data-sw');
    });
    Array.prototype.forEach.call(svg.querySelectorAll('[data-id],[data-type],[data-handle]'), function (n) {
      n.removeAttribute('data-id'); n.removeAttribute('data-type');
    });
    return svg;
  };

  Editor.COL = COL;
  Editor.GATE_COL = GATE_COL;
  root.Editor = Editor;
})(typeof self !== 'undefined' ? self : this);
