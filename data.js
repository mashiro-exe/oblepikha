/* ============================================================
   charts.js — отрисовка на D3 v7.
   Каждая функция получает DOM-узел, данные и опции; возвращает
   ничего — просто перерисовывает содержимое узла.

   Общие правила оформления (соблюдаются во всех графиках):
     • столбец ≤ 24px, скруглён на 4px со стороны значения;
     • линия 2px, точка ≥ 8px с кольцом цвета подложки 2px;
     • заливка области — 10% непрозрачности;
     • сетка и оси — сплошные волосяные линии приглушённого тона;
     • подписи значений — точечные (максимум, край), не на каждой точке;
     • текст всегда текстовым цветом, цвет несёт только сама метка.
   ============================================================ */
(function (global) {
  'use strict';

  var d3 = global.d3;
  var S = global.Stats;

  /* ---------------- вспомогательное ---------------- */

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function theme() {
    return {
      surface: cssVar('--surface-1'),
      surface2: cssVar('--surface-2'),
      text: cssVar('--text-primary'),
      text2: cssVar('--text-secondary'),
      muted: cssVar('--muted'),
      grid: cssVar('--grid'),
      axis: cssVar('--axis'),
      demph: cssVar('--demph'),
      seqLow: cssVar('--seq-low'),
      seqHigh: cssVar('--seq-high'),
      seqEmpty: cssVar('--seq-empty'),
      series: [1, 2, 3, 4, 5].map(function (i) { return cssVar('--series-' + i); }),
      // смысловой код: продажи / остаток / скидки / менеджеры
      sales: cssVar('--c-sales'),
      rest: cssVar('--c-rest'),
      discount: cssVar('--c-discount'),
      manager: cssVar('--c-manager'),
      // вид из окон — отдельный код, включается только в режиме «по виду»
      views: viewPalette()
    };
  }

  /* ---------------- вид из окон ---------------- */

  // цвет берём от самого объекта: лес зелёный, река голубая, асфальт серый
  var VIEW_VARS = {
    'на лес': '--view-forest',
    'на ЖК': '--view-jk',
    'на реку': '--view-river',
    'на дорогу': '--view-road',
    'во двор': '--view-yard',
    'окна в окна': '--view-face'
  };

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function viewPalette() {
    var map = {};
    Object.keys(VIEW_VARS).forEach(function (k) { map[k] = cssVar(VIEW_VARS[k]); });
    return map;
  }

  /** цвет вида; неизвестный вид падает в приглушённый серый */
  function viewColor(view, t) {
    var p = (t && t.views) || viewPalette();
    return p[view] || (t ? t.rest : cssVar('--c-rest'));
  }

  var _canvas = null;
  function measureText(text, font) {
    if (!_canvas) _canvas = document.createElement('canvas');
    var ctx = _canvas.getContext('2d');
    ctx.font = font || '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    return ctx.measureText(String(text)).width;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function makeSvg(node, height) {
    clear(node);
    var width = Math.max(node.clientWidth || node.getBoundingClientRect().width || 640, 260);
    var svg = d3.select(node).append('svg')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('width', width)
      .attr('height', height)
      .attr('role', 'img');
    return { svg: svg, width: width, height: height };
  }

  /** прямоугольник со скруглением только со стороны значения */
  function roundedBar(x, y, w, h, r, side) {
    w = Math.max(w, 0); h = Math.max(h, 0);
    r = Math.max(0, Math.min(r, side === 'top' || side === 'bottom' ? w / 2 : h / 2,
      side === 'top' || side === 'bottom' ? h : w));
    if (r <= 0.5) return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    if (side === 'top') {
      return 'M' + x + ',' + (y + h) + 'V' + (y + r) +
        'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) +
        'h' + (w - 2 * r) +
        'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
        'V' + (y + h) + 'Z';
    }
    if (side === 'right') {
      return 'M' + x + ',' + y +
        'h' + (w - r) +
        'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
        'v' + (h - 2 * r) +
        'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r +
        'H' + x + 'Z';
    }
    // без скругления
    return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
  }

  /* ---------------- подсказка ---------------- */

  var tip = {
    el: null,
    ensure: function () {
      if (!this.el) {
        this.el = document.getElementById('tooltip');
        if (!this.el) {
          this.el = document.createElement('div');
          this.el.id = 'tooltip';
          document.body.appendChild(this.el);
        }
      }
      return this.el;
    },
    /** rows: [{label, value, color}] — вставка через textContent, без innerHTML */
    show: function (event, title, rows) {
      var el = this.ensure();
      clear(el);
      if (title) {
        var t = document.createElement('div');
        t.className = 'tt-title';
        t.textContent = title;
        el.appendChild(t);
      }
      (rows || []).forEach(function (r) {
        if (r.sep) {
          var sep = document.createElement('div');
          sep.className = 'tt-sep';
          el.appendChild(sep);
          return;
        }
        var row = document.createElement('div');
        row.className = 'tt-row';
        var k = document.createElement('span');
        k.className = 'k';
        if (r.color) {
          var i = document.createElement('i');
          i.style.background = r.color;
          if (r.shape === 'dot') { i.style.width = '8px'; i.style.height = '8px'; i.style.borderRadius = '50%'; }
          k.appendChild(i);
        }
        k.appendChild(document.createTextNode(r.label));
        var v = document.createElement('span');
        v.className = 'v';
        v.textContent = r.value;
        row.appendChild(k);
        row.appendChild(v);
        el.appendChild(row);
      });
      el.classList.add('is-visible');
      this.move(event);
    },
    move: function (event) {
      var el = this.ensure();
      var pad = 14;
      var w = el.offsetWidth, h = el.offsetHeight;
      var x = event.clientX + pad, y = event.clientY + pad;
      if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = event.clientY - h - pad;
      el.style.left = Math.max(8, x) + 'px';
      el.style.top = Math.max(8, y) + 'px';
    },
    hide: function () {
      if (this.el) this.el.classList.remove('is-visible');
    }
  };

  /* ============================================================
     Сквозная подсветка одной квартиры
     ------------------------------------------------------------
     Квадратик несёт только код квартиры (data-apt). Агрегаты —
     разрезы, в которые эта квартира входит: менеджер, вид, корпус,
     секция, комнатность, ячейка «корпус × этаж». При наведении
     на атом подсвечиваются и он сам, и все агрегаты, где он учтён.
     ============================================================ */

  /** атом: только собственный код квартиры */
  function markAtom(sel, item) {
    return sel.classed('mark', true).attr('data-apt', item.apartment);
  }

  /** агрегат: разрезы, в которые попадает квартира */
  function markFacet(sel, facets) {
    sel.classed('mark', true);
    Object.keys(facets || {}).forEach(function (k) {
      if (facets[k] != null && facets[k] !== '') sel.attr('data-' + k, facets[k]);
    });
    return sel;
  }

  var hl = {
    active: null,
    set: function (item) {
      if (!item) return this.clear();
      if (this.active === item.apartment) return;
      this.active = item.apartment;
      var doc = document;
      doc.body.classList.add('hl-on');
      var prev = doc.querySelectorAll('.mark.is-hl');
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove('is-hl');
      var sels = ['[data-apt="' + item.apartment + '"]'];
      if (item.view) sels.push('[data-view="' + item.view + '"]');
      if (item.manager) sels.push('[data-manager="' + item.manager + '"]');
      if (item.building) sels.push('[data-building="' + item.building + '"]');
      if (item.rooms != null) sels.push('[data-rooms="' + item.rooms + '"]');
      sels.push('[data-section="' + S.sectionOf(item) + '"]');
      sels.push('[data-cell="' + item.building + '|' + item.floor + '"]');
      var hits = doc.querySelectorAll(sels.join(','));
      for (var j = 0; j < hits.length; j++) hits[j].classList.add('is-hl');
    },
    clear: function () {
      if (this.active === null) return;
      this.active = null;
      document.body.classList.remove('hl-on');
      var prev = document.querySelectorAll('.mark.is-hl');
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove('is-hl');
    }
  };

  /* ============================================================
     0. Визуальный атом — квартира
     ------------------------------------------------------------
     Частица данных здесь — одна квартира (одна строка выгрузки).
     По алгоритму Тани Мисютиной её воплощение должно быть атомарным:
     берём ячейку — квадратик регулярной сетки. Цвет кодирует одно
     состояние: продана или в экспозиции. Размер и зазор одинаковы
     во всех блоках, поэтому квадратик читается как одна и та же
     единица и на квадратной диаграмме, и в строках, и в легенде.
     ============================================================ */

  var ATOM = { size: 10, gap: 1, radius: 2, min: 3, max: 16 };

  /** скругление уменьшается вместе с атомом, иначе мелкий квадрат «рябит» */
  function atomRadius(size) {
    return size >= 8 ? 2 : (size >= 5 ? 1.5 : 1);
  }

  /** один атом; fill задаёт состояние, а не категорию */
  function drawAtom(g, x, y, fill, size) {
    var s = size || ATOM.size;
    return g.append('rect')
      .attr('x', x).attr('y', y)
      .attr('width', s).attr('height', s)
      .attr('rx', atomRadius(s))
      .attr('fill', fill);
  }

  /** атом с растянутой высотой: ширина общая, высота несёт величину */
  function drawCell(g, x, y, w, h, fill) {
    return g.append('rect')
      .attr('x', x).attr('y', y)
      .attr('width', w).attr('height', Math.max(h, 1))
      .attr('rx', Math.min(atomRadius(w), h / 2))
      .attr('fill', fill);
  }

  /** подобрать размер атома так, чтобы ряд из n штук уложился в ширину */
  function fitAtom(avail, n) {
    if (!n) return ATOM.size;
    var step = avail / n;
    var size = Math.min(ATOM.max, Math.max(ATOM.min, step - ATOM.gap));
    return size;
  }

  /** полная карточка квартиры: всё, что есть про неё в выгрузке */
  function atomTooltipRows(item, sold, t) {
    var rows = [
      { label: sold ? 'Продана' : 'В экспозиции', value: S.blockOf(item),
        color: sold ? t.sales : t.rest },
      { label: 'Этаж', value: item.floor + '-й' },
      { label: 'Комнат', value: S.fmtInt(item.rooms) },
      { label: 'Планировка', value: item.layout || '—' },
      { label: 'Площадь', value: S.fmtArea(item.area_m2) },
      { label: 'Вид из окон', value: item.view, color: viewColor(item.view, t) },
      { sep: true },
      { label: 'Прайс', value: S.fmtMoneyShort(item.price) },
      { label: 'Прайс за м²', value: item.price_per_m2 ? S.fmtMoneyShort(item.price_per_m2) : '—' }
    ];
    if (sold) {
      rows.push({ label: 'Цена продажи', value: S.fmtMoneyShort(item.sale_price) });
      rows.push({ label: 'Скидка', value: item.discount ? S.fmtMoneyShort(item.discount) : 'нет',
        color: item.discount ? t.discount : null });
      rows.push({ sep: true });
      rows.push({ label: 'Менеджер', value: item.manager || '—', color: t.manager });
      rows.push({ label: 'Обращение', value: S.fmtDateFull(item.request_date) });
      rows.push({ label: 'Сделка', value: S.fmtDateFull(item.deal_date) });
      rows.push({ label: 'Дней в работе', value: S.fmtInt(item.days_in_work) });
    }
    return rows;
  }

  /**
   * Пул квартир «в разрезе дома»: строка — этаж, квадратик — квартира.
   * Шкала этажей общая для всех корпусов, поэтому невысокий ГП-4 честно
   * ниже остальных. Внутри этажа порядок по секции и номеру, между
   * секциями — дополнительный зазор.
   * @param groups [{key, label, total, sold, cells:[{item, sold}]}]
   */
  function waffle(node, groups, opts) {
    opts = opts || {};
    var t = theme();
    var byView = opts.colorBy === 'view';
    clear(node);
    if (!groups.length) return;
    var width = Math.max(node.clientWidth || node.getBoundingClientRect().width || 560, 260);

    // раскладка по этажам внутри каждого корпуса
    var byFloor = groups.map(function (grp) {
      var map = new Map();
      grp.cells.forEach(function (cell) {
        var f = cell.item.floor;
        if (!map.has(f)) map.set(f, []);
        map.get(f).push(cell);
      });
      return map;
    });

    var floors = [];
    byFloor.forEach(function (map) {
      Array.from(map.keys()).forEach(function (f) {
        if (floors.indexOf(f) < 0) floors.push(f);
      });
    });
    floors.sort(function (a, b) { return b - a; });     // верхний этаж — сверху

    var maxPerFloor = 1, maxSections = 1;
    byFloor.forEach(function (map) {
      map.forEach(function (cells) {
        if (cells.length > maxPerFloor) maxPerFloor = cells.length;
        var secs = S.uniq(cells.map(function (c) { return S.sectionOf(c.item); })).length;
        if (secs > maxSections) maxSections = secs;
      });
    });

    // ширина каждого корпуса — по его собственной этажной «ёмкости»,
    // чтобы узкие корпуса не растягивались пустотой
    var caps = byFloor.map(function (map) {
      var cap = 1, secs = 1;
      map.forEach(function (cells) {
        if (cells.length > cap) cap = cells.length;
        var n = S.uniq(cells.map(function (c) { return S.sectionOf(c.item); })).length;
        if (n > secs) secs = n;
      });
      return { cap: cap, secs: secs };
    });
    var labelW = 26;
    var groupGap = 24;
    var unitsTotal = caps.reduce(function (a, c) { return a + c.cap + (c.secs - 1) * 0.5; }, 0);
    var size = fitAtom(width - labelW - groupGap * (groups.length - 1), unitsTotal);
    var step = size + ATOM.gap;
    var secGap = Math.max(2, Math.round(size / 2));
    var headerH = 20;
    var height = headerH + floors.length * step + 4;

    var groupWidths = caps.map(function (c) { return c.cap * step + (c.secs - 1) * secGap; });
    var clusterW = groupWidths.reduce(function (a, w) { return a + w; }, 0)
      + groupGap * (groups.length - 1);
    var offsetX = 0;   // выравнивание по левому краю, как и остальные блоки
    var groupX = [];
    groupWidths.reduce(function (acc, w, i) {
      groupX[i] = acc;
      return acc + w + groupGap;
    }, labelW + offsetX);

    var svg = d3.select(node).append('svg')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('width', width).attr('height', height)
      .attr('role', 'img')
      .attr('aria-label', opts.ariaLabel || 'Каждый квадратик — одна квартира, строка — этаж');

    var everyFloor = step >= 13;
    floors.forEach(function (f, fi) {
      if (!everyFloor && fi % 2 === 1 && f !== floors[floors.length - 1]) return;
      svg.append('text')
        .attr('x', labelW + offsetX - 8).attr('y', headerH + fi * step + size - 1)
        .attr('text-anchor', 'end')
        .attr('fill', t.muted)
        .style('font-size', '11px')
        .style('font-variant-numeric', 'tabular-nums')
        .text(f);
    });

    groups.forEach(function (grp, gi) {
      var x0 = groupX[gi];
      var g = svg.append('g');

      g.append('text')
        .attr('x', x0).attr('y', 11)
        .attr('fill', t.text2)
        .style('font-size', '12px').style('font-weight', '600')
        .text(grp.label);
      g.append('text')
        .attr('x', x0 + measureText(grp.label, '600 12px system-ui, -apple-system, sans-serif') + 8)
        .attr('y', 11)
        .attr('fill', t.muted)
        .style('font-size', '12px')
        .style('font-variant-numeric', 'tabular-nums')
        .text(grp.sold + ' / ' + grp.total);

      floors.forEach(function (f, fi) {
        var cells = byFloor[gi].get(f);
        if (!cells) return;
        var x = x0;
        var prevSection = null;
        cells.forEach(function (cell) {
          var sec = S.sectionOf(cell.item);
          if (prevSection !== null && sec !== prevSection) x += secGap;
          prevSection = sec;
          // непроданная квартира всегда одного цвета — светло-серого:
          // цвет вида кодирует только то, что уже продано
          var fill = cell.sold ? (byView ? viewColor(cell.item.view, t) : t.sales) : t.rest;
          var atom = drawAtom(g, x, headerH + fi * step, fill, size);
          markAtom(atom, cell.item)
            .on('pointermove', function (event) {
              hl.set(cell.item);
              tip.show(event, cell.item.apartment, atomTooltipRows(cell.item, cell.sold, t));
            })
            .on('pointerleave', function () { tip.hide(); hl.clear(); });
          x += step;
        });
      });
    });

    // геометрия нужна соседнему блоку: недельные столбцы равняются по высоте
    return { width: width, height: height, headerH: headerH, fieldH: floors.length * step };
  }

  /**
   * Строки из атомов — строго в одну линию, без переноса: размер квадратика
   * подбирается так, чтобы самый длинный ряд уложился в ширину блока.
   * @param rows [{key, label, total, filled, note, tooltip}] — два состояния,
   *             либо [{key, label, segments:[{count, color}], note, tooltip}]
   */
  function unitRows(node, rows, opts) {
    opts = opts || {};
    var t = theme();
    clear(node);
    if (!rows.length) return;
    var width = Math.max(node.clientWidth || node.getBoundingClientRect().width || 560, 260);

    rows.forEach(function (r) {
      if (r.segments) {
        r.total = r.segments.reduce(function (a, sgm) { return a + sgm.count; }, 0);
      }
    });

    var labelW = Math.ceil(d3.max(rows, function (r) {
      return measureText(r.label, '12px system-ui, -apple-system, "Segoe UI", sans-serif');
    }) || 60) + 12;
    var noteW = opts.showNote === false ? 6 : 66;
    var maxTotal = d3.max(rows, function (r) { return r.total; }) || 1;

    var size = fitAtom(width - labelW - noteW, maxTotal);
    var step = size + ATOM.gap;
    var rowStep = Math.max(19, Math.round(size * 2));
    var height = rows.length * rowStep + 4;

    var svg = d3.select(node).append('svg')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('width', width).attr('height', height)
      .attr('role', 'img');

    rows.forEach(function (r, ri) {
      var y = ri * rowStep + 2;
      var mid = y + size / 2;
      var g = svg.append('g');

      g.append('text')
        .attr('x', labelW - 12).attr('y', mid)
        .attr('dy', '0.32em')
        .attr('text-anchor', 'end')
        .attr('fill', t.text2)
        .style('font-size', '12px')
        .text(r.label);

      var colorAt = r.segments
        ? (function () {
          var flat = [];
          r.segments.forEach(function (sgm) {
            for (var k = 0; k < sgm.count; k++) flat.push(sgm.color);
          });
          return function (i) { return flat[i] || t.rest; };
        })()
        : function (i) { return i < r.filled ? t.sales : t.rest; };

      for (var i = 0; i < r.total; i++) {
        markFacet(drawAtom(g, labelW + i * step, y, colorAt(i), size), r.facet);
      }

      if (opts.showNote !== false) {
        g.append('text')
          .attr('class', 'value-label strong')
          .attr('x', width - 2).attr('y', mid)
          .attr('dy', '0.32em')
          .attr('text-anchor', 'end')
          .attr('fill', t.text)
          .text(r.note != null ? r.note : (r.filled + ' / ' + r.total));
      }

      g.append('rect')
        .attr('x', 0).attr('y', y - (rowStep - size) / 2)
        .attr('width', width).attr('height', rowStep)
        .attr('fill', 'transparent')
        .on('pointermove', function (event) {
          tip.show(event, r.label, r.tooltip || [
            { label: 'Продано', value: r.filled + ' из ' + r.total, color: t.sales }
          ]);
        })
        .on('pointerleave', function () { tip.hide(); });
    });
  }

  /**
   * Столбцы из атомов: гистограмма, где каждая сделка — квадратик.
   * @param items [{key, label, count, tooltip}]
   */
  function unitColumns(node, items, opts) {
    opts = opts || {};
    var t = theme();
    clear(node);
    if (!items.length) return;
    var width = Math.max(node.clientWidth || node.getBoundingClientRect().width || 560, 260);

    var m = { top: 20, right: 4, bottom: 28, left: 4 };
    var iw = width - m.left - m.right;
    var band = iw / items.length;
    var size = ATOM.size;
    var step = size + ATOM.gap;
    var cols = Math.max(1, Math.floor((band - 14) / step));
    var maxRows = Math.max(1, Math.ceil(d3.max(items, function (d) { return d.count; }) / cols));
    var height = m.top + m.bottom + maxRows * step;

    var svg = d3.select(node).append('svg')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('width', width).attr('height', height)
      .attr('role', 'img');

    var baseY = m.top + maxRows * step;
    var g = svg.append('g');

    items.forEach(function (item, idx) {
      var colWidth = cols * step - ATOM.gap;
      var x0 = m.left + idx * band + (band - colWidth) / 2;
      var col = g.append('g');

      for (var i = 0; i < item.count; i++) {
        var cx = x0 + (i % cols) * step;
        var cy = baseY - (Math.floor(i / cols) + 1) * step;
        drawAtom(col, cx, cy, opts.color || t.sales, size);
      }

      var top = baseY - Math.ceil(item.count / cols) * step;
      col.append('text')
        .attr('class', 'value-label strong')
        .attr('x', x0 + colWidth / 2).attr('y', top - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', t.text)
        .text(S.fmtInt(item.count));

      col.append('text')
        .attr('class', 'tick-text')
        .attr('x', m.left + idx * band + band / 2).attr('y', baseY + 18)
        .attr('text-anchor', 'middle')
        .attr('fill', t.muted)
        .style('font-size', '12px')
        .text(item.label);

      col.append('rect')
        .attr('x', m.left + idx * band).attr('y', 0)
        .attr('width', band).attr('height', height - m.bottom + 20)
        .attr('fill', 'transparent')
        .on('pointermove', function (event) {
          tip.show(event, item.label, item.tooltip || [
            { label: 'Сделок', value: S.fmtInt(item.count), color: opts.color || t.sales }
          ]);
        })
        .on('pointerleave', function () { tip.hide(); });
    });

    g.append('line')
      .attr('class', 'axis-line')
      .attr('x1', m.left).attr('x2', width - m.right)
      .attr('y1', baseY + 2).attr('y2', baseY + 2)
      .attr('stroke', t.axis);
  }

  /* ============================================================
     1. Сделки по неделям — столбец, набранный из самих сделок
     ------------------------------------------------------------
     Столбец — неделя, сегмент — конкретная проданная квартира.
     Высота сегмента несёт величину: цена сделки, площадь квартиры
     или одна сделка = один квадратик. Поэтому у столбца есть шкала
     слева, а над столбцом — число сделок за неделю.
     Цвет — либо скидка (синий / оранжевый), либо вид из окон.
     ============================================================ */

  var VIEW_ORDER = ['на лес', 'на реку', 'во двор', 'на ЖК', 'на дорогу', 'окна в окна'];

  /** «2022-06-13» → «13.06» — короткая подпись понедельника */
  function shortDate(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '.' + p[1] : '';
  }

  function weeklyUnits(node, weeks, opts) {
    opts = opts || {};
    var t = theme();
    clear(node);
    if (!weeks.length) return null;
    var width = Math.max(node.clientWidth || node.getBoundingClientRect().width || 480, 220);

    var byView = opts.colorBy === 'view';
    var mode = opts.sizeBy === 'price' ? 'price' : (opts.sizeBy === 'area' ? 'area' : 'count');
    var byValue = mode !== 'count';
    var colorFull = opts.colorFull || t.sales;
    var colorDiscount = opts.colorDiscount || t.discount;
    var gap = ATOM.gap;
    var maxCount = d3.max(weeks, function (w) { return w.count; }) || 1;

    function colorOf(deal) {
      return byView ? viewColor(deal.view, t) : (deal.discount ? colorDiscount : colorFull);
    }
    function valueOf(deal) {
      if (mode === 'price') return deal.sale_price || 0;
      if (mode === 'area') return deal.area_m2 || 0;
      return 1;
    }
    function fmtValue(v) {
      if (mode === 'price') return S.fmtMoneyAxis(v);
      if (mode === 'area') return S.fmtInt(v);
      return S.fmtInt(v);
    }
    var axisTitle = mode === 'price' ? 'выручка' : (mode === 'area' ? 'продано, м²' : 'сделок');

    // порядок внутри столбца: по виду — чтобы цвета собирались в полосы,
    // иначе по цене — сначала по прайсу, сверху скидки
    var order = weeks.map(function (w) {
      if (!byView) return w.deals;
      return w.deals.slice().sort(function (a, b) {
        return VIEW_ORDER.indexOf(a.view) - VIEW_ORDER.indexOf(b.view);
      });
    });
    var sums = order.map(function (list) {
      return list.reduce(function (a, d) { return a + valueOf(d); }, 0);
    });
    var maxSum = d3.max(sums) || 1;

    // поля: слева шкала, сверху число сделок, снизу дата понедельника
    var tickW = byValue ? Math.ceil(measureText(fmtValue(maxSum), '11px system-ui, sans-serif')) + 12 : 26;
    var m = { top: 22, right: 4, bottom: 26, left: tickW };

    // высота графика: либо задана снаружи (выравнивание с соседним блоком),
    // либо считается от размера атома
    var maxH = opts.maxHeight
      || (opts.matchHeight ? Math.max(120, opts.matchHeight - m.top - m.bottom) : 300);

    var size, k, heights;
    if (byValue) {
      // сегменты идут вплотную, их разделяет обводка цветом подложки,
      // поэтому высота столбца в пикселях честно пропорциональна величине
      k = maxH / maxSum;
      heights = order.map(function (list) {
        return list.map(function (d) { return Math.max(1.5, k * valueOf(d)); });
      });
      // ширина столбца — от свободного места под блоком, как в референсе
      size = Math.max(10, Math.min(46,
        Math.floor((width - m.left - m.right) / weeks.length * 0.74)));
    } else {
      size = Math.max(5, Math.min(16, Math.floor(maxH / maxCount) - gap));
      k = size + gap;
      heights = order.map(function (list) { return list.map(function () { return size; }); });
    }
    var colWidth = size;

    var colHeights = heights.map(function (list, i) {
      if (!list.length) return 0;
      return byValue
        ? list.reduce(function (a, h) { return a + h; }, 0)
        : list.reduce(function (a, h) { return a + h + gap; }, 0) - gap;
    });
    var chartH = Math.max(d3.max(colHeights) || 0, 20);

    // просвет между неделями — минимум 45% ширины столбца; если под блоком
    // осталось место, он растёт, но не больше полутора ширин столбца
    var colGap = Math.max(3, Math.round(colWidth * 0.45));
    if (weeks.length > 1) {
      var spare = Math.floor((width - m.left - m.right - weeks.length * colWidth) / (weeks.length - 1));
      colGap = Math.max(colGap, Math.min(Math.round(colWidth * 1.5), spare));
    }
    var colStep = colWidth + colGap;

    var needed = m.left + m.right + weeks.length * colStep - colGap;
    width = Math.min(width, needed);
    var height = m.top + m.bottom + chartH;
    var baseY = m.top + chartH;

    var svg = d3.select(node).append('svg')
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .attr('width', width).attr('height', height)
      .attr('role', 'img')
      .attr('aria-label', 'Сделки по неделям, каждый сегмент — проданная квартира');

    var g = svg.append('g');

    /* --- шкала слева и линии сетки --- */
    var ticks = byValue
      ? d3.ticks(0, maxSum, 4)
      : d3.ticks(0, maxCount, 4).filter(function (v) { return Number.isInteger(v); });
    ticks.forEach(function (v) {
      if (v === 0) return;
      var y = baseY - v * k;
      if (y < m.top - 6) return;
      g.append('line')
        .attr('class', 'grid-line')
        .attr('x1', m.left - 6).attr('x2', width - m.right)
        .attr('y1', y).attr('y2', y)
        .attr('stroke', t.grid);
      g.append('text')
        .attr('class', 'tick-text')
        .attr('x', m.left - 10).attr('y', y)
        .attr('dy', '0.32em')
        .attr('text-anchor', 'end')
        .attr('fill', t.muted)
        .style('font-size', '11px')
        .text(fmtValue(v));
    });
    g.append('text')
      .attr('class', 'tick-text')
      .attr('x', m.left - 10).attr('y', 8)
      .attr('text-anchor', 'end')
      .attr('fill', t.muted)
      .style('font-size', '11px')
      .text(axisTitle);

    // подписи дат: если все не влезают, оставляем каждую вторую
    var dateW = measureText('30.05', '11px system-ui, sans-serif');
    var everyDate = dateW + 6 <= colStep;

    weeks.forEach(function (w, idx) {
      var x0 = m.left + idx * colStep;
      var cx = x0 + colWidth / 2;
      var col = g.append('g');

      if (w.partial) {
        col.append('rect')
          .attr('x', x0 - colGap / 2).attr('y', m.top - 14)
          .attr('width', colStep).attr('height', chartH + 16)
          .attr('rx', 4)
          .attr('fill', t.surface2)
          .style('pointer-events', 'none');
      }

      // подложка-ловушка для подсказки по неделе лежит под сегментами,
      // поэтому наведение на сам сегмент показывает карточку квартиры
      col.append('rect')
        .attr('x', x0 - colGap / 2).attr('y', 0)
        .attr('width', colStep).attr('height', baseY + 4)
        .attr('fill', 'transparent')
        .on('pointermove', function (event) {
          hl.clear();
          tip.show(event, w.labelFull + (w.partial ? ' · неполная неделя' : ''), [
            { label: 'Сделок', value: S.fmtInt(w.count), color: colorFull },
            { label: 'Со скидкой', value: S.fmtInt(w.discountCount) +
              (w.count ? ' (' + S.fmtPct(w.discountShare) + ')' : ''), color: colorDiscount },
            { label: 'Выручка', value: S.fmtMoneyShort(w.revenue) },
            { label: 'Средний чек', value: S.fmtMoneyShort(w.avgDeal) },
            { label: 'Сумма скидок', value: w.discount ? S.fmtMoneyShort(w.discount) : '—' }
          ]);
        })
        .on('pointerleave', function () { tip.hide(); });

      var y = baseY;
      order[idx].forEach(function (deal, i) {
        var h = heights[idx][i];
        y -= h;
        var seg = drawCell(col, x0, y, colWidth, h, colorOf(deal));
        if (byValue) seg.attr('stroke', t.surface).attr('stroke-width', 1);
        markAtom(seg, deal)
          .on('pointermove', function (event) {
            hl.set(deal);
            tip.show(event, deal.apartment, atomTooltipRows(deal, true, t));
          })
          .on('pointerleave', function () { tip.hide(); hl.clear(); });
        if (!byValue) y -= gap;
      });

      // число сделок над столбцом — как «сделок, шт» в референсе
      if (w.count) {
        col.append('text')
          .attr('class', 'value-label')
          .attr('x', cx).attr('y', baseY - colHeights[idx] - 6)
          .attr('text-anchor', 'middle')
          .attr('fill', w.partial ? t.muted : t.text2)
          .style('font-size', '11px')
          .text(S.fmtInt(w.count));
      }

      if (everyDate || idx % 2 === 0) {
        col.append('text')
          .attr('class', 'tick-text')
          .attr('x', cx).attr('y', baseY + 16)
          .attr('text-anchor', 'middle')
          .attr('fill', w.partial ? t.muted : t.text2)
          .style('font-size', '11px')
          .text(shortDate(w.from));
      }
    });

    g.append('line')
      .attr('class', 'axis-line')
      .attr('x1', m.left - 6).attr('x2', m.left + weeks.length * colStep - colGap + 2)
      .attr('y1', baseY).attr('y2', baseY)
      .attr('stroke', t.axis);

    return { width: width, height: height };
  }

  /* ============================================================
     2. Столбцы — вертикальные и горизонтальные, с накоплением
     items: [{key, label, total, segments:[{key,label,value,color}], tooltip:[...]}]
     ============================================================ */

  function bars(node, items, opts) {
    opts = opts || {};
    var t = theme();
    var horizontal = opts.orientation !== 'v';
    var height = opts.height || (horizontal ? Math.max(120, items.length * 38 + 40) : 260);
    var g0 = makeSvg(node, height);
    var svg = g0.svg, width = g0.width;
    if (!items.length) return;

    var fmtV = opts.valueFormat || function (v) { return S.fmtInt(v); };
    var fmtTick = opts.tickFormat || fmtV;
    var maxV = opts.max || d3.max(items, function (d) { return d.total; }) || 1;
    var barSize = opts.barSize || 24;
    var GAP = 2;   // разрыв цвета подложки между сегментами

    var m, x, y, iw, ih, g;

    if (horizontal) {
      var labelW = d3.max(items, function (d) {
        return measureText(d.label, '12px system-ui, -apple-system, "Segoe UI", sans-serif');
      }) || 40;
      var valueW = opts.showValues === false ? 8 : measureText(fmtV(maxV)) + 14;
      m = { top: 6, right: Math.ceil(valueW), bottom: opts.baseline ? 20 : 6, left: Math.ceil(labelW) + 12 };
      iw = width - m.left - m.right;
      ih = height - m.top - m.bottom;
      g = svg.append('g').attr('transform', 'translate(' + m.left + ',' + m.top + ')');

      x = d3.scaleLinear().domain([0, maxV]).range([0, iw]);
      y = d3.scaleBand()
        .domain(items.map(function (d) { return d.key; }))
        .range([0, ih])
        .paddingInner(0.34);

      var bh = Math.min(barSize, y.bandwidth());

      items.forEach(function (item) {
        var yPos = y(item.key) + (y.bandwidth() - bh) / 2;
        var row = g.append('g');

        // подпись категории
        row.append('text')
          .attr('class', 'value-label')
          .attr('x', -10).attr('y', yPos + bh / 2)
          .attr('dy', '0.32em')
          .attr('text-anchor', 'end')
          .attr('fill', t.text2)
          .style('font-size', '12px')
          .text(item.label);

        var acc = 0;
        var segs = item.segments.filter(function (s) { return s.value > 0; });
        segs.forEach(function (s, i) {
          var x0 = x(acc);
          var x1 = x(acc + s.value);
          var isLast = i === segs.length - 1;
          var w = Math.max(1, x1 - x0 - (isLast ? 0 : GAP));
          markFacet(row.append('path')
            .attr('d', roundedBar(x0, yPos, w, bh, 4, isLast ? 'right' : 'none'))
            .attr('fill', s.color)
            .style('cursor', 'default'), item.facet);
          acc += s.value;
        });

        // значение у конца полосы
        if (opts.showValues !== false && item.total > 0) {
          row.append('text')
            .attr('class', 'value-label strong')
            .attr('x', x(item.total) + 8)
            .attr('y', yPos + bh / 2)
            .attr('dy', '0.32em')
            .attr('fill', t.text)
            .text(fmtV(item.total));
        }

        // цель наведения — шире самой полосы (вся строка)
        row.append('rect')
          .attr('x', -m.left).attr('y', y(item.key))
          .attr('width', iw + m.left + m.right)
          .attr('height', Math.max(24, y.bandwidth()))
          .attr('fill', 'transparent')
          .on('pointermove', function (event) {
            tip.show(event, item.label, item.tooltip || defaultRows(item, fmtV));
          })
          .on('pointerleave', function () { tip.hide(); });
      });

      // базовая линия
      g.append('line')
        .attr('class', 'axis-line')
        .attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', ih)
        .attr('stroke', t.axis);

      // линия сравнения (например, средняя реализация по всей выборке)
      if (opts.baseline && opts.baseline.value > 0) {
        var bx = x(opts.baseline.value);
        g.insert('line', ':first-child')
          .attr('x1', bx).attr('x2', bx).attr('y1', -2).attr('y2', ih)
          .attr('stroke', t.text2).attr('stroke-width', 1)
          .attr('shape-rendering', 'crispEdges');
        if (opts.baseline.label) {
          g.append('text')
            .attr('class', 'value-label')
            .attr('x', bx).attr('y', ih + 12)
            .attr('text-anchor', bx > iw - 60 ? 'end' : 'middle')
            .attr('fill', t.text2)
            .text(opts.baseline.label);
        }
      }

    } else {
      var maxTickW = measureText(fmtTick(maxV));
      m = { top: 22, right: 8, bottom: 30, left: Math.ceil(maxTickW) + 14 };
      iw = width - m.left - m.right;
      ih = height - m.top - m.bottom;
      g = svg.append('g').attr('transform', 'translate(' + m.left + ',' + m.top + ')');

      y = d3.scaleLinear().domain([0, maxV * 1.08]).nice().range([ih, 0]);
      x = d3.scaleBand()
        .domain(items.map(function (d) { return d.key; }))
        .range([0, iw])
        .paddingInner(0.36);

      var yTicks2 = y.ticks(4);
      g.append('g').selectAll('line').data(yTicks2).join('line')
        .attr('class', 'grid-line')
        .attr('x1', 0).attr('x2', iw)
        .attr('y1', function (d) { return y(d); })
        .attr('y2', function (d) { return y(d); })
        .attr('stroke', t.grid);
      g.append('g').selectAll('text').data(yTicks2).join('text')
        .attr('class', 'tick-text')
        .attr('x', -8).attr('y', function (d) { return y(d); })
        .attr('dy', '0.32em').attr('text-anchor', 'end')
        .attr('fill', t.muted)
        .text(function (d) { return fmtTick(d); });

      var bw = Math.min(barSize, x.bandwidth());

      items.forEach(function (item) {
        var xPos = x(item.key) + (x.bandwidth() - bw) / 2;
        var col = g.append('g');
        var acc = 0;
        var segs = item.segments.filter(function (s) { return s.value > 0; });
        segs.forEach(function (s, i) {
          var yTop = y(acc + s.value);
          var yBottom = y(acc);
          var isLast = i === segs.length - 1;
          var h = Math.max(1, yBottom - yTop - (isLast ? 0 : GAP));
          markFacet(col.append('path')
            .attr('d', roundedBar(xPos, yTop + (isLast ? 0 : GAP), bw, h, 4, isLast ? 'top' : 'none'))
            .attr('fill', s.color), item.facet);
          acc += s.value;
        });

        if (opts.showValues !== false && item.total > 0) {
          col.append('text')
            .attr('class', 'value-label strong')
            .attr('x', xPos + bw / 2)
            .attr('y', y(item.total) - 8)
            .attr('text-anchor', 'middle')
            .attr('fill', t.text)
            .text(fmtV(item.total));
        }

        col.append('text')
          .attr('class', 'tick-text')
          .attr('x', x(item.key) + x.bandwidth() / 2)
          .attr('y', ih + 18)
          .attr('text-anchor', 'middle')
          .attr('fill', t.muted)
          .style('font-size', '12px')
          .text(item.label);

        col.append('rect')
          .attr('x', x(item.key)).attr('y', 0)
          .attr('width', Math.max(24, x.bandwidth()))
          .attr('height', ih + 22)
          .attr('fill', 'transparent')
          .on('pointermove', function (event) {
            tip.show(event, item.label, item.tooltip || defaultRows(item, fmtV));
          })
          .on('pointerleave', function () { tip.hide(); });
      });

      g.append('line')
        .attr('class', 'axis-line')
        .attr('x1', 0).attr('x2', iw).attr('y1', ih).attr('y2', ih)
        .attr('stroke', t.axis);
    }
  }

  function defaultRows(item, fmtV) {
    return item.segments.map(function (s) {
      return { label: s.label, value: fmtV(s.value), color: s.color };
    });
  }

  /* ============================================================
     3. Тепловая карта «корпус × этаж»
     ============================================================ */

  function heatmap(node, matrix, opts) {
    opts = opts || {};
    var t = theme();
    var buildings = matrix.buildings, floors = matrix.floors, cells = matrix.cells;
    var cellH = 22, gap = 2;
    var m = { top: 24, right: 8, bottom: 8, left: 34 };
    var height = m.top + m.bottom + floors.length * cellH;
    var g0 = makeSvg(node, height);
    var svg = g0.svg, width = g0.width;
    if (!cells.length) return;

    var iw = width - m.left - m.right;
    var colW = iw / buildings.length;
    var g = svg.append('g').attr('transform', 'translate(' + m.left + ',' + m.top + ')');

    var scale = d3.scaleLinear().domain([0, 1]).range([t.seqLow, t.seqHigh])
      .interpolate(d3.interpolateLab);

    // заголовки колонок
    buildings.forEach(function (b, i) {
      g.append('text')
        .attr('class', 'tick-text')
        .attr('x', i * colW + colW / 2)
        .attr('y', -9)
        .attr('text-anchor', 'middle')
        .attr('fill', t.text2)
        .style('font-size', '12px')
        .text(b);
    });

    // подписи этажей — через один, чтобы не слипались
    floors.forEach(function (f, j) {
      if (floors.length > 12 && j % 2 === 1) return;
      g.append('text')
        .attr('class', 'tick-text')
        .attr('x', -8)
        .attr('y', (floors.length - 1 - j) * cellH + cellH / 2)
        .attr('dy', '0.32em')
        .attr('text-anchor', 'end')
        .attr('fill', t.muted)
        .text(f);
    });

    cells.forEach(function (c) {
      var i = buildings.indexOf(c.building);
      var j = floors.indexOf(c.floor);
      if (i < 0 || j < 0) return;
      var cx = i * colW;
      var cy = (floors.length - 1 - j) * cellH;
      var w = colW - gap, h = cellH - gap;
      var fill = c.empty ? t.seqEmpty : scale(c.share);

      markFacet(g.append('rect')
        .attr('x', cx).attr('y', cy)
        .attr('width', Math.max(1, w)).attr('height', Math.max(1, h))
        .attr('rx', 3)
        .attr('fill', fill), { cell: c.building + '|' + c.floor });

      if (!c.empty) {
        var label = Math.round(c.share * 100) + '%';
        if (w > measureText(label) + 12) {
          // текст внутри заливки: белый или тёмный — по светлоте фона
          var lab = d3.lab(fill);
          g.append('text')
            .attr('x', cx + w / 2).attr('y', cy + h / 2)
            .attr('dy', '0.32em')
            .attr('text-anchor', 'middle')
            .style('font-size', '11px')
            .style('font-variant-numeric', 'tabular-nums')
            .attr('fill', lab.l > 62 ? '#0b0b0b' : '#ffffff')
            .text(label);
        }
      }

      g.append('rect')
        .attr('x', cx).attr('y', cy)
        .attr('width', Math.max(1, w)).attr('height', Math.max(24, h))
        .attr('fill', 'transparent')
        .on('pointermove', function (event) {
          if (c.empty) {
            tip.show(event, c.building + ', этаж ' + c.floor, [{ label: 'Квартир нет', value: '—' }]);
            return;
          }
          tip.show(event, c.building + ', этаж ' + c.floor, [
            { label: 'Продано', value: c.deals + ' из ' + c.total },
            { label: 'Доля', value: S.fmtPct(c.share) },
            { label: 'Выручка', value: S.fmtMoneyShort(c.revenue) },
            { label: 'Прайс за м²', value: S.fmtMoneyShort(c.avgPricePerM2) }
          ]);
        })
        .on('pointerleave', function () { tip.hide(); });
    });
  }

  /* ============================================================
     4. Схема ЖК «Облепиха» — корпуса красятся по реализации,
        клик по корпусу/секции работает как фильтр.
        Геометрия повторяет схему заказчика: ул. Сиреневая, д. 1.
     ============================================================ */

  /* Геометрия снята со схемы заказчика: масштаб 1:2 к присланному изображению
     (2000×1300 → viewBox 1000×620). ГП-4 — три отдельные секции: А и Б сверху,
     В под Б; Г-образный силуэт даёт их взаимное расположение, а не сам блок А. */
  var PLAN = {
    viewBox: [0, 0, 1000, 620],
    blocks: [
      { key: 'ГП4-А', building: 'ГП4', sub: 'А', x: 415, y: 37, w: 72, h: 63 },
      { key: 'ГП4-Б', building: 'ГП4', sub: 'Б', x: 487, y: 37, w: 95, h: 75 },
      { key: 'ГП4-В', building: 'ГП4', sub: 'В', x: 507, y: 112, w: 75, h: 66 },
      { key: 'ГП1-А', building: 'ГП1', title: 'ГП-1', sub: 'А', x: 275, y: 240, w: 70, h: 70 },
      { key: 'ГП2-А', building: 'ГП2', title: 'ГП-2', sub: 'А', x: 392, y: 240, w: 70, h: 70 },
      { key: 'ГП3-А', building: 'ГП3', title: 'ГП-3', sub: 'А', x: 510, y: 240, w: 70, h: 70 }
    ],
    groupTitle: { text: 'ГП-4', x: 498, y: 27 },
    infra: [
      { label: 'ТЦ «Маяк»', x: 232, y: 520, w: 140, h: 78 },
      { label: 'Школа', x: 430, y: 552, w: 150, h: 60 },
      { label: 'Детский сад', x: 618, y: 528, w: 126, h: 72 },
      { label: 'Торговый', label2: 'центр', x: 800, y: 462, w: 132, h: 118 }
    ],
    yard: { x: 385, y: 155, w: 90, h: 65 }
  };

  function plan(node, rows, opts) {
    opts = opts || {};
    var t = theme();
    var selected = opts.selected || [];
    var vb = PLAN.viewBox;
    clear(node);

    var width = Math.max(node.clientWidth || node.getBoundingClientRect().width || 720, 320);
    var height = Math.round(width * vb[3] / vb[2]);
    var svg = d3.select(node).append('svg')
      .attr('viewBox', vb.join(' '))
      .attr('width', width)
      .attr('height', height)
      .attr('role', 'img')
      .attr('aria-label', 'Схема ЖК «Облепиха»: реализация по корпусам');

    var byKey = new Map();
    rows.forEach(function (r) { byKey.set(r.key, r); });

    // заливка — выбранная метрика; доля считается от 0 до 1, остальные нормируются
    var metric = opts.metric || { key: 'soldShare', domain: [0, 1] };
    var values = rows.map(function (r) { return r[metric.key] || 0; });
    var domain = metric.domain || [d3.min(values) || 0, d3.max(values) || 1];
    if (domain[0] === domain[1]) domain = [0, domain[1] || 1];
    var scale = d3.scaleLinear().domain(domain).range([t.seqLow, t.seqHigh])
      .clamp(true).interpolate(d3.interpolateLab);
    var fmtMetric = metric.format || function (v) { return Math.round(v * 100) + '%'; };

    var water = cssVar('--map-water');
    var green = cssVar('--map-green');
    var road = cssVar('--map-road');
    var ground = cssVar('--map-ground');

    // подложка
    svg.append('rect').attr('x', 0).attr('y', 0).attr('width', 1000).attr('height', 620)
      .attr('fill', ground);
    // река слева
    svg.append('path')
      .attr('d', 'M0,0 L78,0 C68,120 92,240 74,330 C58,420 86,500 62,620 L0,620 Z')
      .attr('fill', water);
    // лесопарк справа сверху
    svg.append('path')
      .attr('d', 'M1000,0 L1000,168 C920,176 856,140 792,126 C712,108 648,72 664,32 C674,6 720,0 1000,0 Z')
      .attr('fill', green);

    // дороги
    var roads = svg.append('g')
      .attr('fill', 'none').attr('stroke', road).attr('stroke-width', 20)
      .attr('stroke-linecap', 'round');
    roads.append('path').attr('d', 'M150,0 L150,545');            // въезд с севера
    roads.append('path').attr('d', 'M150,372 L1000,372');          // ул. Сиреневая
    roads.append('path').attr('d', 'M150,398 Q150,428 186,428 L1000,428');  // ул. Шлюзовая
    roads.append('circle').attr('cx', 150).attr('cy', 572).attr('r', 30);   // кольцо
    roads.append('path').attr('d', 'M118,572 L0,572');

    svg.append('text').attr('x', 700).attr('y', 366)
      .attr('text-anchor', 'middle').attr('fill', t.muted)
      .style('font-size', '15px').text('ул. Сиреневая');
    svg.append('text').attr('x', 790).attr('y', 422)
      .attr('text-anchor', 'middle').attr('fill', t.muted)
      .style('font-size', '15px').text('ул. Шлюзовая');

    // двор
    svg.append('rect')
      .attr('x', PLAN.yard.x).attr('y', PLAN.yard.y)
      .attr('width', PLAN.yard.w).attr('height', PLAN.yard.h)
      .attr('rx', 4)
      .attr('fill', cssVar('--map-yard'));
    svg.append('text')
      .attr('x', PLAN.yard.x + PLAN.yard.w / 2).attr('y', PLAN.yard.y + PLAN.yard.h / 2 + 4)
      .attr('text-anchor', 'middle').attr('fill', t.muted)
      .style('font-size', '13px').text('двор');

    // инфраструктура — контуром, без заливки: это контекст, а не данные
    PLAN.infra.forEach(function (b) {
      svg.append('rect')
        .attr('x', b.x).attr('y', b.y).attr('width', b.w).attr('height', b.h)
        .attr('rx', 4)
        .attr('fill', 'none').attr('stroke', t.axis).attr('stroke-width', 1.5);
      var cy = b.y + b.h / 2 + (b.label2 ? -3 : 5);
      svg.append('text')
        .attr('x', b.x + b.w / 2).attr('y', cy)
        .attr('text-anchor', 'middle').attr('fill', t.muted)
        .style('font-size', '15px').text(b.label);
      if (b.label2) {
        svg.append('text')
          .attr('x', b.x + b.w / 2).attr('y', cy + 17)
          .attr('text-anchor', 'middle').attr('fill', t.muted)
          .style('font-size', '15px').text(b.label2);
      }
    });

    function paint(sel, key) {
      var row = byKey.get(key);
      var isSel = selected.indexOf(key) >= 0;
      sel.attr('fill', row ? scale(row[metric.key] || 0) : t.seqEmpty)
        .attr('stroke', isSel ? t.text : 'none')
        .attr('stroke-width', isSel ? 3 : 0);
    }

    function bindHover(sel, key) {
      var row = byKey.get(key);
      sel.style('cursor', 'pointer')
        .on('pointermove', function (event) {
          var rows2 = row ? [
            { label: 'Продано', value: S.fmtInt(row.deals) + ' из ' + S.fmtInt(row.total) },
            { label: 'Реализация', value: S.fmtPct(row.soldShare) },
            { label: 'Выручка', value: S.fmtMoneyShort(row.revenue) },
            { label: 'Цена сделки за м²', value: S.fmtMoneyShort(row.avgPricePerM2) },
            { label: 'Прайс за м²', value: S.fmtMoneyShort(row.listPricePerM2) },
            { label: 'Медиана дней', value: row.medianDays == null ? '—' : S.fmtInt(row.medianDays) }
          ] : [{ label: 'Нет квартир в выборке', value: '—' }];
          tip.show(event, key + ' — клик, чтобы отфильтровать', rows2);
        })
        .on('pointerleave', function () { tip.hide(); })
        .on('click', function () { if (opts.onSelect) opts.onSelect(key); });
    }

    if (PLAN.groupTitle) {
      svg.append('text')
        .attr('x', PLAN.groupTitle.x).attr('y', PLAN.groupTitle.y)
        .attr('text-anchor', 'middle').attr('fill', t.text2)
        .style('font-size', '15px').style('font-weight', '600')
        .text(PLAN.groupTitle.text);
    }

    PLAN.blocks.forEach(function (b) {
      var g = svg.append('g');
      var shape = b.d
        ? g.append('path').attr('d', b.d)
        : g.append('rect')
          .attr('x', b.x).attr('y', b.y).attr('width', b.w).attr('height', b.h)
          .attr('rx', 3);
      paint(shape, b.key);
      markFacet(shape, { section: b.key, building: b.building });
      var lx = b.lx != null ? b.lx : b.x + b.w / 2;
      var ly = b.ly != null ? b.ly : b.y + b.h / 2;

      var row = byKey.get(b.key);
      var fill = row ? scale(row[metric.key] || 0) : t.seqEmpty;
      var ink = d3.lab(fill).l > 62 ? '#0b0b0b' : '#ffffff';

      g.append('text')
        .attr('x', lx).attr('y', ly - 4)
        .attr('text-anchor', 'middle').attr('fill', ink)
        .style('font-size', '17px').style('font-weight', '600')
        .text(b.sub);
      if (row) {
        g.append('text')
          .attr('x', lx).attr('y', ly + 17)
          .attr('text-anchor', 'middle').attr('fill', ink)
          .style('font-size', '14px')
          .style('font-variant-numeric', 'tabular-nums')
          .text(fmtMetric(row[metric.key] || 0));
      }
      if (b.title) {
        g.append('text')
          .attr('x', b.tx != null ? b.tx : b.x + b.w / 2)
          .attr('y', b.ty != null ? b.ty : b.y - 10)
          .attr('text-anchor', 'middle').attr('fill', t.text2)
          .style('font-size', '15px').style('font-weight', '600')
          .text(b.title);
      }
      bindHover(g, b.key);
    });
  }

  /** горизонтальная шкала-легенда: от меньшего к большему */
  function heatLegend(node, opts) {
    opts = opts || {};
    var t = theme();
    clear(node);
    var wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    wrap.style.fontSize = '12px';
    wrap.style.color = t.muted;

    var a = document.createElement('span'); a.textContent = opts.from || '0%';
    var bar = document.createElement('span');
    bar.style.flex = '0 0 140px';
    bar.style.height = '8px';
    bar.style.borderRadius = '4px';
    bar.style.background = 'linear-gradient(90deg,' + t.seqLow + ',' + t.seqHigh + ')';
    var b = document.createElement('span'); b.textContent = opts.to || '100% продано';

    wrap.appendChild(a); wrap.appendChild(bar); wrap.appendChild(b);
    node.appendChild(wrap);
  }

  global.Charts = {
    ATOM: ATOM,
    waffle: waffle,
    unitRows: unitRows,
    unitColumns: unitColumns,
    weeklyUnits: weeklyUnits,
    bars: bars,
    plan: plan,
    PLAN: PLAN,
    heatmap: heatmap,
    heatLegend: heatLegend,
    theme: theme,
    tip: tip,
    hl: hl,
    viewColor: viewColor,
    VIEW_ORDER: VIEW_ORDER
  };
})(window);
