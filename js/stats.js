/* ============================================================
   stats.js — агрегация и форматирование.
   Чистые функции без зависимостей: используются и Vue-слоем,
   и графиками, и автотестами.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- форматирование ---------------- */

  var nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function fmtInt(v) { return v == null ? '—' : nf0.format(Math.round(v)); }

  function fmtMoney(v) { return v == null ? '—' : nf0.format(Math.round(v)) + ' ₽'; }

  /** компактно: 1,08 млрд ₽ / 254 млн ₽ / 3,97 млн ₽ / 700 тыс ₽ */
  function fmtMoneyShort(v, withCurrency) {
    if (v == null) return '—';
    var suffix = withCurrency === false ? '' : ' ₽';
    var a = Math.abs(v);
    if (a >= 1e9) return nf2.format(v / 1e9) + ' млрд' + suffix;
    if (a >= 1e8) return nf0.format(v / 1e6) + ' млн' + suffix;
    if (a >= 1e6) return nf1.format(v / 1e6) + ' млн' + suffix;
    if (a >= 1e3) return nf0.format(v / 1e3) + ' тыс' + suffix;
    return nf0.format(v) + suffix;
  }

  function fmtArea(v) { return v == null ? '—' : nf1.format(v) + ' м²'; }
  /** подпись оси: одна разрядность на всю шкалу, без «20,0 млн» рядом с «120 млн» */
  function fmtMoneyAxis(v) {
    if (v == null) return '';
    var a = Math.abs(v);
    if (a >= 1e9) return nf1.format(v / 1e9) + ' млрд';
    if (a >= 1e6) return nf0.format(v / 1e6) + ' млн';
    if (a >= 1e3) return nf0.format(v / 1e3) + ' тыс';
    return nf0.format(v);
  }

  /** число с одним знаком после запятой — для темпов вроде «20,5 в неделю» */
  function fmt1(v) { return v == null || !isFinite(v) ? '—' : nf1.format(v); }
  function fmtPct(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    return (digits === 1 ? nf1.format(v * 100) : nf0.format(v * 100)) + '%';
  }

  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONTHS_FULL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  /** '2022-07-29' -> '29 июл' */
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1];
  }
  /** '2022-07-29' -> '29 июл 2022' */
  function fmtDateFull(iso) {
    if (!iso) return '—';
    return fmtDate(iso) + ' ' + iso.slice(0, 4);
  }
  function monthName(ym) {
    var p = ym.split('-');
    return MONTHS_FULL[Number(p[1]) - 1];
  }
  /** число -> 'сделка/сделки/сделок' */
  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  /* ---------------- работа с датами ---------------- */

  function parseISO(iso) {
    var p = iso.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function toISO(d) {
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }
  /** воскресенье той же недели */
  function weekEnd(iso) { return addDays(weekStart(iso), 6); }

  /**
   * Подпись недели интервалом: «2–8 июн», а если неделя переходит
   * из месяца в месяц — «30 мая – 5 июн».
   */
  function weekLabel(from, to) {
    var f = from.split('-'), t2 = (to || weekEnd(from)).split('-');
    var sameMonth = f[1] === t2[1];
    return sameMonth
      ? Number(f[2]) + '–' + Number(t2[2]) + ' ' + MONTHS[Number(t2[1]) - 1]
      : fmtDate(from) + ' – ' + fmtDate(to || weekEnd(from));
  }
  /** то же, но с годом — для подсказок и таблиц */
  function weekLabelFull(from, to) {
    return weekLabel(from, to) + ' ' + from.slice(0, 4);
  }

  /** понедельник недели, в которую попадает дата */
  function weekStart(iso) {
    var d = parseISO(iso);
    var dow = (d.getUTCDay() + 6) % 7;      // пн = 0
    d.setUTCDate(d.getUTCDate() - dow);
    return toISO(d);
  }
  function addDays(iso, n) {
    var d = parseISO(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return toISO(d);
  }
  /** список дат от a до b включительно */
  function dateRange(a, b) {
    var out = [], cur = a;
    var guard = 0;
    while (cur <= b && guard++ < 4000) { out.push(cur); cur = addDays(cur, 1); }
    return out;
  }

  /* ---------------- базовые выборки ---------------- */

  var isSold = function (r) { return r.sale_price != null; };

  function sum(arr, fn) {
    var t = 0;
    for (var i = 0; i < arr.length; i++) t += (fn(arr[i]) || 0);
    return t;
  }
  function mean(arr, fn) { return arr.length ? sum(arr, fn) / arr.length : null; }
  function median(values) {
    if (!values.length) return null;
    var v = values.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  function uniq(arr) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
    }
    return out;
  }
  function groupBy(arr, keyFn) {
    var map = new Map();
    for (var i = 0; i < arr.length; i++) {
      var k = keyFn(arr[i]);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(arr[i]);
    }
    return map;
  }

  /* ---------------- фильтрация ---------------- */

  /**
   * Пул квартир: только «физические» признаки (корпус, комнатность, вид).
   * Период и менеджер к непроданным квартирам неприменимы.
   * @param f {buildings:[], rooms:[], views:[], sections:['ГП4-Б']} — пустой массив = «все»
   */
  function filterInventory(data, f) {
    f = f || {};
    var b = f.buildings || [], r = f.rooms || [], v = f.views || [], sec = f.sections || [];
    return data.filter(function (row) {
      if (b.length && b.indexOf(row.building) < 0) return false;
      if (r.length && r.indexOf(row.rooms) < 0) return false;
      if (v.length && v.indexOf(row.view) < 0) return false;
      if (sec.length && sec.indexOf(blockOf(row)) < 0) return false;
      return true;
    });
  }

  /** Сделки внутри пула: + менеджер и период (границы включительно). */
  function filterDeals(inventory, f) {
    f = f || {};
    var m = f.managers || [], from = f.from, to = f.to;
    return inventory.filter(function (row) {
      if (!isSold(row)) return false;
      if (m.length && m.indexOf(row.manager) < 0) return false;
      if (from && row.deal_date < from) return false;
      if (to && row.deal_date > to) return false;
      return true;
    });
  }

  /* ---------------- сводка / KPI ---------------- */

  /**
   * @param inventory  весь пул квартир, прошедший фильтры по измерениям
   * @param deals      проданные квартиры, прошедшие фильтры + период
   */
  function summary(inventory, deals) {
    var revenue = sum(deals, function (r) { return r.sale_price; });
    var soldArea = sum(deals, function (r) { return r.area_m2; });
    var discountSum = sum(deals, function (r) { return r.discount || 0; });
    var withDiscount = deals.filter(function (r) { return r.discount; });
    var listPrice = sum(deals, function (r) { return r.price; });
    return {
      inventory: inventory.length,
      deals: deals.length,
      soldShare: inventory.length ? deals.length / inventory.length : null,
      remaining: inventory.length - deals.length,
      revenue: revenue,
      avgDeal: deals.length ? revenue / deals.length : null,
      soldArea: soldArea,
      avgPricePerM2: soldArea ? revenue / soldArea : null,
      medianDays: median(deals.map(function (r) { return r.days_in_work; })),
      avgDays: mean(deals, function (r) { return r.days_in_work; }),
      discountSum: discountSum,
      discountDeals: withDiscount.length,
      discountShare: deals.length ? withDiscount.length / deals.length : null,
      discountRate: listPrice ? discountSum / listPrice : null,
      avgDiscount: withDiscount.length ? discountSum / withDiscount.length : null,
      firstDeal: deals.length ? deals.map(function (r) { return r.deal_date; }).sort()[0] : null,
      lastDeal: deals.length ? deals.map(function (r) { return r.deal_date; }).sort().slice(-1)[0] : null
    };
  }

  /* ---------------- 1. динамика по дате сделки ---------------- */

  /**
   * @param deals сделки
   * @param opts  {granularity:'day'|'week', metric:'count'|'revenue', cumulative:bool,
   *              from, to — границы оси (ISO)}
   * @returns {points:[{key,label,value,count,revenue,cumulative}], ...}
   */
  function timeSeries(deals, opts) {
    opts = opts || {};
    var gran = opts.granularity || 'day';
    var metric = opts.metric || 'count';
    var keyOf = gran === 'week' ? weekStart : function (iso) { return iso; };

    var byKey = new Map();
    deals.forEach(function (r) {
      var k = keyOf(r.deal_date);
      if (!byKey.has(k)) byKey.set(k, { key: k, count: 0, revenue: 0, area: 0, discount: 0 });
      var b = byKey.get(k);
      b.count += 1;
      b.revenue += r.sale_price;
      b.area += r.area_m2;
      b.discount += r.discount || 0;
    });

    // непрерывная ось: дни/недели без сделок = 0, иначе линия врёт о темпе
    var keys = Array.from(byKey.keys()).sort();
    var from = opts.from || keys[0];
    var to = opts.to || keys[keys.length - 1];
    var axis = [];
    if (from && to) {
      if (gran === 'week') {
        var cur = weekStart(from), last = weekStart(to), guard = 0;
        while (cur <= last && guard++ < 600) { axis.push(cur); cur = addDays(cur, 7); }
      } else {
        axis = dateRange(from, to);
      }
    }

    var acc = 0;
    var points = axis.map(function (k) {
      var b = byKey.get(k) || { key: k, count: 0, revenue: 0, area: 0, discount: 0 };
      var value = metric === 'revenue' ? b.revenue : b.count;
      acc += value;
      return {
        key: k,
        date: parseISO(k),
        label: gran === 'week' ? 'неделя с ' + fmtDate(k) : fmtDateFull(k),
        count: b.count,
        revenue: b.revenue,
        area: b.area,
        discount: b.discount,
        value: opts.cumulative ? acc : value,
        raw: value
      };
    });

    return {
      points: points,
      granularity: gran,
      metric: metric,
      cumulative: !!opts.cumulative,
      total: metric === 'revenue' ? sum(deals, function (r) { return r.sale_price; }) : deals.length,
      peak: points.reduce(function (m, p) { return (!m || p.raw > m.raw) ? p : m; }, null)
    };
  }

  /* ---------------- 2–3. менеджеры ---------------- */

  function byManager(deals, allManagers) {
    var map = groupBy(deals.filter(function (r) { return r.manager; }),
      function (r) { return r.manager; });
    var names = (allManagers || Array.from(map.keys())).slice();
    return names.map(function (name) {
      var g = map.get(name) || [];
      var withD = g.filter(function (r) { return r.discount; });
      var listPrice = sum(g, function (r) { return r.price; });
      var discountSum = sum(withD, function (r) { return r.discount; });
      return {
        key: name,
        label: name,
        deals: g.length,
        revenue: sum(g, function (r) { return r.sale_price; }),
        area: sum(g, function (r) { return r.area_m2; }),
        avgDeal: g.length ? sum(g, function (r) { return r.sale_price; }) / g.length : 0,
        avgPricePerM2: sum(g, function (r) { return r.area_m2; })
          ? sum(g, function (r) { return r.sale_price; }) / sum(g, function (r) { return r.area_m2; })
          : 0,
        dealsWithDiscount: withD.length,
        dealsFullPrice: g.length - withD.length,
        discountShare: g.length ? withD.length / g.length : 0,
        discountSum: discountSum,
        avgDiscount: withD.length ? discountSum / withD.length : 0,
        discountRate: listPrice ? discountSum / listPrice : 0,
        medianDays: median(g.map(function (r) { return r.days_in_work; })),
        avgDays: g.length ? mean(g, function (r) { return r.days_in_work; }) : null
      };
    });
  }

  /* ---------------- 4. корпуса ---------------- */

  function byBuilding(inventory, deals) {
    var invMap = groupBy(inventory, function (r) { return r.building; });
    var dealMap = groupBy(deals, function (r) { return r.building; });
    var names = Array.from(invMap.keys()).sort();
    return names.map(function (name) {
      var inv = invMap.get(name) || [];
      var g = dealMap.get(name) || [];
      var revenue = sum(g, function (r) { return r.sale_price; });
      var area = sum(g, function (r) { return r.area_m2; });
      var withD = g.filter(function (r) { return r.discount; });
      return {
        key: name,
        label: name,
        total: inv.length,
        deals: g.length,
        remaining: inv.length - g.length,
        soldShare: inv.length ? g.length / inv.length : 0,
        revenue: revenue,
        soldArea: area,
        avgPricePerM2: area ? revenue / area : 0,
        avgDeal: g.length ? revenue / g.length : 0,
        discountSum: sum(withD, function (r) { return r.discount; }),
        medianDays: median(g.map(function (r) { return r.days_in_work; })),
        floors: uniq(inv.map(function (r) { return r.floor; })).length
      };
    });
  }

  /* ---------------- 5. вид из окон ---------------- */

  function byView(inventory, deals) {
    var invMap = groupBy(inventory, function (r) { return r.view; });
    var dealMap = groupBy(deals, function (r) { return r.view; });
    var names = Array.from(invMap.keys());
    var rows = names.map(function (name) {
      var inv = invMap.get(name) || [];
      var g = dealMap.get(name) || [];
      var revenue = sum(g, function (r) { return r.sale_price; });
      var area = sum(g, function (r) { return r.area_m2; });
      var withD = g.filter(function (r) { return r.discount; });
      return {
        key: name,
        label: name,
        total: inv.length,
        deals: g.length,
        remaining: inv.length - g.length,
        soldShare: inv.length ? g.length / inv.length : 0,
        revenue: revenue,
        soldArea: area,
        avgPricePerM2: area ? revenue / area : 0,
        listPricePerM2: mean(inv, function (r) { return r.price_per_m2; }),
        avgDeal: g.length ? revenue / g.length : 0,
        discountShare: g.length ? withD.length / g.length : 0,
        medianDays: median(g.map(function (r) { return r.days_in_work; }))
      };
    });
    rows.sort(function (a, b) { return b.deals - a.deals; });
    return rows;
  }

  /* ---------------- секции ---------------- */

  /** Секция зашита в код квартиры: М-ГП4-В-116 → «В». */
  function sectionOf(r) {
    var p = String(r.apartment || '').split('-');
    return p.length > 2 ? p[2] : '—';
  }
  /** «ГП4-В» — уникальный ключ секции на схеме комплекса. */
  function blockOf(r) { return r.building + '-' + sectionOf(r); }

  function bySection(inventory, deals) {
    var soldSet = new Set(deals.map(function (r) { return r.apartment; }));
    var map = groupBy(inventory, blockOf);
    return Array.from(map.keys()).sort().map(function (key) {
      var inv = map.get(key);
      var s = inv.filter(function (r) { return soldSet.has(r.apartment); });
      var revenue = sum(s, function (r) { return r.sale_price; });
      var area = sum(s, function (r) { return r.area_m2; });
      return {
        key: key,
        label: key,
        building: inv[0].building,
        section: sectionOf(inv[0]),
        total: inv.length,
        deals: s.length,
        remaining: inv.length - s.length,
        soldShare: inv.length ? s.length / inv.length : 0,
        revenue: revenue,
        avgPricePerM2: area ? revenue / area : 0,
        listPricePerM2: mean(inv, function (r) { return r.price_per_m2; }),
        medianDays: median(s.map(function (r) { return r.days_in_work; })),
        floors: uniq(inv.map(function (r) { return r.floor; })).length
      };
    });
  }

  /**
   * Раскладка пула для квадратной диаграммы: группы по корпусам,
   * внутри — квартиры по секции, этажу и номеру, чтобы порядок атомов
   * был осмысленным, а не случайным.
   */
  function atomGroups(inventory, deals) {
    var soldSet = new Set(deals.map(function (r) { return r.apartment; }));
    var map = groupBy(inventory, function (r) { return r.building; });
    return Array.from(map.keys()).sort().map(function (key) {
      var cells = map.get(key).slice().sort(function (a, b) {
        if (sectionOf(a) !== sectionOf(b)) return sectionOf(a) < sectionOf(b) ? -1 : 1;
        if (a.floor !== b.floor) return a.floor - b.floor;
        return a.apartment < b.apartment ? -1 : 1;
      }).map(function (item) {
        return { item: item, sold: soldSet.has(item.apartment) };
      });
      var sold = cells.filter(function (c) { return c.sold; }).length;
      return {
        key: key,
        label: key,
        cells: cells,
        total: cells.length,
        sold: sold,
        soldShare: cells.length ? sold / cells.length : 0
      };
    });
  }

  /**
   * Сделки, разложенные по неделям: для каждой недели — список сделок,
   * чтобы построить столбец из атомов-квартир. Внутри недели сначала идут
   * сделки по прайсу, потом со скидкой — так столбец читается снизу вверх.
   */
  function weeklyDeals(deals, opts) {
    opts = opts || {};
    var byWeek = new Map();
    deals.forEach(function (r) {
      var k = weekStart(r.deal_date);
      if (!byWeek.has(k)) byWeek.set(k, []);
      byWeek.get(k).push(r);
    });

    var keys = Array.from(byWeek.keys()).sort();
    if (!keys.length) return [];
    var lastDate = opts.lastDate ||
      deals.map(function (r) { return r.deal_date; }).sort().slice(-1)[0];

    // непрерывная ось: недели без сделок остаются пустыми столбцами
    var axis = [], cur = keys[0], guard = 0;
    while (cur <= keys[keys.length - 1] && guard++ < 400) {
      axis.push(cur);
      cur = addDays(cur, 7);
    }

    return axis.map(function (k) {
      var list = (byWeek.get(k) || []).slice().sort(function (a, b) {
        var da = a.discount ? 1 : 0, db = b.discount ? 1 : 0;
        if (da !== db) return da - db;                  // сначала по прайсу
        return a.deal_date < b.deal_date ? -1 : 1;
      });
      var to = addDays(k, 6);
      var withD = list.filter(function (r) { return r.discount; });
      var revenue = sum(list, function (r) { return r.sale_price; });
      return {
        key: k,
        from: k,
        to: to,
        label: weekLabel(k, to),
        labelFull: weekLabelFull(k, to),
        partial: lastDate != null && to > lastDate,     // выгрузка обрывается внутри недели
        deals: list,
        count: list.length,
        discountCount: withD.length,
        fullPriceCount: list.length - withD.length,
        revenue: revenue,
        discount: sum(withD, function (r) { return r.discount; }),
        area: sum(list, function (r) { return r.area_m2; }),
        avgDeal: list.length ? revenue / list.length : 0,
        discountShare: list.length ? withD.length / list.length : 0
      };
    });
  }

  /* ---------------- пульс продаж (вопрос «что происходит») ---------------- */

  /**
   * Недельный темп, сравнение двух окон по 4 недели и запас экспозиции.
   * Последняя неделя обычно неполная — она показывается, но в расчёт темпа не идёт.
   */
  function pulse(inventory, deals, opts) {
    opts = opts || {};
    var win = opts.window || 4;
    var weeks = weeklyDeals(deals, opts);

    var full = weeks.filter(function (w) { return !w.partial; });
    var recent = full.slice(-win);
    var prev = full.slice(-2 * win, -win);
    var avg = function (arr, f) { return arr.length ? sum(arr, f) / arr.length : 0; };

    var rateNow = avg(recent, function (w) { return w.count; });
    var ratePrev = avg(prev, function (w) { return w.count; });
    var revNow = avg(recent, function (w) { return w.revenue; });
    var revPrev = avg(prev, function (w) { return w.revenue; });
    var checkNow = avg(recent, function (w) { return w.avgDeal; });
    var checkPrev = avg(prev, function (w) { return w.avgDeal; });

    var remaining = inventory.filter(function (r) { return !isSold(r); });

    return {
      weeks: weeks,
      window: win,
      rateNow: rateNow,
      ratePrev: ratePrev,
      dealsDelta: ratePrev ? rateNow / ratePrev - 1 : null,
      revenueNow: revNow,
      revenuePrev: revPrev,
      revenueDelta: revPrev ? revNow / revPrev - 1 : null,
      checkNow: checkNow,
      checkDelta: checkPrev ? checkNow / checkPrev - 1 : null,
      remaining: remaining.length,
      remainingValue: sum(remaining, function (r) { return r.price; }),
      weeksLeft: rateNow ? remaining.length / rateNow : null,
      soldShare: inventory.length ? deals.length / inventory.length : 0,
      firstWeek: weeks.length ? weeks[0] : null,
      lastWeek: weeks.length ? weeks[weeks.length - 1] : null
    };
  }

  /* ---------------- скоринг менеджеров (вопрос «кому премия») ---------------- */

  /**
   * Сравнивает менеджеров с командным средним и выдаёт ярлыки.
   * Пороги умышленно мягкие: это повод для разговора, а не приговор.
   */
  function managerScore(deals, allManagers) {
    var rows = byManager(deals, allManagers).filter(function (m) { return m.deals > 0; });
    if (!rows.length) return [];

    var totalRevenue = sum(rows, function (m) { return m.revenue; });
    var totalDeals = sum(rows, function (m) { return m.deals; });
    var totalArea = sum(rows, function (m) { return m.area; });
    var avgRevenue = totalRevenue / rows.length;
    var avgDeals = totalDeals / rows.length;
    var teamPricePerM2 = totalArea ? totalRevenue / totalArea : 0;
    var teamDiscountRate = mean(rows, function (m) { return m.discountRate; }) || 0;
    var teamDays = median(rows.map(function (m) { return m.medianDays; })) || 0;

    return rows.map(function (m) {
      var tags = [];
      var pricePremium = teamPricePerM2 ? m.avgPricePerM2 / teamPricePerM2 - 1 : 0;

      if (m.revenue >= avgRevenue && m.discountRate <= teamDiscountRate) {
        tags.push({ kind: 'good', text: 'премия: выручка выше средней при скидках ниже средних' });
      }
      if (m.deals >= avgDeals * 1.15) {
        tags.push({ kind: 'good', text: 'объём: сделок больше среднего по команде' });
      }
      if (teamDays && m.medianDays != null && m.medianDays <= teamDays * 0.8) {
        tags.push({ kind: 'good', text: 'быстрый цикл сделки' });
      }
      if (teamDiscountRate && m.discountRate >= teamDiscountRate * 1.5) {
        tags.push({
          kind: 'watch',
          text: 'разговор о скидках: дисконт ' + fmtPct(m.discountRate, 1) +
            ' от прайса против ' + fmtPct(teamDiscountRate, 1) + ' по команде — это ' +
            fmtMoneyShort(m.discountSum) + ' недополученной выручки'
        });
      }
      if (teamDays && m.medianDays != null && m.medianDays >= teamDays * 1.3) {
        tags.push({
          kind: 'watch',
          text: 'разговор о темпе: медиана ' + fmtInt(m.medianDays) + ' ' +
            plural(m.medianDays, 'день', 'дня', 'дней') + ' против ' + fmtInt(teamDays) + ' по команде'
        });
      }
      if (pricePremium <= -0.1) {
        tags.push({
          kind: 'watch',
          text: 'разговор о структуре продаж: цена за м² на ' + fmtPct(-pricePremium) +
            ' ниже командной — уходит в дешёвый ассортимент'
        });
      }
      if (!tags.length) tags.push({ kind: 'neutral', text: 'в пределах команды' });

      return Object.assign({}, m, {
        revenueShare: totalRevenue ? m.revenue / totalRevenue : 0,
        pricePremium: pricePremium,
        vsAvgDeals: avgDeals ? m.deals / avgDeals - 1 : 0,
        vsTeamDiscount: teamDiscountRate ? m.discountRate / teamDiscountRate - 1 : 0,
        tags: tags,
        // good — только если есть за что хвалить и не за что ругать
        verdict: tags.some(function (t) { return t.kind === 'watch'; })
          ? (tags.some(function (t) { return t.kind === 'good'; }) ? 'mixed' : 'watch')
          : (tags.some(function (t) { return t.kind === 'good'; }) ? 'good' : 'neutral')
      });
    }).sort(function (a, b) { return b.revenue - a.revenue; });
  }

  /* ---------------- признаки квартир (вопрос «что продаётся») ---------------- */

  var FEATURES = {
    rooms: {
      label: 'Комнатность',
      of: function (r) { return r.rooms + '-комн.'; },
      order: function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }
    },
    view: { label: 'Вид из окон', of: function (r) { return r.view; } },
    building: { label: 'Корпус', of: function (r) { return r.building; } },
    section: { label: 'Корпус и секция', of: blockOf },
    floorBand: {
      label: 'Этаж',
      of: function (r) {
        var f = r.floor;
        if (f === 1) return '1-й этаж';
        if (f <= 4) return '2–4';
        if (f <= 9) return '5–9';
        if (f <= 14) return '10–14';
        return '15–17';
      }
    },
    areaBand: {
      label: 'Площадь',
      of: function (r) {
        var a = r.area_m2;
        if (a < 40) return 'до 40 м²';
        if (a < 55) return '40–55 м²';
        if (a < 70) return '55–70 м²';
        if (a < 90) return '70–90 м²';
        return 'от 90 м²';
      }
    },
    priceBand: {
      label: 'Цена за м² по прайсу',
      of: function (r) {
        var p = r.price_per_m2;
        if (p == null) return 'без прайса';
        if (p < 40000) return 'до 40 тыс';
        if (p < 60000) return '40–60 тыс';
        if (p < 80000) return '60–80 тыс';
        if (p < 100000) return '80–100 тыс';
        return 'от 100 тыс';
      }
    },
    layout: { label: 'Планировка', of: function (r) { return r.layout; } }
  };

  /**
   * Реализация в разрезе одного признака + отклонение от общей доли продаж.
   * @returns {baseline, rows:[{key,total,deals,share,delta,medianDays,...}]}
   */
  function featureBreakdown(inventory, deals, feature, opts) {
    opts = opts || {};
    var spec = FEATURES[feature];
    if (!spec) return { baseline: 0, rows: [], label: '' };
    var soldSet = new Set(deals.map(function (r) { return r.apartment; }));
    var baseline = inventory.length ? deals.length / inventory.length : 0;
    var map = groupBy(inventory, spec.of);
    var minPool = opts.minPool || 0;

    var rows = Array.from(map.keys()).map(function (key) {
      var inv = map.get(key);
      var s = inv.filter(function (r) { return soldSet.has(r.apartment); });
      var revenue = sum(s, function (r) { return r.sale_price; });
      var area = sum(s, function (r) { return r.area_m2; });
      var withD = s.filter(function (r) { return r.discount; });
      return {
        key: String(key),
        label: String(key),
        total: inv.length,
        deals: s.length,
        remaining: inv.length - s.length,
        share: inv.length ? s.length / inv.length : 0,
        delta: (inv.length ? s.length / inv.length : 0) - baseline,
        revenue: revenue,
        avgPricePerM2: area ? revenue / area : 0,
        listPricePerM2: mean(inv, function (r) { return r.price_per_m2; }),
        medianDays: median(s.map(function (r) { return r.days_in_work; })),
        discountShare: s.length ? withD.length / s.length : 0
      };
    }).filter(function (r) { return r.total >= minPool; });

    rows.sort(function (a, b) { return b.share - a.share; });
    return { baseline: baseline, rows: rows, label: spec.label, feature: feature };
  }

  /** Все признаки одним списком — чтобы найти самые сильные отклонения. */
  function featureHighlights(inventory, deals, opts) {
    opts = opts || {};
    var minPool = opts.minPool || 20;
    var skip = { section: 1, layout: 1, areaBand: 1 };   // дублируют корпус / комнатность
    var all = [];
    Object.keys(FEATURES).forEach(function (f) {
      if (skip[f]) return;
      var br = featureBreakdown(inventory, deals, f, { minPool: minPool });
      br.rows.forEach(function (r) {
        all.push(Object.assign({ feature: f, featureLabel: br.label }, r));
      });
    });
    all.sort(function (a, b) { return b.delta - a.delta; });
    return { best: all.slice(0, 4), worst: all.slice(-4).reverse(), all: all };
  }

  /* ---------------- доп. аналитика ---------------- */

  /** матрица «корпус × этаж»: доля проданных квартир */
  function floorMatrix(inventory, deals) {
    var soldSet = new Set(deals.map(function (r) { return r.apartment; }));
    var buildings = uniq(inventory.map(function (r) { return r.building; })).sort();
    var floors = uniq(inventory.map(function (r) { return r.floor; }))
      .sort(function (a, b) { return a - b; });
    var cells = [];
    buildings.forEach(function (b) {
      floors.forEach(function (f) {
        var inv = inventory.filter(function (r) { return r.building === b && r.floor === f; });
        if (!inv.length) { cells.push({ building: b, floor: f, empty: true, total: 0 }); return; }
        var s = inv.filter(function (r) { return soldSet.has(r.apartment); });
        cells.push({
          building: b,
          floor: f,
          empty: false,
          total: inv.length,
          deals: s.length,
          share: s.length / inv.length,
          revenue: sum(s, function (r) { return r.sale_price; }),
          avgPricePerM2: mean(inv, function (r) { return r.price_per_m2; })
        });
      });
    });
    return { buildings: buildings, floors: floors, cells: cells };
  }

  /** структура спроса по комнатности */
  function byRooms(inventory, deals) {
    var invMap = groupBy(inventory, function (r) { return r.rooms; });
    var dealMap = groupBy(deals, function (r) { return r.rooms; });
    return Array.from(invMap.keys()).sort(function (a, b) { return a - b; }).map(function (n) {
      var inv = invMap.get(n) || [];
      var g = dealMap.get(n) || [];
      var revenue = sum(g, function (r) { return r.sale_price; });
      var area = sum(g, function (r) { return r.area_m2; });
      return {
        key: String(n),
        label: n + '-комн.',
        rooms: n,
        total: inv.length,
        deals: g.length,
        remaining: inv.length - g.length,
        soldShare: inv.length ? g.length / inv.length : 0,
        revenue: revenue,
        avgArea: mean(inv, function (r) { return r.area_m2; }),
        avgPricePerM2: area ? revenue / area : 0,
        medianDays: median(g.map(function (r) { return r.days_in_work; }))
      };
    });
  }

  /** распределение «дней в работе» по корзинам */
  function daysHistogram(deals) {
    var bins = [
      { key: '0-7', label: '0–7 дней', min: 0, max: 7 },
      { key: '8-14', label: '8–14', min: 8, max: 14 },
      { key: '15-21', label: '15–21', min: 15, max: 21 },
      { key: '22-30', label: '22–30', min: 22, max: 30 },
      { key: '31-45', label: '31–45', min: 31, max: 45 },
      { key: '46+', label: '46 и более', min: 46, max: Infinity }
    ];
    return bins.map(function (b) {
      var g = deals.filter(function (r) {
        return r.days_in_work >= b.min && r.days_in_work <= b.max;
      });
      return {
        key: b.key,
        label: b.label,
        deals: g.length,
        share: deals.length ? g.length / deals.length : 0,
        revenue: sum(g, function (r) { return r.sale_price; }),
        discountShare: g.length
          ? g.filter(function (r) { return r.discount; }).length / g.length : 0
      };
    });
  }

  /* ---------------- прямые ответы на вопросы заказчика ---------------- */

  /** «Что сейчас происходит с продажами?» */
  function answerPulse(inventory, deals) {
    if (!deals.length) return { headline: 'Нет сделок в выборке', lines: [] };
    var p = pulse(inventory, deals);
    var lines = [];
    var dir, headline;

    if (p.dealsDelta == null) {
      dir = 'мало данных для сравнения периодов';
      headline = 'Данных пока на один период';
    } else if (p.dealsDelta <= -0.1) {
      dir = 'замедляются';
      headline = 'Темп продаж падает, выручка держится на среднем чеке';
    } else if (p.dealsDelta >= 0.1) {
      dir = 'ускоряются';
      headline = 'Продажи ускоряются';
    } else {
      dir = 'держатся на одном уровне';
      headline = 'Продажи вышли на плато';
    }

    lines.push('Сделки ' + dir + ': ' + nf1.format(p.rateNow) + ' в неделю за последние ' +
      p.window + ' ' + plural(p.window, 'неделю', 'недели', 'недель') + ' против ' +
      nf1.format(p.ratePrev) + ' в предыдущие ' + p.window +
      (p.dealsDelta == null ? '' : ' (' + signPct(p.dealsDelta) + ').'));

    if (p.revenueDelta != null) {
      lines.push('Выручка при этом ' + (Math.abs(p.revenueDelta) < 0.05 ? 'почти не изменилась' :
        (p.revenueDelta > 0 ? 'выросла' : 'просела')) + ' — ' + fmtMoneyShort(p.revenueNow) +
        ' в неделю (' + signPct(p.revenueDelta) + '), потому что средний чек ' +
        (p.checkDelta > 0 ? 'вырос' : 'изменился') + ' до ' + fmtMoneyShort(p.checkNow) +
        (p.checkDelta == null ? '' : ' (' + signPct(p.checkDelta) + ')') + '.');
    }

    lines.push('Продано ' + fmtPct(p.soldShare) + ' пула. В экспозиции осталось ' +
      fmtInt(p.remaining) + ' ' + plural(p.remaining, 'квартира', 'квартиры', 'квартир') +
      ' на ' + fmtMoneyShort(p.remainingValue) + ' по прайсу' +
      (p.weeksLeft ? ' — при нынешнем темпе это примерно ' + fmtInt(p.weeksLeft) + ' ' +
        plural(Math.round(p.weeksLeft), 'неделя', 'недели', 'недель') + ' работы' : '') + '.');

    return { headline: headline, lines: lines, pulse: p };
  }

  /** «Кому премия, с кем поговорить?» */
  function answerManagers(deals, allManagers) {
    var rows = managerScore(deals, allManagers);
    if (!rows.length) return { headline: 'Нет сделок в выборке', lines: [], rows: [] };
    var good = rows.filter(function (m) { return m.verdict === 'good'; });
    var watch = rows.filter(function (m) {
      return m.verdict === 'watch' || m.verdict === 'mixed';
    });
    var lines = [];

    if (good.length) {
      lines.push('Премия: ' + good.map(function (m) { return m.label; }).join(', ') +
        ' — выручка выше средней по команде при скидках ниже средних.');
    }
    watch.forEach(function (m) {
      var w = m.tags.filter(function (t) { return t.kind === 'watch'; });
      if (w.length) lines.push(m.label + ' — ' + w.map(function (t) { return t.text; }).join('; ') + '.');
    });
    return {
      headline: good.length
        ? 'Премия: ' + good.map(function (m) { return m.label; }).join(', ')
        : 'Явных кандидатов на премию нет',
      lines: lines,
      rows: rows
    };
  }

  /** «Квартиры с какими признаками продаются хорошо, а с какими плохо?» */
  function answerFeatures(inventory, deals) {
    var h = featureHighlights(inventory, deals);
    if (!h.all.length) return { headline: '', lines: [], best: [], worst: [] };
    var base = inventory.length ? deals.length / inventory.length : 0;
    var lines = [];

    var b = h.best[0], w = h.worst[0];
    if (b) lines.push('Лучше всего уходит «' + b.label + '» (' + b.featureLabel.toLowerCase() +
      '): ' + fmtPct(b.share) + ' пула против ' + fmtPct(base) + ' в среднем, медиана ' +
      (b.medianDays == null ? '—' : fmtInt(b.medianDays)) + ' ' +
      plural(b.medianDays || 0, 'день', 'дня', 'дней') + '.');
    if (w) lines.push('Хуже всего — «' + w.label + '» (' + w.featureLabel.toLowerCase() +
      '): ' + fmtPct(w.share) + ', это ' + fmtInt(w.remaining) + ' ' +
      plural(w.remaining, 'квартира', 'квартиры', 'квартир') + ' в экспозиции.');

    // дорогое против дешёвого — контринтуитивный, но устойчивый эффект
    var price = featureBreakdown(inventory, deals, 'priceBand', { minPool: 20 }).rows;
    if (price.length > 1) {
      var top = price[0], bottom = price[price.length - 1];
      if (top.listPricePerM2 > bottom.listPricePerM2) {
        lines.push('Цена сама по себе не тормозит продажи: сегмент «' + top.label +
          '» реализован на ' + fmtPct(top.share) + ', а «' + bottom.label + '» — на ' +
          fmtPct(bottom.share) + '. Стоят не дорогие, а неудачные квартиры.');
      }
    }
    return {
      headline: b && w ? 'Продаётся вид и метраж, стоит — «окна в окна»' : '',
      lines: lines,
      best: h.best,
      worst: h.worst
    };
  }

  function signPct(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v > 0 ? '+' : '−') + nf0.format(Math.abs(v) * 100) + '%';
  }

  /* ---------------- наблюдения (текстом) ---------------- */

  function insights(inventory, deals) {
    var out = [];
    if (!deals.length) return out;
    var s = summary(inventory, deals);
    var views = byView(inventory, deals);
    var mans = byManager(deals).sort(function (a, b) { return b.revenue - a.revenue; });
    var rooms = byRooms(inventory, deals);

    var bestView = views.slice().sort(function (a, b) { return b.soldShare - a.soldShare; })[0];
    var worstView = views.slice().sort(function (a, b) { return a.soldShare - b.soldShare; })[0];
    if (bestView && worstView && bestView.key !== worstView.key) {
      out.push('Вид из окон делит спрос: «' + bestView.label + '» распродан на ' +
        fmtPct(bestView.soldShare) + ', «' + worstView.label + '» — только на ' +
        fmtPct(worstView.soldShare) + '.');
    }
    if (mans.length) {
      var top = mans[0];
      out.push('Лидер по выручке — ' + top.label + ': ' + fmtMoneyShort(top.revenue) +
        ' за ' + top.deals + ' ' + plural(top.deals, 'сделку', 'сделки', 'сделок') + '.');
      var disc = mans.slice().sort(function (a, b) { return b.discountShare - a.discountShare; })[0];
      if (disc && disc.discountShare > 0) {
        out.push('Чаще всех торгуется ' + disc.label + ': скидка в ' +
          fmtPct(disc.discountShare) + ' сделок, всего ' + fmtMoneyShort(disc.discountSum) + '.');
      }
    }
    if (s.medianDays != null) {
      out.push('Половина сделок закрывается за ' + fmtInt(s.medianDays) + ' ' +
        plural(s.medianDays, 'день', 'дня', 'дней') + ' с момента обращения.');
    }
    var bestRooms = rooms.slice().sort(function (a, b) { return b.soldShare - a.soldShare; })[0];
    if (bestRooms) {
      out.push('Лучше всего реализованы ' + bestRooms.label + ' квартиры: продано ' +
        fmtPct(bestRooms.soldShare) + ' пула, медиана срока сделки — ' +
        (bestRooms.medianDays == null ? '—' : fmtInt(bestRooms.medianDays)) + ' ' +
        plural(bestRooms.medianDays || 0, 'день', 'дня', 'дней') + '.');
    }
    if (s.discountSum > 0) {
      out.push('Скидки съели ' + fmtMoneyShort(s.discountSum) + ' — ' +
        fmtPct(s.discountRate, 1) + ' прайсовой стоимости проданного.');
    }
    return out;
  }

  global.Stats = {
    fmtInt: fmtInt,
    fmtMoney: fmtMoney,
    fmtMoneyShort: fmtMoneyShort,
    fmtArea: fmtArea,
    fmt1: fmt1,
    fmtMoneyAxis: fmtMoneyAxis,
    fmtPct: fmtPct,
    fmtDate: fmtDate,
    fmtDateFull: fmtDateFull,
    monthName: monthName,
    plural: plural,
    parseISO: parseISO,
    toISO: toISO,
    weekStart: weekStart,
    weekEnd: weekEnd,
    weekLabel: weekLabel,
    weekLabelFull: weekLabelFull,
    weeklyDeals: weeklyDeals,
    addDays: addDays,
    dateRange: dateRange,
    isSold: isSold,
    filterInventory: filterInventory,
    filterDeals: filterDeals,
    sectionOf: sectionOf,
    blockOf: blockOf,
    bySection: bySection,
    atomGroups: atomGroups,
    pulse: pulse,
    managerScore: managerScore,
    FEATURES: FEATURES,
    featureBreakdown: featureBreakdown,
    featureHighlights: featureHighlights,
    answerPulse: answerPulse,
    answerManagers: answerManagers,
    answerFeatures: answerFeatures,
    signPct: signPct,
    sum: sum,
    mean: mean,
    median: median,
    uniq: uniq,
    groupBy: groupBy,
    summary: summary,
    timeSeries: timeSeries,
    byManager: byManager,
    byBuilding: byBuilding,
    byView: byView,
    floorMatrix: floorMatrix,
    byRooms: byRooms,
    daysHistogram: daysHistogram,
    insights: insights
  };
})(window);
