/* ============================================================
   app.js — Vue 3: состояние, фильтры, агрегаты, вызов отрисовки.
   Вся арифметика — в stats.js, вся графика — в charts.js.

   Цветовая семантика дашборда (одна на все блоки):
     синий  — продано / факт
     серый  — остаток в экспозиции
     оранж. — скидка
   ============================================================ */
(function () {
  'use strict';

  if (!window.Vue) {
    document.getElementById('boot-error').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    return;
  }

  var S = window.Stats;
  var C = window.Charts;
  var DATA = window.SALES_DATA || [];
  var Vue = window.Vue;

  var MONTH_PRESETS = (function () {
    var months = S.uniq(DATA.filter(S.isSold).map(function (r) { return r.deal_date.slice(0, 7); })).sort();
    return months.map(function (ym) {
      var p = ym.split('-');
      // последний день месяца — чтобы значение подходило и для <input type="date">
      var last = new Date(Date.UTC(+p[0], +p[1], 0));
      return {
        key: ym,
        label: S.monthName(ym),
        from: ym + '-01',
        to: ym + '-' + String(last.getUTCDate()).padStart(2, '0')
      };
    });
  })();

  // localStorage может быть недоступен при открытии файла с диска — не роняем приложение
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* игнорируем */ } }

  var ALL_DATES = DATA.filter(S.isSold).map(function (r) { return r.deal_date; }).sort();
  var DATE_MIN = ALL_DATES[0];
  var DATE_MAX = ALL_DATES[ALL_DATES.length - 1];

  var app = Vue.createApp({
    setup: function () {
      var ref = Vue.ref, computed = Vue.computed, watch = Vue.watch, nextTick = Vue.nextTick;

      /* ---------------- состояние ---------------- */

      var theme = ref(lsGet('dash-theme') || 'light');
      var selBuildings = ref([]);
      var selRooms = ref([]);
      var selViews = ref([]);
      var selManagers = ref([]);
      var selSections = ref([]);        // выбор кликом по схеме комплекса
      var datePreset = ref('all');
      var dateFrom = ref(DATE_MIN);
      var dateTo = ref(DATE_MAX);

      var viewMetric = ref('units');     // units | deals | price
      var roomsMode = ref('units');      // units | bars
      var featureKey = ref('view');      // признак для разбора «что продаётся»
      var planMetric = ref('soldShare'); // что показывает заливка на схеме

      var tableMode = Vue.reactive({});  // id блока -> показывать таблицу вместо графика
      var sortKey = ref('revenue');
      var sortDir = ref('desc');

      /* ---------------- справочники ---------------- */

      var allBuildings = S.uniq(DATA.map(function (r) { return r.building; })).sort();
      var allRooms = S.uniq(DATA.map(function (r) { return r.rooms; }))
        .sort(function (a, b) { return a - b; });
      var allViews = S.uniq(DATA.map(function (r) { return r.view; }));
      var allManagers = S.uniq(DATA.filter(function (r) { return r.manager; })
        .map(function (r) { return r.manager; })).sort();

      /* ---------------- фильтрация ---------------- */

      // пул квартир: фильтры по «физическим» признакам
      var inventory = computed(function () {
        return S.filterInventory(DATA, {
          buildings: selBuildings.value,
          rooms: selRooms.value,
          views: selViews.value,
          sections: selSections.value
        });
      });

      // сделки: пул + менеджер + период
      var deals = computed(function () {
        return S.filterDeals(inventory.value, {
          managers: selManagers.value,
          from: dateFrom.value,
          to: dateTo.value
        });
      });

      var isFiltered = computed(function () {
        return selBuildings.value.length || selRooms.value.length || selViews.value.length ||
          selManagers.value.length || selSections.value.length || datePreset.value !== 'all';
      });

      /* ---------------- агрегаты ---------------- */

      var kpi = computed(function () { return S.summary(inventory.value, deals.value); });

      var weeks = computed(function () {
        return S.weeklyDeals(deals.value, { lastDate: dateTo.value || DATE_MAX });
      });
      var mans = computed(function () {
        var names = selManagers.value.length ? selManagers.value : allManagers;
        return S.byManager(deals.value, names);
      });
      var mansByDeals = computed(function () {
        return mans.value.slice().sort(function (a, b) { return b.deals - a.deals; });
      });
      var mansByRevenue = computed(function () {
        return mans.value.slice().sort(function (a, b) { return b.revenue - a.revenue; });
      });
      var mansByDiscount = computed(function () {
        return mans.value.slice().sort(function (a, b) { return b.dealsWithDiscount - a.dealsWithDiscount; });
      });

      var buildingsRows = computed(function () { return S.byBuilding(inventory.value, deals.value); });
      var buildingsSorted = computed(function () {
        var rows = buildingsRows.value.slice();
        var k = sortKey.value, dir = sortDir.value === 'asc' ? 1 : -1;
        rows.sort(function (a, b) {
          var av = a[k], bv = b[k];
          if (typeof av === 'string') return dir * av.localeCompare(bv, 'ru');
          return dir * ((av || 0) - (bv || 0));
        });
        return rows;
      });
      var buildingsTotal = computed(function () {
        var rows = buildingsRows.value;
        var total = S.sum(rows, function (r) { return r.total; });
        var d = S.sum(rows, function (r) { return r.deals; });
        var revenue = S.sum(rows, function (r) { return r.revenue; });
        var area = S.sum(rows, function (r) { return r.soldArea; });
        return {
          total: total, deals: d, remaining: total - d,
          soldShare: total ? d / total : 0,
          revenue: revenue, soldArea: area,
          avgPricePerM2: area ? revenue / area : 0,
          avgDeal: d ? revenue / d : 0,
          discountSum: S.sum(rows, function (r) { return r.discountSum; }),
          medianDays: kpi.value.medianDays
        };
      });

      var viewRows = computed(function () { return S.byView(inventory.value, deals.value); });
      var roomRows = computed(function () { return S.byRooms(inventory.value, deals.value); });
      var matrix = computed(function () { return S.floorMatrix(inventory.value, deals.value); });
      var daysRows = computed(function () { return S.daysHistogram(deals.value); });
      var insights = computed(function () { return S.insights(inventory.value, deals.value); });

      // схема комплекса и ответы на вопросы заказчика
      var planRows = computed(function () { return S.bySection(inventory.value, deals.value); });
      var atomGroups = computed(function () { return S.atomGroups(inventory.value, deals.value); });
      var pulse = computed(function () { return S.pulse(inventory.value, deals.value); });
      var managerAnswer = computed(function () {
        var names = selManagers.value.length ? selManagers.value : allManagers;
        return S.answerManagers(deals.value, names);
      });
      var featureAnswer = computed(function () { return S.answerFeatures(inventory.value, deals.value); });
      var featureBreak = computed(function () {
        return S.featureBreakdown(inventory.value, deals.value, featureKey.value);
      });
      // метрики схемы: домен и формат подписи внутри корпуса
      var PLAN_METRICS = [
        { key: 'soldShare', label: 'Реализация', domain: [0, 1],
          format: function (v) { return Math.round(v * 100) + '%'; },
          from: '0%', to: '100% продано' },
        { key: 'revenue', label: 'Выручка',
          format: function (v) { return S.fmtMoneyShort(v, false); },
          from: 'меньше', to: 'больше выручка' },
        { key: 'avgPricePerM2', label: 'Цена за м²',
          format: function (v) { return v ? Math.round(v / 1000) + 'т' : '—'; },
          from: 'дешевле', to: 'дороже за м²' },
        { key: 'remaining', label: 'Остаток',
          format: function (v) { return S.fmtInt(v); },
          from: 'меньше', to: 'больше в экспозиции' }
      ];
      var planMetricSpec = computed(function () {
        return PLAN_METRICS.filter(function (m) { return m.key === planMetric.value; })[0] || PLAN_METRICS[0];
      });

      var featureList = Object.keys(S.FEATURES).map(function (k) {
        return { key: k, label: S.FEATURES[k].label };
      });

      /* ---------------- цвета ---------------- */

      function palette() { return C.theme(); }

      /* ---------------- отрисовка ---------------- */

      function el(id) { return document.getElementById(id); }

      function moneyTick(v) { return S.fmtMoneyAxis(v); }

      function renderCharts() {
        var t = palette();
        var sales = t.sales, rest = t.rest, discount = t.discount, manager = t.manager;

        // 1. сделки по неделям — столбцы из атомов
        if (el('chart-weeks')) {
          C.weeklyUnits(el('chart-weeks'), weeks.value, {
            colorFull: sales,
            colorDiscount: discount
          });
        }

        // 2. менеджеры: сделки / выручка (две панели, одна шкала на каждой)
        if (el('chart-man-deals')) {
          C.bars(el('chart-man-deals'), mansByDeals.value.map(function (m) {
            return {
              key: m.key, label: m.label, total: m.deals,
              segments: [{ key: 'deals', label: 'Сделок', value: m.deals, color: manager }],
              tooltip: [
                { label: 'Сделок', value: S.fmtInt(m.deals), color: manager },
                { label: 'Выручка', value: S.fmtMoneyShort(m.revenue) },
                { label: 'Средний чек', value: S.fmtMoneyShort(m.avgDeal) },
                { label: 'Медиана дней', value: m.medianDays == null ? '—' : S.fmtInt(m.medianDays) }
              ]
            };
          }), { height: Math.max(150, mansByDeals.value.length * 38 + 20) });
        }
        if (el('chart-man-revenue')) {
          C.bars(el('chart-man-revenue'), mansByRevenue.value.map(function (m) {
            return {
              key: m.key, label: m.label, total: m.revenue,
              segments: [{ key: 'revenue', label: 'Выручка', value: m.revenue, color: manager }],
              tooltip: [
                { label: 'Выручка', value: S.fmtMoneyShort(m.revenue), color: manager },
                { label: 'Сделок', value: S.fmtInt(m.deals) },
                { label: 'Средняя цена м²', value: S.fmtMoneyShort(m.avgPricePerM2) },
                { label: 'Продано, м²', value: S.fmtArea(m.area) }
              ]
            };
          }), {
            height: Math.max(150, mansByRevenue.value.length * 38 + 20),
            valueFormat: function (v) { return S.fmtMoneyShort(v); }
          });
        }

        // 3. скидки по менеджерам — каждая сделка отдельным атомом
        if (el('chart-man-discount')) {
          C.unitRows(el('chart-man-discount'), mansByDiscount.value.map(function (m) {
            return {
              key: m.key, label: m.label,
              segments: [
                { count: m.dealsWithDiscount, color: discount },
                { count: m.dealsFullPrice, color: sales }
              ],
              note: S.fmtInt(m.dealsWithDiscount) + ' / ' + S.fmtInt(m.deals),
              tooltip: [
                { label: 'Со скидкой', value: S.fmtInt(m.dealsWithDiscount) + ' из ' + S.fmtInt(m.deals), color: discount },
                { label: 'Доля со скидкой', value: S.fmtPct(m.discountShare) },
                { label: 'Сумма скидок', value: S.fmtMoneyShort(m.discountSum) },
                { label: 'Средняя скидка', value: S.fmtMoneyShort(m.avgDiscount) },
                { label: 'Дисконт от прайса', value: S.fmtPct(m.discountRate, 1) }
              ]
            };
          }), {});
        }
        if (el('chart-man-discount-sum')) {
          var bySum = mans.value.slice().sort(function (a, b) { return b.discountSum - a.discountSum; });
          C.bars(el('chart-man-discount-sum'), bySum.map(function (m) {
            return {
              key: m.key, label: m.label, total: m.discountSum,
              segments: [{ key: 'sum', label: 'Скидки', value: m.discountSum, color: discount }],
              tooltip: [
                { label: 'Сумма скидок', value: S.fmtMoneyShort(m.discountSum), color: discount },
                { label: 'Сделок со скидкой', value: S.fmtInt(m.dealsWithDiscount) },
                { label: 'Средняя скидка', value: S.fmtMoneyShort(m.avgDiscount) },
                { label: 'Дисконт от прайса', value: S.fmtPct(m.discountRate, 1) }
              ]
            };
          }), {
            height: Math.max(150, mans.value.length * 38 + 20),
            valueFormat: function (v) { return S.fmtMoneyShort(v); }
          });
        }

        // пульс продаж: выручка по неделям
        if (el('chart-pulse-revenue')) {
          C.bars(el('chart-pulse-revenue'), pulse.value.weeks.map(function (w) {
            return {
              key: w.key, label: w.label, total: w.revenue,
              segments: [{ key: 'r', label: 'Выручка', value: w.revenue, color: w.partial ? rest : sales }],
              tooltip: [
                { label: 'Выручка', value: S.fmtMoneyShort(w.revenue), color: w.partial ? rest : sales },
                { label: 'Сделок', value: S.fmtInt(w.count) },
                { label: 'Со скидкой', value: S.fmtInt(w.discountCount) },
                { label: 'Средний чек', value: S.fmtMoneyShort(w.avgDeal) },
                { label: 'Неделя', value: w.partial ? 'неполная' : 'полная' }
              ]
            };
          }), {
            orientation: 'v', height: 220,
            valueFormat: function (v) { return S.fmtMoneyShort(v); },
            tickFormat: moneyTick,
            showValues: false
          });
        }

        // визуальный атом: пул квартир квадратиками
        if (el('chart-pool')) {
          C.waffle(el('chart-pool'), atomGroups.value, {
            ariaLabel: 'Пул квартир: каждый квадратик — одна квартира'
          });
        }

        // схема комплекса
        if (el('chart-plan')) {
          var spec = planMetricSpec.value;
          C.plan(el('chart-plan'), planRows.value, {
            selected: selSections.value,
            onSelect: toggleSection,
            metric: spec
          });
          if (el('plan-legend')) C.heatLegend(el('plan-legend'), { from: spec.from, to: spec.to });
        }

        // признаки квартир
        if (el('chart-feature')) {
          var fb = featureBreak.value;
          var featColor = sales;
          C.bars(el('chart-feature'), fb.rows.map(function (r) {
            return {
              key: r.key, label: r.label, total: r.share,
              segments: [{ key: 's', label: 'Реализация', value: r.share, color: featColor }],
              tooltip: [
                { label: 'Реализация', value: S.fmtPct(r.share), color: featColor },
                { label: 'Продано', value: S.fmtInt(r.deals) + ' из ' + S.fmtInt(r.total) },
                { label: 'К среднему', value: S.signPct(r.delta) },
                { label: 'Медиана дней', value: r.medianDays == null ? '—' : S.fmtInt(r.medianDays) },
                { label: 'Прайс за м²', value: S.fmtMoneyShort(r.listPricePerM2) }
              ]
            };
          }), {
            height: Math.max(160, fb.rows.length * 34 + 40),
            max: 1,
            barSize: 20,
            valueFormat: function (v) { return S.fmtPct(v); },
            baseline: { value: fb.baseline, label: 'среднее ' + S.fmtPct(fb.baseline) }
          });
        }

        // 5. вид из окон
        if (el('chart-views')) {
          if (viewMetric.value === 'units') {
            C.unitRows(el('chart-views'), viewRows.value.map(function (v) {
              return {
                key: v.key, label: v.label, total: v.total, filled: v.deals,
                note: S.fmtInt(v.deals) + ' / ' + S.fmtInt(v.total),
                tooltip: [
                  { label: 'Продано', value: S.fmtInt(v.deals) + ' из ' + S.fmtInt(v.total), color: sales },
                  { label: 'В экспозиции', value: S.fmtInt(v.remaining), color: rest },
                  { label: 'Реализация', value: S.fmtPct(v.soldShare) },
                  { label: 'Выручка', value: S.fmtMoneyShort(v.revenue) },
                  { label: 'Медиана дней', value: v.medianDays == null ? '—' : S.fmtInt(v.medianDays) }
                ]
              };
            }), {});
          } else if (viewMetric.value === 'deals') {
            C.bars(el('chart-views'), viewRows.value.map(function (v) {
              return {
                key: v.key, label: v.label, total: v.total,
                segments: [
                  { key: 'sold', label: 'Продано', value: v.deals, color: sales },
                  { key: 'left', label: 'В экспозиции', value: v.remaining, color: rest }
                ],
                tooltip: [
                  { label: 'Продано', value: S.fmtInt(v.deals) + ' из ' + S.fmtInt(v.total), color: sales },
                  { label: 'Реализация', value: S.fmtPct(v.soldShare) },
                  { label: 'Выручка', value: S.fmtMoneyShort(v.revenue) },
                  { label: 'Цена сделки за м²', value: S.fmtMoneyShort(v.avgPricePerM2) },
                  { label: 'Медиана дней', value: v.medianDays == null ? '—' : S.fmtInt(v.medianDays) }
                ]
              };
            }), { height: Math.max(160, viewRows.value.length * 38 + 20) });
          } else {
            var byPrice = viewRows.value.slice()
              .sort(function (a, b) { return b.avgPricePerM2 - a.avgPricePerM2; })
              .filter(function (v) { return v.avgPricePerM2 > 0; });
            C.bars(el('chart-views'), byPrice.map(function (v) {
              return {
                key: v.key, label: v.label, total: v.avgPricePerM2,
                segments: [{ key: 'ppm', label: 'Цена за м²', value: v.avgPricePerM2, color: sales }],
                tooltip: [
                  { label: 'Цена сделки за м²', value: S.fmtMoneyShort(v.avgPricePerM2), color: sales },
                  { label: 'Прайс за м²', value: S.fmtMoneyShort(v.listPricePerM2) },
                  { label: 'Сделок', value: S.fmtInt(v.deals) },
                  { label: 'Реализация', value: S.fmtPct(v.soldShare) }
                ]
              };
            }), {
              height: Math.max(160, byPrice.length * 38 + 20),
              valueFormat: function (v) { return S.fmtMoneyShort(v); }
            });
          }
        }

        // 6. матрица корпус × этаж
        if (el('chart-matrix')) {
          C.heatmap(el('chart-matrix'), matrix.value, {});
          if (el('matrix-legend')) C.heatLegend(el('matrix-legend'));
        }

        // 7. комнатность
        if (el('chart-rooms') && roomsMode.value === 'units') {
          C.unitRows(el('chart-rooms'), roomRows.value.map(function (r) {
            return {
              key: r.key, label: r.label, total: r.total, filled: r.deals,
              note: S.fmtInt(r.deals) + ' / ' + S.fmtInt(r.total),
              tooltip: [
                { label: 'Продано', value: S.fmtInt(r.deals) + ' из ' + S.fmtInt(r.total), color: sales },
                { label: 'В экспозиции', value: S.fmtInt(r.remaining), color: rest },
                { label: 'Реализация', value: S.fmtPct(r.soldShare) },
                { label: 'Средняя площадь', value: S.fmtArea(r.avgArea) },
                { label: 'Цена сделки за м²', value: S.fmtMoneyShort(r.avgPricePerM2) }
              ]
            };
          }), {});
        } else if (el('chart-rooms')) {
          C.bars(el('chart-rooms'), roomRows.value.map(function (r) {
            return {
              key: r.key, label: r.label, total: r.total,
              segments: [
                { key: 'sold', label: 'Продано', value: r.deals, color: sales },
                { key: 'left', label: 'В экспозиции', value: r.remaining, color: rest }
              ],
              tooltip: [
                { label: 'Продано', value: S.fmtInt(r.deals) + ' из ' + S.fmtInt(r.total), color: sales },
                { label: 'Реализация', value: S.fmtPct(r.soldShare) },
                { label: 'Выручка', value: S.fmtMoneyShort(r.revenue) },
                { label: 'Средняя площадь', value: S.fmtArea(r.avgArea) },
                { label: 'Цена сделки за м²', value: S.fmtMoneyShort(r.avgPricePerM2) }
              ]
            };
          }), { orientation: 'v', height: 240 });
        }

        // 8. скорость сделки — каждая сделка отдельным атомом
        if (el('chart-days')) {
          C.unitColumns(el('chart-days'), daysRows.value.map(function (d) {
            return {
              key: d.key, label: d.label, count: d.deals,
              tooltip: [
                { label: 'Сделок', value: S.fmtInt(d.deals), color: sales },
                { label: 'Доля', value: S.fmtPct(d.share) },
                { label: 'Выручка', value: S.fmtMoneyShort(d.revenue) },
                { label: 'Со скидкой', value: S.fmtPct(d.discountShare) }
              ]
            };
          }), { color: sales });
        }
      }

      var rafId = null;
      function scheduleRender() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(function () {
          rafId = null;
          renderCharts();
        });
      }

      // ключ перерисовки: всё, что влияет на картинку
      var renderKey = computed(function () {
        return [
          theme.value, deals.value.length, inventory.value.length,
          viewMetric.value, roomsMode.value, planMetric.value,
          dateFrom.value, dateTo.value,
          selBuildings.value.join(), selRooms.value.join(),
          selViews.value.join(), selManagers.value.join(), selSections.value.join(),
          featureKey.value,
          JSON.stringify(tableMode)
        ].join('|');
      });

      watch(renderKey, function () { nextTick(scheduleRender); });

      watch(theme, function (v) {
        document.documentElement.setAttribute('data-theme', v);
        lsSet('dash-theme', v);
      }, { immediate: true });

      Vue.onMounted(function () {
        nextTick(scheduleRender);
        var timer = null;
        window.addEventListener('resize', function () {
          clearTimeout(timer);
          timer = setTimeout(scheduleRender, 160);
        });
      });

      /* ---------------- действия ---------------- */

      // в шаблоне ref разворачивается в обычное значение, поэтому переключаем
      // по имени фильтра, а не по переданной ссылке
      var FILTER_REFS = {
        building: selBuildings,
        rooms: selRooms,
        view: selViews,
        manager: selManagers
      };
      function toggleFilter(kind, value) {
        var r = FILTER_REFS[kind];
        if (!r) return;
        if (r.value.indexOf(value) < 0) r.value = r.value.concat([value]);
        else r.value = r.value.filter(function (v) { return v !== value; });
      }

      function toggleSection(key) {
        if (selSections.value.indexOf(key) < 0) selSections.value = selSections.value.concat([key]);
        else selSections.value = selSections.value.filter(function (v) { return v !== key; });
      }
      function clearSections() { selSections.value = []; }

      function setPreset(key) {
        datePreset.value = key;
        if (key === 'all') { dateFrom.value = DATE_MIN; dateTo.value = DATE_MAX; return; }
        var p = MONTH_PRESETS.filter(function (m) { return m.key === key; })[0];
        if (p) { dateFrom.value = p.from; dateTo.value = p.to; }
      }

      function onDateInput() { datePreset.value = 'custom'; }

      function resetFilters() {
        selBuildings.value = [];
        selRooms.value = [];
        selViews.value = [];
        selManagers.value = [];
        selSections.value = [];
        setPreset('all');
      }

      function sortBy(key) {
        if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
        else { sortKey.value = key; sortDir.value = 'desc'; }
      }

      function toggleTable(id) { tableMode[id] = !tableMode[id]; }
      function isTable(id) { return !!tableMode[id]; }

      function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark'; }

      return {
        // состояние
        theme: theme, toggleTheme: toggleTheme,
        selBuildings: selBuildings, selRooms: selRooms, selViews: selViews, selManagers: selManagers,
        selSections: selSections, featureKey: featureKey, featureList: featureList,
        planMetric: planMetric,
        planMetrics: PLAN_METRICS.map(function (m) { return { key: m.key, label: m.label }; }),
        datePreset: datePreset, dateFrom: dateFrom, dateTo: dateTo,
        viewMetric: viewMetric, roomsMode: roomsMode,
        sortKey: sortKey, sortDir: sortDir,
        // справочники
        allBuildings: allBuildings, allRooms: allRooms, allViews: allViews, allManagers: allManagers,
        totalCount: DATA.length,
        presets: MONTH_PRESETS, dateMin: DATE_MIN, dateMax: DATE_MAX,
        // данные
        inventory: inventory, deals: deals, kpi: kpi,
        mansByDeals: mansByDeals, mansByRevenue: mansByRevenue, mansByDiscount: mansByDiscount,
        buildingsSorted: buildingsSorted, buildingsTotal: buildingsTotal,
        viewRows: viewRows, roomRows: roomRows, daysRows: daysRows, insights: insights,
        matrix: matrix, isFiltered: isFiltered,
        pulse: pulse,
        managerAnswer: managerAnswer, featureAnswer: featureAnswer, featureBreak: featureBreak,
        // действия
        toggleFilter: toggleFilter, setPreset: setPreset, onDateInput: onDateInput,
        resetFilters: resetFilters, sortBy: sortBy,
        toggleSection: toggleSection, clearSections: clearSections,
        toggleTable: toggleTable, isTable: isTable,
        // форматирование в шаблоне
        fmtInt: S.fmtInt, fmtMoney: S.fmtMoney, fmtMoneyShort: S.fmtMoneyShort,
        fmtArea: S.fmtArea, fmt1: S.fmt1, fmtPct: S.fmtPct, fmtDate: S.fmtDate, fmtDateFull: S.fmtDateFull,
        plural: S.plural, signPct: S.signPct
      };
    }
  });

  app.mount('#app');
})();
