/* Interface do FeiraMapa: tela inicial, painéis, diálogos e a ligação com o editor. */
(function () {
  'use strict';

  var G = window.Geo, S = window.Store, Sh = window.Share, Editor = window.Editor;
  var $ = function (id) { return document.getElementById(id); };

  var state = { editor: null, map: null, readOnly: false, saveTimer: 0, tab: 'item', keepTab: false, inited: false, issueSig: '', visible: false };

  /* ---------- utilidades ---------- */

  function h(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { n.addEventListener(ev, v[ev]); });
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function fmtDate(ts) { return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  function r2(n) { return Math.round(n * 100) / 100; }

  function toast(msg, level) {
    var box = $('toasts');
    Array.prototype.forEach.call(box.children, function (c) { if (c.textContent === msg) c.remove(); });
    while (box.children.length >= 3) box.firstChild.remove();
    var t = h('div', { class: 'toast ' + (level || 'info'), text: msg });
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, level === 'error' || level === 'warn' ? 7000 : 3800);
  }

  function slugId(s) { return String(s).replace(/[^\w-]/g, ''); }

  /* ---------- foto ---------- */

  function readPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Escolha um arquivo de imagem.'));
      if (file.size > 30 * 1024 * 1024) return reject(new Error('A imagem é grande demais (máximo 30 MB).'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1800, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: c.toDataURL('image/jpeg', 0.82), ratio: c.width / c.height });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler esta imagem.')); };
      img.src = url;
    });
  }

  /* ---------- diálogos ---------- */

  function askText(o) {
    return new Promise(function (resolve) {
      var dlg = $('dlg-text');
      $('text-title').textContent = o.title; $('text-label').textContent = o.label;
      $('text-input').value = o.value || ''; $('text-ok').textContent = o.ok || 'OK';
      function done() { dlg.removeEventListener('close', done); resolve(dlg.returnValue === 'ok' && $('text-input').value.trim() ? $('text-input').value.trim() : null); }
      dlg.addEventListener('close', done);
      dlg.returnValue = '';
      dlg.showModal();
      $('text-input').select();
    });
  }

  /* ---------- roteamento ---------- */

  function route() {
    var hash = location.hash || '', m;
    if ((m = /^#\/mapa\/([\w-]+)$/.exec(hash))) return openMap(m[1]);
    if ((m = /^#\/v\/([\w-]+)$/.exec(hash))) return openShared(m[1]);
    showHome();
  }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  /* ---------- tela inicial ---------- */

  var HERO_ART = '<svg viewBox="0 0 300 200" role="img" aria-label="Ilustração de um mapa de feira com barracas" style="stroke:none">' +
    '<rect x="2" y="2" width="296" height="196" rx="16" fill="#fffdf8" stroke="#e2dac6" stroke-width="2"/>' +
    '<g stroke="#e8e1cf" stroke-width="1">' + [40, 80, 120, 160, 200, 240, 280].map(function (x) { return '<path d="M' + x + ' 4V196"/>'; }).join('') + [40, 80, 120, 160].map(function (y) { return '<path d="M4 ' + y + 'H296"/>'; }).join('') + '</g>' +
    '<rect x="16" y="86" width="268" height="28" fill="rgba(74,134,197,.16)" stroke="#4a86c5" stroke-dasharray="6 4"/>' +
    '<rect x="34" y="28" width="52" height="42" rx="3" fill="#f2c46d" stroke="#6b5a3c" stroke-width="1.5"/><rect x="104" y="28" width="52" height="42" rx="3" fill="#e9967a" stroke="#6b5a3c" stroke-width="1.5"/>' +
    '<rect x="174" y="28" width="52" height="42" rx="3" fill="#9ccc9c" stroke="#6b5a3c" stroke-width="1.5"/><rect x="34" y="130" width="52" height="42" rx="3" fill="#8fbcd9" stroke="#6b5a3c" stroke-width="1.5"/>' +
    '<rect x="104" y="130" width="52" height="42" rx="3" fill="#c9a7e0" stroke="#6b5a3c" stroke-width="1.5"/><rect x="174" y="130" width="52" height="42" rx="3" fill="#d7d38b" stroke="#6b5a3c" stroke-width="1.5"/>' +
    '<circle cx="258" cy="46" r="17" fill="rgba(192,57,43,.2)" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="3 3"/>' +
    '<circle cx="130" cy="78" r="8" fill="#f5c518" stroke="#8a6d00" stroke-width="1.5"/><circle cx="16" cy="100" r="11" fill="#2e7d32" stroke="#fff" stroke-width="2"/>' +
    '<path d="M11 100h10m-4-4l4 4-4 4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function showHome() {
    flushSave();
    state.visible = false;
    state.map = null;
    $('view-editor').hidden = true;
    var v = $('view-home'); v.hidden = false;
    document.title = 'FeiraMapa — planeje a distribuição das barracas';
    document.body.classList.remove('panel-open');
    renderHome();
  }

  function renderHome() {
    var v = clear($('view-home'));
    var maps = S.list();
    var inner = h('div', { class: 'home-inner' });

    var art = h('div', { class: 'hero-art' }); art.innerHTML = HERO_ART;
    inner.appendChild(h('section', { class: 'hero' }, [
      h('div', null, [
        h('div', { class: 'brand' }, [
          (function () { var s = h('span'); s.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#2f6f4e"/><path d="M12 26l5-10h30l5 10z" fill="#f2c46d"/><rect x="16" y="26" width="32" height="22" fill="#fffdf8"/><rect x="24" y="34" width="16" height="14" fill="#c8553d"/></svg>'; return s.firstChild; })(),
          'FeiraMapa'
        ]),
        h('h1', { text: 'Planeje a feira antes de montar.' }),
        h('p', { text: 'Monte o mapa do local, posicione barracas, tomadas, entradas e corredores e descubra problemas de espaço antes do dia do evento.' })
      ]),
      art
    ]));

    var fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'Importar arquivo de mapa' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0]; fileInput.value = '';
      if (!f) return;
      if (f.size > 40 * 1024 * 1024) return toast('Arquivo grande demais.', 'error');
      f.text().then(function (txt) {
        var map = S.parseImport(txt), r = S.save(map);
        if (!r.ok) return toast(r.error, 'error');
        toast('Mapa importado.', 'ok'); go('#/mapa/' + map.id);
      }).catch(function (e) { toast(e.message || 'Não foi possível importar.', 'error'); });
    });

    inner.appendChild(h('div', { class: 'home-actions' }, [
      h('button', { class: 'btn primary', on: { click: openNewDialog } }, ['+ Novo mapa']),
      h('button', { class: 'btn', on: { click: function () { fileInput.click(); } } }, ['Importar arquivo']),
      h('button', { class: 'btn', on: { click: function () { var m = S.demo(); go('#/mapa/' + m.id); } } }, ['Ver um exemplo pronto']),
      fileInput
    ]));

    if (S.isVolatile()) inner.appendChild(h('div', { class: 'notice', text: 'Seu navegador está bloqueando o armazenamento local (modo privado?). Os mapas só ficam salvos enquanto esta aba estiver aberta — baixe o arquivo do mapa para guardar.' }));

    inner.appendChild(h('h2', { class: 'section-title', text: 'Meus mapas' }));
    if (!maps.length) {
      inner.appendChild(h('div', { class: 'empty' }, [
        h('p', { text: 'Você ainda não criou nenhum mapa.' }),
        h('p', { class: 'small', text: 'Crie um mapa novo ou abra o exemplo para conhecer o aplicativo.' })
      ]));
    } else {
      var cards = h('div', { class: 'cards' });
      maps.forEach(function (m) { cards.appendChild(mapCard(m)); });
      inner.appendChild(cards);
    }
    inner.appendChild(h('p', { class: 'foot', text: 'Os mapas ficam salvos neste navegador, neste aparelho. Para guardar um backup ou levar para outro computador, exporte o arquivo do mapa.' }));
    v.appendChild(inner);
    v.scrollTop = 0;
  }

  function mapCard(m) {
    function act(label, fn, cls) { return h('button', { class: 'btn small ' + (cls || ''), on: { click: fn } }, [label]); }
    return h('article', { class: 'card' }, [
      h('h3', { text: m.name }),
      h('div', { class: 'meta' }, [
        h('span', { text: m.stalls + (m.stalls === 1 ? ' barraca' : ' barracas') }),
        h('span', { text: G.formatM(m.width) + ' × ' + G.formatM(m.height) }),
        m.hasBg ? h('span', { text: 'com foto' }) : null,
        h('span', { text: 'editado ' + fmtDate(m.updatedAt) })
      ]),
      h('div', { class: 'actions' }, [
        act('Abrir', function () { go('#/mapa/' + m.id); }, 'primary'),
        act('Duplicar', function () {
          askText({ title: 'Duplicar mapa', label: 'Nome da nova feira', value: m.name + ' (cópia)', ok: 'Duplicar' }).then(function (name) {
            if (!name) return;
            var c = S.duplicate(m.id, name);
            if (!c) return toast('Não foi possível duplicar (sem espaço no navegador?).', 'error');
            toast('Mapa duplicado. Ajuste para a nova feira.', 'ok'); go('#/mapa/' + c.id);
          });
        }),
        act('Renomear', function () {
          askText({ title: 'Renomear mapa', label: 'Nome da feira', value: m.name, ok: 'Salvar' }).then(function (name) {
            if (!name) return;
            var full = S.load(m.id); if (!full) return;
            full.name = name; S.save(full); renderHome();
          });
        }),
        act('Exportar', function () { var full = S.load(m.id); if (full) Sh.downloadJson(full); }),
        act('Excluir', function () {
          if (confirm('Excluir o mapa "' + m.name + '"? Isso não pode ser desfeito.\n\nDica: exporte o arquivo antes, se quiser guardar uma cópia.')) { S.remove(m.id); renderHome(); }
        }, 'danger')
      ])
    ]);
  }

  /* ---------- novo mapa ---------- */

  var newPhoto = null;

  function openNewDialog() {
    var dlg = $('dlg-new');
    newPhoto = null;
    $('form-new').reset();
    $('new-draw').hidden = false; $('new-photo').hidden = true; $('new-preview').hidden = true;
    $('new-ok').disabled = false;
    $('new-photo-note').textContent = 'Escolha uma foto. O comprimento é calculado pela proporção da imagem; você pode ajustar depois.';
    dlg.returnValue = '';
    dlg.showModal();
    $('new-name').focus();
  }

  function initNewDialog() {
    var dlg = $('dlg-new');
    Array.prototype.forEach.call(document.getElementsByName('new-mode'), function (r) {
      r.addEventListener('change', function () {
        var photo = r.value === 'photo' && r.checked, draw = r.value === 'draw' && r.checked;
        if (photo) { $('new-draw').hidden = true; $('new-photo').hidden = false; }
        if (draw) { $('new-draw').hidden = false; $('new-photo').hidden = true; }
        $('new-ok').disabled = $('new-photo').hidden ? false : !newPhoto;
      });
    });
    $('new-file').addEventListener('change', function () {
      var f = this.files && this.files[0]; newPhoto = null; $('new-ok').disabled = true; $('new-preview').hidden = true;
      if (!f) return;
      readPhoto(f).then(function (p) {
        newPhoto = p; $('new-preview').src = p.dataUrl; $('new-preview').hidden = false; $('new-ok').disabled = false;
        $('new-photo-note').textContent = 'A foto vai de fundo do mapa, esticada para a largura real informada.';
      }).catch(function (e) { toast(e.message, 'error'); });
    });
    dlg.addEventListener('close', function () {
      if (dlg.returnValue !== 'ok') return;
      var name = $('new-name').value.trim() || 'Nova feira', photo = !$('new-photo').hidden, map;
      if (photo && newPhoto) {
        var w = Math.max(1, parseFloat($('new-pw').value) || 40);
        map = S.newMap({ name: name, width: w, height: Math.round((w / newPhoto.ratio) * 10) / 10, bg: newPhoto.dataUrl });
      } else {
        map = S.newMap({ name: name, width: Math.max(1, parseFloat($('new-w').value) || 40), height: Math.max(1, parseFloat($('new-h').value) || 25) });
      }
      var r = S.save(map);
      if (!r.ok) return toast(r.error, 'error');
      go('#/mapa/' + map.id);
    });
  }

  /* ---------- editor: abrir ---------- */

  function openMap(id) {
    var map = S.load(slugId(id));
    if (!map) { toast('Mapa não encontrado neste navegador.', 'error'); go('#/'); return; }
    enterEditor(map, false);
  }

  function openShared(payload) {
    Sh.decode(payload).then(function (map) { enterEditor(map, true); }).catch(function (e) {
      toast(e.message || 'Este link não pôde ser aberto.', 'error'); go('#/');
    });
  }

  function enterEditor(map, readOnly) {
    flushSave();
    if (!state.inited) initEditorUi();
    state.map = map; state.readOnly = readOnly; state.visible = true;
    $('view-home').hidden = true; $('view-editor').hidden = false;
    document.body.classList.remove('panel-open');
    $('readonly-banner').hidden = !readOnly;
    $('map-name').value = map.name; $('map-name').readOnly = readOnly;
    $('grp-history').hidden = readOnly;
    $('tabs').querySelector('[data-tab="map"]').hidden = readOnly;
    document.title = map.name + ' — FeiraMapa';
    setSaveState(readOnly ? 'Somente leitura' : 'Salvo');
    buildToolbar();
    state.search = ''; $('stall-search').value = '';
    state.issueSig = '';
    state.editor.load(map, { readOnly: readOnly });
    $('btn-grid').setAttribute('aria-pressed', String(map.settings.showGrid));
    renderMapPane(); renderStalls(); renderIssues(); renderProps(null);
    showTab(readOnly ? 'stalls' : 'item');
    updateHistoryButtons();
  }

  /* ---------- salvar ---------- */

  function setSaveState(text, isErr) { var s = $('save-state'); s.textContent = text; s.classList.toggle('err', !!isErr); }
  function scheduleSave() {
    if (state.readOnly) return;
    setSaveState('Salvando…');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(doSave, 450);
  }
  function doSave() {
    clearTimeout(state.saveTimer); state.saveTimer = 0;
    if (!state.map || state.readOnly) return;
    var r = S.save(state.map);
    if (r.ok) setSaveState(r.volatile ? 'Não salvo: armazenamento bloqueado' : 'Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), r.volatile);
    else { setSaveState('Erro ao salvar', true); toast(r.error, 'error'); }
  }
  function flushSave() { if (state.saveTimer) doSave(); }

  /* ---------- editor: interface ---------- */

  var ICONS = {
    select: 'M5 3l14 8-6.5 1.8L10 19z',
    rect: 'M4 6h16v12H4z',
    circle: 'M12 4a8 8 0 100 16 8 8 0 000-16z',
    wall: 'M3 9h18v6H3zM9 9v6M15 9v6',
    guide: 'M4 19L20 5',
    stall: 'M4 10l2-5h12l2 5zM6 10v9h12v-9M10 19v-5h4v5',
    aisle: 'M8 3L5 21M16 3l3 18M12 5v3M12 11v3M12 17v3',
    blocked: 'M12 4a8 8 0 100 16 8 8 0 000-16zM6.3 6.3l11.4 11.4',
    outlet: 'M13 2L5 14h6l-1 8 8-12h-6z',
    gate: 'M3 12h11M10 7l5 5-5 5M20 4v16',
    measure: 'M3 8h18v8H3zM7 8v4M11 8v3M15 8v4M19 8v3'
  };
  var TOOLS = [
    { id: 'select', label: 'Selecionar', key: 'V' },
    '-',
    { id: 'rect', label: 'Retângulo', key: 'R' }, { id: 'circle', label: 'Círculo', key: 'C' },
    { id: 'wall', label: 'Parede', key: 'W' }, { id: 'guide', label: 'Linha', key: 'L' },
    '-',
    { id: 'stall', label: 'Barraca', key: 'B' }, { id: 'aisle', label: 'Corredor', key: 'A' },
    { id: 'blocked', label: 'Proibida', key: 'X', title: 'Área proibida' }, { id: 'outlet', label: 'Tomada', key: 'T' },
    { id: 'gate', label: 'Entrada', key: 'E', title: 'Entrada ou saída' },
    '-',
    { id: 'measure', label: 'Medir', key: 'M', title: 'Medir distância' }
  ];
  var HINTS = {
    select: 'Clique para selecionar · arraste para mover · role para dar zoom · arraste o fundo (ou segure Espaço) para deslocar a tela',
    stall: 'Clique para colocar uma barraca, ou arraste para definir o tamanho',
    rect: 'Arraste para desenhar um retângulo (parte do local)',
    circle: 'Arraste para desenhar um círculo',
    wall: 'Arraste para desenhar uma parede · Shift trava o ângulo',
    guide: 'Arraste para traçar uma linha de apoio · Shift trava o ângulo',
    aisle: 'Arraste para marcar um corredor de circulação',
    blocked: 'Arraste para marcar uma área proibida para barracas (árvore, banheiro, extintor…)',
    outlet: 'Clique para colocar uma tomada',
    gate: 'Clique perto da borda para colocar uma entrada ou saída',
    measure: 'Clique em dois pontos para medir a distância · Esc limpa a medida'
  };

  function svgIcon(path) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', path); s.appendChild(p);
    return s;
  }

  function buildToolbar() {
    var tb = clear($('toolbar'));
    TOOLS.forEach(function (t) {
      if (t === '-') { tb.appendChild(h('div', { class: 'tool-sep', 'data-sep': '1' })); return; }
      if (state.readOnly && t.id !== 'select' && t.id !== 'measure') return;
      var b = h('button', {
        class: 'tool', 'data-tool': t.id, 'aria-pressed': 'false', title: (t.title || t.label) + ' (' + t.key + ') — clique duas vezes para manter ativa',
        on: {
          click: function () { state.editor.setTool(t.id, false); },
          dblclick: function () { state.editor.setTool(t.id, true); }
        }
      }, [svgIcon(ICONS[t.id]), h('span', { text: t.label }), h('i', { class: 'sticky-dot' })]);
      tb.appendChild(b);
    });
    if (state.readOnly) {
      Array.prototype.forEach.call(tb.querySelectorAll('.tool-sep'), function (s, i, all) { if (i > 0) s.hidden = true; });
    }
  }

  function updateTool(tool, sticky) {
    Array.prototype.forEach.call($('toolbar').querySelectorAll('.tool'), function (b) {
      var on = b.getAttribute('data-tool') === tool;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('data-sticky', on && sticky ? '1' : '0');
    });
    var hint = $('tool-hint'); clear(hint);
    var t = (HINTS[tool] || '') + (sticky ? ' · modo contínuo (Esc para sair)' : '');
    if (t) hint.appendChild(h('span', { text: t }));
  }

  function updateHistoryButtons() {
    var e = state.editor; if (!e) return;
    $('btn-undo').disabled = !e.canUndo(); $('btn-redo').disabled = !e.canRedo();
  }

  function showTab(name) {
    if (state.readOnly && name === 'map') name = 'stalls';
    state.tab = name;
    Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name));
    });
    ['item', 'stalls', 'issues', 'map'].forEach(function (n) { $('pane-' + n).hidden = n !== name; });
  }

  function closePanel() { document.body.classList.remove('panel-open'); $('btn-panel').setAttribute('aria-expanded', 'false'); }

  function selectAndCenter(id) {
    state.keepTab = true;
    state.editor.select(id); state.editor.centerOn(id);
    state.keepTab = false;
    closePanel();
  }

  function initEditorUi() {
    state.inited = true;
    state.editor = new Editor($('canvas'), {
      onChange: function (map, source) {
        scheduleSave();
        document.title = map.name + ' — FeiraMapa';
        renderStalls(); renderMapStats();
        if (source !== 'form' && source !== 'map') renderProps(state.editor.getSelected());
        if (source === 'map' && $('map-name') !== document.activeElement) $('map-name').value = map.name;
      },
      onSelect: function (item) {
        renderProps(item);
        if (item && !state.keepTab) showTab('item');
        renderStalls();
      },
      onTool: updateTool,
      onIssues: function (issues) {
        var sig = JSON.stringify(issues.map(function (i) { return [i.code, i.ids, i.level]; }));
        updateBadge(issues);
        renderItemDynamic();
        if (sig !== state.issueSig) { state.issueSig = sig; renderIssues(); }
      },
      onHistory: updateHistoryButtons,
      onToast: toast
    });

    // cabeçalho
    $('btn-home').addEventListener('click', function () { flushSave(); go('#/'); });
    $('map-name').addEventListener('input', function () {
      var v = this.value.trim(); if (!v || state.readOnly) return;
      state.editor.setMapInfo({ name: v.slice(0, 100) });
    });
    $('map-name').addEventListener('blur', function () { if (!this.value.trim() && state.map) this.value = state.map.name; });
    $('map-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); });
    $('btn-undo').addEventListener('click', function () { state.editor.undo(); });
    $('btn-redo').addEventListener('click', function () { state.editor.redo(); });
    $('btn-zoom-in').addEventListener('click', function () { state.editor.zoomBy(1.25); });
    $('btn-zoom-out').addEventListener('click', function () { state.editor.zoomBy(0.8); });
    $('btn-fit').addEventListener('click', function () { state.editor.fit(); });
    $('btn-grid').addEventListener('click', function () {
      var on = !state.map.settings.showGrid;
      state.editor.setSettings({ showGrid: on }); this.setAttribute('aria-pressed', String(on));
      if (!state.readOnly) renderMapPane();
    });
    $('btn-help').addEventListener('click', function () { $('dlg-help').showModal(); });
    $('btn-panel').addEventListener('click', function () {
      var open = document.body.classList.toggle('panel-open'); this.setAttribute('aria-expanded', String(open));
    });
    $('stage').addEventListener('pointerdown', closePanel);
    $('btn-save-copy').addEventListener('click', function () {
      var copy = JSON.parse(JSON.stringify(state.map));
      copy.id = S.uid(); copy.createdAt = Date.now(); copy.name = state.map.name + ' (cópia)';
      var r = S.save(copy);
      if (!r.ok) return toast(r.error, 'error');
      toast('Cópia salva em "Meus mapas". Agora você pode editar.', 'ok'); go('#/mapa/' + copy.id);
    });

    // abas
    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]'); if (b) showTab(b.getAttribute('data-tab'));
    });

    // menu compartilhar
    var menu = $('menu-export');
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]'); if (!b) return;
      menu.open = false;
      var act = b.getAttribute('data-act');
      if (act === 'link') openShare();
      else if (act === 'print') Sh.printSheet(state.editor);
      else if (act === 'png') Sh.downloadPng(state.editor).catch(function (er) { toast(er.message, 'error'); });
      else if (act === 'json') Sh.downloadJson(state.map);
    });
    document.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });

    // painel de barracas: busca (o campo é criado pelo esqueleto do painel)
    initPanelSkeleton();
    var search = $('stall-search');
    search.addEventListener('input', function () { state.search = this.value; renderStalls(); });
    search.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var first = matchingStalls()[0];
      if (first) selectAndCenter(first.id); else toast('Nenhuma barraca encontrada.', 'info');
    });

    // teclado
    document.addEventListener('keydown', function (e) {
      if (!state.visible || document.querySelector('dialog[open]')) return;
      var t = e.target, tag = t && t.tagName;
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (!state.readOnly) { doSave(); toast('Tudo salvo automaticamente neste navegador.', 'ok'); } return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); showTab('stalls'); $('stall-search').focus(); document.body.classList.add('panel-open'); return; }
      if (typing) { if (e.key === 'Escape') t.blur(); return; }
      if ((tag === 'BUTTON' || tag === 'SUMMARY') && (e.key === ' ' || e.key === 'Enter')) return;
      if (state.editor.onKey(e)) e.preventDefault();
    });
    document.addEventListener('keyup', function (e) { if (state.visible) state.editor.onKeyUp(e); });
    window.addEventListener('beforeunload', flushSave);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });
  }

  /* ---------- compartilhar ---------- */

  function openShare() {
    var dlg = $('dlg-share'), url = $('share-url'), note = $('share-note');
    url.value = 'Gerando link…'; note.textContent = '';
    dlg.showModal();
    Sh.linkFor(state.map).then(function (r) {
      url.value = r.url;
      var parts = ['O mapa vai dentro do próprio link: se você editar depois, gere um novo link.'];
      if (r.hadBg) parts.push('A foto de fundo não é incluída no link. Para mostrar a foto, envie a imagem ou o PDF.');
      if (r.length > 8000) parts.push('Este link ficou longo (' + r.length + ' caracteres) e alguns aplicativos de mensagem podem cortá-lo. Se acontecer, envie o PDF/imagem ou o arquivo do mapa.');
      note.textContent = parts.join(' ');
    }).catch(function (e) { url.value = ''; note.textContent = e.message; });
  }

  function copyShare() {
    var url = $('share-url'); url.select();
    var done = function () { toast('Link copiado.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url.value).then(done, function () { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
  }

  /* ---------- painel: item ---------- */

  var KIND_NAMES = { stall: 'Barraca', outlet: 'Tomada', gate: 'Entrada / saída' };

  function itemTitle(it) {
    if (it.type === 'stall') return G.stallLabel(it);
    if (it.type === 'zone') return it.kind === 'aisle' ? 'Corredor' : it.kind === 'blocked' ? G.blockLabel(it) : (it.shape === 'circle' ? 'Círculo' : 'Retângulo');
    if (it.type === 'line') return it.kind === 'wall' ? 'Parede' : 'Linha de apoio';
    if (it.type === 'outlet') return it.label || 'Tomada';
    if (it.type === 'gate') return it.label || G.GATE_TYPES[it.kind];
    return 'Item';
  }

  function fText(label, it, key, o) {
    o = o || {};
    var ctl = o.multiline ? h('textarea', { rows: 3, maxlength: 500 }) : h('input', { type: 'text', maxlength: o.max || 80, autocomplete: 'off' });
    ctl.value = it[key] || ''; ctl.disabled = state.readOnly;
    if (o.placeholder) ctl.setAttribute('placeholder', o.placeholder);
    ctl.addEventListener('input', function () { var p = {}; p[key] = ctl.value; state.editor.updateSelected(p, 'prop:' + key + ':' + it.id); });
    return h('label', { class: 'field' }, [h('span', { text: label }), ctl]);
  }
  function fNum(label, it, key, o) {
    o = o || {};
    var ctl = h('input', { type: 'number', step: o.step || 0.1, inputmode: 'decimal' });
    if (o.min != null) ctl.setAttribute('min', o.min);
    ctl.value = r2(it[key]); ctl.disabled = state.readOnly || !!o.readOnly;
    ctl.addEventListener('input', function () {
      var v = parseFloat(String(ctl.value).replace(',', '.'));
      if (!isFinite(v)) return;
      var p = {}; p[key] = v; state.editor.updateSelected(p, 'prop:' + key + ':' + it.id);
    });
    return h('label', { class: 'field' }, [h('span', { text: label }), ctl]);
  }
  function fSelect(label, value, options, onChange) {
    var sel = h('select', null, options.map(function (o) { return h('option', { value: o[0], text: o[1], selected: o[0] === value }); }));
    sel.value = value; sel.disabled = state.readOnly;
    sel.addEventListener('change', function () { onChange(sel.value); });
    return h('label', { class: 'field' }, [h('span', { text: label }), sel]);
  }
  function fCheck(label, checked, onChange) {
    var c = h('input', { type: 'checkbox', checked: checked, disabled: state.readOnly });
    c.addEventListener('change', function () { onChange(c.checked); });
    return h('label', { class: 'check' }, [c, h('span', { text: label })]);
  }

  function renderProps(it) {
    var pane = clear($('pane-item'));
    if (!it) {
      pane.appendChild(h('h3', { text: 'Nenhum item selecionado' }));
      pane.appendChild(h('p', { class: 'muted', text: 'Clique em um item do mapa para ver e editar as informações dele.' }));
      var tips = state.readOnly
        ? ['Use a aba Barracas para buscar e localizar uma barraca.', 'A ferramenta Medir mostra a distância entre dois pontos.', 'Role para dar zoom e arraste o fundo para mover a tela.']
        : ['Escolha uma ferramenta na barra ao lado e desenhe no mapa.', 'Arraste uma barraca para movê-la; use as alças para redimensionar e girar.', 'Veja a aba Avisos para saber se há barracas sobrepostas, corredores estreitos ou tomadas longe.', 'Ctrl+Z desfaz; Ctrl+D duplica o item selecionado.'];
      pane.appendChild(h('ul', { class: 'tip' }, tips.map(function (t) { return h('li', { text: t }); })));
      return;
    }
    var e = state.editor, ro = state.readOnly;
    var dot = it.type === 'stall' ? h('span', { class: 'dot', style: 'background:' + it.color }) : h('span', { class: 'dot', style: 'background:#ddd' });
    pane.appendChild(h('div', { class: 'item-head' }, [dot, h('h2', { text: itemTitle(it) })]));

    if (!ro) {
      var acts = h('div', { class: 'item-actions' });
      acts.appendChild(h('button', { class: 'btn small', on: { click: function () { e.duplicateSelected(); } } }, ['Duplicar']));
      if (it.type !== 'line' && it.type !== 'outlet') acts.appendChild(h('button', { class: 'btn small', on: { click: function () { e.rotateSelected(90); renderProps(e.getSelected()); } } }, ['Girar 90°']));
      acts.appendChild(h('button', { class: 'btn small danger', on: { click: function () { e.deleteSelected(); } } }, ['Excluir']));
      pane.appendChild(acts);
    }
    pane.appendChild(h('div', { id: 'item-dyn' }));

    var xy = function () { return h('div', { class: 'row2' }, [fNum('Posição X (m)', it, 'x'), fNum('Posição Y (m)', it, 'y')]); };

    if (it.type === 'stall') {
      pane.appendChild(fText('Nome da barraca', it, 'name'));
      pane.appendChild(h('div', { class: 'row2' }, [fText('Número', it, 'number', { max: 20 }), fText('Tipo de produto', it, 'product')]));
      pane.appendChild(fText('Nome do responsável', it, 'owner'));
      pane.appendChild(h('div', { class: 'row2' }, [fNum('Largura (m)', it, 'w', { min: 0.2 }), fNum('Comprimento (m)', it, 'h', { min: 0.2 })]));
      pane.appendChild(xy());
      pane.appendChild(fNum('Rotação (°)', it, 'rot', { step: 5 }));
      var sw = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Cor da barraca' });
      S.STALL_COLORS.forEach(function (c) {
        var b = h('button', { class: 'swatch', style: 'background:' + c, 'aria-pressed': String(it.color === c), 'aria-label': 'Cor ' + c, disabled: ro, on: { click: function () {
          e.updateSelected({ color: c }, 'color'); Array.prototype.forEach.call(sw.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        } } });
        sw.appendChild(b);
      });
      pane.appendChild(sw);
      pane.appendChild(fCheck('Precisa de tomada', it.needsPower, function (v) { e.updateSelected({ needsPower: v }, 'power'); renderProps(e.getSelected()); }));
      if (it.needsPower) {
        var outlets = state.map.items.filter(function (o) { return o.type === 'outlet'; });
        if (outlets.length) {
          var cur = outlets.filter(function (o) { return (o.stalls || []).indexOf(it.id) >= 0; })[0];
          pane.appendChild(fSelect('Tomada atribuída', cur ? cur.id : '', [['', 'Automática (a mais próxima)']].concat(outlets.map(function (o) { return [o.id, o.label || 'Tomada']; })), function (v) { e.assignStallToOutlet(it.id, v || null); }));
        }
      }
      pane.appendChild(fText('Observações', it, 'notes', { multiline: true }));
    } else if (it.type === 'zone') {
      pane.appendChild(fText(it.kind === 'blocked' ? 'Nome (opcional)' : 'Nome / rótulo', it, 'label', { placeholder: it.kind === 'aisle' ? 'Corredor' : '' }));
      if (it.kind === 'blocked') {
        pane.appendChild(fSelect('O que é', it.blockType || 'other', Object.keys(G.BLOCK_TYPES).map(function (k) { return [k, G.BLOCK_TYPES[k]]; }), function (v) { e.updateSelected({ blockType: v }, 'block'); renderStalls(); }));
      }
      pane.appendChild(h('div', { class: 'row2' }, [fNum('Largura (m)', it, 'w', { min: 0.2 }), fNum(it.shape === 'circle' ? 'Altura (m)' : 'Comprimento (m)', it, 'h', { min: 0.2 })]));
      pane.appendChild(xy());
      pane.appendChild(fNum('Rotação (°)', it, 'rot', { step: 5 }));
      if (it.kind === 'aisle') pane.appendChild(h('p', { class: 'muted small', text: 'Barracas colocadas sobre um corredor geram aviso. A largura mínima de passagem fica na aba Mapa.' }));
      if (it.kind === 'blocked') pane.appendChild(h('p', { class: 'muted small', text: 'Barracas colocadas sobre uma área proibida geram aviso.' }));
    } else if (it.type === 'line') {
      pane.appendChild(h('p', { class: 'muted small', text: it.kind === 'wall' ? 'Paredes bloqueiam barracas.' : 'Linha de apoio: serve só de referência visual.' }));
      if (it.kind === 'wall') pane.appendChild(fNum('Espessura (m)', it, 'thick', { step: 0.05, min: 0.05 }));
      pane.appendChild(h('div', { class: 'row2' }, [fNum('X inicial (m)', it, 'x1'), fNum('Y inicial (m)', it, 'y1')]));
      pane.appendChild(h('div', { class: 'row2' }, [fNum('X final (m)', it, 'x2'), fNum('Y final (m)', it, 'y2')]));
    } else if (it.type === 'outlet') {
      pane.appendChild(fText('Nome da tomada', it, 'label'));
      pane.appendChild(xy());
      var stalls = state.map.items.filter(function (s) { return s.type === 'stall'; }).sort(function (a, b) {
        return (b.needsPower ? 1 : 0) - (a.needsPower ? 1 : 0) || String(a.number).localeCompare(String(b.number), 'pt-BR', { numeric: true });
      });
      pane.appendChild(h('h3', { text: 'Barracas que usam esta tomada' }));
      if (!stalls.length) pane.appendChild(h('p', { class: 'muted small', text: 'Adicione barracas ao mapa para atribuí-las a esta tomada.' }));
      else {
        var list = h('div', { class: 'checklist' });
        stalls.forEach(function (s) {
          var c = h('input', { type: 'checkbox', checked: (it.stalls || []).indexOf(s.id) >= 0, disabled: ro });
          c.addEventListener('change', function () { e.assignStallToOutlet(s.id, c.checked ? it.id : null); renderProps(e.getSelected()); });
          list.appendChild(h('label', null, [c, h('span', { text: (s.needsPower ? '⚡ ' : '') + (s.number ? s.number + ' · ' : '') + (s.name || 'Sem nome') })]));
        });
        pane.appendChild(list);
        pane.appendChild(h('p', { class: 'muted small', text: '⚡ = barraca que precisa de tomada. Cada barraca usa uma tomada; marcar aqui tira ela das outras.' }));
      }
    } else if (it.type === 'gate') {
      pane.appendChild(fSelect('Tipo', it.kind, Object.keys(G.GATE_TYPES).map(function (k) { return [k, G.GATE_TYPES[k]]; }), function (v) { e.updateSelected({ kind: v }, 'gate-kind'); renderStalls(); }));
      pane.appendChild(fText('Nome (opcional)', it, 'label', { placeholder: G.GATE_TYPES[it.kind] }));
      pane.appendChild(xy());
      pane.appendChild(fNum('Direção da seta (°)', it, 'rot', { step: 15 }));
    }
    renderItemDynamic();
  }

  /* Bloco que se atualiza sozinho: avisos do item e distância até a tomada. */
  function renderItemDynamic() {
    var box = $('item-dyn'), e = state.editor;
    if (!box || !e) return;
    var it = e.getSelected();
    if (!it) return;
    clear(box);
    var mine = e.issues.filter(function (i) { return i.ids.indexOf(it.id) >= 0; });
    mine.forEach(function (i) {
      box.appendChild(h('div', { class: 'info', style: 'border-left:4px solid ' + (i.level === 'error' ? '#d32f2f' : '#e08a00'), text: i.message }));
    });
    if (it.type === 'stall' && it.needsPower) {
      var best = null;
      state.map.items.forEach(function (o) {
        if (o.type !== 'outlet') return;
        var d = G.distPointPoly(o.x, o.y, G.itemPoly(it));
        if (!best || d < best.d) best = { d: d, o: o };
      });
      if (best) box.appendChild(h('div', { class: 'info', text: 'Tomada mais próxima: ' + G.formatM(best.d) + ' (' + (best.o.label || 'Tomada') + ').' }));
    }
    if (it.type === 'line') box.appendChild(h('div', { class: 'info', text: 'Comprimento: ' + G.formatM(G.dist(it.x1, it.y1, it.x2, it.y2)) }));
    if (it.type === 'stall') box.appendChild(h('div', { class: 'info', text: 'Área: ' + r2(it.w * it.h).toLocaleString('pt-BR') + ' m²' }));
  }

  /* ---------- painel: barracas ---------- */

  function initPanelSkeleton() {
    var pane = $('pane-stalls');
    pane.appendChild(h('label', { class: 'field' }, [
      h('span', { text: 'Buscar barraca' }),
      h('input', { id: 'stall-search', type: 'search', placeholder: 'Nome, produto, número ou responsável', autocomplete: 'off', 'aria-label': 'Buscar barraca' })
    ]));
    pane.appendChild(h('div', { id: 'stall-count', class: 'count-line' }));
    pane.appendChild(h('ul', { id: 'stall-list', class: 'list' }));
    pane.appendChild(h('details', { class: 'fold', id: 'other-fold' }, [
      h('summary', { text: 'Outros elementos do mapa' }),
      h('ul', { id: 'other-list', class: 'list', style: 'margin-top:8px' })
    ]));
  }

  function matchingStalls() {
    var q = fold(state.search).trim(), stalls = state.map.items.filter(function (i) { return i.type === 'stall'; });
    stalls.sort(function (a, b) { return String(a.number || '').localeCompare(String(b.number || ''), 'pt-BR', { numeric: true }) || String(a.name).localeCompare(String(b.name), 'pt-BR'); });
    if (!q) return stalls;
    var words = q.split(/\s+/);
    return stalls.filter(function (s) {
      var hay = fold([s.number, s.name, s.product, s.owner, s.notes].join(' '));
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }

  function issueLevels() {
    var lv = {};
    state.editor.issues.forEach(function (i) { i.ids.forEach(function (id) { if (lv[id] !== 'error') lv[id] = i.level; }); });
    return lv;
  }

  function renderStalls() {
    if (!state.map || !$('stall-list')) return;
    var e = state.editor, list = clear($('stall-list')), all = state.map.items.filter(function (i) { return i.type === 'stall'; });
    var found = matchingStalls(), lv = issueLevels(), q = state.search.trim();

    $('stall-count').textContent = q ? found.length + ' de ' + all.length + (all.length === 1 ? ' barraca' : ' barracas') : all.length + (all.length === 1 ? ' barraca' : ' barracas');
    found.forEach(function (s) {
      var flags = h('span', { class: 'flags' }, [
        s.needsPower ? h('span', { title: 'Precisa de tomada', text: '⚡' }) : null,
        lv[s.id] ? h('span', { class: lv[s.id] === 'error' ? 'flag-err' : 'flag-warn', title: 'Tem aviso', text: '⚠' }) : null
      ]);
      list.appendChild(h('li', null, [h('button', { 'aria-current': String(e.selId === s.id), on: { click: function () { selectAndCenter(s.id); } } }, [
        h('span', { class: 'dot', style: 'background:' + s.color }),
        h('span', { class: 'txt' }, [
          h('strong', { text: (s.number ? s.number + ' · ' : '') + (s.name || 'Sem nome') }),
          h('small', { text: [s.product, s.owner].filter(Boolean).join(' · ') || G.formatM(s.w) + ' × ' + G.formatM(s.h) })
        ]), flags
      ])]));
    });
    if (!found.length) list.appendChild(h('li', { class: 'muted small', text: all.length ? 'Nenhuma barraca encontrada.' : 'Ainda não há barracas. Use a ferramenta Barraca (B).' }));

    // realce no mapa enquanto busca
    var ids = q ? found.map(function (s) { return s.id; }) : [];
    if (ids.join() !== e.highlight.join()) e.setHighlight(ids);

    var other = clear($('other-list'));
    var others = state.map.items.filter(function (i) { return i.type !== 'stall'; });
    others.forEach(function (it) {
      var kind = it.type === 'zone' ? 'Área' : it.type === 'line' ? 'Linha' : it.type === 'outlet' ? 'Tomada' : 'Entrada/saída';
      other.appendChild(h('li', null, [h('button', { 'aria-current': String(e.selId === it.id), on: { click: function () { selectAndCenter(it.id); } } }, [
        h('span', { class: 'txt' }, [h('strong', { text: itemTitle(it) }), h('small', { text: kind })]),
        lv[it.id] ? h('span', { class: 'flags ' + (lv[it.id] === 'error' ? 'flag-err' : 'flag-warn'), text: '⚠' }) : null
      ])]));
    });
    if (!others.length) other.appendChild(h('li', { class: 'muted small', text: 'Nenhum ainda.' }));
  }

  /* ---------- painel: avisos ---------- */

  function updateBadge(issues) {
    var b = $('badge-issues');
    b.hidden = !issues.length; b.textContent = issues.length;
    b.classList.toggle('err', issues.some(function (i) { return i.level === 'error'; }));
  }

  function renderIssues() {
    var pane = clear($('pane-issues')), e = state.editor; if (!e || !state.map) return;
    var issues = e.issues, stalls = state.map.items.filter(function (i) { return i.type === 'stall'; }).length;
    updateBadge(issues);
    if (!issues.length) {
      pane.appendChild(h('div', { class: 'ok-box' }, [
        (function () { var s = svgIcon('M5 12.5l4.5 4.5L19 7.5'); return s; })(),
        h('p', { text: stalls ? 'Tudo certo por aqui.' : 'Nenhum aviso por enquanto.' }),
        h('p', { class: 'muted small', text: stalls ? 'Não há barracas sobrepostas, passagens estreitas, tomadas longe ou entradas bloqueadas.' : 'Adicione barracas, tomadas e entradas para o aplicativo conferir o espaço.' })
      ]));
    } else {
      var errs = issues.filter(function (i) { return i.level === 'error'; }).length;
      pane.appendChild(h('p', { class: 'count-line', text: errs + (errs === 1 ? ' problema' : ' problemas') + ' · ' + (issues.length - errs) + (issues.length - errs === 1 ? ' atenção' : ' atenções') }));
      var ul = h('ul', { class: 'list' });
      issues.forEach(function (i) {
        ul.appendChild(h('li', null, [h('button', { class: 'issue', on: { click: function () { selectAndCenter(i.ids[0]); } } }, [
          h('span', { class: 'sev ' + i.level, text: i.level === 'error' ? '!' : '?' }),
          h('span', { class: 'txt', style: 'white-space:normal' }, [h('strong', { style: 'white-space:normal', text: i.message })])
        ])]));
      });
      pane.appendChild(ul);
    }
    if (!state.readOnly) {
      pane.appendChild(h('p', { class: 'muted small', style: 'margin-top:14px' }, [
        'Os limites usados (passagem mínima, distância até a tomada, espaço livre nas entradas) ficam na aba ',
        h('a', { href: '#', text: 'Mapa', on: { click: function (ev) { ev.preventDefault(); showTab('map'); } } }), '.'
      ]));
    }
  }

  /* ---------- painel: mapa ---------- */

  function renderMapStats() {
    var box = $('map-stats'); if (!box || !state.map) return;
    clear(box);
    var m = state.map, stalls = m.items.filter(function (i) { return i.type === 'stall'; });
    var area = stalls.reduce(function (a, s) { return a + s.w * s.h; }, 0);
    var pct = (area / (m.width * m.height)) * 100;
    [[stalls.length, 'barracas'], [r2(area).toLocaleString('pt-BR'), 'm² em barracas'], [r2(pct).toLocaleString('pt-BR') + '%', 'do espaço']].forEach(function (s) {
      box.appendChild(h('div', { class: 'stat' }, [h('strong', { text: String(s[0]) }), h('span', { text: s[1] })]));
    });
  }

  function renderMapPane() {
    var pane = clear($('pane-map')), e = state.editor, m = state.map;
    if (!m || state.readOnly) return;
    var ratio = m.width / m.height;

    pane.appendChild(h('div', { id: 'map-stats', class: 'stats' }));
    pane.appendChild(h('h3', { text: 'Tamanho do local' }));

    function numField(label, value, min, step, onInput, id) {
      var i = h('input', { type: 'number', min: min, step: step, inputmode: 'decimal', id: id }); i.value = value;
      i.addEventListener('input', function () { var v = parseFloat(String(i.value).replace(',', '.')); if (isFinite(v) && v >= min) onInput(v); });
      return h('label', { class: 'field' }, [h('span', { text: label }), i]);
    }
    pane.appendChild(h('div', { class: 'row2' }, [
      numField('Largura (m)', m.width, 1, 0.5, function (v) {
        var p = { width: v };
        if (m.bg) { p.height = r2(v / ratio); $('map-h').value = p.height; }
        e.setMapInfo(p); e.fit();
      }, 'map-w'),
      numField('Comprimento (m)', m.height, 1, 0.5, function (v) {
        var p = { height: v };
        if (m.bg) { p.width = r2(v * ratio); $('map-w').value = p.width; }
        e.setMapInfo(p); e.fit();
      }, 'map-h')
    ]));
    if (m.bg) pane.appendChild(h('p', { class: 'muted small', text: 'Com foto de fundo, a proporção é mantida.' }));

    pane.appendChild(h('h3', { text: 'Foto de fundo' }));
    var file = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Escolher foto de fundo' });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; file.value = ''; if (!f) return;
      readPhoto(f).then(function (p) {
        e.setMapInfo({ height: r2(m.width / p.ratio) }); e.setBackground(p.dataUrl); e.fit();
        toast('Foto aplicada. Confira se a largura corresponde ao tamanho real do local.', 'ok'); renderMapPane();
      }).catch(function (er) { toast(er.message, 'error'); });
    });
    pane.appendChild(h('div', { class: 'item-actions' }, [
      h('button', { class: 'btn small', on: { click: function () { file.click(); } } }, [m.bg ? 'Trocar foto' : 'Adicionar foto']),
      m.bg ? h('button', { class: 'btn small', on: { click: function () { e.setBackground(null); renderMapPane(); } } }, ['Remover foto']) : null,
      file
    ]));

    pane.appendChild(h('h3', { text: 'Grade e encaixe' }));
    pane.appendChild(fSelect('Passo da grade', String(m.settings.grid), [['0.1', '10 cm'], ['0.25', '25 cm'], ['0.5', '50 cm'], ['1', '1 m']], function (v) { e.setSettings({ grid: parseFloat(v) }); }));
    pane.appendChild(fCheck('Encaixar na grade ao mover e desenhar', m.settings.snap, function (v) { e.setSettings({ snap: v }); }));
    pane.appendChild(fCheck('Mostrar a grade', m.settings.showGrid, function (v) { e.setSettings({ showGrid: v }); $('btn-grid').setAttribute('aria-pressed', String(v)); }));

    pane.appendChild(h('h3', { text: 'Limites dos avisos' }));
    pane.appendChild(numField('Passagem mínima entre barracas e nos corredores (m)', m.settings.minAisle, 0, 0.1, function (v) { e.setSettings({ minAisle: v }); }));
    pane.appendChild(numField('Distância máxima de uma barraca até a tomada (m)', m.settings.maxOutletDist, 0, 0.5, function (v) { e.setSettings({ maxOutletDist: v }); }));
    pane.appendChild(numField('Espaço livre mínimo em entradas e saídas (m)', m.settings.gateClearance, 0, 0.1, function (v) { e.setSettings({ gateClearance: v }); }));

    pane.appendChild(h('h3', { text: 'Este mapa' }));
    pane.appendChild(h('div', { class: 'item-actions' }, [
      h('button', { class: 'btn small', on: { click: function () {
        doSave();
        askText({ title: 'Duplicar mapa', label: 'Nome da nova feira', value: m.name + ' (cópia)', ok: 'Duplicar' }).then(function (name) {
          if (!name) return;
          var c = S.duplicate(m.id, name);
          if (!c) return toast('Não foi possível duplicar (sem espaço no navegador?).', 'error');
          toast('Mapa duplicado.', 'ok'); go('#/mapa/' + c.id);
        });
      } } }, ['Duplicar para uma nova feira']),
      h('button', { class: 'btn small danger', on: { click: function () {
        if (confirm('Excluir o mapa "' + m.name + '"? Isso não pode ser desfeito.')) { clearTimeout(state.saveTimer); state.saveTimer = 0; S.remove(m.id); go('#/'); }
      } } }, ['Excluir mapa'])
    ]));
    renderMapStats();
  }

  /* ---------- início ---------- */

  function init() {
    initNewDialog();
    $('share-copy').addEventListener('click', copyShare);
    // fecha diálogos ao clicar fora
    Array.prototype.forEach.call(document.querySelectorAll('dialog'), function (d) {
      d.addEventListener('click', function (ev) { if (ev.target === d) d.close('cancel'); });
    });
    window.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
