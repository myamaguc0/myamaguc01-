/* CSV/Excel 集計：読み込み → 軸と値を選んで集計 → 表・グラフ・CSV出力 */
window.Pages = window.Pages || {};

window.Analyze = (() => {
  // カテゴリ色は固定順で割り当てる（色覚多様性に配慮して検証済みの並び）
  const PALETTE = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  };
  const OTHER = '#8a8f98';
  const colors = () => PALETTE[matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'];

  // 日本の Excel が出力する CSV は Shift_JIS が多いので、UTF-8 で読めなければ Shift_JIS とみなす
  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('shift_jis').decode(buf); }
  }

  async function readRows(file) {
    const buf = await file.arrayBuffer();
    let wb;
    if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
      wb = XLSX.read(buf, { type: 'array', cellDates: true });
    } else {
      wb = XLSX.read(decode(buf).replace(/^﻿/, ''), { type: 'string', raw: true });
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })
      .map((r) => r.map((v) => (v instanceof Date ? U.ymd(v) : v)));
    const out = rows.filter((r) => r.some((v) => String(v).trim() !== ''));
    if (out.length < 2) throw new Error('データが見つかりません（1行目は見出しにしてください）');
    return out;
  }

  const toNumber = (v) => {
    if (typeof v === 'number') return v;
    // Shift_JIS では「¥」が「\」として読まれるため、両方を取り除く
    const s = String(v ?? '').replace(/[,¥￥\\円\s]/g, '').replace(/^\((.*)\)$/, '-$1').replace(/^▲/, '-');
    if (s === '' || isNaN(s)) return null;
    return Number(s);
  };
  const toDate = (v) => {
    const m = String(v ?? '').trim().match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
  };

  // 列ごとに「数値」「日付」「文字」を判定（8割以上が該当すればその型）
  function profile(header, body) {
    return header.map((h, i) => {
      const vals = body.map((r) => r[i]).filter((v) => String(v ?? '').trim() !== '');
      const ratio = (fn) => (vals.length ? vals.filter((v) => fn(v) !== null).length / vals.length : 0);
      const type = ratio(toDate) >= 0.8 ? 'date' : ratio(toNumber) >= 0.8 ? 'number' : 'text';
      return { i, name: String(h || `列${i + 1}`), type, distinct: new Set(vals).size };
    });
  }

  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function keyOf(v, grain) {
    const d = toDate(v);
    if (!d || grain === 'raw') return String(v ?? '').trim() || '（空欄）';
    if (grain === 'year') return d.slice(0, 4) + '年';
    if (grain === 'month') return d.slice(0, 7);
    if (grain === 'weekday') return WEEK[new Date(d + 'T00:00:00').getDay()];
    return d;
  }

  const AGG = {
    sum: { label: '合計', fn: (a) => a.reduce((x, y) => x + y, 0) },
    count: { label: '件数', fn: (a) => a.length },
    avg: { label: '平均', fn: (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0) },
    max: { label: '最大', fn: (a) => (a.length ? Math.max(...a) : 0) },
    min: { label: '最小', fn: (a) => (a.length ? Math.min(...a) : 0) },
  };

  // 集計本体。split を指定するとクロス集計（内訳）になる。内訳は上位7件＋その他
  function aggregate(body, { group, grain, value, agg, split, sort }) {
    const splitKeys = [];
    if (split !== '') {
      const tally = new Map();
      body.forEach((r) => { const k = keyOf(r[split], 'raw'); tally.set(k, (tally.get(k) || 0) + 1); });
      const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
      splitKeys.push(...ranked.slice(0, ranked.length > 8 ? 7 : 8));
      if (ranked.length > 8) splitKeys.push('その他');
    }
    const cols = split === '' ? ['__all'] : splitKeys;
    const buckets = new Map();
    body.forEach((r) => {
      const g = keyOf(r[group], grain);
      let sk = '__all';
      if (split !== '') { sk = keyOf(r[split], 'raw'); if (!splitKeys.includes(sk)) sk = 'その他'; }
      const v = agg === 'count' ? 1 : toNumber(r[value]);
      if (v === null) return;
      if (!buckets.has(g)) buckets.set(g, new Map(cols.map((c) => [c, []])));
      buckets.get(g).get(sk).push(v);
    });
    let rows = [...buckets.entries()].map(([g, m]) => {
      const vals = cols.map((c) => AGG[agg].fn(m.get(c)));
      const all = [].concat(...cols.map((c) => m.get(c)));
      return { key: g, vals, total: AGG[agg].fn(all), n: all.length };
    });
    const isTime = grain !== 'raw' || rows.every((r) => toDate(r.key));
    if (sort === 'label' || (sort === 'auto' && isTime)) {
      const order = grain === 'weekday' ? (k) => WEEK.indexOf(k) : null;
      rows.sort((a, b) => (order ? order(a.key) - order(b.key) : a.key.localeCompare(b.key, 'ja', { numeric: true })));
    } else {
      rows.sort((a, b) => b.total - a.total);
    }
    return { cols, rows, isTime };
  }

  // 動作確認用のサンプル売上データ（毎回同じ内容になるよう擬似乱数を固定）
  function sampleRows() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const staff = ['佐藤', '鈴木', '高橋', '田中'];
    const items = [['Webサイト保守', 50000], ['LP制作', 180000], ['広告運用代行', 120000], ['コンサルティング', 80000], ['研修講師', 150000]];
    const clients = ['株式会社みらい商事', '有限会社さくら工房', '株式会社ひかり物流', '合同会社あおば', '株式会社たいよう不動産', '株式会社こだま食品'];
    const rows = [['日付', '担当者', '顧客名', '商品', '数量', '金額']];
    for (let i = 0; i < 180; i++) {
      const d = new Date(2026, 4 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 28));
      const it = items[Math.floor(rnd() * items.length)];
      const q = 1 + Math.floor(rnd() * 3);
      rows.push([U.ymd(d), staff[Math.floor(rnd() * (rnd() < 0.3 ? 2 : 4))], clients[Math.floor(rnd() * clients.length)], it[0], q, it[1] * q]);
    }
    return rows;
  }

  return { colors, OTHER, readRows, toNumber, toDate, profile, aggregate, AGG, sampleRows };
})();

Pages.analyze = async (view) => {
  let header = [], body = [], cols = [], fileName = '', chart = null, result = null;
  const cfg = { group: '', grain: 'month', value: '', agg: 'sum', split: '', sort: 'auto', kind: 'bar' };

  view.innerHTML = `
    <div class="page-head">
      <div><h1>CSV・Excel集計</h1><p>売上や問い合わせのデータを読み込み、担当者別・月別などに集計してグラフにします。データは外部に送信されません。</p></div>
      <div class="actions"><button class="btn" id="sample">サンプルデータで試す</button></div>
    </div>
    <div class="card"><label class="drop" id="drop">
      <div class="big">▤</div>
      <div><b>CSV / Excel ファイルをドラッグ＆ドロップ</b></div>
      <div class="small">またはクリックして選択（.csv .xlsx .xls／1行目は見出し／Shift_JISのCSVもそのまま読めます）</div>
      <input type="file" id="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm" hidden>
    </label></div>
    <div id="work"></div>`;

  const $ = (sel) => view.querySelector(sel);
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
  $('#file').onchange = (e) => { if (e.target.files[0]) load(e.target.files[0]); e.target.value = ''; };
  $('#sample').onclick = () => setData(Analyze.sampleRows(), 'サンプル売上データ.csv');

  async function load(file) {
    try { setData(await Analyze.readRows(file), file.name); } catch (err) { U.toast('読み込めませんでした：' + err.message, 'err'); }
  }

  function setData(rows, name) {
    fileName = name;
    header = rows[0].map(String);
    const width = Math.max(...rows.map((r) => r.length));
    body = rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
    while (header.length < width) header.push(`列${header.length + 1}`);
    cols = Analyze.profile(header, body);
    // よくある形を推測して初期値にする：日付があれば月別、数値列は金額系を優先
    const date = cols.find((c) => c.type === 'date');
    const text = cols.find((c) => c.type === 'text' && c.distinct <= 50);
    const nums = cols.filter((c) => c.type === 'number');
    const money = nums.find((c) => /金額|売上|合計|amount|price|total/i.test(c.name)) || nums[nums.length - 1];
    cfg.group = String((date || text || cols[0]).i);
    cfg.grain = date && String(date.i) === cfg.group ? 'month' : 'raw';
    cfg.value = money ? String(money.i) : '';
    cfg.agg = money ? 'sum' : 'count';
    cfg.split = '';
    drawWork();
  }

  const opt = (v, l, cur) => `<option value="${U.esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${U.esc(l)}</option>`;
  const typeLabel = { date: '日付', number: '数値', text: '文字' };

  function drawWork() {
    const nums = cols.filter((c) => c.type === 'number');
    $('#work').innerHTML = `
      <div class="card">
        <div class="card-head"><h2>${U.esc(fileName)}</h2><span class="small muted">${body.length.toLocaleString()}行 × ${cols.length}列</span></div>
        <div class="table-wrap"><table class="table small">
          <thead><tr>${cols.map((c) => `<th>${U.esc(c.name)} <span class="badge">${typeLabel[c.type]}</span></th>`).join('')}</tr></thead>
          <tbody>${body.slice(0, 5).map((r) => `<tr>${r.map((v, i) => `<td class="${cols[i].type === 'number' ? 'r' : ''}">${U.esc(cols[i].type === 'number' ? U.num(Analyze.toNumber(v)) : v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        ${body.length > 5 ? `<p class="small muted" style="margin:6px 0 0">先頭5行を表示しています</p>` : ''}
      </div>
      <div class="card" id="cfg">
        <h2>集計の設定</h2>
        <div class="grid grid-4">
          <label class="field"><span>何ごとに集計するか（軸）</span><select name="group">${cols.map((c) => opt(c.i, c.name, cfg.group)).join('')}</select></label>
          <label class="field" id="grainF"><span>日付のまとめ方</span><select name="grain">${opt('month', '月別', cfg.grain)}${opt('year', '年別', cfg.grain)}${opt('day', '日別', cfg.grain)}${opt('weekday', '曜日別', cfg.grain)}${opt('raw', 'そのまま', cfg.grain)}</select></label>
          <label class="field"><span>集計方法</span><select name="agg">${Object.entries(Analyze.AGG).map(([k, a]) => opt(k, a.label, cfg.agg)).join('')}</select></label>
          <label class="field" id="valF"><span>集計する値</span><select name="value">${nums.length ? nums.map((c) => opt(c.i, c.name, cfg.value)).join('') : '<option value="">（数値の列がありません）</option>'}</select></label>
          <label class="field"><span>内訳（色分け・任意）</span><select name="split">${opt('', 'なし', cfg.split)}${cols.filter((c) => c.type === 'text').map((c) => opt(c.i, c.name, cfg.split)).join('')}</select></label>
          <label class="field"><span>並び順</span><select name="sort">${opt('auto', '自動', cfg.sort)}${opt('desc', '値の大きい順', cfg.sort)}${opt('label', '名前・日付順', cfg.sort)}</select></label>
          <label class="field"><span>グラフ</span><select name="kind">${opt('bar', '棒グラフ', cfg.kind)}${opt('line', '折れ線グラフ', cfg.kind)}${opt('pie', '円グラフ（構成比）', cfg.kind)}</select></label>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2 id="rt"></h2><div class="actions"><button class="btn btn-sm" id="png">グラフを画像で保存</button><button class="btn btn-sm btn-primary" id="csv">集計結果をCSVで保存</button></div></div>
        <div class="chart-box"><canvas id="chart" role="img"></canvas></div>
      </div>
      <div class="card"><div class="table-wrap" id="tbl"></div></div>`;

    $('#cfg').onchange = (e) => { cfg[e.target.name] = e.target.value; if (e.target.name === 'group') { const c = cols[Number(cfg.group)]; cfg.grain = c.type === 'date' ? 'month' : 'raw'; $('[name=grain]').value = cfg.grain; } run(); };
    $('#csv').onclick = exportCSV;
    $('#png').onclick = () => { const a = document.createElement('a'); a.href = $('#chart').toDataURL('image/png'); a.download = `集計グラフ_${U.ymd()}.png`; a.click(); };
    run();
  }

  function run() {
    const groupCol = cols[Number(cfg.group)];
    $('#grainF').style.display = groupCol.type === 'date' ? '' : 'none';
    $('#valF').style.display = cfg.agg === 'count' ? 'none' : '';
    if (cfg.agg !== 'count' && cfg.value === '') { cfg.agg = 'count'; $('[name=agg]').value = 'count'; $('#valF').style.display = 'none'; }
    const grain = groupCol.type === 'date' ? cfg.grain : 'raw';
    const split = cfg.split === cfg.group ? '' : cfg.split;
    result = Analyze.aggregate(body, { group: Number(cfg.group), grain, value: Number(cfg.value), agg: cfg.agg, split: split === '' ? '' : Number(split), sort: cfg.sort });
    result.title = `${groupCol.name}${grain !== 'raw' ? `（${{ month: '月別', year: '年別', day: '日別', weekday: '曜日別' }[grain]}）` : ''}ごとの${cfg.agg === 'count' ? '件数' : `${cols[Number(cfg.value)].name}の${Analyze.AGG[cfg.agg].label}`}`;
    result.splitName = split === '' ? '' : cols[Number(split)].name;
    $('#rt').textContent = result.title;
    drawTable();
    drawChart();
  }

  const fmt = (v) => (cfg.agg === 'avg' ? U.num(Math.round(v * 10) / 10) : U.num(v));

  function drawTable() {
    const { rows, cols: sc } = result;
    const grand = rows.reduce((a, r) => a + r.total, 0);
    const showShare = cfg.agg === 'sum' || cfg.agg === 'count';
    const split = sc[0] !== '__all';
    $('#tbl').innerHTML = `<table class="table">
      <thead><tr><th>${U.esc(cols[Number(cfg.group)].name)}</th>${split ? sc.map((c) => `<th class="r">${U.esc(c)}</th>`).join('') : ''}<th class="r">${split ? '計' : U.esc(Analyze.AGG[cfg.agg].label)}</th>${showShare ? '<th class="r">構成比</th>' : ''}<th class="r">件数</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${U.esc(r.key)}</td>${split ? r.vals.map((v) => `<td class="r">${fmt(v)}</td>`).join('') : ''}<td class="r"><b>${fmt(r.total)}</b></td>${showShare ? `<td class="r">${grand ? ((r.total / grand) * 100).toFixed(1) : 0}%</td>` : ''}<td class="r">${r.n.toLocaleString()}</td></tr>`).join('')}</tbody>
      ${showShare ? `<tfoot><tr><th>合計</th>${split ? sc.map((_, i) => `<th class="r">${fmt(rows.reduce((a, r) => a + r.vals[i], 0))}</th>`).join('') : ''}<th class="r">${fmt(grand)}</th><th class="r">100%</th><th class="r">${rows.reduce((a, r) => a + r.n, 0).toLocaleString()}</th></tr></tfoot>` : ''}
    </table>`;
  }

  function drawChart() {
    if (chart) chart.destroy();
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--muted').trim();
    const grid = css.getPropertyValue('--border').trim();
    const surface = css.getPropertyValue('--surface').trim();
    const pal = Analyze.colors();
    const { rows, cols: sc } = result;
    const split = sc[0] !== '__all';
    const colorAt = (i, key) => (key === 'その他' ? Analyze.OTHER : pal[i % pal.length]);
    let data, type = cfg.kind;

    if (type === 'pie') {
      // 円グラフは上位7件＋その他にまとめる（色が8色を超えないように）
      const top = rows.slice().sort((a, b) => b.total - a.total);
      const head = top.slice(0, top.length > 8 ? 7 : 8);
      const rest = top.slice(head.length).reduce((a, r) => a + r.total, 0);
      const labels = head.map((r) => r.key).concat(rest ? ['その他'] : []);
      data = { labels, datasets: [{ data: head.map((r) => r.total).concat(rest ? [rest] : []), backgroundColor: labels.map((l, i) => colorAt(i, l)), borderColor: surface, borderWidth: 2 }] };
      type = 'doughnut';
    } else if (split) {
      data = { labels: rows.map((r) => r.key), datasets: sc.map((c, i) => ({
        label: c, data: rows.map((r) => r.vals[i]), backgroundColor: colorAt(i, c), borderColor: type === 'line' ? colorAt(i, c) : surface,
        // 積み上げの各段の間に 2px の隙間（背景色の枠線）を入れて境目を見やすくする
        borderWidth: type === 'line' ? 2 : { top: 2, right: 0, bottom: 0, left: 0 }, pointRadius: type === 'line' ? 3 : 0, tension: 0.25,
        borderRadius: 4, borderSkipped: 'start', barPercentage: 0.7, categoryPercentage: 0.8,
      })) };
    } else {
      data = { labels: rows.map((r) => r.key), datasets: [{
        label: result.title, data: rows.map((r) => r.total), backgroundColor: pal[0], borderColor: pal[0],
        borderWidth: type === 'line' ? 2 : 0, pointRadius: 3, tension: 0.25, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 48,
      }] };
    }
    const stacked = split && type === 'bar' && (cfg.agg === 'sum' || cfg.agg === 'count');
    chart = new Chart($('#chart'), {
      type,
      data,
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: type === 'doughnut' ? 'nearest' : 'index', intersect: false },
        plugins: {
          legend: { display: split || type === 'doughnut', position: 'bottom', labels: { color: ink, boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 3 } },
          tooltip: { callbacks: { label: (c) => {
            const v = c.parsed.y ?? c.parsed;
            if (type === 'doughnut') { const sum = c.dataset.data.reduce((a, b) => a + b, 0); return ` ${c.label}: ${fmt(v)}（${((v / sum) * 100).toFixed(1)}%）`; }
            return ` ${c.dataset.label}: ${fmt(v)}`;
          } } },
        },
        scales: type === 'doughnut' ? {} : {
          x: { stacked, ticks: { color: ink, maxRotation: 45, autoSkip: true }, grid: { display: false }, border: { color: grid } },
          y: { stacked, beginAtZero: true, ticks: { color: ink, callback: (v) => U.num(v) }, grid: { color: grid }, border: { display: false } },
        },
        ...(type === 'doughnut' ? { cutout: '55%' } : {}),
      },
    });
    $('#chart').setAttribute('aria-label', result.title);
  }

  function exportCSV() {
    const { rows, cols: sc } = result;
    const split = sc[0] !== '__all';
    const out = [[cols[Number(cfg.group)].name, ...(split ? sc : []), split ? '計' : Analyze.AGG[cfg.agg].label, '件数']];
    rows.forEach((r) => out.push([r.key, ...(split ? r.vals.map((v) => Math.round(v * 100) / 100) : []), Math.round(r.total * 100) / 100, r.n]));
    U.download(`集計結果_${U.ymd()}.csv`, U.toCSV(out), 'text/csv');
  }

  return () => { if (chart) chart.destroy(); };
};
