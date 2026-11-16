/* Geometria e validações do mapa da feira.
 * Tudo em metros. Sem dependências: roda no navegador (window.Geo) e no Node (testes).
 * Itens: stall (barraca), zone (área/corredor/proibida), line (parede/guia), outlet (tomada), gate (entrada/saída).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Geo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 0.001;

  function rad(deg) { return (deg * Math.PI) / 180; }

  function rotatePoint(x, y, deg) {
    var r = rad(deg), c = Math.cos(r), s = Math.sin(r);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  /* Retângulo centrado em (x,y), w x h, girado em graus. */
  function rectPoly(cx, cy, w, h, rot) {
    var hw = w / 2, hh = h / 2;
    var pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return pts.map(function (p) {
      var q = rotatePoint(p[0], p[1], rot || 0);
      return { x: cx + q.x, y: cy + q.y };
    });
  }

  /* Elipse aproximada por polígono convexo (24 lados). Círculo = elipse com w == h. */
  function ellipsePoly(cx, cy, w, h, rot) {
    var pts = [], n = 24;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var q = rotatePoint((Math.cos(a) * w) / 2, (Math.sin(a) * h) / 2, rot || 0);
      pts.push({ x: cx + q.x, y: cy + q.y });
    }
    return pts;
  }

  /* Segmento com espessura (parede) como retângulo. */
  function linePoly(x1, y1, x2, y2, thick) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || EPS;
    var nx = (-dy / len) * (thick / 2), ny = (dx / len) * (thick / 2);
    return [
      { x: x1 + nx, y: y1 + ny }, { x: x2 + nx, y: y2 + ny },
      { x: x2 - nx, y: y2 - ny }, { x: x1 - nx, y: y1 - ny }
    ];
  }

  /* Polígono ocupado por um item (ou null para itens pontuais). */
  function itemPoly(it) {
    if (it.type === 'stall') return rectPoly(it.x, it.y, it.w, it.h, it.rot);
    if (it.type === 'zone') {
      return it.shape === 'circle'
        ? ellipsePoly(it.x, it.y, it.w, it.h, it.rot)
        : rectPoly(it.x, it.y, it.w, it.h, it.rot);
    }
    if (it.type === 'line') return linePoly(it.x1, it.y1, it.x2, it.y2, it.thick || 0.2);
    return null;
  }

  function project(poly, ax, ay) {
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < poly.length; i++) {
      var d = poly[i].x * ax + poly[i].y * ay;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return [min, max];
  }

  /* SAT para polígonos convexos. Só conta como sobreposição se invadir mais que EPS (encostar não conta). */
  function polysOverlap(a, b) {
    var polys = [a, b];
    for (var k = 0; k < 2; k++) {
      var p = polys[k];
      for (var i = 0; i < p.length; i++) {
        var q = p[(i + 1) % p.length];
        var ax = -(q.y - p[i].y), ay = q.x - p[i].x;
        var len = Math.sqrt(ax * ax + ay * ay);
        if (len < 1e-9) continue;
        ax /= len; ay /= len;
        var pa = project(a, ax, ay), pb = project(b, ax, ay);
        if (pa[1] <= pb[0] + EPS || pb[1] <= pa[0] + EPS) return false;
      }
    }
    return true;
  }

  function distPointSeg(px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var l2 = dx * dx + dy * dy;
    var t = l2 === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    var cx = a.x + t * dx, cy = a.y + t * dy;
    return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
  }

  function pointInPoly(px, py, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* Distância do ponto ao polígono (0 se estiver dentro). */
  function distPointPoly(px, py, poly) {
    if (pointInPoly(px, py, poly)) return 0;
    var best = Infinity;
    for (var i = 0; i < poly.length; i++) {
      var d = distPointSeg(px, py, poly[i], poly[(i + 1) % poly.length]);
      if (d < best) best = d;
    }
    return best;
  }

  /* Menor distância entre dois polígonos convexos (0 se sobrepostos/encostados). */
  function polyDistance(a, b) {
    if (polysOverlap(a, b)) return 0;
    var best = Infinity, i, d;
    for (i = 0; i < a.length; i++) {
      d = distPointPoly(a[i].x, a[i].y, b);
      if (d < best) best = d;
    }
    for (i = 0; i < b.length; i++) {
      d = distPointPoly(b[i].x, b[i].y, a);
      if (d < best) best = d;
    }
    return best;
  }

  function polyBounds(poly) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    poly.forEach(function (p) {
      if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function snap(v, step) {
    if (!step || step <= 0) return v;
    return Math.round(v / step) * step;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /* "3,5 m" no padrão brasileiro. */
  function formatM(n) {
    return (Math.round(n * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m';
  }

  var BLOCK_TYPES = {
    tree: 'Árvore', pole: 'Poste', wc: 'Banheiro', extinguisher: 'Extintor',
    emergency: 'Saída de emergência', maintenance: 'Área de manutenção',
    reserved: 'Espaço reservado', other: 'Área proibida'
  };

  function blockLabel(z) {
    return z.label || BLOCK_TYPES[z.blockType] || BLOCK_TYPES.other;
  }

  function stallLabel(s) {
    var parts = [];
    if (s.number) parts.push('nº ' + s.number);
    if (s.name) parts.push(s.name);
    return 'Barraca ' + (parts.join(' · ') || '(sem nome)');
  }

  /* Valida o mapa e devolve a lista de avisos.
   * Cada aviso: { level: 'error'|'warn', code, ids: [..], message }. */
  function validate(map) {
    var s = map.settings || {};
    var minAisle = s.minAisle != null ? s.minAisle : 1.5;
    var maxOutlet = s.maxOutletDist != null ? s.maxOutletDist : 10;
    var gateClear = s.gateClearance != null ? s.gateClearance : 1.5;
    var items = map.items || [];
    var issues = [];
    function add(level, code, ids, message) { issues.push({ level: level, code: code, ids: ids, message: message }); }

    var stalls = [], zones = [], walls = [], outlets = [], gates = [];
    var polys = {};
    items.forEach(function (it) {
      if (it.type === 'stall') stalls.push(it);
      else if (it.type === 'zone') zones.push(it);
      else if (it.type === 'line' && it.kind === 'wall') walls.push(it);
      else if (it.type === 'outlet') outlets.push(it);
      else if (it.type === 'gate') gates.push(it);
      var p = itemPoly(it);
      if (p) polys[it.id] = p;
    });

    var i, j;

    // Barraca x barraca
    for (i = 0; i < stalls.length; i++) {
      for (j = i + 1; j < stalls.length; j++) {
        var A = stalls[i], B = stalls[j];
        if (polysOverlap(polys[A.id], polys[B.id])) {
          add('error', 'stall-overlap', [A.id, B.id],
            stallLabel(A) + ' está sobreposta a ' + stallLabel(B) + '.');
        } else {
          var d = polyDistance(polys[A.id], polys[B.id]);
          if (d > 0.05 && d < minAisle) {
            add('warn', 'narrow', [A.id, B.id],
              'Passagem estreita (' + formatM(d) + ') entre ' + stallLabel(A) + ' e ' + stallLabel(B) +
              '. Mínimo configurado: ' + formatM(minAisle) + '.');
          }
        }
      }
    }

    // Barraca x zonas e paredes
    stalls.forEach(function (st) {
      zones.forEach(function (z) {
        if (z.kind !== 'blocked' && z.kind !== 'aisle') return;
        if (!polysOverlap(polys[st.id], polys[z.id])) return;
        if (z.kind === 'blocked') {
          add('error', 'blocked', [st.id, z.id], stallLabel(st) + ' está sobre uma área proibida (' + blockLabel(z) + ').');
        } else {
          add('warn', 'in-aisle', [st.id, z.id], stallLabel(st) + ' está ocupando um corredor' + (z.label ? ' (' + z.label + ')' : '') + '.');
        }
      });
      walls.forEach(function (w) {
        if (polysOverlap(polys[st.id], polys[w.id])) {
          add('error', 'wall', [st.id, w.id], stallLabel(st) + ' atravessa uma parede.');
        }
      });
      if (map.width && map.height) {
        var b = polyBounds(polys[st.id]);
        if (b.x0 < -EPS || b.y0 < -EPS || b.x1 > map.width + EPS || b.y1 > map.height + EPS) {
          add('warn', 'outside', [st.id], stallLabel(st) + ' está parcial ou totalmente fora do mapa.');
        }
      }
    });

    // Corredores marcados mais estreitos que o mínimo
    zones.forEach(function (z) {
      if (z.kind === 'aisle' && Math.min(z.w, z.h) < minAisle - EPS) {
        add('warn', 'aisle-narrow', [z.id],
          'O corredor' + (z.label ? ' "' + z.label + '"' : '') + ' tem ' + formatM(Math.min(z.w, z.h)) +
          ' de largura, abaixo do mínimo de ' + formatM(minAisle) + '.');
      }
    });

    // Números de barraca repetidos
    var byNumber = {};
    stalls.forEach(function (st) {
      var n = (st.number || '').toString().trim().toLowerCase();
      if (!n) return;
      (byNumber[n] = byNumber[n] || []).push(st);
    });
    Object.keys(byNumber).forEach(function (n) {
      if (byNumber[n].length > 1) {
        add('warn', 'dup-number', byNumber[n].map(function (x) { return x.id; }),
          'O número "' + byNumber[n][0].number + '" está repetido em ' + byNumber[n].length + ' barracas.');
      }
    });

    // Energia
    var powered = stalls.filter(function (st) { return st.needsPower; });
    if (powered.length && !outlets.length) {
      add('warn', 'no-outlet', powered.map(function (x) { return x.id; }),
        powered.length + (powered.length === 1 ? ' barraca precisa' : ' barracas precisam') +
        ' de energia, mas não há nenhuma tomada no mapa.');
    } else {
      powered.forEach(function (st) {
        var assigned = outlets.filter(function (o) { return (o.stalls || []).indexOf(st.id) >= 0; });
        var pool = assigned.length ? assigned : outlets;
        var best = Infinity;
        pool.forEach(function (o) {
          var dd = distPointPoly(o.x, o.y, polys[st.id]);
          if (dd < best) best = dd;
        });
        if (best > maxOutlet) {
          add('warn', 'far-outlet', [st.id].concat(assigned.map(function (o) { return o.id; })),
            stallLabel(st) + ' precisa de energia e está a ' + formatM(best) + ' da tomada' +
            (assigned.length ? ' atribuída' : ' mais próxima') + ' (limite: ' + formatM(maxOutlet) + ').');
        }
      });
    }

    // Tomadas cobertas por barracas ou áreas proibidas
    outlets.forEach(function (o) {
      for (var k = 0; k < stalls.length; k++) {
        if (pointInPoly(o.x, o.y, polys[stalls[k].id])) {
          add('warn', 'outlet-covered', [o.id, stalls[k].id],
            'A tomada' + (o.label ? ' "' + o.label + '"' : '') + ' está embaixo de ' + stallLabel(stalls[k]) + ' e pode ficar inacessível.');
          break;
        }
      }
    });

    // Entradas e saídas bloqueadas
    gates.forEach(function (g) {
      for (var k = 0; k < stalls.length; k++) {
        var dd = distPointPoly(g.x, g.y, polys[stalls[k].id]);
        if (dd < gateClear) {
          add('warn', 'gate-blocked', [g.id, stalls[k].id],
            'A passagem em "' + (g.label || GATE_TYPES[g.kind] || 'Entrada') + '" está a ' + formatM(dd) +
            ' de ' + stallLabel(stalls[k]) + ' (livre mínimo: ' + formatM(gateClear) + ').');
        }
      }
    });

    issues.sort(function (a, b) { return (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1); });
    return issues;
  }

  var GATE_TYPES = {
    main: 'Entrada principal', secondary: 'Entrada secundária', exit: 'Saída',
    staff: 'Entrada de funcionários', supplier: 'Entrada para fornecedores'
  };

  return {
    EPS: EPS, rad: rad, rotatePoint: rotatePoint, rectPoly: rectPoly, ellipsePoly: ellipsePoly,
    linePoly: linePoly, itemPoly: itemPoly, polysOverlap: polysOverlap, polyDistance: polyDistance,
    pointInPoly: pointInPoly, distPointPoly: distPointPoly, polyBounds: polyBounds, dist: dist,
    snap: snap, round2: round2, formatM: formatM, validate: validate,
    BLOCK_TYPES: BLOCK_TYPES, GATE_TYPES: GATE_TYPES, blockLabel: blockLabel, stallLabel: stallLabel
  };
});
