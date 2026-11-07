// 角色筛选搜索（对页面里所有 data-filter-item 生效，包含主卡片网格和按势力
// 分组的简介列表）。支持三个维度同时叠加：搜索文字、势力（data-filter-chip /
// data-group）、种族（data-filter-species-chip / data-species）。
// data-group、data-species 都允许写多个值（空格分隔），用于身份跨越多个分类
// 的角色（比如芙洛拉同时属于"个人势力"与"主角人物"）。
// 每个 data-group-wrapper 分组在筛选后若内部条目全部隐藏，会连标题一起隐藏，
// 不会留下空分组。
//
// 筛选状态与滚动位置会存进 sessionStorage：从人物卡片进入详情页、再点“后退”
// 回到本页时，会先恢复上次选中的势力/种族/搜索词并重新应用筛选，再恢复滚动
// 位置，避免出现筛选被重置、页面跳到底部等问题。
// 只在本页确实有筛选控件时才接管滚动恢复（脚本在 body 末尾同步执行，此时
// 前面的 DOM 已解析完毕，可以直接查询），避免影响其他页面原生的前进/后退
// 滚动行为。
if (window.history && "scrollRestoration" in window.history && document.querySelector("[data-filter-item]")) {
  window.history.scrollRestoration = "manual";
}

// ---------------------------------------------------------------------------
// 页面生命周期：各模块注册的监听与装饰都登记在 PAGE_CLEANUPS 里，便于整体拆除重建。
// ---------------------------------------------------------------------------
var PAGE_CLEANUPS = [];
// 站点根目录的绝对地址，在首次加载时算好：无刷新跳转改变了地址栏路径后，
// 相对路径（以及 link.href 的解析结果）都会随之改变。
var SITE_BASE = (function () {
  var css = document.querySelector('link[href$="css/style.css"]');
  return css ? css.href.replace(/css\/style\.css.*$/, "") : "";
})();
function onPage(target, ev, fn, opts) {
  target.addEventListener(ev, fn, opts);
  PAGE_CLEANUPS.push(function () { target.removeEventListener(ev, fn, opts); });
}
function teardownPage() {
  var list = PAGE_CLEANUPS; PAGE_CLEANUPS = [];
  list.forEach(function (f) { try { f(); } catch (e) {} });
}
function pageTheme() {
  var m = document.body && document.body.className.match(/theme-([a-z]+)/);
  return m ? m[1] : "cosmos";
}
function initPage() {
  initFilter();
  buildSideToc();
  initAmbient();
}
document.addEventListener("DOMContentLoaded", initPage);

function initFilter() {
  var input = document.querySelector("[data-filter-input]");
  var factionChips = Array.prototype.slice.call(document.querySelectorAll("[data-filter-chip]"));
  var speciesChips = Array.prototype.slice.call(document.querySelectorAll("[data-filter-species-chip]"));
  var items = Array.prototype.slice.call(document.querySelectorAll("[data-filter-item]"));
  var groups = Array.prototype.slice.call(document.querySelectorAll("[data-group-wrapper]"));

  if (items.length) {
    var storageKey = "yhwh-filter-state:" + location.pathname;
    var currentQuery = "";
    var currentFaction = "all";
    var currentSpecies = "all";

    var tokens = function (value) {
      return (value || "").split(/\s+/).filter(Boolean);
    };

    var readState = function () {
      try {
        var raw = sessionStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    };

    var saveState = function (extra) {
      try {
        var state = readState() || {};
        state.query = currentQuery;
        state.faction = currentFaction;
        state.species = currentSpecies;
        if (extra) {
          for (var key in extra) state[key] = extra[key];
        }
        sessionStorage.setItem(storageKey, JSON.stringify(state));
      } catch (e) {
        // sessionStorage 不可用（隐私模式等）时静默忽略，仅退化为不记忆状态
      }
    };

    var syncGroups = function () {
      groups.forEach(function (group) {
        var anyVisible = Array.prototype.slice
          .call(group.querySelectorAll("[data-filter-item]"))
          .some(function (item) { return item.style.display !== "none"; });
        group.style.display = anyVisible ? "" : "none";
      });
    };

    var applyFilter = function () {
      items.forEach(function (item) {
        var matchesFaction = currentFaction === "all" || tokens(item.getAttribute("data-group")).indexOf(currentFaction) !== -1;
        var matchesSpecies = currentSpecies === "all" || tokens(item.getAttribute("data-species")).indexOf(currentSpecies) !== -1;
        var matchesQuery = !currentQuery || item.textContent.toLowerCase().indexOf(currentQuery) !== -1;
        item.style.display = matchesFaction && matchesSpecies && matchesQuery ? "" : "none";
      });
      syncGroups();
    };

    if (input) {
      input.addEventListener("input", function () {
        currentQuery = input.value.trim().toLowerCase();
        applyFilter();
        saveState();
      });
    }

    if (factionChips.length) {
      factionChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          factionChips.forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          currentFaction = chip.getAttribute("data-filter-chip");
          applyFilter();
          saveState();
        });
      });
    }

    if (speciesChips.length) {
      speciesChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          speciesChips.forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          currentSpecies = chip.getAttribute("data-filter-species-chip");
          applyFilter();
          saveState();
        });
      });
    }

    // 恢复上次离开时的筛选状态（势力 / 种族 / 搜索词），再重新应用一次筛选。
    var saved = readState();
    if (saved) {
      if (saved.query) {
        currentQuery = saved.query;
        if (input) input.value = saved.query;
      }
      if (saved.faction && saved.faction !== "all") {
        currentFaction = saved.faction;
        factionChips.forEach(function (c) {
          c.classList.toggle("active", c.getAttribute("data-filter-chip") === saved.faction);
        });
      }
      if (saved.species && saved.species !== "all") {
        currentSpecies = saved.species;
        speciesChips.forEach(function (c) {
          c.classList.toggle("active", c.getAttribute("data-filter-species-chip") === saved.species);
        });
      }
      applyFilter();
    }

    // 离开页面前记录滚动位置，保存点击的是筛选后的布局下的偏移量。
    var remember = function () { saveState({ scrollY: window.scrollY }); };
    onPage(window, "pagehide", remember);
    onPage(window, "beforeunload", remember);
    PAGE_CLEANUPS.push(remember); // 站内无刷新跳转离开本页时同样记住

    // 筛选（若有）应用完毕、布局稳定后，再恢复滚动位置，避免因为筛选导致
    // 页面变矮/变高而跳到错误的位置。
    if (saved && typeof saved.scrollY === "number") {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          window.scrollTo(0, saved.scrollY);
        });
      });
    }
  }

}

// 悬浮侧边目录：根据页面里带 id 的 section/article/标题 自动生成跳转列表，
// 方便滚动到页面中段时也能快速跳到别的章节，不用滚回顶部。
function buildSideToc() {
  var targets = Array.prototype.slice.call(
    document.querySelectorAll("main section[id], main article[id], main h2[id], main h3[id], main h4[id]")
  );

  var items = targets
    .map(function (el) {
      var tag = el.tagName.toLowerCase();
      var heading, level;
      if (tag === "section") {
        heading = el.querySelector("h1,h2,h3,h4");
        level = 1;
      } else if (tag === "article") {
        heading = el.querySelector("h1,h2,h3,h4");
        level = 2;
      } else {
        heading = el;
        level = tag === "h2" ? 1 : 2;
      }
      if (!heading) return null;
      var clone = heading.cloneNode(true);
      var rune = clone.querySelector(".rune");
      if (rune) rune.remove();
      return { id: el.id, label: clone.textContent.trim(), level: level };
    })
    .filter(Boolean);

  if (items.length < 3) return; // 内容太短的页面不需要悬浮目录

  var fab = document.createElement("button");
  fab.type = "button";
  fab.className = "toc-fab";
  fab.setAttribute("aria-label", "打开本页目录");
  fab.textContent = "☰";

  var panel = document.createElement("nav");
  panel.className = "side-toc";
  panel.setAttribute("aria-label", "本页目录");

  var title = document.createElement("div");
  title.className = "side-toc-title";
  title.textContent = "本页目录";
  panel.appendChild(title);

  var ul = document.createElement("ul");
  items.forEach(function (item) {
    var li = document.createElement("li");
    if (item.level === 2) li.className = "toc-sub";
    var a = document.createElement("a");
    a.href = "#" + item.id;
    a.textContent = item.label;
    a.dataset.tocTarget = item.id;
    li.appendChild(a);
    ul.appendChild(li);
  });
  panel.appendChild(ul);

  document.body.appendChild(panel);
  document.body.appendChild(fab);
  PAGE_CLEANUPS.push(function () { panel.remove(); fab.remove(); });

  fab.addEventListener("click", function () {
    panel.classList.toggle("open");
  });

  onPage(document, "click", function (e) {
    if (panel.classList.contains("open") && !panel.contains(e.target) && e.target !== fab) {
      panel.classList.remove("open");
    }
  });

  var links = Array.prototype.slice.call(panel.querySelectorAll("a"));
  links.forEach(function (a) {
    a.addEventListener("click", function () {
      panel.classList.remove("open");
    });
  });

  var linkMap = {};
  links.forEach(function (a) {
    linkMap[a.dataset.tocTarget] = a;
  });

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = linkMap[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            links.forEach(function (a) { a.classList.remove("active"); });
            link.classList.add("active");
          }
        });
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    targets.forEach(function (el) { observer.observe(el); });
    PAGE_CLEANUPS.push(function () { observer.disconnect(); });
  }
}

// ---------------------------------------------------------------------------
// 两侧氛围层：按页面主题（body.theme-*）生成侧边装饰条与飘落粒子。
// 装饰条随滚动产生视差；粒子主要分布在正文两侧的留白处，滚动时会被“风”带动。
// 系统开启“减少动态效果”时，只保留静态装饰条，不绘制粒子。
// ---------------------------------------------------------------------------
function initAmbient() {
  var body = document.body;
  if (!body) return;
  var theme = pageTheme();
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var base = SITE_BASE;

  // 侧边装饰条
  var decos = ["left", "right"].map(function (side) {
    var d = document.createElement("div");
    d.className = "side-deco " + side;
    d.setAttribute("aria-hidden", "true");
    d.style.backgroundImage = "url(" + base + "images/deco/" + theme + ".svg)";
    body.insertBefore(d, body.firstChild);
    PAGE_CLEANUPS.push(function () { d.remove(); });
    return d;
  });

  // 整页背景长卷：天空在上、大地在下。固定在视口里、位于正文之下，
  // 随页面滚动从上往下平移——页面顶端看到的是天上，滚到底就落到人间。
  var BACKDROPS = { beijing: 1, dahe: 1, shenluo: 1, helaisi: 1, huaxia: 1, kaimite: 1, tianzhu: 1, huanmeng: 1, xibolier: 1 };
  var bd = null;
  if (BACKDROPS[theme]) {
    bd = document.createElement("div");
    bd.className = "page-backdrop";
    bd.setAttribute("aria-hidden", "true");
    bd.style.backgroundImage = "url(" + base + "images/backdrop/" + theme + ".svg)";
    body.insertBefore(bd, body.firstChild);
    PAGE_CLEANUPS.push(function () { bd.remove(); });
  }
  function panBackdrop() {
    if (!bd) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bd.style.backgroundPosition = "center " + (p * 100).toFixed(2) + "%";
  }

  var gutter = 0;
  function measure() {
    var el = null, sels = ["main .section .detail", "main .section .intro-prose", "main .section .disclaimer-box", "main .section .wrap"];
    for (var i = 0; i < sels.length && !el; i++) el = document.querySelector(sels[i]);
    var left = el ? el.getBoundingClientRect().left : 0;
    gutter = Math.max(0, left - 12);
    var w = Math.min(340, gutter);
    decos.forEach(function (d) {
      d.style.width = w + "px";
      d.style.display = w < 90 ? "none" : "";
    });
  }
  measure();
  onPage(window, "resize", measure);

  var lastY = window.scrollY, wind = 0, scrollDelta = 0;
  function onScroll() {
    var y = window.scrollY;
    scrollDelta += y - lastY;
    lastY = y;
    decos.forEach(function (d) { d.style.backgroundPosition = "0 " + (-y * 0.35) + "px"; });
    panBackdrop();
  }
  onPage(window, "scroll", onScroll, { passive: true });
  onScroll();

  if (reduce) return;

  // 粒子
  var cfg = {
    dahe:     { n: 30, kind: "petal",  colors: ["#f9c6d6", "#f4abc3", "#fde1ea", "#f7b6ca"], size: [5, 9],   vy: [0.5, 1.1],  vx: [-0.5, 0.3], fall: 1 },
    helaisi:  { n: 18, kind: "petal",  colors: ["#ffffff", "#f6b6cb", "#fde6ee", "#9cbf5e"], size: [3.5, 6], vy: [0.4, 0.9],  vx: [-0.3, 0.5], fall: 1 },
    huaxia:   { n: 14, kind: "petal",  colors: ["#c0453a", "#d4685c", "#3a4644", "#55625e"], size: [3, 5.5], vy: [0.35, 0.8], vx: [-0.3, 0.3], fall: 1 },
    beijing:  { n: 55, kind: "snow",   colors: ["#ffffff", "#e2f5ff", "#cfeaff"],            size: [0.8, 2.6], vy: [0.3, 1.0], vx: [-0.25, 0.25], fall: 1 },
    kaimite:  { n: 45, kind: "dust",   colors: ["#f6d38a", "#e5b45c", "#ffe6b0"],            size: [0.6, 1.8], vy: [-0.1, 0.15], vx: [0.25, 0.8], fall: 0 },
    tianzhu:  { n: 24, kind: "ember",  colors: ["#ffd27a", "#f2a33a", "#ff9a5a"],            size: [1.2, 2.8], vy: [-0.7, -0.25], vx: [-0.15, 0.15], fall: -1 },
    shenluo:  { n: 26, kind: "ember",  colors: ["#e9c873", "#f6dd9a", "#ffffff"],            size: [1, 2.4],  vy: [-0.5, -0.15], vx: [-0.1, 0.1], fall: -1 },
    huanmeng: { n: 16, kind: "bubble", colors: ["#5ef2dc", "#d47cff", "#ff5cb4"],            size: [4, 12],   vy: [-0.6, -0.2], vx: [-0.2, 0.2], fall: -1 },
    xibolier: { n: 60, kind: "rain",   colors: ["#9fe9f0", "#39e0d0"],                       size: [10, 22],  vy: [9, 14],     vx: [-0.6, -0.3], fall: 1 },
    astral:   { n: 50, kind: "star",   colors: ["#ffffff", "#bcd0ff", "#9fb8ff"],            size: [0.6, 1.9], vy: [0, 0],     vx: [0, 0],      fall: 0 },
    chronicle:{ n: 40, kind: "dust",   colors: ["#b98a4a", "#8a6232", "#d8b27a"],            size: [0.6, 1.6], vy: [-0.08, 0.12], vx: [0.2, 0.6], fall: 0 },
    relic:    { n: 26, kind: "ember",  colors: ["#d6a04e", "#c0394a", "#f3d7a0"],            size: [1, 2.6],  vy: [-0.6, -0.2], vx: [-0.15, 0.15], fall: -1 },
    sephira:  { n: 26, kind: "ember",  colors: ["#7fd6c8", "#d8fff6", "#e8d9a8"],            size: [1, 2.3],  vy: [-0.45, -0.15], vx: [-0.1, 0.1], fall: -1 },
    atlas:    { n: 30, kind: "dust",   colors: ["#b9a46a", "#e9dfbf"],                       size: [0.6, 1.5], vy: [-0.05, 0.08], vx: [0.15, 0.45], fall: 0 },
    quill:    { n: 16, kind: "petal",  colors: ["#e2a8a0", "#f3d3cc", "#b58ad0"],            size: [3, 5],    vy: [0.3, 0.7],  vx: [-0.3, 0.3], fall: 1 },
    cosmos:   { n: 40, kind: "star",   colors: ["#ffffff", "#ecd08a", "#cfd6ff"],            size: [0.6, 1.8], vy: [0, 0],     vx: [0, 0],      fall: 0 }
  }[theme] || null;
  if (!cfg) return;

  var canvas = document.createElement("canvas");
  canvas.className = "ambient-canvas";
  canvas.setAttribute("aria-hidden", "true");
  body.insertBefore(canvas, body.firstChild);
  var alive = true;
  PAGE_CLEANUPS.push(function () { alive = false; canvas.remove(); });
  var ctx = canvas.getContext("2d");
  var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure();
  }
  resize();
  onPage(window, "resize", resize);

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  var wide = function () { return gutter >= 80; };

  function spawnX() {
    if (wide()) {
      var g = Math.min(gutter, 300);
      return Math.random() < 0.5 ? rnd(-10, g) : rnd(W - g, W + 10);
    }
    return rnd(0, W);
  }
  function make(initial) {
    var p = {
      x: spawnX(),
      y: initial ? rnd(0, H) : (cfg.fall > 0 ? rnd(-40, -10) : cfg.fall < 0 ? rnd(H + 10, H + 40) : rnd(0, H)),
      s: rnd(cfg.size[0], cfg.size[1]),
      vx: rnd(cfg.vx[0], cfg.vx[1]),
      vy: rnd(cfg.vy[0], cfg.vy[1]),
      rot: rnd(0, Math.PI * 2), vr: rnd(-0.03, 0.03),
      flip: rnd(0, Math.PI * 2), vf: rnd(0.02, 0.05),
      sway: rnd(0, Math.PI * 2), depth: rnd(0.4, 1),
      c: pick(cfg.colors), life: 0, a: rnd(0.45, 0.95)
    };
    if (cfg.kind === "dust" && !initial) p.x = rnd(-20, 0);
    if (!wide()) p.a *= 0.55;
    return p;
  }
  var count = wide() ? cfg.n : Math.round(cfg.n * 0.4);
  var ps = [];
  for (var i = 0; i < count; i++) ps.push(make(true));
  var shooting = null;

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.abs(Math.cos(p.flip)) * 0.8 + 0.2);
    ctx.fillStyle = p.c;
    ctx.globalAlpha = p.a;
    var s = p.s;
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.bezierCurveTo(-s * 1.1, s * 0.3, -s * 0.8, -s * 0.9, -s * 0.15, -s);
    ctx.lineTo(0, -s * 0.72);
    ctx.lineTo(s * 0.15, -s);
    ctx.bezierCurveTo(s * 0.8, -s * 0.9, s * 1.1, s * 0.3, 0, s);
    ctx.fill();
    ctx.restore();
  }
  function drawGlow(p, r) {
    var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, p.c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(p.life * 0.05 + p.sway));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = Math.min(1, p.a + 0.2);
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 0.6, 0, Math.PI * 2); ctx.fill();
  }

  var running = true;
  onPage(document, "visibilitychange", function () {
    running = !document.hidden;
    if (running) requestAnimationFrame(tick);
  });

  function tick() {
    if (!running || !alive) return;
    var d = scrollDelta; scrollDelta = 0;
    wind += d * 0.02;
    wind *= 0.93;
    if (wind > 4) wind = 4; if (wind < -4) wind = -4;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      p.life++;
      p.sway += 0.015;
      p.y += p.vy + (cfg.fall >= 0 ? Math.abs(wind) * 0.35 * p.depth : -Math.abs(wind) * 0.2 * p.depth) - d * 0.25 * p.depth;
      p.x += p.vx + Math.sin(p.sway) * (cfg.kind === "petal" ? 0.6 : 0.2) + wind * 0.25 * p.depth;
      p.rot += p.vr + wind * 0.004;
      p.flip += p.vf;
      var out = p.y > H + 50 || p.y < -60 || p.x < -60 || p.x > W + 60;
      if (out) { ps[i] = make(false); continue; }
      switch (cfg.kind) {
        case "petal": drawPetal(p); break;
        case "snow":
          ctx.globalAlpha = p.a; ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); break;
        case "dust":
          ctx.globalAlpha = p.a * 0.8; ctx.fillStyle = p.c;
          ctx.fillRect(p.x, p.y, p.s * 1.6, p.s); break;
        case "ember": drawGlow(p, p.s * 5); break;
        case "bubble":
          ctx.globalAlpha = p.a * 0.7;
          ctx.strokeStyle = "hsl(" + ((p.life * 0.6 + p.sway * 60) % 360) + ",85%,72%)";
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = p.a * 0.35; ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(p.x - p.s * 0.35, p.y - p.s * 0.35, p.s * 0.22, 0, Math.PI * 2); ctx.fill(); break;
        case "rain":
          ctx.globalAlpha = p.a * 0.45; ctx.strokeStyle = p.c; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 3, p.y - p.s); ctx.stroke(); break;
        case "star":
          ctx.globalAlpha = p.a * (0.35 + 0.65 * Math.abs(Math.sin(p.life * 0.02 + p.sway)));
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); break;
      }
    }
    if (cfg.kind === "star") {
      if (!shooting && Math.random() < 0.003 && wide()) {
        var left = Math.random() < 0.5;
        shooting = { x: left ? rnd(0, gutter * 0.6) : rnd(W - gutter, W - gutter * 0.4), y: rnd(0, H * 0.5), t: 0 };
      }
      if (shooting) {
        shooting.t++;
        var sx = shooting.x + shooting.t * 6, sy = shooting.y + shooting.t * 3;
        var grad = ctx.createLinearGradient(sx - 60, sy - 30, sx, sy);
        grad.addColorStop(0, "rgba(236,208,138,0)"); grad.addColorStop(1, "rgba(255,245,220,0.9)");
        ctx.globalAlpha = 1 - shooting.t / 40; ctx.strokeStyle = grad; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(sx - 60, sy - 30); ctx.lineTo(sx, sy); ctx.stroke();
        if (shooting.t > 40) shooting = null;
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
