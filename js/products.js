/* 品目マスタ：よく使う商品・サービスの単価・単位・税率を登録し、明細入力で呼び出す */
window.Pages = window.Pages || {};

Pages.products = async (view) => {
  let products = (await DB.all('products')).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
  let q = '';
  const HEAD = ['品名', '単位', '単価（税抜）', '税率'];
  const rateOf = (v) => { const n = Number(String(v).replace(/[%％\s]/g, '')); return [10, 8, 0].includes(n) ? n : String(v).includes('非課税') ? 0 : 10; };

  view.innerHTML = `
    <div class="page-head">
      <div><p class="small"><a href="#/documents">← 見積書・請求書</a></p><h1>品目マスタ</h1>
        <p>よく使う商品・サービスを登録すると、帳票の明細で品名を選ぶだけで単価・単位・税率が入ります。</p></div>
      <div class="actions">
        <label class="btn">CSV取込<input type="file" accept=".csv,.xlsx,.xls" id="imp" hidden></label>
        <button class="btn" id="exp">CSV出力</button>
        <button class="btn btn-primary" id="add">＋ 品目を追加</button>
      </div>
    </div>
    <div class="card">
      <div class="toolbar"><input class="input" id="q" placeholder="品名で検索"></div>
      <div class="table-wrap" id="list"></div>
      <p class="small muted" style="margin:10px 0 0">表のセルを直接書き換えると、自動で保存されます。帳票の明細から「明細を品目マスタに登録」でまとめて追加することもできます。</p>
    </div>`;

  const $ = (sel) => view.querySelector(sel);
  const opt = (v, l, cur) => `<option value="${v}" ${Number(v) === Number(cur) ? 'selected' : ''}>${l}</option>`;

  function draw() {
    const list = products.filter((p) => !q || (p.name || '').toLowerCase().includes(q.toLowerCase()));
    if (!products.length) {
      $('#list').innerHTML = `<div class="empty"><div class="big">▦</div><p>品目が登録されていません。「＋ 品目を追加」または CSV 取込で登録してください。</p>
        <p><button class="btn btn-sm" id="tplCsv">取込用CSVのひな形をダウンロード</button></p></div>`;
      $('#tplCsv').onclick = () => U.download('品目取込ひな形.csv', U.toCSV([HEAD, ['Webサイト保守 月額', '月', 50000, '10%'], ['茶菓子', '箱', 1500, '8%']]), 'text/csv');
      return;
    }
    $('#list').innerHTML = `<table class="table items-master">
      <thead><tr><th>品名</th><th style="width:90px">単位</th><th style="width:140px" class="r">単価（税抜）</th><th style="width:140px">税率</th><th style="width:120px" class="r">税込</th><th style="width:44px"></th></tr></thead>
      <tbody>${list.map((p) => `<tr data-id="${p.id}">
        <td><input class="input" data-k="name" value="${U.esc(p.name)}" aria-label="品名"></td>
        <td><input class="input" data-k="unit" value="${U.esc(p.unit)}" aria-label="単位"></td>
        <td><input class="input" data-k="price" type="number" step="any" value="${U.esc(p.price)}" style="text-align:right" aria-label="単価"></td>
        <td><select class="input" data-k="taxRate" aria-label="税率">${opt(10, '10%', p.taxRate)}${opt(8, '8%（軽減）', p.taxRate)}${opt(0, '非課税', p.taxRate)}</select></td>
        <td class="r" data-incl>${U.yen(Math.floor(p.price * (1 + p.taxRate / 100)))}</td>
        <td><button class="icon-btn" data-del aria-label="削除">×</button></td></tr>`).join('')}</tbody></table>`;
  }

  const save = U.debounce(async (p) => { await DB.put('products', p); }, 400);
  $('#list').addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    const tr = e.target.closest('tr[data-id]');
    if (!k || !tr) return;
    const p = products.find((x) => x.id === tr.dataset.id);
    p[k] = k === 'price' || k === 'taxRate' ? Number(e.target.value) || 0 : e.target.value;
    tr.querySelector('[data-incl]').textContent = U.yen(Math.floor(p.price * (1 + p.taxRate / 100)));
    save(p);
  });
  $('#list').addEventListener('click', (e) => {
    if (!e.target.closest('[data-del]')) return;
    const p = products.find((x) => x.id === e.target.closest('tr').dataset.id);
    U.confirm('品目を削除', `「${p.name || '（名称未設定）'}」を削除します。作成済みの帳票には影響しません。`, async () => {
      await DB.remove('products', p.id);
      products = products.filter((x) => x.id !== p.id);
      draw();
    });
  });
  $('#q').oninput = U.debounce((e) => { q = e.target.value; draw(); });
  $('#add').onclick = async () => {
    const p = await DB.put('products', { name: '', unit: '式', price: 0, taxRate: 10 });
    products.unshift(p);
    q = ''; $('#q').value = '';
    draw();
    $(`tr[data-id="${p.id}"] [data-k=name]`).focus();
  };
  $('#exp').onclick = () => U.download(`品目マスタ_${U.ymd()}.csv`, U.toCSV([HEAD, ...products.map((p) => [p.name, p.unit, p.price, p.taxRate ? p.taxRate + '%' : '非課税'])]), 'text/csv');
  $('#imp').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const [header, ...rows] = await Analyze.readRows(file);
      const col = (re) => header.findIndex((h) => re.test(String(h)));
      const iName = col(/品名|品目|商品|名称/), iUnit = col(/単位/), iPrice = col(/単価|価格|金額/), iTax = col(/税率|税区分/);
      if (iName < 0) throw new Error('「品名」列が見つかりません');
      const known = new Map(products.map((p) => [p.name, p]));
      let added = 0, updated = 0;
      for (const r of rows) {
        const name = String(r[iName] ?? '').trim();
        if (!name) continue;
        const p = known.get(name) || { name };
        if (p.id) updated++; else added++;
        Object.assign(p, {
          unit: iUnit >= 0 ? String(r[iUnit] ?? '').trim() : p.unit || '式',
          price: iPrice >= 0 ? Analyze.toNumber(r[iPrice]) || 0 : p.price || 0,
          taxRate: iTax >= 0 ? rateOf(r[iTax]) : p.taxRate ?? 10,
        });
        known.set(name, await DB.put('products', p));
      }
      products = [...known.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
      U.toast(`${added}件を追加、${updated}件を更新しました`);
      draw();
    } catch (err) {
      U.toast('取り込めませんでした：' + err.message, 'err');
    }
  };
  draw();
};
