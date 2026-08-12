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

document.addEventListener("DOMContentLoaded", function () {
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
    window.addEventListener("pagehide", function () {
      saveState({ scrollY: window.scrollY });
    });
    window.addEventListener("beforeunload", function () {
      saveState({ scrollY: window.scrollY });
    });

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

  buildSideToc();
});

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

  fab.addEventListener("click", function () {
    panel.classList.toggle("open");
  });

  document.addEventListener("click", function (e) {
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
  }
}
