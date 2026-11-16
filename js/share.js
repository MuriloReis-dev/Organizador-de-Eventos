/* Compartilhar e exportar: link (dados no próprio endereço), imagem PNG, JSON e impressão/PDF. */
(function (root) {
  'use strict';
  var S = root.Store, G = root.Geo;

  function slug(s) {
    return (s || 'mapa').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'mapa';
  }

  function download(filename, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function toB64Url(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64Url(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  var canLink = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

  /* Link somente-leitura com o mapa dentro do endereço. A foto de fundo não vai junto (seria grande demais). */
  async function linkFor(map) {
    if (!canLink) throw new Error('Este navegador não suporta links de compartilhamento. Exporte o arquivo JSON.');
    var copy = JSON.parse(JSON.stringify(map));
    copy.bg = null;
    var bytes = new TextEncoder().encode(JSON.stringify(copy));
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    var buf = await new Response(stream).arrayBuffer();
    var url = location.origin + location.pathname + '#/v/' + toB64Url(buf);
    return { url: url, hadBg: !!map.bg, length: url.length };
  }

  /* Lê o conteúdo de um link compartilhado (com limite de tamanho contra arquivos "bomba"). */
  async function decode(payload) {
    if (!canLink) throw new Error('Este navegador não consegue abrir links de compartilhamento.');
    var stream = new Blob([fromB64Url(payload)]).stream().pipeThrough(new DecompressionStream('gzip'));
    var reader = stream.getReader(), chunks = [], total = 0, LIMIT = 4 * 1024 * 1024;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      total += r.value.length;
      if (total > LIMIT) { reader.cancel(); throw new Error('Link grande demais.'); }
      chunks.push(r.value);
    }
    var all = new Uint8Array(total), off = 0;
    chunks.forEach(function (c) { all.set(c, off); off += c.length; });
    var map = S.normalizeMap(JSON.parse(new TextDecoder().decode(all)));
    return map;
  }

  function svgToCanvas(svg) {
    return new Promise(function (resolve, reject) {
      var xml = new XMLSerializer().serializeToString(svg);
      var url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = parseInt(svg.getAttribute('width'), 10); c.height = parseInt(svg.getAttribute('height'), 10);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Não foi possível gerar a imagem.')); };
      img.src = url;
    });
  }

  async function downloadPng(editor) {
    var m = editor.map, ppm = Math.max(6, Math.min(40, 4096 / Math.max(m.width, m.height)));
    var canvas = await svgToCanvas(editor.exportSvg(ppm));
    var blob = await new Promise(function (res) { canvas.toBlob(res, 'image/png'); });
    if (!blob) throw new Error('Não foi possível gerar a imagem.');
    download(slug(m.name) + '.png', blob);
  }

  function downloadJson(map) {
    download(slug(map.name) + '.feiramapa.json', new Blob([S.exportJSON(map)], { type: 'application/json' }));
  }

  /* Folha para imprimir / salvar em PDF: mapa, lista de barracas e avisos. */
  function printSheet(editor) {
    var m = editor.map;
    var old = document.getElementById('print-root'); if (old) old.remove();
    var rootEl = document.createElement('div');
    rootEl.id = 'print-root';

    function add(tag, text, cls) { var n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; rootEl.appendChild(n); return n; }
    add('h1', m.name);
    var stalls = m.items.filter(function (i) { return i.type === 'stall'; });
    add('p', 'Mapa de ' + G.formatM(m.width) + ' × ' + G.formatM(m.height) + ' · ' + stalls.length + (stalls.length === 1 ? ' barraca' : ' barracas') + ' · gerado em ' + new Date().toLocaleDateString('pt-BR'), 'meta');
    var wrap = document.createElement('div'); wrap.className = 'print-map';
    var svg = editor.exportSvg(24);
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('style', 'width:100%;height:auto;max-height:150mm');
    wrap.appendChild(svg); rootEl.appendChild(wrap);

    if (stalls.length) {
      var sorted = stalls.slice().sort(function (a, b) {
        return String(a.number || '').localeCompare(String(b.number || ''), 'pt-BR', { numeric: true });
      });
      var table = document.createElement('table');
      var head = table.createTHead().insertRow();
      ['Nº', 'Barraca', 'Produto', 'Responsável', 'Medidas', 'Energia', 'Observações'].forEach(function (h) {
        var th = document.createElement('th'); th.textContent = h; head.appendChild(th);
      });
      var body = table.createTBody();
      sorted.forEach(function (s) {
        var tr = body.insertRow();
        [s.number, s.name, s.product, s.owner, G.formatM(s.w) + ' × ' + G.formatM(s.h), s.needsPower ? 'Sim' : '', s.notes].forEach(function (v) {
          tr.insertCell().textContent = v || '';
        });
      });
      add('h2', 'Barracas');
      rootEl.appendChild(table);
    }
    if (editor.issues.length) {
      add('h2', 'Avisos de planejamento');
      var ul = document.createElement('ul');
      editor.issues.forEach(function (i) { var li = document.createElement('li'); li.textContent = (i.level === 'error' ? 'Problema: ' : 'Atenção: ') + i.message; ul.appendChild(li); });
      rootEl.appendChild(ul);
    }
    document.body.appendChild(rootEl);
    var title = document.title; document.title = m.name;
    window.addEventListener('afterprint', function done() {
      window.removeEventListener('afterprint', done);
      rootEl.remove(); document.title = title;
    });
    setTimeout(function () { window.print(); }, 60);
  }

  root.Share = { linkFor: linkFor, decode: decode, downloadPng: downloadPng, downloadJson: downloadJson, printSheet: printSheet, download: download, slug: slug, canLink: canLink };
})(typeof self !== 'undefined' ? self : this);
