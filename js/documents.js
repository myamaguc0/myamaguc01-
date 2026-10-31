/* 見積書・請求書：一覧、編集（リアルタイムプレビュー）、税計算、PDF出力 */
window.Pages = window.Pages || {};

window.Docs = (() => {
  const TYPES = {
    quote: { label: '見積書', title: '御見積書', totalLabel: '御見積金額', lead: '下記の通りお見積り申し上げます。', statuses: ['下書き', '提出済', '受注', '失注'] },
    invoice: { label: '請求書', title: '請求書', totalLabel: 'ご請求金額', lead: '下記の通りご請求申し上げます。', statuses: ['下書き', '送付済', '入金済'] },
  };
  const RATES = [10, 8, 0];
  const STATUS_BADGE = { 下書き: '', 提出済: 'badge-blue', 送付済: 'badge-blue', 受注: 'badge-green', 入金済: 'badge-green', 失注: 'badge-red' };

  const roundFn = (mode) => ({ floor: Math.floor, ceil: Math.ceil, round: Math.round }[mode] || Math.floor);

  // 適格請求書の要件どおり、税率ごとに対価を合計してから1回だけ端数処理する
  function calc(doc, rounding = 'floor') {
    const r = roundFn(rounding);
    const byRate = {};
    RATES.forEach((rate) => (byRate[rate] = { base: 0, tax: 0 }));
    const lines = (doc.items || []).map((it) => {
      const amount = Math.round((Number(it.qty) || 0) * (Number(it.price) || 0));
      const rate = RATES.includes(Number(it.taxRate)) ? Number(it.taxRate) : 10;
      if (it.name || amount) byRate[rate].base += amount;
      return { ...it, amount, taxRate: rate };
    });
    let subtotal = 0, tax = 0;
    RATES.forEach((rate) => {
      byRate[rate].tax = rate ? r((byRate[rate].base * rate) / 100) : 0;
      subtotal += byRate[rate].base;
      tax += byRate[rate].tax;
    });
    return { lines, byRate, subtotal, tax, total: subtotal + tax };
  }

  async function nextNumber(type, issueDate) {
    const s = await Settings.get();
    const prefix = (type === 'quote' ? s.quotePrefix : s.invoicePrefix) || (type === 'quote' ? 'Q' : 'INV');
    const ym = (issueDate || U.ymd()).slice(0, 7).replace('-', '');
    const head = `${prefix}-${ym}-`;
    const docs = await DB.all('documents');
    const max = docs
      .filter((d) => d.type === type && (d.number || '').startsWith(head))
      .reduce((m, d) => Math.max(m, parseInt(d.number.slice(head.length), 10) || 0), 0);
    return head + String(max + 1).padStart(3, '0');
  }

  async function blank(type) {
    const s = await Settings.get();
    const issueDate = U.ymd();
    return {
      type,
      number: await nextNumber(type, issueDate),
      status: '下書き',
      issueDate,
      dueDate: type === 'quote' ? U.addDays(issueDate, Number(s.quoteValidDays) || 30) : U.endOfNextMonth(issueDate),
      customerId: '',
      toName: '',
      honorific: '御中',
      toAttention: '',
      toAddress: '',
      subject: '',
      deliveryDate: '',
      paymentTerms: type === 'quote' ? '月末締め翌月末払い' : '',
      items: [{ name: '', qty: 1, unit: '式', price: 0, taxRate: 10 }],
      notes: type === 'quote' ? s.quoteNotes : s.invoiceNotes,
    };
  }

  const isOverdue = (d) => d.type === 'invoice' && d.status !== '入金済' && d.dueDate && U.daysFromToday(d.dueDate) < 0;

  function statusBadge(d) {
    if (isOverdue(d)) return `<span class="badge badge-red">期限超過</span>`;
    return `<span class="badge ${STATUS_BADGE[d.status] || ''}">${U.esc(d.status)}</span>`;
  }

  // A4 帳票の HTML。画面プレビューと印刷で共通
  function paperHTML(doc, s) {
    const T = TYPES[doc.type];
    const c = calc(doc, s.rounding);
    const hasReduced = c.lines.some((l) => l.taxRate === 8 && (l.name || l.amount));
    const rows = c.lines.filter((l) => l.name || l.amount);
    const pad = Math.max(0, 10 - rows.length);
    const rateLabel = (r) => (r === 10 ? '10%対象' : r === 8 ? '8%対象（軽減税率）' : '非課税・対象外');
    const usedRates = RATES.filter((r) => c.byRate[r].base !== 0);
    const dateLabel = doc.type === 'quote' ? '有効期限' : 'お支払期限';

    return `
    <div class="paper">
      <h1>${T.title}</h1>
      <div class="p-top">
        <div class="p-to">
          <div class="name">${U.esc(doc.toName || '　')} ${U.esc(doc.toName ? doc.honorific : '')}</div>
          ${doc.toAttention ? `<div class="sub">${U.esc(doc.toAttention)}</div>` : ''}
          ${doc.toAddress ? `<div class="sub small">${U.esc(doc.toAddress)}</div>` : ''}
          <p class="p-lead">${T.lead}</p>
        </div>
        <div>
          <div class="p-meta">
            <table>
              <tr><td>No.</td><td>${U.esc(doc.number)}</td></tr>
              <tr><td>発行日</td><td>${U.jpDate(doc.issueDate)}</td></tr>
            </table>
          </div>
          <div class="p-from">
            ${s.sealImage ? `<img class="p-seal" src="${s.sealImage}" alt="">` : ''}
            <div class="co">${U.esc(s.companyName || '（設定で会社名を登録）')}</div>
            ${s.representative ? `<div>${U.esc(s.representative)}</div>` : ''}
            ${s.zip || s.address ? `<div>${s.zip ? '〒' + U.esc(s.zip) + ' ' : ''}${U.esc(s.address)}</div>` : ''}
            ${s.tel ? `<div>TEL ${U.esc(s.tel)}</div>` : ''}
            ${s.email ? `<div>${U.esc(s.email)}</div>` : ''}
            ${s.regNumber ? `<div>登録番号 ${U.esc(s.regNumber)}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="p-total"><span class="t">${T.totalLabel}（税込）</span><span class="v">${U.yen(c.total)}</span></div>
      <table class="p-cond">
        ${doc.subject ? `<tr><td>件名</td><td>${U.esc(doc.subject)}</td></tr>` : ''}
        ${doc.dueDate ? `<tr><td>${dateLabel}</td><td>${U.jpDate(doc.dueDate)}</td></tr>` : ''}
        ${doc.deliveryDate ? `<tr><td>${doc.type === 'quote' ? '納期' : '納品日'}</td><td>${U.esc(doc.deliveryDate)}</td></tr>` : ''}
        ${doc.paymentTerms ? `<tr><td>お支払条件</td><td>${U.esc(doc.paymentTerms)}</td></tr>` : ''}
      </table>

      <table class="p-items">
        <thead><tr><th style="width:50%">品目・内容</th><th style="width:9%">数量</th><th style="width:8%">単位</th><th style="width:15%">単価</th><th style="width:18%">金額</th></tr></thead>
        <tbody>
          ${rows.map((l) => `<tr>
            <td>${U.esc(l.name)}${l.taxRate === 8 ? ' ※' : l.taxRate === 0 ? ' （非課税）' : ''}</td>
            <td class="r">${U.num(l.qty)}</td><td class="c">${U.esc(l.unit)}</td>
            <td class="r">${U.num(l.price)}</td><td class="r">${U.num(l.amount)}</td></tr>`).join('')}
          ${'<tr><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(pad)}
        </tbody>
      </table>

      <div class="p-sum">
        <table>
          <tr><th>税率区分</th><th>対象金額（税抜）</th><th>消費税</th></tr>
          ${(usedRates.length ? usedRates : [10]).map((r) => `<tr><td>${rateLabel(r)}</td><td class="r">${U.yen(c.byRate[r].base)}</td><td class="r">${r ? U.yen(c.byRate[r].tax) : '—'}</td></tr>`).join('')}
        </table>
        <table>
          <tr><th>小計</th><td class="r">${U.yen(c.subtotal)}</td></tr>
          <tr><th>消費税</th><td class="r">${U.yen(c.tax)}</td></tr>
          <tr class="grand"><th>合計</th><td class="r">${U.yen(c.total)}</td></tr>
        </table>
      </div>
      ${hasReduced ? '<div class="p-foot">※印は軽減税率（8%）対象品目です。</div>' : ''}

      ${doc.type === 'invoice' && s.bankInfo ? `<div class="p-bank"><b>お振込先</b><br>${U.esc(s.bankInfo).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="p-note"><div class="p-note-h">備考</div>${U.esc(doc.notes)}</div>
    </div>`;
  }

  // ブラウザの印刷機能で「PDFに保存」する。ファイル名はページタイトルから付く
  async function print(docs) {
    const s = await Settings.get();
    const root = document.createElement('div');
    root.className = 'print-root';
    root.innerHTML = docs.map((d) => paperHTML(d, s)).join('');
    document.body.appendChild(root);
    const prevTitle = document.title;
    const d0 = docs[0];
    document.title = docs.length === 1 ? `${TYPES[d0.type].label}_${d0.number}_${d0.toName || ''}`.replace(/[\\/:*?"<>|\s]+/g, '_') : `帳票_${U.ymd()}`;
    const done = () => { root.remove(); document.title = prevTitle; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  }

  async function toInvoice(quote) {
    const inv = await blank('invoice');
    Object.assign(inv, {
      customerId: quote.customerId, toName: quote.toName, honorific: quote.honorific, toAttention: quote.toAttention,
      toAddress: quote.toAddress, subject: quote.subject, items: JSON.parse(JSON.stringify(quote.items)),
      sourceQuoteId: quote.id,
    });
    return DB.put('documents', inv);
  }

  async function duplicate(doc) {
    const copy = JSON.parse(JSON.stringify(doc));
    delete copy.id; delete copy.createdAt; delete copy.sourceQuoteId;
    copy.issueDate = U.ymd();
    copy.number = await nextNumber(copy.type, copy.issueDate);
    copy.status = '下書き';
    const s = await Settings.get();
    copy.dueDate = copy.type === 'quote' ? U.addDays(copy.issueDate, Number(s.quoteValidDays) || 30) : U.endOfNextMonth(copy.issueDate);
    return DB.put('documents', copy);
  }

  return { TYPES, RATES, calc, blank, nextNumber, paperHTML, print, toInvoice, duplicate, isOverdue, statusBadge };
})();

/* ---------- 一覧 ---------- */
Pages.documents = async (view) => {
  const s = await Settings.get();
  const docs = (await DB.all('documents')).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.number || '').localeCompare(a.number || ''));
  const state = { type: sessionStorage.getItem('docs.type') || 'all', q: '', status: '' };

  const month = U.ymd().slice(0, 7);
  const invoices = docs.filter((d) => d.type === 'invoice');
  const billedThisMonth = invoices.filter((d) => (d.issueDate || '').startsWith(month)).reduce((a, d) => a + Docs.calc(d, s.rounding).total, 0);
  const unpaid = invoices.filter((d) => d.status !== '入金済' && d.status !== '下書き');
  const unpaidSum = unpaid.reduce((a, d) => a + Docs.calc(d, s.rounding).total, 0);
  const overdue = unpaid.filter(Docs.isOverdue);
  const openQuotes = docs.filter((d) => d.type === 'quote' && d.status === '提出済');

  view.innerHTML = `
    <div class="page-head">
      <div><h1>見積書・請求書</h1><p>インボイス制度（適格請求書）に対応した帳票を作成し、PDFで保存できます。</p></div>
      <div class="actions">
        <a class="btn" href="#/documents/new/quote">＋ 見積書を作成</a>
        <a class="btn btn-primary" href="#/documents/new/invoice">＋ 請求書を作成</a>
      </div>
    </div>
    ${!s.companyName ? `<div class="hint" style="margin-bottom:16px">まずは <a href="#/settings">設定</a> で会社名・登録番号・振込先を登録してください。帳票に自動で印字されます。</div>` : ''}
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat"><div class="label">今月の請求額</div><div class="value">${U.yen(billedThisMonth)}</div><div class="sub">${month.replace('-', '年')}月発行分（税込）</div></div>
      <div class="card stat"><div class="label">未入金</div><div class="value">${U.yen(unpaidSum)}</div><div class="sub">${unpaid.length}件</div></div>
      <div class="card stat"><div class="label">支払期限超過</div><div class="value ${overdue.length ? 'danger-text' : ''}">${overdue.length}件</div><div class="sub">${U.yen(overdue.reduce((a, d) => a + Docs.calc(d, s.rounding).total, 0))}</div></div>
      <div class="card stat"><div class="label">回答待ちの見積</div><div class="value">${openQuotes.length}件</div><div class="sub">${U.yen(openQuotes.reduce((a, d) => a + Docs.calc(d, s.rounding).total, 0))}</div></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="seg" id="seg">
          <button data-t="all">すべて</button><button data-t="quote">見積書</button><button data-t="invoice">請求書</button>
        </div>
        <input class="input" id="q" placeholder="宛先・件名・番号で検索">
        <select class="input" id="st"><option value="">すべてのステータス</option>${[...new Set([...Docs.TYPES.quote.statuses, ...Docs.TYPES.invoice.statuses])].map((x) => `<option>${x}</option>`).join('')}<option value="__overdue">期限超過</option></select>
        <button class="btn" id="csv">CSV出力</button>
      </div>
      <div class="table-wrap" id="list"></div>
    </div>`;

  const $ = (sel) => view.querySelector(sel);
  const filtered = () => docs.filter((d) =>
    (state.type === 'all' || d.type === state.type) &&
    (!state.status || (state.status === '__overdue' ? Docs.isOverdue(d) : d.status === state.status)) &&
    (!state.q || [d.toName, d.subject, d.number].join(' ').toLowerCase().includes(state.q.toLowerCase())));

  function draw() {
    view.querySelectorAll('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.t === state.type));
    const list = filtered();
    if (!docs.length) {
      $('#list').innerHTML = `<div class="empty"><div class="big">¥</div><p>まだ帳票がありません。右上のボタンから作成するか、<a href="#/settings">設定</a>でサンプルデータを読み込んでください。</p></div>`;
      return;
    }
    if (!list.length) { $('#list').innerHTML = '<div class="empty">条件に一致する帳票はありません。</div>'; return; }
    $('#list').innerHTML = `
      <table class="table">
        <thead><tr><th>種別</th><th>番号</th><th>発行日</th><th>宛先</th><th>件名</th><th class="r">金額（税込）</th><th>期限</th><th>状態</th><th></th></tr></thead>
        <tbody>${list.map((d) => `
          <tr class="clickable" data-id="${d.id}">
            <td><span class="badge ${d.type === 'quote' ? '' : 'badge-blue'}">${Docs.TYPES[d.type].label}</span></td>
            <td class="nowrap">${U.esc(d.number)}</td>
            <td class="nowrap">${U.esc(d.issueDate)}</td>
            <td>${U.esc(d.toName)}</td>
            <td>${U.esc(d.subject)}</td>
            <td class="r">${U.yen(Docs.calc(d, s.rounding).total)}</td>
            <td class="nowrap ${Docs.isOverdue(d) ? 'danger-text' : ''}">${U.esc(d.dueDate)}</td>
            <td>${Docs.statusBadge(d)}</td>
            <td class="nowrap"><button class="btn btn-sm" data-pdf="${d.id}">PDF</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  $('#seg').onclick = (e) => { const t = e.target.dataset.t; if (!t) return; state.type = t; sessionStorage.setItem('docs.type', t); draw(); };
  $('#q').oninput = U.debounce((e) => { state.q = e.target.value; draw(); });
  $('#st').onchange = (e) => { state.status = e.target.value; draw(); };
  $('#list').onclick = (e) => {
    const pdf = e.target.closest('[data-pdf]');
    if (pdf) { e.stopPropagation(); Docs.print([docs.find((d) => d.id === pdf.dataset.pdf)]); return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = `#/documents/${tr.dataset.id}`;
  };
  $('#csv').onclick = () => {
    const rows = [['種別', '番号', '発行日', '期限', '宛先', '件名', '税抜金額', '消費税', '税込金額', '状態']];
    filtered().forEach((d) => {
      const c = Docs.calc(d, s.rounding);
      rows.push([Docs.TYPES[d.type].label, d.number, d.issueDate, d.dueDate, d.toName, d.subject, c.subtotal, c.tax, c.total, Docs.isOverdue(d) ? '期限超過' : d.status]);
    });
    U.download(`帳票一覧_${U.ymd()}.csv`, U.toCSV(rows), 'text/csv');
  };
  draw();
};

/* ---------- 編集 ---------- */
Pages.documentEdit = async (view, { id, type }) => {
  const s = await Settings.get();
  let doc;
  if (id) {
    doc = await DB.get('documents', id);
    if (!doc) { view.innerHTML = '<div class="card empty">帳票が見つかりません。<a href="#/documents">一覧へ戻る</a></div>'; return; }
  } else {
    doc = await Docs.blank(type);
    const pre = sessionStorage.getItem('docs.prefillCustomer');
    if (pre) {
      sessionStorage.removeItem('docs.prefillCustomer');
      const cu = await DB.get('customers', pre);
      if (cu) Object.assign(doc, { customerId: cu.id, toName: cu.company, toAttention: cu.contactName ? `${cu.dept ? cu.dept + ' ' : ''}${cu.contactName} 様` : '', toAddress: cu.address || '' });
    }
  }
  const T = Docs.TYPES[doc.type];
  const customers = (await DB.all('customers')).sort((a, b) => (a.company || '').localeCompare(b.company || '', 'ja'));
  let dirty = !id;

  const opt = (v, label, cur) => `<option value="${U.esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${U.esc(label)}</option>`;

  view.innerHTML = `
    <div class="page-head">
      <div><p class="small"><a href="#/documents">← 見積書・請求書</a></p><h1>${T.label}${id ? 'の編集' : 'を作成'}</h1></div>
      <div class="actions">
        ${id && doc.type === 'quote' ? '<button class="btn" id="toInv">請求書に変換</button>' : ''}
        ${id ? '<button class="btn" id="dup">複製</button><button class="btn btn-ghost danger-text" id="del">削除</button>' : ''}
        <button class="btn" id="pdf">PDF出力</button>
        <button class="btn btn-primary" id="save">保存</button>
      </div>
    </div>
    <div class="doc-layout">
      <div>
        <div class="card" id="f">
          <h2>基本情報</h2>
          <div class="form-grid">
            <label class="field"><span>番号</span><input name="number" value="${U.esc(doc.number)}"></label>
            <label class="field"><span>ステータス</span><select name="status">${T.statuses.map((x) => opt(x, x, doc.status)).join('')}</select></label>
            <label class="field"><span>発行日</span><input name="issueDate" type="date" value="${U.esc(doc.issueDate)}"></label>
            <label class="field"><span>${doc.type === 'quote' ? '有効期限' : 'お支払期限'}</span><input name="dueDate" type="date" value="${U.esc(doc.dueDate)}"></label>
            <label class="field span-2"><span>件名</span><input name="subject" value="${U.esc(doc.subject)}" placeholder="例：Webサイト保守業務（2026年11月分）"></label>
            <label class="field"><span>${doc.type === 'quote' ? '納期' : '納品日'}</span><input name="deliveryDate" value="${U.esc(doc.deliveryDate)}" placeholder="${doc.type === 'quote' ? '例：ご発注後2週間' : '例：2026年11月30日'}"></label>
            <label class="field"><span>お支払条件</span><input name="paymentTerms" value="${U.esc(doc.paymentTerms)}" placeholder="例：月末締め翌月末払い"></label>
          </div>
        </div>
        <div class="card" id="f2">
          <div class="card-head"><h2>宛先</h2>
            <select class="input" id="cust" style="width:auto; max-width:100%">
              <option value="">顧客から選ぶ…</option>
              ${customers.map((c) => opt(c.id, c.company + (c.contactName ? `（${c.contactName}）` : ''), doc.customerId)).join('')}
            </select>
          </div>
          <div class="form-grid">
            <label class="field"><span>宛名（会社名・氏名）</span><input name="toName" value="${U.esc(doc.toName)}" placeholder="株式会社〇〇"></label>
            <label class="field"><span>敬称</span><select name="honorific">${['御中', '様', '殿', ''].map((x) => opt(x, x || '（なし）', doc.honorific)).join('')}</select></label>
            <label class="field"><span>部署・ご担当者</span><input name="toAttention" value="${U.esc(doc.toAttention)}" placeholder="営業部 佐藤 様"></label>
            <label class="field"><span>住所</span><input name="toAddress" value="${U.esc(doc.toAddress)}"></label>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>明細</h2><span class="small muted">金額は税抜で入力。値引きはマイナス単価で入力できます。</span></div>
          <table class="items">
            <thead><tr><th class="c-name">品目・内容</th><th class="c-qty">数量</th><th class="c-unit">単位</th><th class="c-price">単価</th><th class="c-tax">税率</th><th class="c-amt">金額</th><th class="c-del"></th></tr></thead>
            <tbody id="items"></tbody>
          </table>
          <div class="actions" style="margin-top:8px"><button class="btn btn-sm" id="addRow">＋ 行を追加</button></div>
          <div class="totals-mini" id="tot"></div>
        </div>
        <div class="card" id="f3">
          <label class="field"><span>備考</span><textarea name="notes" rows="4">${U.esc(doc.notes)}</textarea></label>
        </div>
      </div>
      <div class="preview-col">
        <div class="paper-wrap" id="pw"><div class="paper-scale" id="ps"></div></div>
        <p class="small muted" style="margin-top:8px">「PDF出力」を押し、印刷画面の送信先で「PDFに保存」を選んでください。用紙はA4、余白は「なし」または「デフォルト」がおすすめです。</p>
      </div>
    </div>`;

  const $ = (sel) => view.querySelector(sel);

  function drawItems() {
    $('#items').innerHTML = doc.items.map((it, i) => `
      <tr data-i="${i}">
        <td class="c-name"><input data-k="name" value="${U.esc(it.name)}" placeholder="品目・内容"></td>
        <td class="c-qty"><input data-k="qty" type="number" step="any" value="${U.esc(it.qty)}" aria-label="数量"></td>
        <td class="c-unit"><input data-k="unit" value="${U.esc(it.unit)}" aria-label="単位"></td>
        <td class="c-price"><input data-k="price" type="number" step="any" value="${U.esc(it.price)}" aria-label="単価"></td>
        <td class="c-tax"><select data-k="taxRate" aria-label="税率">${opt(10, '10%', it.taxRate)}${opt(8, '8%※', it.taxRate)}${opt(0, '非課税', it.taxRate)}</select></td>
        <td class="c-amt" data-amt>${U.num(Math.round((Number(it.qty) || 0) * (Number(it.price) || 0)))}</td>
        <td class="c-del"><button class="icon-btn" data-del title="行を削除" aria-label="行を削除">×</button></td>
      </tr>`).join('');
  }

  function collect() {
    Object.assign(doc, U.formData($('#f')), U.formData($('#f2')), U.formData($('#f3')));
  }

  function refresh() {
    collect();
    const c = Docs.calc(doc, s.rounding);
    view.querySelectorAll('#items tr').forEach((tr, i) => { tr.querySelector('[data-amt]').textContent = U.num(c.lines[i]?.amount); });
    $('#tot').innerHTML = `<span>小計 ${U.yen(c.subtotal)}</span><span>消費税 ${U.yen(c.tax)}</span><span>合計 <b>${U.yen(c.total)}</b></span>`;
    $('#ps').innerHTML = Docs.paperHTML(doc, s);
    fit();
  }

  // プレビューを枠の幅に合わせて縮小表示
  function fit() {
    const paper = $('#ps .paper');
    if (!paper) return;
    const w = $('#pw').clientWidth - 32;
    const scale = Math.min(1, w / paper.offsetWidth);
    $('#ps').style.transform = `scale(${scale})`;
    $('#ps').style.height = paper.offsetHeight * scale + 'px';
  }
  const ro = new ResizeObserver(fit);
  ro.observe($('#pw'));

  const markDirty = () => { dirty = true; };
  view.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (k) {
      const i = Number(e.target.closest('tr').dataset.i);
      doc.items[i][k] = e.target.type === 'number' || k === 'taxRate' ? Number(e.target.value) : e.target.value;
    }
    markDirty();
    refresh();
  });

  $('#items').onclick = (e) => {
    if (!e.target.closest('[data-del]')) return;
    doc.items.splice(Number(e.target.closest('tr').dataset.i), 1);
    if (!doc.items.length) doc.items.push({ name: '', qty: 1, unit: '式', price: 0, taxRate: 10 });
    drawItems(); markDirty(); refresh();
  };
  $('#addRow').onclick = () => {
    doc.items.push({ name: '', qty: 1, unit: '個', price: 0, taxRate: 10 });
    drawItems(); refresh();
    view.querySelector(`#items tr:last-child input`).focus();
  };
  $('#cust').onchange = (e) => {
    const cu = customers.find((c) => c.id === e.target.value);
    if (!cu) return;
    doc.customerId = cu.id;
    const set = (n, v) => { $(`[name=${n}]`).value = v; };
    set('toName', cu.company || '');
    set('toAttention', cu.contactName ? `${cu.dept ? cu.dept + ' ' : ''}${cu.contactName} 様` : '');
    set('toAddress', cu.address || '');
    set('honorific', '御中');
    markDirty(); refresh();
  };

  async function save({ silent } = {}) {
    collect();
    if (!doc.toName) { U.toast('宛名を入力してください', 'err'); $('[name=toName]').focus(); return false; }
    doc.items = doc.items.filter((it, i) => it.name || Number(it.price) || i === 0);
    // 宛名を手で変えた場合は顧客との紐づけを外す
    const cu = customers.find((c) => c.id === doc.customerId);
    if (cu && cu.company !== doc.toName) doc.customerId = '';
    await DB.put('documents', doc);
    dirty = false;
    if (!silent) U.toast(`${T.label}を保存しました`);
    if (!id) location.replace(`#/documents/${doc.id}`);
    return true;
  }

  $('#save').onclick = () => save();
  $('#pdf').onclick = async () => { if (await save({ silent: true })) Docs.print([doc]); };
  if (id) {
    $('#dup').onclick = async () => { await save({ silent: true }); const c = await Docs.duplicate(doc); U.toast('複製しました'); location.hash = `#/documents/${c.id}`; };
    $('#del').onclick = () => U.confirm(`${T.label}を削除`, `「${doc.number}」を削除します。元に戻せません。`, async () => {
      await DB.remove('documents', doc.id); dirty = false; U.toast('削除しました'); location.hash = '#/documents';
    });
    if ($('#toInv')) $('#toInv').onclick = async () => {
      await save({ silent: true });
      const inv = await Docs.toInvoice(doc);
      if (doc.status !== '受注') { doc.status = '受注'; await DB.put('documents', doc); }
      U.toast('請求書を作成しました（見積書は「受注」に更新）');
      location.hash = `#/documents/${inv.id}`;
    };
  }

  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);

  drawItems();
  refresh();
  dirty = !id;

  return () => { ro.disconnect(); window.removeEventListener('beforeunload', beforeUnload); };
};
