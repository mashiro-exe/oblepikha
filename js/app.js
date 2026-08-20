(function () {
  'use strict';

  var DATA = window.SALES_DATA || [];

  /* ---------------- палитра ---------------- */

  var VIEW_COLORS = {
    'на реку': '#1aa3ff',
    'на дорогу': '#a9adb4',
    'на лес': '#4cc02a',
    'на ЖК': '#ff8a1e',
    'окна в окна': '#d724ea',
    'во двор': '#14e0a0'
  };
  var VIEW_ORDER = ['на реку', 'на дорогу', 'на лес', 'на ЖК', 'окна в окна', 'во двор'];
  // в легенде предлог «на» не повторяется: На реку · Дорогу · Лес · ЖК
  var VIEW_LABELS = {
    'на реку': 'на реку',
    'на дорогу': 'дорогу',
    'на лес': 'лес',
    'на ЖК': 'ЖК',
    'окна в окна': 'окна в окна',
    'во двор': 'во двор'
  };
  var VIEW_FULL = {
    'на реку': 'на реку',
    'на дорогу': 'на дорогу',
    'на лес': 'на лес',
    'на ЖК': 'на ЖК',
    'окна в окна': 'окна в окна',
    'во двор': 'во двор'
  };
  var DISC_COLORS = { yes: '#ff2ec4', no: '#1a5cff' };
  var DAYS_FROM = '#00c8ff', DAYS_TO = '#ff00c8';
  var ACCENT = '#2f6bff';
  var ACCENT_LOW = '#16305e';
  var UNSOLD = '#2a2c30';
  var PENDING_PLAN = '#474b53';   // в обработке — светлее непроданных
  var DIM = '#161719';
  var INK = '#0c0d0f';

  var SHARE_STOPS = [
    [0.00, '#ff2d2d'],
    [0.35, '#ff8a1e'],
    [0.60, '#ffe600'],
    [0.80, '#a6e22e'],
    [1.00, '#35e02a']
  ];

  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function rgb2hex(c) {
    return '#' + c.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }
  function mix(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b);
    return rgb2hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
  }
  function shareColor(v) {
    var t = Math.max(0, Math.min(1, v || 0));
    for (var i = 1; i < SHARE_STOPS.length; i++) {
      if (t <= SHARE_STOPS[i][0]) {
        var a = SHARE_STOPS[i - 1], b = SHARE_STOPS[i];
        return mix(a[1], b[1], (t - a[0]) / (b[0] - a[0] || 1));
      }
    }
    return SHARE_STOPS[SHARE_STOPS.length - 1][1];
  }
  // когда выбран один менеджер, доля перестаёт быть реализацией корпуса
  // и становится его вкладом — шкала «мало/много» тут не к месту
  // доля внутри категории «со скидкой» — не оценка: низкий процент здесь
  // не хуже высокого, поэтому шкалу «красный → зелёный» заменяем цветом категории
  function catColorNow() {
    if (state.tab === 'discount' && state.cats.length === 1) return DISC_COLORS[state.cats[0]];
    if (state.managers.length || state.weeks.length) return ACCENT;
    // срок сделки — тоже не оценка: берём цвет самого интервала
    if (daysNarrowed()) return daysColor((state.daysFrom + state.daysTo) / 2);
    // вид из окна не отменяет оценку: доля проданных «на реку» — по-прежнему
    // доля от квартир с этим видом, поэтому шкала остаётся красно-зелёной
    if (state.tab !== 'view' && state.cats.length) return ACCENT;
    return null;
  }
  function shareColorNow(v) {
    return catColorNow() || shareColor(v);
  }
  function daysColor(d) {
    var t = Math.max(0, Math.min(1, (d || 0) / 65));
    return mix(DAYS_FROM, DAYS_TO, t);
  }
  function gradientCss(stops) {
    return 'linear-gradient(90deg,' + stops.map(function (s) {
      return s[1] + ' ' + (s[0] * 100) + '%';
    }).join(',') + ')';
  }

  /* ---------------- форматирование ---------------- */

  var NBSP = ' ';
  function nf(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }
  function dec(v, d) { return v.toFixed(d).replace('.', ','); }

  function fmtBig(v) {
    if (!v) return '0';
    if (v >= 1e9) return dec(v / 1e9, 2) + NBSP + 'млрд' + NBSP + '₽';
    if (v >= 1e6) return nf(Math.round(v / 1e6)) + NBSP + 'млн' + NBSP + '₽';
    return nf(Math.round(v)) + NBSP + '₽';
  }
  function fmtMln(v) {
    if (!v) return '0';
    if (v >= 1e9) return dec(v / 1e9, 2) + NBSP + 'млрд';
    if (v >= 1e6) return nf(Math.round(v / 1e6)) + NBSP + 'млн';
    if (v >= 1e5) return dec(v / 1e6, 1) + NBSP + 'млн';
    return nf(Math.round(v / 1e3)) + NBSP + 'тыс';
  }
  function fmtDiscBig(v) {
    if (!v) return '0';
    var s = v >= 1e9 ? dec(v / 1e9, 2) + NBSP + 'млрд'
      : v >= 1e6 ? dec(v / 1e6, 1) + NBSP + 'млн'
        : nf(Math.round(v / 1e3)) + NBSP + 'тыс';
    return '−' + s + NBSP + '₽';
  }
  function fmtDisc(v) {
    if (!v) return '—';
    var s = v >= 1e6 ? dec(v / 1e6, 1) + NBSP + 'млн' : nf(Math.round(v / 1e3)) + NBSP + 'тыс';
    return '−' + s;
  }
  function fmtPct2(v) { return dec((v || 0) * 100, 2) + '%'; }
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function d2(n) { return n < 10 ? '0' + n : String(n); }
  function shortDate(iso) {
    var p = String(iso).split('-');
    return p[2] + '.' + p[1];
  }

  /* ---------------- подготовка данных ---------------- */

  function addDays(iso, n) {
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + '-' + d2(d.getUTCMonth() + 1) + '-' + d2(d.getUTCDate());
  }
  function weekStart(iso) {
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var dow = (d.getUTCDay() + 6) % 7;
    return addDays(iso, -dow);
  }

  var RECS = DATA.map(function (r) {
    var parts = r.apartment.split('-');
    var sub = parts[2];
    var group = r.building === 'ГП4' ? r.building + ' ' + sub : r.building;
    var sold = r.sale_price != null;
    return {
      raw: r,
      apartment: r.apartment,
      building: r.building,
      sub: sub,
      group: group,
      floor: r.floor,
      rooms: r.rooms,
      area: r.area_m2,
      price: r.price,
      salePrice: r.sale_price,
      discount: r.discount || 0,
      manager: r.manager,
      days: r.days_in_work,
      req: r.request_date,
      view: r.view,
      date: r.deal_date,
      week: sold ? weekStart(r.deal_date) : null,
      sold: sold,
      num: Number(parts[3])
    };
  });

  var GROUPS = ['ГП1', 'ГП2', 'ГП3', 'ГП4 А', 'ГП4 Б', 'ГП4 В'];
  var MANAGERS = ['Иван', 'Лиана', 'Миша', 'Саша', 'Филипп'];
  var MAX_FLOOR = RECS.reduce(function (a, r) { return Math.max(a, r.floor); }, 0);

  var SOLD = RECS.filter(function (r) { return r.sold; });
  var DATE_MIN = SOLD.map(function (r) { return r.date; }).sort()[0];
  var DATE_MAX = SOLD.map(function (r) { return r.date; }).sort().slice(-1)[0];

  var WEEKS = (function () {
    var out = [], cur = weekStart(DATE_MIN), last = weekStart(DATE_MAX);
    while (cur <= last) { out.push(cur); cur = addDays(cur, 7); }
    return out;
  })();

  var BY_GROUP = {};
  GROUPS.forEach(function (g) {
    BY_GROUP[g] = RECS.filter(function (r) { return r.group === g; });
  });

  /* ---------------- состояние ---------------- */

  var state = {
    tab: 'view',
    groups: [],
    floors: [],
    rooms: [],
    managers: [],
    weeks: [],
    cats: [],
    apartment: null,
    base: 'own',            // первый таб в блоке долей; см. firstBase()
    daysFrom: 0,
    daysTo: 65
  };
  var DAYS_MAX = 65;

  function has(arr, v) { return arr.indexOf(v) >= 0; }
  /** добавить, убрать или переключить значение; возвращает, выбрано ли оно теперь */
  function pick(arr, v, mode) {
    var i = arr.indexOf(v);
    if (mode === 'remove') {
      if (i >= 0) arr.splice(i, 1);
      return false;
    }
    if (mode === 'add') {
      if (i < 0) arr.push(v);
      return true;
    }
    if (i < 0) { arr.push(v); return true; }
    arr.splice(i, 1);
    return false;
  }
  function daysNarrowed() { return state.daysFrom > 0 || state.daysTo < DAYS_MAX; }

  /* протяжка: зажали кнопку и ведём по соседним одинаковым элементам */
  var drag = { kind: null, mode: 'add' };
  function stopDrag() { drag.kind = null; }
  document.addEventListener('pointerup', stopDrag);
  document.addEventListener('pointercancel', stopDrag);
  document.addEventListener('mouseup', stopDrag);
  window.addEventListener('blur', stopDrag);

  function stateKey() {
    return [state.groups, state.floors, state.rooms, state.managers, state.weeks, state.cats]
      .map(function (a) { return a.slice().sort().join(','); }).join('|');
  }

  function bindPick(node, kind, apply) {
    node.style.cursor = 'pointer';
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      drag.kind = kind;
      // направление протяжки задаёт первое действие: сняли фильтр — ведём и снимаем
      drag.mode = apply('toggle') ? 'add' : 'remove';
      render();
    });
    // перерисовка пересоздаёт узлы, поэтому входим только на реальном изменении:
    // иначе новый узел под курсором снова шлёт pointerenter и получается петля
    node.addEventListener('pointerenter', function () {
      if (drag.kind !== kind) return;
      var before = stateKey();
      apply(drag.mode);
      if (stateKey() !== before) render();
    });
  }

  function inScope(r) {
    if (state.groups.length && !has(state.groups, r.group)) return false;
    if (state.floors.length && !has(state.floors, r.floor)) return false;
    if (state.rooms.length && !has(state.rooms, r.rooms)) return false;
    return true;
  }
  function catOf(r) {
    if (state.tab === 'view') return r.view;
    if (state.tab === 'discount') return r.discount ? 'yes' : 'no';
    return null;
  }
  function passCat(r) {
    if (!state.cats.length) return true;
    return has(state.cats, catOf(r));
  }
  // скидка и срок — свойства сделки, поэтому пул непроданных ими не сужается
  function passCatStock(r) {
    if (!state.cats.length) return true;
    return state.tab === 'view' ? passCat(r) : true;
  }
  function inDaysRange(r) {
    if (state.daysFrom <= 0 && state.daysTo >= DAYS_MAX) return true;
    return r.days != null && r.days >= state.daysFrom && r.days <= state.daysTo;
  }
  // всё, что сужает сделки, кроме выбранной категории
  function dealFilters(r) {
    if (state.managers.length && !has(state.managers, r.manager)) return false;
    if (state.weeks.length && !has(state.weeks, r.week)) return false;
    if (!inDaysRange(r)) return false;
    return true;
  }
  function isActive(r) {
    if (!inScope(r)) return false;
    if (!passCat(r)) return false;
    return dealFilters(r);
  }
  function activeDeals() {
    return SOLD.filter(isActive);
  }
  /** на этой неделе поступило обращение, а сделка закрылась позже */
  function pendingOfWeek(r, week) {
    if (!r.sold || !r.req) return false;
    var end = addDays(week, 6);
    return r.req >= week && r.req <= end && r.date > end;
  }
  function pendingCandidates() {
    return SOLD.filter(function (r) {
      return inScope(r) && passCat(r)
        && (!state.managers.length || has(state.managers, r.manager))
        && inDaysRange(r);
    });
  }
  function scopeStock() {
    return RECS.filter(function (r) { return inScope(r) && passCatStock(r); });
  }

  function colorOf(r) {
    if (state.tab === 'view') return VIEW_COLORS[r.view] || UNSOLD;
    if (state.tab === 'discount') return r.discount ? DISC_COLORS.yes : DISC_COLORS.no;
    return daysColor(r.days);
  }

  function median(arr) {
    var a = arr.filter(function (v) { return v != null; }).slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function sum(arr, f) {
    return arr.reduce(function (a, r) { return a + (f(r) || 0); }, 0);
  }

  /* ---------------- svg ---------------- */

  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, str, attrs) {
    var n = el('text', Object.assign({ x: x, y: y, fill: '#fff' }, attrs || {}), parent);
    n.textContent = str;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function widthOf(node, fallback) {
    var w = node.clientWidth || node.getBoundingClientRect().width;
    return Math.max(w || fallback, 260);
  }


  /* ---------------- карточка квартиры ---------------- */

  var tipBox = document.getElementById('tipbox');
  var pinPos = { x: 0, y: 0 };

  function tipRow(box, k, v) {
    var row = document.createElement('div');
    row.className = 'tt-row';
    var a = document.createElement('span');
    a.className = 'k';
    a.textContent = k;
    var b = document.createElement('span');
    b.className = 'v';
    b.textContent = v;
    row.appendChild(a);
    row.appendChild(b);
    box.appendChild(row);
  }
  function tipSep(box) {
    var d = document.createElement('div');
    d.className = 'tt-sep';
    box.appendChild(d);
  }

  function fillTip(r, pinned) {
    clear(tipBox);
    var title = document.createElement('div');
    title.className = 'tt-title';
    var sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = r.sold ? colorOf(r) : UNSOLD;
    title.appendChild(sw);
    title.appendChild(document.createTextNode(r.apartment));
    tipBox.appendChild(title);

    tipRow(tipBox, 'Корпус и секция', r.building + ' · ' + r.sub);
    tipRow(tipBox, 'Этаж', r.floor);
    tipRow(tipBox, 'Комнат', r.rooms);
    tipRow(tipBox, 'Планировка', r.raw.layout || '—');
    tipRow(tipBox, 'Площадь', dec(r.area, 1) + NBSP + 'м²');
    tipRow(tipBox, 'Вид из окон', VIEW_FULL[r.view] || r.view);
    tipSep(tipBox);
    tipRow(tipBox, 'Прайс', fmtMln(r.price) + NBSP + '₽');
    tipRow(tipBox, 'Цена за м²', r.raw.price_per_m2 ? nf(Math.round(r.raw.price_per_m2)) + NBSP + '₽' : '—');
    if (r.sold) {
      tipRow(tipBox, 'Цена продажи', fmtMln(r.salePrice) + NBSP + '₽');
      tipRow(tipBox, 'Скидка', r.discount ? '−' + fmtMln(r.discount) + NBSP + '₽' : 'нет');
      tipSep(tipBox);
      tipRow(tipBox, 'Менеджер', r.manager);
      tipRow(tipBox, 'Обращение', shortDate(r.raw.request_date) + '.22');
      tipRow(tipBox, 'Сделка', shortDate(r.date) + '.22');
      tipRow(tipBox, 'Дней в работе', nf(r.days));
    } else {
      tipSep(tipBox);
      tipRow(tipBox, 'Статус', 'в экспозиции');
    }
    if (pinned) {
      var hint = document.createElement('div');
      hint.className = 'tt-hint';
      hint.textContent = 'клик по квартире — снять выбор';
      tipBox.appendChild(hint);
    }
  }

  function placeTip(x, y) {
    var w = tipBox.offsetWidth, h = tipBox.offsetHeight;
    var nx = x + 16, ny = y + 16;
    if (nx + w > window.innerWidth - 12) nx = x - w - 16;
    if (ny + h > window.innerHeight - 12) ny = Math.max(12, y - h - 16);
    tipBox.style.left = Math.max(12, nx) + 'px';
    tipBox.style.top = Math.max(12, ny) + 'px';
  }

  function showTip(evt, r) {
    if (state.apartment) return;
    fillTip(r, false);
    tipBox.classList.add('is-visible');
    tipBox.classList.remove('is-pinned');
    placeTip(evt.clientX, evt.clientY);
  }
  function hideTip() {
    if (state.apartment) return;
    tipBox.classList.remove('is-visible');
  }
  function showPinned() {
    var r = RECS.filter(function (x) { return x.apartment === state.apartment; })[0];
    if (!r) { tipBox.classList.remove('is-visible', 'is-pinned'); return; }
    fillTip(r, true);
    tipBox.classList.add('is-visible');
    tipBox.classList.add('is-pinned');
    placeTip(pinPos.x, pinPos.y);
  }
  function selectApartment(evt, r) {
    if (state.apartment === r.apartment) {
      state.apartment = null;
    } else {
      state.apartment = r.apartment;
      pinPos = { x: evt.clientX, y: evt.clientY };
    }
    render();
  }
  function bindCell(node, r) {
    node.addEventListener('mousemove', function (e) { showTip(e, r); });
    node.addEventListener('mouseleave', hideTip);
    node.addEventListener('click', function (e) {
      e.stopPropagation();
      selectApartment(e, r);
    });
    node.style.cursor = 'pointer';
  }

  /* ---------------- фактоиды ---------------- */

  function renderKpi() {
    var deals = activeDeals();
    var stock = scopeStock();
    var revenue = sum(deals, function (r) { return r.salePrice; });
    var share = stock.length ? deals.length / stock.length : 0;
    var md = median(deals.map(function (r) { return r.days; }));

    document.getElementById('kpi-revenue').textContent = fmtBig(revenue);
    document.getElementById('kpi-deals').textContent = nf(deals.length);
    document.getElementById('kpi-share').textContent = fmtPct2(share);
    document.getElementById('kpi-days').textContent = md == null
      ? '—'
      : Math.round(md) + NBSP + plural(Math.round(md), 'день', 'дня', 'дней');
    document.getElementById('kpi-discount').textContent =
      fmtDiscBig(sum(deals, function (r) { return r.discount; }));
    document.getElementById('deals-total').textContent = nf(deals.length);
  }

  /* ---------------- табы и легенда ---------------- */

  var TABS = [
    { key: 'view', label: 'По виду из окна' },
    { key: 'days', label: 'По длительности сделки' },
    { key: 'discount', label: 'По наличию скидки' }
  ];

  function renderTabs() {
    var box = document.getElementById('tabs');
    clear(box);
    TABS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab' + (state.tab === t.key ? ' is-active' : '');
      b.textContent = t.label;
      b.onclick = function () {
        if (state.tab === t.key) return;
        state.tab = t.key;
        state.cats = [];
        state.base = firstBase(t.key);
        render();
      };
      box.appendChild(b);
    });
  }

  /** в блоке долей по умолчанию выбран первый доступный для этого таба вариант */
  function firstBase(tab) {
    for (var i = 0; i < BASES.length; i++) {
      if (!BASES[i].only || BASES[i].only === tab) return BASES[i].key;
    }
    return 'stock';
  }

  function legendItem(color, label, key) {
    var s = document.createElement('span');
    s.className = 'item' + (state.cats.length && !has(state.cats, key) ? ' is-off' : '');
    var sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = color;
    s.appendChild(sw);
    s.appendChild(document.createTextNode(label));
    if (key) {
      bindPick(s, 'cat', function (mode) { return pick(state.cats, key, mode); });
    }
    return s;
  }

  function renderLegend() {
    var box = document.getElementById('legend');
    clear(box);
    if (state.tab === 'view') {
      VIEW_ORDER.forEach(function (v) {
        box.appendChild(legendItem(VIEW_COLORS[v], VIEW_LABELS[v], v));
      });
    } else if (state.tab === 'discount') {
      box.appendChild(legendItem(DISC_COLORS.yes, 'со скидкой', 'yes'));
      box.appendChild(legendItem(DISC_COLORS.no, 'без скидки', 'no'));
    } else {
      box.appendChild(daysRangeControl());
    }
  }

  function dayWord(n) { return n + NBSP + plural(n, 'день', 'дня', 'дней'); }

  /** две цеплялки: интервал срока сделки */
  function daysRangeControl() {
    var wrap = document.createElement('span');
    wrap.className = 'scale range-scale';

    var a = document.createElement('span');
    a.className = 'range-val';
    a.textContent = dayWord(state.daysFrom);

    var track = document.createElement('span');
    track.className = 'range-track';
    var full = document.createElement('i');
    full.className = 'range-full';
    full.style.background = 'linear-gradient(90deg,' + DAYS_FROM + ',' + DAYS_TO + ')';
    var sel = document.createElement('i');
    sel.className = 'range-sel';
    sel.style.left = (state.daysFrom / DAYS_MAX * 100) + '%';
    sel.style.right = (100 - state.daysTo / DAYS_MAX * 100) + '%';
    sel.style.background = 'linear-gradient(90deg,' + daysColor(state.daysFrom) + ',' + daysColor(state.daysTo) + ')';
    track.appendChild(full);
    track.appendChild(sel);

    [['from', state.daysFrom], ['to', state.daysTo]].forEach(function (h) {
      var knob = document.createElement('i');
      knob.className = 'range-knob';
      knob.style.left = (h[1] / DAYS_MAX * 100) + '%';
      knob.style.background = daysColor(h[1]);
      knob.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        dragKnob(h[0]);
      });
      track.appendChild(knob);
    });

    var b = document.createElement('span');
    b.className = 'range-val';
    b.textContent = dayWord(state.daysTo);

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'range-reset';
    reset.textContent = 'Весь срок';
    reset.onclick = function () {
      state.daysFrom = 0;
      state.daysTo = DAYS_MAX;
      render();
    };

    wrap.appendChild(a);
    wrap.appendChild(track);
    wrap.appendChild(b);
    if (state.daysFrom > 0 || state.daysTo < DAYS_MAX) wrap.appendChild(reset);
    return wrap;
  }

  var dragRaf = null;
  function dragKnob(which) {
    function move(e) {
      // дорожку ищем заново: перерисовка заменяет узел, а старый теряет размеры
      var node = document.querySelector('.range-track');
      if (!node) return;
      var box = node.getBoundingClientRect();
      var t = Math.max(0, Math.min(1, (e.clientX - box.left) / (box.width || 1)));
      var v = Math.round(t * DAYS_MAX);
      if (which === 'from') state.daysFrom = Math.min(v, state.daysTo);
      else state.daysTo = Math.max(v, state.daysFrom);
      if (dragRaf) return;
      dragRaf = requestAnimationFrame(function () {
        dragRaf = null;
        render();
      });
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      render();
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function renderManagerChips() {
    var box = document.getElementById('mchips');
    clear(box);
    MANAGERS.forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mchip' + (has(state.managers, name) ? ' is-active' : '')
        + (state.managers.length && !has(state.managers, name) ? ' is-dim' : '');
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = name.charAt(0);
      b.appendChild(badge);
      b.appendChild(document.createTextNode(name));
      bindPick(b, 'manager', function (mode) { return pick(state.managers, name, mode); });
      box.appendChild(b);
    });
  }

  /* ---------------- дом ---------------- */

  var CELL_W = { 1: 14, 2: 20, 3: 27 };
  var CELL_H = 15;
  var ROW_STEP = 18;
  var GAP_X = 3;
  var GROUP_GAP = 17;
  var planVW = 0;
  var LABEL_W = 26;
  var TOP_PAD = 36;

  function planLayout() {
    var groups = GROUPS.map(function (g) {
      var byFloor = {};
      BY_GROUP[g].forEach(function (r) {
        (byFloor[r.floor] = byFloor[r.floor] || []).push(r);
      });
      Object.keys(byFloor).forEach(function (f) {
        byFloor[f].sort(function (a, b) { return a.num - b.num; });
      });
      var width = 0, top = 0, cols = [];
      Object.keys(byFloor).forEach(function (f) {
        var row = byFloor[f];
        var w = row.reduce(function (a, r) { return a + CELL_W[r.rooms] + GAP_X; }, -GAP_X);
        if (w > width) width = w;
        if (Number(f) > top) top = Number(f);
        if (row.length >= (cols.length || 0)) {
          // за эталон берём полный этаж: на первом этаже квартир меньше
          if (row.length > cols.length) cols = row.map(function (r) { return r.rooms; });
        }
      });
      return { key: g, byFloor: byFloor, width: width, topFloor: top, cols: cols, items: BY_GROUP[g] };
    });
    var x = LABEL_W;
    groups.forEach(function (g) { g.x = x; x += g.width + GROUP_GAP; });
    return { groups: groups, width: x - GROUP_GAP };
  }

  function renderPlan() {
    var wrap = document.getElementById('plan-wrap');
    clear(wrap);
    var lay = planLayout();
    var pending = pendingSet();
    CELL_H = ROW_STEP - 4;
    var planH = TOP_PAD + MAX_FLOOR * ROW_STEP;
    var footH = 58;
    var vw = lay.width;
    var vh = planH + footH;
    planVW = vw;

    var svg = el('svg', {
      'class': 'plan',
      viewBox: '0 0 ' + vw + ' ' + vh,
      preserveAspectRatio: 'xMinYMin meet'
    }, wrap);
    svg.style.height = 'auto';

    function yOf(f) { return TOP_PAD + (MAX_FLOOR - f) * ROW_STEP; }

    var plateLayer = el('g', {}, svg);
    var bandLayer = el('g', {}, svg);
    var cellLayer = el('g', {}, svg);
    var uiLayer = el('g', {}, svg);

    // номера этажей — они же переключатель этажа
    var floorLabels = {};
    for (var f = 1; f <= MAX_FLOOR; f++) {
      (function (floor) {
        var lab = text(uiLayer, LABEL_W - 8, yOf(floor) + CELL_H / 2 + 3.4, String(floor), {
          'data-floor': floor,
          'text-anchor': 'end',
          'font-size': 9.5,
          fill: has(state.floors, floor) ? '#ffe600' : (state.floors.length ? '#4a4d53' : '#6f7379'),
          'font-weight': has(state.floors, floor) ? 700 : 600,
          cursor: 'pointer'
        });
        floorLabels[floor] = lab;
        lab.addEventListener('mouseenter', function () { hoverFloor(floor, true); });
        lab.addEventListener('mouseleave', function () { hoverFloor(floor, false); });
        bindPick(lab, 'floor', function (mode) { return pick(state.floors, floor, mode); });
      })(f);
    }

    // полоса этажа только подсвечивает; выбор — по цифре этажа
    var bands = {};
    for (var fl = 1; fl <= MAX_FLOOR; fl++) {
      bands[fl] = el('rect', {
        x: 0, y: yOf(fl) - 1.5,
        width: vw, height: CELL_H + 3,
        rx: 3,
        fill: has(state.floors, fl) ? 'rgba(255,255,255,0.10)' : 'transparent',
        'pointer-events': 'none'
      }, bandLayer);
    }

    function hoverFloor(floor, on) {
      var band = bands[floor];
      if (band && !has(state.floors, floor)) {
        band.setAttribute('fill', on ? 'rgba(255,255,255,0.09)' : 'transparent');
      }
      var lab = floorLabels[floor];
      if (lab && !has(state.floors, floor)) {
        lab.setAttribute('fill', on ? '#ffffff' : (state.floors.length ? '#4a4d53' : '#6f7379'));
      }
    }

    lay.groups.forEach(function (g) {
      var selected = has(state.groups, g.key);
      var dimmed = state.groups.length && !selected;

      // плашка корпуса — появляется при наведении на название или квартиру
      var plate = el('rect', {
        x: g.x - 9, y: yOf(g.topFloor) - 32,
        width: g.width + 18, height: (MAX_FLOOR - g.topFloor) * 0 + (yOf(1) - yOf(g.topFloor)) + CELL_H + 32 + 52,
        rx: 10,
        fill: selected ? 'rgba(255,255,255,0.05)' : 'transparent',
        'pointer-events': 'none'
      }, plateLayer);
      function platePlate(on) {
        if (selected) return;
        plate.setAttribute('fill', on ? 'rgba(255,255,255,0.05)' : 'transparent');
      }

      // комнатность стояков — над квадратиками
      var cx0 = g.x;
      g.cols.forEach(function (rooms) {
        var cw = CELL_W[rooms];
        var lab = text(uiLayer, cx0 + cw / 2, yOf(g.topFloor) - 6, rooms + 'к', {
          'data-rooms': rooms,
          'text-anchor': 'middle',
          'font-size': 8.5,
          'font-weight': 700,
          fill: (has(state.rooms, rooms) && (!state.groups.length || selected))
            ? '#ffe600'
            : (state.rooms.length || dimmed ? '#4a4d53' : '#8a8d94'),
          cursor: 'pointer'
        });
        bindPick(lab, 'rooms', function (mode) { return pick(state.rooms, rooms, mode); });
        cx0 += cw + GAP_X;
      });

      var title = text(uiLayer, g.x, yOf(g.topFloor) - 20, g.key, {
        'data-group': g.key,
        'font-size': 12.5,
        'font-weight': 700,
        fill: dimmed ? '#5d6067' : '#fff',
        cursor: 'pointer'
      });
      title.addEventListener('mouseenter', function () { platePlate(true); });
      title.addEventListener('mouseleave', function () { platePlate(false); });
      bindPick(title, 'group', function (mode) { return pick(state.groups, g.key, mode); });

      Object.keys(g.byFloor).forEach(function (fk) {
        var floor = Number(fk);
        var x = g.x;
        g.byFloor[fk].forEach(function (r) {
          var w = CELL_W[r.rooms];
          var active = isActive(r);
          var fill = !r.sold
            ? (inScope(r) && passCatStock(r) ? UNSOLD : DIM)
            : (active ? colorOf(r) : (pending[r.apartment] ? PENDING_PLAN : DIM));
          var picked = state.apartment === r.apartment;
          var cell = el('rect', {
            x: x, y: yOf(floor), width: w, height: CELL_H, rx: 2.5, fill: fill,
            stroke: picked ? '#ffffff' : 'none',
            'stroke-width': picked ? 1.6 : 0
          }, cellLayer);
          bindCell(cell, r);
          cell.addEventListener('mouseenter', function () { hoverFloor(floor, true); platePlate(true); });
          cell.addEventListener('mouseleave', function () { hoverFloor(floor, false); platePlate(false); });
          if (r.sold && active && w >= 13) {
            text(cellLayer, x + w / 2, yOf(floor) + CELL_H / 2 + 3.2, r.manager.charAt(0), {
              'text-anchor': 'middle',
              'font-size': 8.5,
              'font-weight': 700,
              fill: INK,
              'pointer-events': 'none',
              opacity: 0.85
            });
          }
          x += w + GAP_X;
        });
      });

      // доля проданных по корпусу
      var pool = g.items.filter(function (r) {
        return (!state.floors.length || has(state.floors, r.floor))
          && (!state.rooms.length || has(state.rooms, r.rooms))
          && passCatStock(r);
      });
      var soldN = pool.filter(function (r) {
        return r.sold && passCat(r) && dealFilters(r);
      }).length;
      var share = pool.length ? soldN / pool.length : 0;
      var fy = planH + 12;
      el('rect', { x: g.x, y: fy, width: g.width, height: 5, rx: 2.5, fill: '#2a2c30' }, uiLayer);
      if (pool.length) {
        el('rect', {
          x: g.x, y: fy, width: Math.max(2, g.width * share), height: 5, rx: 2.5,
          fill: shareColorNow(share), opacity: dimmed ? 0.4 : 1
        }, uiLayer);
      }
      text(uiLayer, g.x + g.width / 2, fy + 24, pool.length ? Math.round(share * 100) + '%' : '—', {
        'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700,
        fill: dimmed || !pool.length ? '#5d6067' : '#fff'
      });
      if (!pool.length) return;
      var frac = el('text', {
        x: g.x + g.width / 2, y: fy + 37, 'text-anchor': 'middle', 'font-size': 9.5
      }, uiLayer);
      var t1 = el('tspan', { fill: shareColorNow(share) }, frac);
      t1.textContent = nf(soldN);
      var t2 = el('tspan', { fill: '#6f7379' }, frac);
      t2.textContent = '/' + nf(pool.length);
    });
  }

  /* ---------------- графики ---------------- */

  var CHART_LEFT = 40, CHART_RIGHT = 4;

  function sortDeals(list) {
    return list.slice().sort(function (p, q) {
      if (state.tab === 'view') return VIEW_ORDER.indexOf(p.view) - VIEW_ORDER.indexOf(q.view);
      if (state.tab === 'discount') return (p.discount ? 1 : 0) - (q.discount ? 1 : 0);
      return (p.days || 0) - (q.days || 0);
    });
  }

  function weekAgg() {
    var deals = activeDeals();
    var map = {};
    WEEKS.forEach(function (w) { map[w] = { week: w, deals: [], count: 0, revenue: 0 }; });
    deals.forEach(function (r) {
      var b = map[r.week];
      if (!b) return;
      b.deals.push(r);
      b.count++;
      b.revenue += r.salePrice;
    });
    return WEEKS.map(function (w) { return map[w]; });
  }

  /** квартиры в обработке на выбранных неделях — для схемы корпусов */
  function pendingSet() {
    var set = {};
    if (!state.weeks.length) return set;
    pendingCandidates().forEach(function (r) {
      for (var i = 0; i < state.weeks.length; i++) {
        if (pendingOfWeek(r, state.weeks[i])) { set[r.apartment] = 1; return; }
      }
    });
    return set;
  }

  /* Шкалы недельных графиков постоянны: считаются один раз по всем данным,
     поэтому при фильтрации столбцы уменьшаются, а не пересчитывают масштаб. */
  var WEEK_MAX = (function () {
    var cnt = {}, rev = {};
    WEEKS.forEach(function (w) { cnt[w] = 0; rev[w] = 0; });
    SOLD.forEach(function (r) {
      if (cnt[r.week] != null) { cnt[r.week]++; rev[r.week] += r.salePrice; }
    });
    var mc = 1, mv = 0;
    WEEKS.forEach(function (w) {
      if (cnt[w] > mc) mc = cnt[w];
      if (rev[w] > mv) mv = rev[w];
    });
    return { count: mc, revenue: mv };
  })();

  function renderCumulative() {
    var host = document.getElementById('chart-cum');
    clear(host);
    var w = widthOf(host, 700), h = 150;
    var svg = el('svg', { 'class': 'chart', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h }, host);

    var deals = activeDeals().slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    var stock = scopeStock().length || 1;
    var t0 = Date.parse(DATE_MIN), t1 = Date.parse(DATE_MAX) || t0 + 1;
    var finalShare = deals.length / stock;
    var valueBox = document.getElementById('cum-value');
    valueBox.textContent = fmtPct2(finalShare);

    var top = 46, bottom = 8;
    // шкала постоянная: 0–60%. Выше поднимается только там, где фильтр
    // сам по себе даёт больше 60% — иначе линия ушла бы за поле графика.
    var maxY = 0.6;
    while (finalShare > maxY + 1e-9) maxY += 0.2;
    var mL = CHART_LEFT, mR = CHART_RIGHT;
    // ось времени размечена неделями — ровно так же, как столбцы «Сделок» и «Выручки»
    var cstep = (w - mL - mR) / WEEKS.length;
    var tw0 = Date.parse(WEEKS[0]);
    function X(ms) { return mL + cstep * (ms - tw0) / 6048e5; }
    function Y(v) { return h - bottom - (h - top - bottom) * (v / maxY); }

    var ticks = [];
    for (var tv = 0.2; tv <= maxY + 1e-9; tv += 0.2) ticks.push(Math.round(tv * 100) / 100);
    ticks.forEach(function (v) {
      el('line', {
        x1: mL, x2: w - mR, y1: Y(v), y2: Y(v),
        stroke: '#232529', 'stroke-width': 1
      }, svg);
      text(svg, mL - 8, Y(v) + 3.5, Math.round(v * 100) + '%', {
        'text-anchor': 'end', 'font-size': 11, fill: '#6f7379'
      });
    });

    // накопление по дням, чтобы линия была плавной, а не ступенчатой
    var perDay = {};
    deals.forEach(function (r) { perDay[r.date] = (perDay[r.date] || 0) + 1; });
    var pts = [], acc = 0, byDate = {};
    for (var ms = t0; ms <= t1; ms += 864e5) {
      var iso = new Date(ms).toISOString().slice(0, 10);
      acc += perDay[iso] || 0;
      byDate[iso] = acc;
      pts.push([X(ms), Y(acc / stock)]);
    }
    if (pts.length < 2) pts = [[X(t0), Y(0)], [X(t1), Y(acc / stock)]];

    var d = pts.reduce(function (acc2, p, i) {
      if (!i) return 'M' + p[0].toFixed(1) + ',' + p[1].toFixed(1);
      var prev = pts[i - 1];
      var cx = (prev[0] + p[0]) / 2;
      return acc2 + 'C' + cx.toFixed(1) + ',' + prev[1].toFixed(1) + ' ' +
        cx.toFixed(1) + ',' + p[1].toFixed(1) + ' ' + p[0].toFixed(1) + ',' + p[1].toFixed(1);
    }, '');

    var line = shareColorNow(finalShare);
    var gid = 'cumfill';
    var defs = el('defs', {}, svg);
    var lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': line, 'stop-opacity': 0.32 }, lg);
    el('stop', { offset: '100%', 'stop-color': line, 'stop-opacity': 0 }, lg);

    var bandLayer = el('g', {}, svg);

    el('path', {
      d: d + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + (h - bottom) + 'L' + pts[0][0].toFixed(1) + ',' + (h - bottom) + 'Z',
      fill: 'url(#' + gid + ')'
    }, svg);
    el('path', { d: d, fill: 'none', stroke: line, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    var last = pts[pts.length - 1];
    el('circle', { cx: last[0], cy: last[1], r: 3.5, fill: line }, svg);
    valueBox.style.color = line;

    /* --- недели выделяются интервалами, показатели стоят над интервалом --- */
    var weeks = weekAgg();
    var step = cstep;

    function weekEndIso(week) {
      var e = addDays(week, 6);
      return e > DATE_MAX ? DATE_MAX : e;
    }
    // выделение недели занимает ту же полосу, что и подсветка столбца в других графиках
    function bandX(i) { return [mL + i * cstep, mL + (i + 1) * cstep]; }

    /** подпись над интервалом: даты и что за него продано */
    function drawLabel(layer, x0, x1, list, strong) {
      var count = list.reduce(function (a, b) { return a + b.count; }, 0);
      var revenue = list.reduce(function (a, b) { return a + b.revenue; }, 0);
      var cx = (x0 + x1) / 2;
      var width = x1 - x0;
      var color = strong ? '#ffffff' : '#c8cbd1';

      if (width >= 92) {
        text(layer, cx, 19, shortDate(list[0].week) + ' – ' + shortDate(weekEndIso(list[list.length - 1].week)), {
          'text-anchor': 'middle', 'font-size': 10.5, fill: strong ? '#c8cbd1' : '#8a8d94'
        });
        text(layer, cx, 38, nf(count) + ' ' + plural(count, 'сделка', 'сделки', 'сделок') + ' · ' + fmtMln(revenue) + ' ₽', {
          'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, fill: color
        });
      } else {
        text(layer, cx, 13, shortDate(list[0].week), {
          'text-anchor': 'middle', 'font-size': 9.5, fill: strong ? '#c8cbd1' : '#8a8d94'
        });
        text(layer, cx, 29, nf(count), {
          'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, fill: color
        });
        text(layer, cx, 41, fmtMln(revenue), {
          'text-anchor': 'middle', 'font-size': 10, fill: strong ? '#c8cbd1' : '#8a8d94'
        });
      }
    }

    function drawBand(layer, x0, x1, opacity) {
      el('rect', {
        x: x0, y: top - 4, width: Math.max(2, x1 - x0), height: h - bottom - top + 4,
        rx: 5,
        fill: 'rgba(255,255,255,' + opacity + ')',
        'pointer-events': 'none'
      }, layer);
      [x0, x1].forEach(function (x) {
        el('line', {
          x1: x, x2: x, y1: top - 4, y2: h - bottom,
          stroke: 'rgba(255,255,255,.28)', 'stroke-width': 1, 'pointer-events': 'none'
        }, layer);
      });
    }

    // выбранные недели: соседние сливаются в один интервал
    var chosen = [];
    weeks.forEach(function (b, i) {
      if (!has(state.weeks, b.week)) return;
      var prev = chosen[chosen.length - 1];
      if (prev && prev[prev.length - 1].i === i - 1) prev.push({ i: i, b: b });
      else chosen.push([{ i: i, b: b }]);
    });
    chosen.forEach(function (grp) {
      var x0 = bandX(grp[0].i)[0];
      var x1 = bandX(grp[grp.length - 1].i)[1];
      drawBand(bandLayer, x0, x1, 0.10);
      drawLabel(svg, x0, x1, grp.map(function (g) { return g.b; }), true);
    });

    var hoverLayer = el('g', {}, svg);

    weeks.forEach(function (b, i) {
      var selected = has(state.weeks, b.week);
      var xr = bandX(i);

      var hit = el('rect', {
        x: mL + i * step, y: 0, width: step, height: h, fill: 'transparent'
      }, svg);
      hit.addEventListener('mouseenter', function () {
        if (selected) return;
        clear(hoverLayer);
        drawBand(hoverLayer, xr[0], xr[1], 0.055);
        drawLabel(hoverLayer, xr[0], xr[1], [b], false);
        var cum = (byDate[weekEndIso(b.week)] || 0) / stock;
        valueBox.textContent = fmtPct2(cum);
      });
      hit.addEventListener('mouseleave', function () {
        clear(hoverLayer);
        valueBox.textContent = fmtPct2(finalShare);
      });
      bindPick(hit, 'week', function (mode) { return pick(state.weeks, b.week, mode); });
    });
  }

  function renderDealsChart() {
    var host = document.getElementById('chart-deals');
    clear(host);
    var weeks = weekAgg();

    var maxC = WEEK_MAX.count;

    var top = 10, bottom = 22;
    var cellGap = 0.8;
    var cellH = Math.max(2.4, Math.min(6, 140 / maxC - cellGap));
    var h = top + bottom + maxC * (cellH + cellGap);
    var w = widthOf(host, 700);
    var svg = el('svg', { 'class': 'chart', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h }, host);

    var mL = CHART_LEFT, mR = CHART_RIGHT;
    var step = (w - mL - mR) / weeks.length;
    var bw = Math.max(10, step * 0.84);
    var base = h - bottom;

    weeks.forEach(function (b, i) {
      var x = mL + i * step + (step - bw) / 2;
      var selected = has(state.weeks, b.week);

      var hit = el('rect', {
        x: mL + i * step, y: 0, width: step, height: h,
        fill: selected ? 'rgba(255,255,255,0.06)' : 'transparent',
        rx: 6, cursor: 'pointer'
      }, svg);
      hit.addEventListener('mouseenter', function () {
        if (!selected) hit.setAttribute('fill', 'rgba(255,255,255,0.045)');
      });
      hit.addEventListener('mouseleave', function () {
        if (!selected) hit.setAttribute('fill', 'transparent');
      });
      bindPick(hit, 'week', function (mode) { return pick(state.weeks, b.week, mode); });

      var list = sortDeals(b.deals);
      var y = base;
      list.forEach(function (r) {
        y -= cellH;
        var picked = state.apartment === r.apartment;
        var cell = el('rect', {
          x: x, y: y, width: bw, height: cellH, rx: Math.min(2, cellH / 2),
          fill: colorOf(r),
          stroke: picked ? '#ffffff' : 'none',
          'stroke-width': picked ? 1.4 : 0
        }, svg);
        bindCell(cell, r);
        y -= cellGap;
      });

      if (b.count) {
        text(svg, x + bw / 2, base + 15, nf(b.count), {
          'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700,
          fill: selected ? '#ffffff' : '#e8e9eb', 'pointer-events': 'none'
        });
      }
    });

    var meanC = weeks.reduce(function (a, b) { return a + b.count; }, 0) / weeks.length;
    if (meanC > 0.05) {
      meanLine(svg, mL, w - mR, base - meanC * (cellH + cellGap) + cellGap,
        'ср ' + dec(meanC, 1));
    }
  }

  /** пунктир среднего за период — общая деталь недельных графиков */
  function meanLine(svg, x0, x1, y, label) {
    el('line', {
      x1: x0, x2: x1, y1: y, y2: y,
      stroke: '#9aa0a8', 'stroke-width': 1, 'stroke-dasharray': '5 4',
      'pointer-events': 'none'
    }, svg);
    var t = text(svg, x1, y - 5, label, {
      'text-anchor': 'end', 'font-size': 10.5, 'font-weight': 700,
      fill: '#9aa0a8', 'pointer-events': 'none'
    });
    var tw = label.length * 5.5;
    try { tw = t.getComputedTextLength() || tw; } catch (e) {}
    // подложка: линия среднего проходит по столбцам, без неё подпись теряется
    svg.insertBefore(el('rect', {
      x: x1 - tw - 5, y: y - 16, width: tw + 10, height: 15, rx: 4,
      fill: '#000000', opacity: 0.72, 'pointer-events': 'none'
    }), t);
  }

  function niceMax(v) {
    if (v <= 0) return 10;
    var step = v > 8e7 ? 2e7 : v > 4e7 ? 1e7 : v > 1e7 ? 5e6 : 1e6;
    return Math.ceil(v / step) * step;
  }

  function renderRevenueChart() {
    var host = document.getElementById('chart-revenue');
    clear(host);
    var weeks = weekAgg();
    var w = widthOf(host, 700), h = 252;
    var svg = el('svg', { 'class': 'chart', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h }, host);

    var totalBox = document.getElementById('revenue-total');
    var totalV = weeks.reduce(function (a, b) { return a + b.revenue; }, 0);
    if (totalBox) totalBox.textContent = nf(Math.round(totalV / 1e6));

    var m = { top: 10, right: CHART_RIGHT, bottom: 52, left: CHART_LEFT };
    var maxV = niceMax(WEEK_MAX.revenue);
    var iw = w - m.left - m.right;
    var base = h - m.bottom;
    var step = iw / weeks.length;
    var bw = Math.max(10, step * 0.84);

    function Y(v) { return base - (base - m.top) * (v / maxV); }

    var tickStep = maxV > 8e7 ? 2e7 : maxV > 3e7 ? 1e7 : 5e6;
    for (var v = tickStep; v <= maxV + 1; v += tickStep) {
      el('line', {
        x1: m.left, x2: w - m.right, y1: Y(v), y2: Y(v),
        stroke: '#232529', 'stroke-width': 1
      }, svg);
      text(svg, m.left - 8, Y(v) + 3.5, String(Math.round(v / 1e6)), {
        'text-anchor': 'end', 'font-size': 11, fill: '#6f7379'
      });
    }
    el('line', { x1: m.left, x2: w - m.right, y1: base, y2: base, stroke: '#2f3237', 'stroke-width': 1 }, svg);

    weeks.forEach(function (b, i) {
      var x = m.left + i * step + (step - bw) / 2;
      var selected = has(state.weeks, b.week);

      var hit = el('rect', {
        x: m.left + i * step, y: m.top - 8, width: step, height: base - m.top + 40,
        rx: 6,
        fill: selected ? 'rgba(255,255,255,0.06)' : 'transparent', cursor: 'pointer'
      }, svg);
      hit.addEventListener('mouseenter', function () {
        if (!selected) hit.setAttribute('fill', 'rgba(255,255,255,0.045)');
      });
      hit.addEventListener('mouseleave', function () {
        if (!selected) hit.setAttribute('fill', 'transparent');
      });
      bindPick(hit, 'week', function (mode) { return pick(state.weeks, b.week, mode); });

      var list = sortDeals(b.deals);
      var y = base;
      list.forEach(function (r) {
        var seg = (base - m.top) * (r.salePrice / maxV);
        y -= seg;
        var picked = state.apartment === r.apartment;
        var rect = el('rect', {
          x: x, y: y, width: bw, height: Math.max(1, seg),
          fill: colorOf(r),
          stroke: picked ? '#ffffff' : '#0b0c0e',
          'stroke-width': picked ? 1.4 : 0.8
        }, svg);
        bindCell(rect, r);
      });

      var cx = m.left + i * step + step / 2;
      if (b.revenue) {
        text(svg, cx, base + 16, nf(Math.round(b.revenue / 1e6)), {
          'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700,
          fill: selected ? '#ffffff' : '#e8e9eb'
        });
      }
      text(svg, cx, base + 31, shortDate(b.week), {
        'text-anchor': 'middle', 'font-size': 10.5, fill: selected ? '#fff' : '#6f7379'
      });
      text(svg, cx, base + 43, shortDate(addDays(b.week, 6)), {
        'text-anchor': 'middle', 'font-size': 10.5, fill: selected ? '#fff' : '#6f7379'
      });
    });

    var meanV = totalV / weeks.length;
    if (meanV > 0) {
      meanLine(svg, m.left, w - m.right, Y(meanV),
        'ср ' + nf(Math.round(meanV / 1e6)));
    }
  }

  /* ---------------- таблицы ---------------- */

  function splitMoney(v, neg) {
    var n, u;
    if (!v) { n = '0'; u = ''; }
    else if (v >= 1e9) { n = dec(v / 1e9, 2); u = 'млрд'; }
    else if (v >= 1e6) { n = v < 1e7 ? dec(v / 1e6, 1) : nf(Math.round(v / 1e6)); u = 'млн'; }
    else if (v >= 1e3) { n = nf(Math.round(v / 1e3)); u = 'тыс'; }
    else { n = nf(Math.round(v)); u = '₽'; }
    return { n: (neg && v ? '−' : '') + n, u: u };
  }

  function numCell(parts, plain) {
    var td = document.createElement('td');
    var box = document.createElement('div');
    box.className = 'num' + (plain ? ' plain' : '')
      + (!plain && parts.u && parts.u.length <= 2 ? ' short' : '');
    var n = document.createElement('span');
    n.className = 'n';
    n.textContent = parts.n;
    box.appendChild(n);
    if (!plain) {
      var u = document.createElement('span');
      u.className = 'u';
      u.textContent = parts.u;
      box.appendChild(u);
    }
    td.appendChild(box);
    return td;
  }

  function renderTable() {
    var body = document.getElementById('mtable-body');
    clear(body);

    var base = SOLD.filter(function (r) {
      return inScope(r) && passCat(r) && (!state.weeks.length || has(state.weeks, r.week));
    });

    var rows = MANAGERS.map(function (name) {
      var list = base.filter(function (r) { return r.manager === name; });
      return {
        name: name,
        revenue: sum(list, function (r) { return r.salePrice; }),
        deals: list.length,
        discount: sum(list, function (r) { return r.discount; }),
        days: median(list.map(function (r) { return r.days; })),
        byWeek: WEEKS.map(function (w) {
          return list.filter(function (r) { return r.week === w; }).length;
        })
      };
    }).sort(function (a, b) { return b.revenue - a.revenue; });

    var maxWeek = rows.reduce(function (a, r) {
      return Math.max(a, Math.max.apply(null, r.byWeek));
    }, 1);

    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (state.managers.length && !has(state.managers, r.name)) tr.className = 'is-dim';
      bindPick(tr, 'manager', function (mode) { return pick(state.managers, r.name, mode); });

      var td1 = document.createElement('td');
      td1.textContent = r.name;
      tr.appendChild(td1);
      tr.appendChild(numCell(splitMoney(r.revenue)));

      var td3 = document.createElement('td');
      var sw = WEEKS.length * 8, sh = 22;
      var svg = el('svg', { 'class': 'spark', width: sw, height: sh, viewBox: '0 0 ' + sw + ' ' + sh });
      r.byWeek.forEach(function (c, i) {
        var bh = c ? Math.max(2, (sh - 4) * (c / maxWeek)) : 2;
        el('rect', {
          x: i * 8, y: sh - bh, width: 6, height: bh, rx: 1.5,
          fill: c ? '#d9dce1' : '#3a3d43'
        }, svg);
      });
      td3.appendChild(svg);
      tr.appendChild(td3);

      tr.appendChild(numCell({ n: nf(r.deals), u: '' }, true));
      tr.appendChild(numCell(r.days == null
        ? { n: '—', u: '' }
        : { n: nf(Math.round(r.days)), u: 'дн' }));
      tr.appendChild(numCell(splitMoney(r.discount, true)));
      body.appendChild(tr);
    });
  }

  /* ---------------- доли по разрезам ---------------- */

  var DAY_BUCKETS = [
    { key: '0-7', label: 'до 7 дн', from: 0, to: 7 },
    { key: '8-14', label: '8–14 дн', from: 8, to: 14 },
    { key: '15-21', label: '15–21 дн', from: 15, to: 21 },
    { key: '22-30', label: '22–30 дн', from: 22, to: 30 },
    { key: '31+', label: 'более 31 дн', from: 31, to: 9999 }
  ];
  var DIM_NAMES = {
    view: 'по виду из окна',
    discount: 'по наличию скидки',
    days: 'по длительности сделки'
  };
  var BASES = [
    { key: 'own', label: 'От числа квартир с таким видом', only: 'view' },
    { key: 'deals', label: 'От числа проданных квартир' },
    { key: 'stock', label: 'От общего числа квартир' }
  ];

  function shareRows() {
    var stock = RECS.filter(function (r) {
      return (!state.groups.length || has(state.groups, r.group))
        && (!state.floors.length || has(state.floors, r.floor))
        && (!state.rooms.length || has(state.rooms, r.rooms));
    });
    var deals = stock.filter(function (r) { return r.sold && dealFilters(r); });
    var base = state.base === 'deals' ? deals.length : stock.length;
    var rows;

    if (state.tab === 'view') {
      rows = VIEW_ORDER.map(function (v) {
        var list = deals.filter(function (r) { return r.view === v; });
        var own = stock.filter(function (r) { return r.view === v; }).length;
        return {
          key: v, label: VIEW_LABELS[v], color: VIEW_COLORS[v],
          sold: list.length, own: own,
          active: has(state.cats, v),
          pickKind: 'cat',
          click: function (mode) { return pick(state.cats, v, mode || 'toggle'); }
        };
      });
    } else if (state.tab === 'discount') {
      rows = [
        { k: 'yes', label: 'со скидкой', color: DISC_COLORS.yes, list: deals.filter(function (r) { return r.discount; }) },
        { k: 'no', label: 'без скидки', color: DISC_COLORS.no, list: deals.filter(function (r) { return !r.discount; }) }
      ].map(function (row) {
        return {
          key: row.k, label: row.label, color: row.color, sold: row.list.length,
          active: has(state.cats, row.k),
          pickKind: 'cat',
          click: function (mode) { return pick(state.cats, row.k, mode || 'toggle'); }
        };
      });
    } else {
      rows = DAY_BUCKETS.map(function (b, i) {
        var list = deals.filter(function (r) { return r.days >= b.from && r.days <= b.to; });
        return {
          key: b.key, label: b.label,
          color: mix(DAYS_FROM, DAYS_TO, i / (DAY_BUCKETS.length - 1)),
          sold: list.length, active: false, click: null
        };
      });
    }

    rows.forEach(function (r) {
      if (state.base === 'own' && r.own != null) {
        r.total = r.own;
        r.share = r.own ? r.sold / r.own : 0;
      } else {
        r.total = base;
        r.share = base ? r.sold / base : 0;
      }
    });
    return {
      rows: rows.filter(function (r) { return r.total > 0 && (r.sold > 0 || state.base === 'own'); }),
      base: base, deals: deals.length, stock: stock.length
    };
  }

  function renderBaseTabs() {
    var box = document.getElementById('base-tabs');
    clear(box);
    BASES.filter(function (b) {
      return !b.only || b.only === state.tab;
    }).forEach(function (b) {
      var el2 = document.createElement('button');
      el2.type = 'button';
      el2.className = 'base-tab' + (state.base === b.key ? ' is-active' : '');
      el2.textContent = b.label;
      el2.onclick = function () {
        state.base = b.key;
        render();
      };
      box.appendChild(el2);
    });
  }

  function renderShares() {
    document.getElementById('dim-name').textContent = DIM_NAMES[state.tab] || '';
    renderBaseTabs();

    var data = shareRows();
    var rows = data.rows;
    var anyActive = rows.some(function (r) { return r.active; });
    var restShare = state.base === 'stock' && data.stock
      ? Math.max(0, (data.stock - data.deals) / data.stock)
      : 0;

    /* --- легенда --- */
    var leg = document.getElementById('shares-legend');
    clear(leg);
    rows.forEach(function (r) {
      var item = document.createElement('span');
      item.className = 'item' + (anyActive && !r.active ? ' is-off' : '');
      var sw = document.createElement('span');
      sw.className = 'sw';
      sw.style.background = r.color;
      item.appendChild(sw);
      item.appendChild(document.createTextNode(r.label));
      if (r.click) bindPick(item, r.pickKind || 'cat', function (mode) { return r.click(mode); });
      leg.appendChild(item);
    });
    if (restShare > 0) {
      var rest = document.createElement('span');
      rest.className = 'item';
      var sw2 = document.createElement('span');
      sw2.className = 'sw';
      sw2.style.background = UNSOLD;
      rest.appendChild(sw2);
      rest.appendChild(document.createTextNode('в экспозиции'));
      leg.appendChild(rest);
    }

    if (state.base === 'own') {
      clear(document.getElementById('shares-stack'));
      renderVolumes(rows, anyActive);
      return;
    }

    /* --- стопка: одна полоса на 100% выбранной базы --- */
    var stackBox = document.getElementById('shares-stack');
    clear(stackBox);
    var bar = document.createElement('div');
    bar.className = 'bar';
    var nums = document.createElement('div');
    nums.className = 'nums';

    var segments = rows.map(function (r) {
      return { share: r.share, color: r.color, sold: r.sold, total: r.total, dim: anyActive && !r.active, click: r.click };
    });
    if (restShare > 0) {
      segments.push({
        share: restShare, color: UNSOLD, dim: false, rest: true,
        sold: data.stock - data.deals, total: data.stock
      });
    }

    var barWidth = stackBox.clientWidth || 560;
    segments.forEach(function (sg) {
      var seg = document.createElement('span');
      seg.style.width = (sg.share * 100) + '%';
      seg.style.background = sg.color;
      seg.style.opacity = sg.dim ? 0.35 : 1;
      if (sg.click) bindPick(seg, 'cat', function (mode) { return sg.click(mode); });
      bar.appendChild(seg);

      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.width = (sg.share * 100) + '%';
      if (sg.share * barWidth >= 44) {
        var p = document.createElement('div');
        p.className = 'p';
        p.textContent = Math.round(sg.share * 100) + '%';
        p.style.color = sg.rest ? '#6f7379' : '#ffffff';
        var f = document.createElement('div');
        f.className = 'f';
        var b = document.createElement('b');
        b.textContent = nf(sg.sold);
        b.style.color = sg.rest ? '#6f7379' : sg.color;
        f.appendChild(b);
        f.appendChild(document.createTextNode('/' + nf(sg.total)));
        cell.appendChild(p);
        cell.appendChild(f);
      }
      nums.appendChild(cell);
    });
    stackBox.appendChild(bar);
    stackBox.appendChild(nums);

    /* --- рейтинг: те же доли полосами, по убыванию --- */
    var ranks = document.getElementById('shares-ranks');
    clear(ranks);
    rows.slice().sort(function (a, b) { return b.share - a.share; }).forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'rank' + (anyActive && !r.active ? ' is-dim' : '');
      var p = document.createElement('div');
      p.className = 'p';
      p.textContent = Math.round(r.share * 100) + '%';
      var line = document.createElement('div');
      line.className = 'line';
      var i2 = document.createElement('i');
      i2.style.width = Math.max(6, r.share * 100) + '%';
      i2.style.background = r.color;
      var lab = document.createElement('span');
      lab.textContent = r.label;
      line.appendChild(i2);
      line.appendChild(lab);
      row.appendChild(p);
      row.appendChild(line);
      if (r.click) bindPick(row, r.pickKind || 'cat', function (mode) { return r.click(mode); });
      ranks.appendChild(row);
    });
  }

  /** длина полосы — сколько всего квартир с таким видом, заливка — сколько продано */
  function renderVolumes(rows, anyActive) {
    var box = document.getElementById('shares-ranks');
    clear(box);
    var maxTotal = rows.reduce(function (a, r) { return Math.max(a, r.total); }, 1);

    rows.slice().sort(function (a, b) { return b.total - a.total; }).forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'vol' + (anyActive && !r.active ? ' is-dim' : '');

      var lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = r.label;

      var wrapTrack = document.createElement('div');
      var track = document.createElement('div');
      track.className = 'track';
      track.style.width = (r.total / maxTotal * 100) + '%';
      var fill = document.createElement('i');
      fill.style.width = (r.share * 100) + '%';
      fill.style.background = r.color;
      track.appendChild(fill);
      wrapTrack.appendChild(track);

      var p = document.createElement('div');
      p.className = 'p';
      p.textContent = Math.round(r.share * 100) + '%';

      var frac = document.createElement('div');
      frac.className = 'frac';
      var b = document.createElement('b');
      b.textContent = nf(r.sold);
      b.style.color = r.color;
      frac.appendChild(b);
      frac.appendChild(document.createTextNode('/' + nf(r.total)));

      row.appendChild(lbl);
      row.appendChild(wrapTrack);
      row.appendChild(p);
      row.appendChild(frac);
      if (r.click) bindPick(row, r.pickKind || 'cat', function (mode) { return r.click(mode); });
      box.appendChild(row);
    });
  }

  /* ---------------- доли по комнатности и этажам ---------------- */

  function extraRows(dim) {
    var stock = RECS.filter(function (r) {
      return (!state.groups.length || has(state.groups, r.group))
        && (dim === 'floor' || !state.floors.length || has(state.floors, r.floor))
        && (dim === 'rooms' || !state.rooms.length || has(state.rooms, r.rooms))
        && passCatStock(r);
    });
    var keys = dim === 'rooms'
      ? [1, 2, 3]
      : S_uniqFloors(stock);

    return keys.map(function (k) {
      var pool = stock.filter(function (r) {
        return dim === 'rooms' ? r.rooms === k : r.floor === k;
      });
      var sold = pool.filter(function (r) { return r.sold && passCat(r) && dealFilters(r); });
      var base = state.base === 'deals'
        ? stock.filter(function (r) { return r.sold && passCat(r) && dealFilters(r); }).length
        : pool.length;
      var share = base ? sold.length / (state.base === 'deals' ? base : pool.length) : 0;
      return {
        key: k,
        label: dim === 'rooms' ? k + '-комн.' : k + ' этаж',
        sold: sold.length,
        total: state.base === 'deals' ? base : pool.length,
        share: state.base === 'deals' ? (base ? sold.length / base : 0) : share,
        active: dim === 'rooms' ? has(state.rooms, k) : has(state.floors, k),
        pickKind: dim === 'rooms' ? 'rooms' : 'floor',
        click: function (mode) {
          return dim === 'rooms'
            ? pick(state.rooms, k, mode || 'toggle')
            : pick(state.floors, k, mode || 'toggle');
        }
      };
    }).filter(function (r) { return r.total > 0; });
  }

  function S_uniqFloors(list) {
    var set = {};
    list.forEach(function (r) { set[r.floor] = 1; });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }

  function renderExtraShares() {
    var host = document.getElementById('shares-extra');
    clear(host);
    var dims = [];
    if (state.rooms.length) dims.push({ key: 'rooms', name: 'по комнатности' });
    if (state.floors.length) dims.push({ key: 'floor', name: 'по этажам' });
    if (!dims.length) return;

    dims.forEach(function (d) {
      var rows = extraRows(d.key);
      if (!rows.length) return;
      var panel = document.createElement('div');
      panel.className = 'panel shares-panel';

      var title = document.createElement('h2');
      title.className = 'shares-title';
      title.appendChild(document.createTextNode('Доля проданных квартир'));
      title.appendChild(document.createElement('br'));
      var sub = document.createElement('span');
      sub.textContent = d.name;
      title.appendChild(sub);
      panel.appendChild(title);

      var box = document.createElement('div');
      box.className = 'ranks' + (rows.length > 6 ? ' ranks-compact' : '');
      rows.forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'rank rank-lab' + (r.active ? ' is-on' : (dims.length && rowsHasActive(rows) ? ' is-dim' : ''));
        // название слева, полоса, справа колонка процентов и дробь
        var lab = document.createElement('div');
        lab.className = 'lbl';
        lab.textContent = r.label;
        var line = document.createElement('div');
        line.className = 'line';
        var i2 = document.createElement('i');
        i2.style.width = Math.max(4, r.share * 100) + '%';
        i2.style.background = shareColorNow(r.share);
        line.appendChild(i2);
        var p = document.createElement('div');
        p.className = 'p';
        p.textContent = Math.round(r.share * 100) + '%';
        var frac = document.createElement('div');
        frac.className = 'frac';
        var b = document.createElement('b');
        b.textContent = nf(r.sold);
        b.style.color = shareColorNow(r.share);
        frac.appendChild(b);
        frac.appendChild(document.createTextNode('/' + nf(r.total)));
        row.appendChild(lab);
        row.appendChild(line);
        row.appendChild(p);
        row.appendChild(frac);
        bindPick(row, r.pickKind || 'cat', function (mode) { return r.click(mode); });
        box.appendChild(row);
      });
      panel.appendChild(box);
      host.appendChild(panel);
    });
  }

  function rowsHasActive(rows) {
    return rows.some(function (r) { return r.active; });
  }

  /* ---------------- закреплённые фильтры ---------------- */

  function activeFilters() {
    var out = [];
    state.groups.forEach(function (g) {
      out.push({ label: g, clear: function () { pick(state.groups, g, 'toggle'); } });
    });
    state.floors.slice().sort(function (a, b) { return a - b; }).forEach(function (f) {
      out.push({ label: f + ' этаж', clear: function () { pick(state.floors, f, 'toggle'); } });
    });
    state.rooms.slice().sort(function (a, b) { return a - b; }).forEach(function (n) {
      out.push({ label: n + '-комн.', clear: function () { pick(state.rooms, n, 'toggle'); } });
    });
    state.managers.forEach(function (m) {
      out.push({ label: m, clear: function () { pick(state.managers, m, 'toggle'); } });
    });
    state.weeks.slice().sort().forEach(function (w) {
      out.push({
        label: shortDate(w) + ' – ' + shortDate(addDays(w, 6)),
        clear: function () { pick(state.weeks, w, 'toggle'); }
      });
    });
    state.cats.forEach(function (c) {
      var label = state.tab === 'view' ? VIEW_LABELS[c] : (c === 'yes' ? 'со скидкой' : 'без скидки');
      var color = state.tab === 'view' ? VIEW_COLORS[c] : DISC_COLORS[c];
      out.push({ label: label, color: color, clear: function () { pick(state.cats, c, 'toggle'); } });
    });
    if (daysNarrowed()) out.push({
      label: state.daysFrom + '–' + dayWord(state.daysTo),
      clear: function () { state.daysFrom = 0; state.daysTo = DAYS_MAX; }
    });
    if (state.apartment) out.push({
      label: state.apartment, clear: function () { state.apartment = null; }
    });
    return out;
  }

  function renderDock() {
    var dock = document.getElementById('filters-dock');
    clear(dock);
    var items = activeFilters();
    dock.className = 'filters-dock' + (items.length ? ' is-on' : '');
    if (!items.length) return;

    var cap = document.createElement('span');
    cap.className = 'cap';
    cap.textContent = 'Фильтры:';
    dock.appendChild(cap);

    items.forEach(function (f) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'fchip';
      if (f.color) {
        var sw = document.createElement('span');
        sw.className = 'sw';
        sw.style.background = f.color;
        chip.appendChild(sw);
      }
      chip.appendChild(document.createTextNode(f.label));
      var x = document.createElement('span');
      x.className = 'x';
      x.textContent = '✕';
      chip.appendChild(x);
      chip.onclick = function () { f.clear(); render(); };
      dock.appendChild(chip);
    });

    if (items.length > 1) {
      var all = document.createElement('button');
      all.type = 'button';
      all.className = 'fchip fchip-all';
      all.textContent = 'Сбросить всё';
      all.onclick = function () {
        items.forEach(function (f) { f.clear(); });
        render();
      };
      dock.appendChild(all);
    }
  }

  /* ---------------- сборка ---------------- */

  function renderShareScale() {
    var c = catColorNow();
    document.getElementById('share-scale').style.background = c
      ? gradientCss([[0, mix('#101113', c, 0.35)], [1, c]])
      : gradientCss(SHARE_STOPS);
  }

  // высота разреза дома подгоняется так, чтобы нижний край сошёлся с «Выручка, млн»
  function fitPlan() {
    var wrap = document.getElementById('plan-wrap');
    var ref = document.getElementById('chart-revenue');
    if (!wrap || !ref || !planVW) return false;
    var wb = wrap.getBoundingClientRect();
    var rb = ref.getBoundingClientRect();
    if (!wb.width || !rb.height) return false;
    var target = rb.bottom - wb.top;
    var s = wb.width / planVW;
    var next = (target / s - TOP_PAD - 58) / MAX_FLOOR;
    next = Math.max(16, Math.min(46, next));
    if (Math.abs(next - ROW_STEP) < 0.25) return false;
    ROW_STEP = next;
    return true;
  }

  function render() {
    renderTabs();
    renderLegend();
    renderManagerChips();
    renderShareScale();
    renderKpi();
    renderPlan();
    renderCumulative();
    renderDealsChart();
    renderRevenueChart();
    renderTable();
    renderShares();
    renderExtraShares();
    renderDock();
    if (state.apartment) showPinned(); else tipBox.classList.remove('is-visible', 'is-pinned');
    if (fitPlan()) renderPlan();
  }

  render();

  document.addEventListener('click', function (e) {
    if (!state.apartment) return;
    if (tipBox.contains(e.target)) return;
    state.apartment = null;
    render();
  });

  var timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      renderCumulative();
      renderDealsChart();
      renderRevenueChart();
      if (fitPlan()) renderPlan();
    }, 140);
  });
})();
