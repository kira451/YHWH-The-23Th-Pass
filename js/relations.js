/* 人物关系图：以一位人物为中心展开有向关系。箭头由 A 指向 B，读作“A 是 / 对 B 的……”。
   可拖动节点；点击外圈人物切换中心；点击中心人物进入其档案。 */
(function () {
  var dataEl = document.getElementById('rel-data');
  var host = document.getElementById('rel-graph');
  if (!dataEl || !host) return;
  var D = JSON.parse(dataEl.textContent);
  var NODES = D.nodes, OUT = {}, IN = {};
  D.edges.forEach(function (e) {
    (OUT[e[0]] = OUT[e[0]] || {})[e[1]] = e[2];
    (IN[e[1]] = IN[e[1]] || {})[e[0]] = e[2];
  });
  var DEFAULT = D['default'];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var svg = el('svg', { 'class': 'rel-svg', role: 'img' }, host);
  var gEdges = el('g', {}, svg), gLabels = el('g', {}, svg), gNodes = el('g', {}, svg);
  var panel = document.getElementById('rel-panel');
  var picker = document.getElementById('rel-picker');
  var W = 800, H = 680, items = [], centerId = null, raf = null, drag = null, pendingFrom = null, focusId = null, pinned = false;

  function resolve(h) {
    h = decodeURIComponent(h || '');
    if (NODES[h]) return h;
    if (D.slugs[h]) return D.slugs[h];
    return DEFAULT;
  }
  function neighbors(id) {
    var seen = {}, list = [];
    Object.keys(OUT[id] || {}).forEach(function (b) { seen[b] = 1; list.push(b); });
    Object.keys(IN[id] || {}).forEach(function (b) { if (!seen[b]) list.push(b); });
    return list;
  }
  // 画布铺满整个页面宽度、不加边框；桌面端关系面板浮在右侧，圆心随之左移
  var PANEL_W = 0;
  function size() {
    W = Math.max(320, host.clientWidth);
    PANEL_W = (panel && getComputedStyle(panel).position === 'absolute') ? panel.offsetWidth + 40 : 0;
    var n = centerId ? neighbors(centerId).length : 12;
    var avail = W - PANEL_W;
    if (W < 640) H = Math.round(W * (n > 18 ? 1.25 : n > 10 ? 1.15 : 1.05));
    else H = Math.round(Math.max(Math.min(avail * 0.9, window.innerHeight * 0.92), n > 18 ? 860 : 700));
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
  }
  function CX() { return (W - PANEL_W) / 2; }
  // 圆形布局：横纵半径取同一值
  function radii() {
    var mob = W < 640;
    var r = Math.min((W - PANEL_W) / 2 - (mob ? 48 : 70), H / 2 - (mob ? 50 : 60));
    return { rx: r, ry: r };
  }

  function build(id, fromPos) {
    centerId = id;
    size();
    var nbrs = neighbors(id);
    gEdges.innerHTML = ''; gLabels.innerHTML = ''; gNodes.innerHTML = '';
    items = [];
    var cx = CX(), cy = H / 2, RR = radii(), dense = nbrs.length > 14, twoRing = nbrs.length > 18;
    focusId = null; pinned = false; svg.classList.remove('has-focus');
    items.push(mk(id, true, fromPos ? fromPos.x : cx, fromPos ? fromPos.y : cy, dense));
    nbrs.forEach(function (b, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, nbrs.length);
      var s0 = reduce ? 1 : 0.35;
      var it = mk(b, false, cx + Math.cos(a) * RR.rx * s0, cy + Math.sin(a) * RR.ry * s0, dense);
      it.ang = a; it.ring = twoRing && i % 2 ? 0.66 : 1; it.links = [];
      var outL = (OUT[id] || {})[b], inL = (IN[id] || {})[b], both = outL && inL;
      if (outL) it.links.push(mkLink(it, true, outL, both ? 1 : 0, i));
      if (inL) it.links.push(mkLink(it, false, inL, both ? -1 : 0, i));
      items.push(it);
    });
    svg.setAttribute('aria-label', NODES[id].name + '的人物关系图，共 ' + nbrs.length + ' 位相关人物');
    renderPanel();
    if (picker) Array.prototype.forEach.call(picker.querySelectorAll('[data-id]'), function (b) {
      var on = b.getAttribute('data-id') === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && b.offsetParent === picker && (b.offsetTop < picker.scrollTop || b.offsetTop + b.offsetHeight > picker.scrollTop + picker.clientHeight))
        picker.scrollTop = b.offsetTop - picker.clientHeight / 2;
    });
    if (reduce) { for (var k = 0; k < 400; k++) step(); draw(); } else kick();
  }

  function mkLink(it, outward, label, side, i) {
    var col = outward ? NODES[it.id].color : NODES[centerId].color;
    var L = { outward: outward, side: side, t: side ? (outward ? 0.76 : 0.5) : (i % 2 ? 0.6 : 0.74) };
    L.path = el('path', { 'class': 'rel-line' + (outward ? '' : ' is-in'), stroke: col, fill: 'none' }, gEdges);
    L.head = el('path', { 'class': 'rel-head', fill: col }, gEdges);
    var lg = el('g', { 'class': 'rel-label' + (outward ? '' : ' is-in') }, gLabels);
    var tw = 0;
    for (var k = 0; k < label.length; k++) tw += label.charCodeAt(k) > 255 ? 12 : 6.6;
    L.pill = el('rect', { 'class': 'rel-pill', x: -(tw / 2 + 6), y: -10, width: tw + 12, height: 20, rx: 10 }, lg);
    L.text = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, lg);
    L.text.textContent = label;
    L.g = lg; L.id = it.id; L.off = null;
    if (!outward && W < 640 && neighbors(centerId).length > 10) lg.classList.add('is-hidden');
    lg.addEventListener('pointerdown', function (ev) { dragLabel(ev, L); });
    lg.addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse' && !pinned && !drag) setFocus(L.id, lg); });
    lg.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse' && !pinned) setFocus(null); });
    return L;
  }

  function mk(id, isCenter, x, y, dense) {
    var n = NODES[id], mob = W < 640;
    var g = el('g', { 'class': 'rel-node' + (isCenter ? ' is-center' : '') + (n.href ? '' : ' no-page'), tabindex: '0', role: 'button' }, gNodes);
    var r = isCenter ? (mob ? 36 : 44) : (mob ? (dense ? 19 : 24) : (dense ? 25 : 30));
    el('circle', { r: r + 6, 'class': 'rel-halo', stroke: n.color }, g);
    el('circle', { r: r, 'class': 'rel-disc', stroke: n.color }, g);
    var gl = el('text', { 'class': 'rel-glyph', 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: n.color, 'font-size': Math.round(r * 0.8) }, g);
    gl.textContent = n.glyph || n.name.charAt(0);
    var nm = el('text', { 'class': 'rel-name', 'text-anchor': 'middle', y: r + 16 }, g);
    nm.textContent = n.name;
    g.setAttribute('aria-label', isCenter ? (n.name + '（当前中心）' + (n.href ? '，按回车查看人物档案' : '')) : ('切换到' + n.name + '的关系图'));
    var it = { id: id, g: g, x: x, y: y, vx: 0, vy: 0, r: r, center: isCenter };
    g.addEventListener('pointerdown', function (ev) { startDrag(ev, it); });
    g.addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse' && !pinned && !drag) setFocus(isCenter ? null : id, g); });
    g.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse' && !pinned && !drag) setFocus(null); });
    g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(it); } });
    return it;
  }

  function step() {
    var cx = CX(), cy = H / 2, c = items[0], RR = radii();
    for (var i = 0; i < items.length; i++) {
      var a = items[i];
      if (a === drag) continue;
      var fx = 0, fy = 0;
      if (a.center) { fx += (cx - a.x) * 0.02; fy += (cy - a.y) * 0.02; }
      else {
        var tx = c.x + Math.cos(a.ang) * RR.rx * a.ring, ty = c.y + Math.sin(a.ang) * RR.ry * a.ring;
        fx += (tx - a.x) * 0.045; fy += (ty - a.y) * 0.045;
      }
      for (var j = 0; j < items.length; j++) {
        if (i === j) continue;
        var b = items[j], ex = a.x - b.x, ey = a.y - b.y, dd = ex * ex + ey * ey;
        if (dd < 1) { ex = Math.random() - 0.5; ey = Math.random() - 0.5; dd = 1; }
        var minD = a.r + b.r + 22, dl = Math.sqrt(dd);
        if (dl < minD) { var rf = (minD - dl) * 0.25; fx += ex / dl * rf; fy += ey / dl * rf; }
      }
      a.vx = (a.vx + fx) * 0.82; a.vy = (a.vy + fy) * 0.82;
      a.x += a.vx; a.y += a.vy;
      var m = a.r + 6;
      a.x = Math.max(m, Math.min(W - m, a.x)); a.y = Math.max(m, Math.min(H - m - 18, a.y));
    }
  }

  function unit(x, y) { var d = Math.sqrt(x * x + y * y) || 1; return [x / d, y / d]; }

  function draw() {
    var c = items[0];
    items.forEach(function (it) {
      it.g.setAttribute('transform', 'translate(' + it.x.toFixed(1) + ',' + it.y.toFixed(1) + ')');
      if (!it.links) return;
      var u = unit(it.x - c.x, it.y - c.y), p = [-u[1], u[0]];
      it.links.forEach(function (L) {
        var from = L.outward ? c : it, to = L.outward ? it : c;
        var off = L.side * 20;
        var mx = (c.x + it.x) / 2 + p[0] * off, my = (c.y + it.y) / 2 + p[1] * off;
        L.bx = mx; L.by = my;
        if (L.off) { mx += L.off.x; my += L.off.y; }
        var s0 = unit(mx - from.x, my - from.y), e0 = unit(to.x - mx, to.y - my);
        var sx = from.x + s0[0] * (from.r + 2), sy = from.y + s0[1] * (from.r + 2);
        var ex = to.x - e0[0] * (to.r + 3), ey = to.y - e0[1] * (to.r + 3);
        var qx = 2 * mx - (sx + ex) / 2, qy = 2 * my - (sy + ey) / 2;
        L.path.setAttribute('d', 'M' + sx.toFixed(1) + ',' + sy.toFixed(1) + ' Q' + qx.toFixed(1) + ',' + qy.toFixed(1) + ' ' + ex.toFixed(1) + ',' + ey.toFixed(1));
        var hd = unit(ex - qx, ey - qy), hp = [-hd[1], hd[0]], hl = 9, hw = 4.5;
        var bx = ex - hd[0] * hl, by = ey - hd[1] * hl;
        L.head.setAttribute('d', 'M' + ex.toFixed(1) + ',' + ey.toFixed(1) + ' L' + (bx + hp[0] * hw).toFixed(1) + ',' + (by + hp[1] * hw).toFixed(1) + ' L' + (bx - hp[0] * hw).toFixed(1) + ',' + (by - hp[1] * hw).toFixed(1) + 'Z');
        var t = L.off ? 0.5 : (L.outward ? L.t : 1 - L.t);
        var lx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * qx + t * t * ex;
        var ly = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * qy + t * t * ey;
        L.g.setAttribute('transform', 'translate(' + lx.toFixed(1) + ',' + ly.toFixed(1) + ')');
      });
    });
  }

  function energy() { var e = 0; items.forEach(function (it) { e += it.vx * it.vx + it.vy * it.vy; }); return e; }
  function kick() {
    if (raf) return;
    var frames = 0;
    (function loop() {
      step(); draw(); frames++;
      if (drag || (energy() > 0.02 && frames < 900)) raf = requestAnimationFrame(loop);
      else raf = null;
    })();
  }

  function pt(ev) {
    var r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
  }
  function startDrag(ev, it) {
    ev.preventDefault();
    var p0 = pt(ev), moved = false, ox = it.x - p0.x, oy = it.y - p0.y;
    drag = it; it.g.classList.add('dragging');
    try { it.g.setPointerCapture(ev.pointerId); } catch (e) {}
    function mv(e) {
      var p = pt(e);
      if (Math.abs(p.x - p0.x) + Math.abs(p.y - p0.y) > 5) moved = true;
      it.x = p.x + ox; it.y = p.y + oy; it.vx = it.vy = 0;
      if (!reduce) kick(); else draw();
    }
    function up() {
      it.g.removeEventListener('pointermove', mv);
      it.g.removeEventListener('pointerup', up);
      it.g.removeEventListener('pointercancel', up);
      it.g.classList.remove('dragging');
      drag = null;
      if (moved && !it.center) {
        var c = items[0], RR = radii();
        it.ang = Math.atan2((it.y - c.y) / RR.ry, (it.x - c.x) / RR.rx);
        var d = Math.sqrt(Math.pow((it.x - c.x) / RR.rx, 2) + Math.pow((it.y - c.y) / RR.ry, 2));
        it.ring = Math.max(0.45, Math.min(1, d));
      }
      if (!moved) activate(it); else if (!reduce) kick();
    }
    it.g.addEventListener('pointermove', mv);
    it.g.addEventListener('pointerup', up);
    it.g.addEventListener('pointercancel', up);
  }


  // 高亮：只突出与某位人物相连的线与标签，其余淡出
  // src：触发高亮的元素本身。悬停中的元素不能被移动 DOM 位置，否则浏览器会丢失它的悬停状态，移开后不再触发 pointerleave
  function setFocus(id, src) {
    focusId = id;
    svg.classList.toggle('has-focus', !!id);
    items.forEach(function (it) {
      it.g.classList.toggle('is-hot', !!id && (it.id === id || it.center));
      if (!it.links) return;
      it.links.forEach(function (L) {
        var on = !!id && L.id === id;
        L.path.classList.toggle('is-hot', on); L.head.classList.toggle('is-hot', on); L.g.classList.toggle('is-hot', on);
        if (on && L.g !== src) gLabels.appendChild(L.g);
      });
    });
    if (panel) Array.prototype.forEach.call(panel.querySelectorAll('[data-go]'), function (b) {
      b.classList.toggle('is-hot', !!id && b.getAttribute('data-go') === id);
    });
    if (id) { var t = null; items.forEach(function (it) { if (it.id === id) t = it; }); if (t && t.g !== src) gNodes.appendChild(t.g); }
  }
  // 拖动关系标签：把这条连线单独拉开；轻点则固定 / 取消高亮
  function dragLabel(ev, L) {
    ev.preventDefault(); ev.stopPropagation();
    var p0 = pt(ev), moved = false, g = L.g;
    try { g.setPointerCapture(ev.pointerId); } catch (e) {}
    g.classList.add('dragging');
    function mv(e) {
      var p = pt(e);
      if (!moved && Math.abs(p.x - p0.x) + Math.abs(p.y - p0.y) > 4) { moved = true; pinned = true; setFocus(L.id); }
      if (moved) { L.off = { x: p.x - L.bx, y: p.y - L.by }; draw(); }
    }
    function up() {
      g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
      g.classList.remove('dragging');
      if (!moved) { if (pinned && focusId === L.id) { pinned = false; setFocus(null); } else { pinned = true; setFocus(L.id); } }
    }
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  }
  svg.addEventListener('pointerdown', function (ev) {
    if (ev.target === svg && pinned) { pinned = false; setFocus(null); }
  });
  // 兜底：鼠标移到空白处时，若未固定高亮，则恢复全亮
  svg.addEventListener('pointermove', function (ev) {
    if (ev.pointerType === 'mouse' && !pinned && !drag && focusId && ev.target === svg) setFocus(null);
  });
  svg.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse' && !pinned && !drag && focusId) setFocus(null); });
  function resetLines() {
    items.forEach(function (it) { (it.links || []).forEach(function (L) { L.off = null; }); });
    pinned = false; setFocus(null); draw();
  }

  function activate(it) {
    if (it.center) { var n = NODES[it.id]; if (n.href) { var to = new URL(n.href, location.href).href; if (window.yhwhGo) window.yhwhGo(to); else location.href = to; } return; }
    go(it.id, { x: it.x, y: it.y });
  }
  function go(id, from) {
    pendingFrom = from || null;
    if (resolve(location.hash.slice(1)) === id && location.hash) { build(id, pendingFrom); pendingFrom = null; }
    else location.hash = encodeURIComponent(id);
  }

  function renderPanel() {
    if (!panel) return;
    var n = NODES[centerId], nb = neighbors(centerId);
    var h = '<div class="rel-panel-head"><span class="rel-panel-glyph" style="color:' + n.color + '">' + esc(n.glyph || n.name.charAt(0)) + '</span>' +
      '<div><h3>' + esc(n.full || n.name) + '</h3>' + (n.sub ? '<p class="rel-panel-sub">' + esc(n.sub) + '</p>' : '') + '</div></div>';
    if (n.alias && n.alias.length) h += '<p class="rel-panel-alias"><b>同一人</b>' + n.alias.map(esc).join('、') + '</p>';
    if (n.lede) h += '<p class="rel-panel-lede">' + esc(n.lede) + '</p>';
    if (n.href) h += '<p><a class="rel-panel-link" href="' + n.href + '">查看人物档案 →</a></p>';
    h += '<h4>关系一览（' + nb.length + '）</h4><ul class="rel-list">';
    nb.forEach(function (b) {
      var m = NODES[b], o = (OUT[centerId] || {})[b], i = (IN[centerId] || {})[b];
      h += '<li><button type="button" data-go="' + esc(b) + '"><span class="rel-dot" style="background:' + m.color + '"></span>' +
        '<span class="rel-li-name">' + esc(m.name) + '</span><span class="rel-li-labels">' +
        (o ? '<span>→ ' + esc(o) + '</span>' : '') + (i ? '<span class="is-in">← ' + esc(i) + '</span>' : '') +
        '</span></button></li>';
    });
    panel.innerHTML = h + '</ul><p class="rel-legend">→ ' + esc(n.name) + ' 是 / 对 对方的……<br>← 对方 是 / 对 ' + esc(n.name) + ' 的……</p>' +
      '<p class="rel-legend">悬停或轻点关系标签，可单独高亮这条连线；按住标签拖动，可把重叠的连线拉开。</p>' +
      '<button type="button" class="rel-reset" data-reset>连线复位</button>';
  }
  if (panel) {
    panel.addEventListener('mouseover', function (e) { var b = e.target.closest('[data-go]'); if (b && !pinned) setFocus(b.getAttribute('data-go')); });
    panel.addEventListener('mouseleave', function () { if (!pinned) setFocus(null); });
  }
  if (panel) panel.addEventListener('click', function (e) {
    if (e.target.closest('[data-reset]')) { resetLines(); return; }
    var b = e.target.closest('[data-go]');
    if (b) { go(b.getAttribute('data-go')); host.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' }); }
  });
  if (picker) picker.addEventListener('click', function (e) {
    var b = e.target.closest('[data-id]');
    if (!b) return;
    go(b.getAttribute('data-id'));
    host.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  });

  // 站内无刷新跳转后本页会被替换：页面已不在文档中时，自动解除这两个全局监听
  function gone() {
    if (document.body.contains(host)) return false;
    window.removeEventListener('hashchange', onHash);
    window.removeEventListener('resize', onResize);
    return true;
  }
  function onHash() { if (gone()) return; build(resolve(location.hash.slice(1)), pendingFrom); pendingFrom = null; }
  var rt;
  function onResize() {
    if (gone()) return;
    clearTimeout(rt);
    rt = setTimeout(function () { if (Math.abs(host.clientWidth - W) > 20) build(centerId); }, 150);
  }
  window.addEventListener('hashchange', onHash);
  window.addEventListener('resize', onResize);

  build(resolve(location.hash.slice(1)));
})();
