/* 顧客管理（簡易CRM）：一覧 / カンバン、詳細、活動履歴、CSV入出力 */
window.Pages = window.Pages || {};

window.Customers = (() => {
  const STATUSES = ['リード', '商談中', '見積提出', '受注', '失注'];
  const BADGE = { リード: '', 商談中: 'badge-blue', 見積提出: 'badge-amber', 受注: 'badge-green', 失注: 'badge-red' };
  const ACTIVITY_TYPES = ['電話', 'メール', '訪問', 'オンライン商談', 'その他'];
  // CSV 列名 ⇔ 項目。読み込み時は別名も受け付ける
  const COLUMNS = [
    ['company', '会社名', ['会社', '企業名', '顧客名', '取引先']],
    ['dept', '部署', ['部署名', '所属']],
    ['contactName', '担当者名', ['担当者', '氏名', '名前']],
    ['title', '役職', []],
    ['email', 'メール', ['メールアドレス', 'email', 'e-mail', 'mail']],
    ['phone', '電話番号', ['電話', 'tel', 'TEL']],
    ['address', '住所', ['所在地']],
    ['status', 'ステータス', ['状態']],
    ['expectedAmount', '見込金額', ['見込み金額', '金額']],
    ['nextActionDate', '次回アクション日', ['次回日', 'フォロー日']],
    ['nextAction', '次回アクション', ['次回内容']],
    ['source', '流入経路', ['獲得経路', 'きっかけ']],
    ['notes', 'メモ', ['備考']],
  ];

  const badge = (st) => `<span class="badge ${BADGE[st] || ''}">${U.esc(st)}</span>`;

  // 次回アクション日の表示：期限切れは赤、3日以内は黄
  function dueLabel(c) {
    if (!c.nextActionDate || c.status === '失注') return '<span class="muted">—</span>';
    const d = U.daysFromToday(c.nextActionDate);
    const txt = d < 0 ? `${-d}日超過` : d === 0 ? '今日' : d === 1 ? '明日' : `${d}日後`;
    const cls = d < 0 ? 'badge-red' : d <= 3 ? 'badge-amber' : '';
    return `<span class="nowrap">${U.esc(c.nextActionDate)}</span> <span class="badge ${cls}">${txt}</span>`;
  }

  const blank = () => ({ company: '', dept: '', contactName: '', title: '', email: '', phone: '', address: '', status: 'リード', expectedAmount: '', nextActionDate: '', nextAction: '', source: '', notes: '', activities: [] });

  function fromRows(rows) {
    const [header, ...body] = rows;
    const norm = (s) => String(s || '').trim().toLowerCase();
    const idx = {};
    COLUMNS.forEach(([key, label, alias]) => {
      const i = header.findIndex((h) => [label, ...alias].map(norm).includes(norm(h)));
      if (i >= 0) idx[key] = i;
    });
    if (idx.company === undefined) throw new Error('「会社名」列が見つかりません');
    return body
      .filter((r) => r.some((v) => String(v ?? '').trim()))
      .map((r) => {
        const c = blank();
        Object.entries(idx).forEach(([k, i]) => (c[k] = String(r[i] ?? '').trim()));
        if (!STATUSES.includes(c.status)) c.status = 'リード';
        c.expectedAmount = c.expectedAmount ? Number(String(c.expectedAmount).replace(/[^\d.-]/g, '')) || '' : '';
        return c;
      });
  }

  function toRows(list) {
    return [COLUMNS.map((c) => c[1]), ...list.map((c) => COLUMNS.map(([k]) => c[k] ?? ''))];
  }

  return { STATUSES, ACTIVITY_TYPES, COLUMNS, badge, dueLabel, blank, fromRows, toRows };
})();

/* ---------- 一覧 ---------- */
Pages.customers = async (view) => {
  let customers = await DB.all('customers');
  const state = { mode: sessionStorage.getItem('cust.mode') || 'list', q: '', status: '', due: '' };

  view.innerHTML = `
    <div class="page-head">
      <div><h1>顧客管理</h1><p>商談の進み具合と次回アクションを管理し、フォロー漏れを防ぎます。</p></div>
      <div class="actions">
        <label class="btn">CSV取込<input type="file" accept=".csv,.xlsx,.xls" id="imp" hidden></label>
        <button class="btn" id="exp">CSV出力</button>
        <a class="btn btn-primary" href="#/customers/new">＋ 顧客を追加</a>
      </div>
    </div>
    <div class="grid grid-4" style="margin-bottom:16px" id="stats"></div>
    <div class="card">
      <div class="toolbar">
        <div class="seg" id="mode"><button data-m="list">リスト</button><button data-m="board">ボード</button></div>
        <input class="input" id="q" placeholder="会社名・担当者・メモで検索">
        <select class="input" id="st"><option value="">すべてのステータス</option>${Customers.STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
        <select class="input" id="due"><option value="">次回アクション：すべて</option><option value="over">期限切れ</option><option value="week">7日以内</option><option value="none">未設定</option></select>
      </div>
      <div id="list"></div>
    </div>`;

  const $ = (sel) => view.querySelector(sel);

  function stats() {
    const active = customers.filter((c) => !['受注', '失注'].includes(c.status));
    const pipeline = active.reduce((a, c) => a + (Number(c.expectedAmount) || 0), 0);
    const overdue = active.filter((c) => c.nextActionDate && U.daysFromToday(c.nextActionDate) < 0).length;
    const won = customers.filter((c) => c.status === '受注').length;
    const closed = won + customers.filter((c) => c.status === '失注').length;
    $('#stats').innerHTML = `
      <div class="card stat"><div class="label">進行中の案件</div><div class="value">${active.length}件</div><div class="sub">全${customers.length}社</div></div>
      <div class="card stat"><div class="label">見込金額の合計</div><div class="value">${U.yen(pipeline)}</div><div class="sub">進行中の案件</div></div>
      <div class="card stat"><div class="label">フォロー期限切れ</div><div class="value ${overdue ? 'danger-text' : ''}">${overdue}件</div><div class="sub">すぐに連絡しましょう</div></div>
      <div class="card stat"><div class="label">受注率</div><div class="value">${closed ? Math.round((won / closed) * 100) : 0}%</div><div class="sub">受注${won} / 決着${closed}</div></div>`;
  }

  const filtered = () => customers.filter((c) => {
    const d = U.daysFromToday(c.nextActionDate);
    return (!state.q || [c.company, c.dept, c.contactName, c.notes, c.email].join(' ').toLowerCase().includes(state.q.toLowerCase())) &&
      (!state.status || c.status === state.status) &&
      (!state.due || (state.due === 'over' ? d !== null && d < 0 : state.due === 'week' ? d !== null && d >= 0 && d <= 7 : !c.nextActionDate));
  }).sort((a, b) => (a.nextActionDate || '9999').localeCompare(b.nextActionDate || '9999'));

  function draw() {
    view.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === state.mode));
    stats();
    if (!customers.length) {
      $('#list').innerHTML = `<div class="empty"><div class="big">◆</div><p>顧客が登録されていません。「＋ 顧客を追加」から登録するか、Excelの顧客リストをCSVで取り込めます。</p>
        <p><button class="btn btn-sm" id="tplCsv">取込用CSVのひな形をダウンロード</button></p></div>`;
      $('#tplCsv').onclick = () => U.download('顧客取込ひな形.csv', U.toCSV([Customers.COLUMNS.map((c) => c[1])]), 'text/csv');
      return;
    }
    const list = filtered();
    if (state.mode === 'board') return drawBoard(list);
    if (!list.length) { $('#list').innerHTML = '<div class="empty">条件に一致する顧客はいません。</div>'; return; }
    $('#list').innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>会社名</th><th>担当者</th><th>ステータス</th><th class="r">見込金額</th><th>次回アクション</th><th>内容</th></tr></thead>
      <tbody>${list.map((c) => `<tr class="clickable" data-id="${c.id}">
        <td><b>${U.esc(c.company)}</b>${c.dept ? `<div class="small muted">${U.esc(c.dept)}</div>` : ''}</td>
        <td>${U.esc(c.contactName)}${c.title ? `<div class="small muted">${U.esc(c.title)}</div>` : ''}</td>
        <td>${Customers.badge(c.status)}</td>
        <td class="r">${c.expectedAmount ? U.yen(c.expectedAmount) : ''}</td>
        <td>${Customers.dueLabel(c)}</td>
        <td>${U.esc(c.nextAction)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ボード表示：カードをドラッグしてステータスを変更
  function drawBoard(list) {
    $('#list').innerHTML = `<div class="kanban">${Customers.STATUSES.map((st) => {
      const items = list.filter((c) => c.status === st);
      const sum = items.reduce((a, c) => a + (Number(c.expectedAmount) || 0), 0);
      return `<div class="kcol" data-st="${st}"><h3><span>${st}（${items.length}）</span><span>${sum ? U.yen(sum) : ''}</span></h3>
        ${items.map((c) => `<div class="kcard" draggable="true" data-id="${c.id}">
          <div class="co">${U.esc(c.company)}</div>
          <div class="small">${U.esc(c.contactName)}</div>
          <div class="meta"><span>${c.expectedAmount ? U.yen(c.expectedAmount) : ''}</span><span>${c.nextActionDate ? Customers.dueLabel(c) : ''}</span></div>
        </div>`).join('')}</div>`;
    }).join('')}</div><p class="small muted" style="margin-top:8px">カードをドラッグすると、ステータスを変更できます。</p>`;

    view.querySelectorAll('.kcard').forEach((el) => {
      el.ondragstart = (e) => e.dataTransfer.setData('text/plain', el.dataset.id);
    });
    view.querySelectorAll('.kcol').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('drag-over'); };
      col.ondragleave = () => col.classList.remove('drag-over');
      col.ondrop = async (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const c = customers.find((x) => x.id === e.dataTransfer.getData('text/plain'));
        if (!c || c.status === col.dataset.st) return;
        const from = c.status;
        c.status = col.dataset.st;
        c.activities = [...(c.activities || []), { id: DB.uid(), date: U.ymd(), type: 'その他', memo: `ステータス変更：${from} → ${c.status}` }];
        await DB.put('customers', c);
        U.toast(`${c.company} を「${c.status}」に変更しました`);
        draw();
      };
    });
  }

  $('#mode').onclick = (e) => { const m = e.target.dataset.m; if (!m) return; state.mode = m; sessionStorage.setItem('cust.mode', m); draw(); };
  $('#q').oninput = U.debounce((e) => { state.q = e.target.value; draw(); });
  $('#st').onchange = (e) => { state.status = e.target.value; draw(); };
  $('#due').onchange = (e) => { state.due = e.target.value; draw(); };
  $('#list').onclick = (e) => {
    const el = e.target.closest('[data-id]');
    if (el) location.hash = `#/customers/${el.dataset.id}`;
  };
  $('#exp').onclick = () => U.download(`顧客一覧_${U.ymd()}.csv`, U.toCSV(Customers.toRows(filtered())), 'text/csv');
  $('#imp').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = await Analyze.readRows(file);
      const list = Customers.fromRows(rows);
      const known = new Set(customers.map((c) => c.company));
      const dup = list.filter((c) => known.has(c.company)).length;
      U.modal({
        title: '顧客を取り込む',
        body: `<p>${list.length}件の顧客が見つかりました。${dup ? `<br><span class="warn-text">うち${dup}件は同じ会社名がすでに登録されています（重複して追加されます）。</span>` : ''}</p>
          <div class="table-wrap" style="margin-top:12px; max-height:240px"><table class="table"><thead><tr><th>会社名</th><th>担当者</th><th>ステータス</th></tr></thead>
          <tbody>${list.slice(0, 8).map((c) => `<tr><td>${U.esc(c.company)}</td><td>${U.esc(c.contactName)}</td><td>${U.esc(c.status)}</td></tr>`).join('')}</tbody></table></div>
          ${list.length > 8 ? `<p class="small muted" style="margin-top:6px">ほか${list.length - 8}件</p>` : ''}`,
        okText: `${list.length}件を取り込む`,
        onOk: async () => {
          for (const c of list) await DB.put('customers', c);
          customers = await DB.all('customers');
          U.toast(`${list.length}件を取り込みました`);
          draw();
        },
      });
    } catch (err) {
      U.toast('取り込めませんでした：' + err.message, 'err');
    }
  };
  draw();
};

/* ---------- 詳細・編集 ---------- */
Pages.customerDetail = async (view, { id }) => {
  const isNew = id === 'new';
  const c = isNew ? Customers.blank() : await DB.get('customers', id);
  if (!c) { view.innerHTML = '<div class="card empty">顧客が見つかりません。<a href="#/customers">一覧へ戻る</a></div>'; return; }
  c.activities = c.activities || [];
  const s = await Settings.get();
  const docs = isNew ? [] : (await DB.all('documents')).filter((d) => d.customerId === c.id).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));

  const f = (name, label, opts = {}) => `<label class="field ${opts.span ? 'span-2' : ''}"><span>${label}</span>${
    opts.textarea ? `<textarea name="${name}" rows="4">${U.esc(c[name])}</textarea>`
      : `<input name="${name}" type="${opts.type || 'text'}" value="${U.esc(c[name])}" placeholder="${U.esc(opts.ph || '')}">`}</label>`;

  view.innerHTML = `
    <div class="page-head">
      <div><p class="small"><a href="#/customers">← 顧客管理</a></p><h1>${isNew ? '顧客を追加' : U.esc(c.company)}</h1>
        ${isNew ? '' : `<p>${Customers.badge(c.status)} ${c.contactName ? U.esc(c.contactName) + ' 様' : ''}</p>`}</div>
      <div class="actions">
        ${isNew ? '' : `<button class="btn" id="mail">✉ メールを作成</button><button class="btn" id="quote">見積書を作成</button><button class="btn btn-ghost danger-text" id="del">削除</button>`}
        <button class="btn btn-primary" id="save">保存</button>
      </div>
    </div>
    <div class="grid" style="grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items:start" id="cols">
      <div>
        <div class="card" id="f">
          <h2>基本情報</h2>
          <div class="form-grid">
            ${f('company', '会社名', { ph: '株式会社〇〇' })}
            <label class="field"><span>ステータス</span><select name="status">${Customers.STATUSES.map((x) => `<option ${x === c.status ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            ${f('dept', '部署')}
            ${f('title', '役職')}
            ${f('contactName', '担当者名', { ph: '佐藤 花子' })}
            ${f('expectedAmount', '見込金額（円）', { type: 'number' })}
            ${f('email', 'メール', { type: 'email' })}
            ${f('phone', '電話番号', { type: 'tel' })}
            ${f('address', '住所', { span: true })}
            ${f('source', '流入経路', { ph: '紹介 / 展示会 / Web問合せ など' })}
          </div>
        </div>
        <div class="card" id="f2">
          <h2>次回アクション</h2>
          <div class="form-grid">
            ${f('nextActionDate', '予定日', { type: 'date' })}
            ${f('nextAction', '内容', { ph: '例：見積のご感想を電話で確認' })}
            ${f('notes', 'メモ', { textarea: true, span: true })}
          </div>
        </div>
      </div>
      <div>
        ${isNew ? '<div class="card"><p class="muted small">保存すると、活動履歴の記録や見積書の作成ができるようになります。</p></div>' : `
        <div class="card">
          <div class="card-head"><h2>活動履歴</h2><button class="btn btn-sm btn-primary" id="addAct">＋ 記録する</button></div>
          ${c.activities.length ? `<ul class="timeline">${[...c.activities].sort((a, b) => b.date.localeCompare(a.date)).map((a) => `
            <li><div class="when">${U.esc(a.date)}・${U.esc(a.type)} <button class="icon-btn" style="width:22px;height:22px;font-size:13px" data-delact="${a.id}" aria-label="削除">×</button></div><div class="what">${U.esc(a.memo)}</div></li>`).join('')}</ul>`
            : '<p class="muted small">電話・訪問・メールなどのやり取りを記録しておくと、担当交代や振り返りのときに役立ちます。</p>'}
        </div>
        <div class="card">
          <h2>関連する帳票</h2>
          ${docs.length ? `<ul class="list-plain">${docs.map((d) => `<li><a href="#/documents/${d.id}">${Docs.TYPES[d.type].label} ${U.esc(d.number)}</a>
            <span class="small">${U.yen(Docs.calc(d, s.rounding).total)} ${Docs.statusBadge(d)}</span></li>`).join('')}</ul>` : '<p class="muted small">まだありません。</p>'}
        </div>`}
      </div>
    </div>`;

  const $ = (sel) => view.querySelector(sel);
  if (window.innerWidth < 900) $('#cols').style.gridTemplateColumns = '1fr';

  async function save({ silent } = {}) {
    Object.assign(c, U.formData($('#f')), U.formData($('#f2')));
    if (!c.company) { U.toast('会社名を入力してください', 'err'); $('[name=company]').focus(); return false; }
    await DB.put('customers', c);
    if (!silent) U.toast('保存しました');
    if (isNew) location.replace(`#/customers/${c.id}`);
    return true;
  }
  $('#save').onclick = () => save();
  if (isNew) return;

  $('#del').onclick = () => U.confirm('顧客を削除', `「${c.company}」を削除します。関連する帳票は残ります。`, async () => {
    await DB.remove('customers', c.id); U.toast('削除しました'); location.hash = '#/customers';
  });
  $('#quote').onclick = async () => { if (await save({ silent: true })) { sessionStorage.setItem('docs.prefillCustomer', c.id); location.hash = '#/documents/new/quote'; } };
  $('#mail').onclick = async () => { if (await save({ silent: true })) { sessionStorage.setItem('tpl.customer', c.id); location.hash = '#/templates'; } };

  view.querySelectorAll('[data-delact]').forEach((b) => (b.onclick = async () => {
    c.activities = c.activities.filter((a) => a.id !== b.dataset.delact);
    await DB.put('customers', c);
    Pages.customerDetail(view, { id });
  }));

  $('#addAct').onclick = () => U.modal({
    title: '活動を記録',
    body: `<div class="form-grid" id="af">
      <label class="field"><span>日付</span><input type="date" name="date" value="${U.ymd()}"></label>
      <label class="field"><span>種別</span><select name="type">${Customers.ACTIVITY_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
      <label class="field span-2"><span>内容</span><textarea name="memo" rows="4" placeholder="例：見積内容をご説明。来週中に社内稟議にかけるとのこと。"></textarea></label>
      <label class="field"><span>次回アクション日（任意）</span><input type="date" name="nextActionDate" value="${U.esc(c.nextActionDate)}"></label>
      <label class="field"><span>次回アクション内容（任意）</span><input name="nextAction" value="${U.esc(c.nextAction)}"></label>
    </div>`,
    okText: '記録する',
    onOk: async (m) => {
      const a = U.formData(m.querySelector('#af'));
      if (!a.memo) { U.toast('内容を入力してください', 'err'); return false; }
      Object.assign(c, U.formData($('#f')), U.formData($('#f2')));
      c.activities.push({ id: DB.uid(), date: a.date, type: a.type, memo: a.memo });
      c.nextActionDate = a.nextActionDate;
      c.nextAction = a.nextAction;
      await DB.put('customers', c);
      U.toast('記録しました');
      Pages.customerDetail(view, { id });
    },
  });
};
