/* ダッシュボード：今日やること、売上・入金状況、最近の帳票 */
window.Pages = window.Pages || {};

Pages.dashboard = async (view) => {
  const s = await Settings.get();
  const [docs, customers] = await Promise.all([DB.all('documents'), DB.all('customers')]);
  const total = (d) => Docs.calc(d, s.rounding).total;
  const today = U.ymd();
  const month = today.slice(0, 7);

  // 「今日やること」：期限切れのフォロー、今日のアクション、入金遅れ、返事待ちの見積
  const todo = [];
  customers.filter((c) => !['受注', '失注'].includes(c.status) && c.nextActionDate && U.daysFromToday(c.nextActionDate) <= 0).forEach((c) => {
    const d = U.daysFromToday(c.nextActionDate);
    todo.push({ pri: d < 0 ? 0 : 1, tag: d < 0 ? `<span class="badge badge-red">${-d}日超過</span>` : '<span class="badge badge-amber">今日</span>',
      text: `${U.esc(c.company)}：${U.esc(c.nextAction || 'フォロー')}`, href: `#/customers/${c.id}` });
  });
  docs.filter(Docs.isOverdue).forEach((d) => todo.push({ pri: 0, tag: '<span class="badge badge-red">入金遅れ</span>',
    text: `${U.esc(d.toName)}（${U.esc(d.number)}・${U.yen(total(d))}）の入金を確認`, href: `#/documents/${d.id}` }));
  docs.filter((d) => d.type === 'quote' && d.status === '提出済' && U.daysFromToday(d.issueDate) <= -7).forEach((d) => todo.push({ pri: 2,
    tag: '<span class="badge badge-blue">見積フォロー</span>', text: `${U.esc(d.toName)}「${U.esc(d.subject || d.number)}」の検討状況を確認（提出から${-U.daysFromToday(d.issueDate)}日）`, href: `#/documents/${d.id}` }));
  todo.sort((a, b) => a.pri - b.pri);

  const invoices = docs.filter((d) => d.type === 'invoice' && d.status !== '下書き');
  const billed = invoices.filter((d) => (d.issueDate || '').startsWith(month)).reduce((a, d) => a + total(d), 0);
  const paid = invoices.filter((d) => d.status === '入金済' && (d.issueDate || '').startsWith(month)).reduce((a, d) => a + total(d), 0);
  const unpaid = invoices.filter((d) => d.status !== '入金済').reduce((a, d) => a + total(d), 0);
  const pipeline = customers.filter((c) => !['受注', '失注'].includes(c.status)).reduce((a, c) => a + (Number(c.expectedAmount) || 0), 0);
  const upcoming = customers.filter((c) => !['受注', '失注'].includes(c.status) && c.nextActionDate && U.daysFromToday(c.nextActionDate) > 0 && U.daysFromToday(c.nextActionDate) <= 7)
    .sort((a, b) => a.nextActionDate.localeCompare(b.nextActionDate));
  const recent = [...docs].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6);
  const fresh = !docs.length && !customers.length;

  const h = new Date().getHours();
  view.innerHTML = `
    <div class="page-head">
      <div><h1>${h < 11 ? 'おはようございます' : h < 18 ? 'お疲れさまです' : 'こんばんは'}${s.senderName ? '、' + U.esc(s.senderName) + 'さん' : ''}</h1>
        <p>${U.jpDate(today)}（${'日月火水木金土'[new Date().getDay()]}）</p></div>
      <div class="actions">
        <a class="btn" href="#/customers/new">＋ 顧客</a>
        <a class="btn" href="#/documents/new/quote">＋ 見積書</a>
        <a class="btn btn-primary" href="#/documents/new/invoice">＋ 請求書</a>
      </div>
    </div>

    ${fresh ? `
    <div class="card" style="margin-bottom:16px">
      <h2>はじめに（3ステップ）</h2>
      <ol style="margin:0; padding-left:20px; line-height:2">
        <li><a href="#/settings">設定</a>で会社名・インボイス登録番号・振込先・あなたの名前を登録</li>
        <li><a href="#/customers">顧客管理</a>で取引先を登録（ExcelのリストをCSVで一括取込もできます）</li>
        <li><a href="#/documents/new/quote">見積書</a>を作ってPDFで保存 → 受注したら「請求書に変換」</li>
      </ol>
      <div class="actions" style="margin-top:12px"><button class="btn" id="sample">まずはサンプルデータで試す</button></div>
    </div>` : ''}

    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat"><div class="label">今月の請求額</div><div class="value">${U.yen(billed)}</div><div class="sub">うち入金済 ${U.yen(paid)}</div></div>
      <div class="card stat"><div class="label">未入金の合計</div><div class="value">${U.yen(unpaid)}</div><div class="sub">送付済の請求書</div></div>
      <div class="card stat"><div class="label">商談中の見込金額</div><div class="value">${U.yen(pipeline)}</div><div class="sub">受注・失注を除く</div></div>
      <div class="card stat"><div class="label">今日やること</div><div class="value ${todo.length ? 'warn-text' : ''}">${todo.length}件</div><div class="sub">${todo.length ? '下の一覧を確認' : 'すべて対応済み'}</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h2>今日やること</h2>
        ${todo.length ? `<ul class="list-plain">${todo.map((t) => `<li><a href="${t.href}" style="color:inherit; text-decoration:none">${t.text}</a>${t.tag}</li>`).join('')}</ul>`
          : '<div class="empty" style="padding:20px"><div class="big">✓</div>期限が来ているタスクはありません</div>'}
      </div>
      <div class="card">
        <h2>今後7日間の予定</h2>
        ${upcoming.length ? `<ul class="list-plain">${upcoming.map((c) => `<li><a href="#/customers/${c.id}" style="color:inherit; text-decoration:none"><b>${U.esc(c.company)}</b>：${U.esc(c.nextAction || 'フォロー')}</a><span class="small muted nowrap">${U.esc(c.nextActionDate)}</span></li>`).join('')}</ul>`
          : '<p class="muted small">予定はありません。顧客ごとに「次回アクション」を設定すると、ここに表示されます。</p>'}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>最近の帳票</h2><a class="small" href="#/documents">すべて見る →</a></div>
      ${recent.length ? `<div class="table-wrap"><table class="table"><tbody>${recent.map((d) => `<tr class="clickable" onclick="location.hash='#/documents/${d.id}'">
        <td><span class="badge ${d.type === 'quote' ? '' : 'badge-blue'}">${Docs.TYPES[d.type].label}</span></td><td class="nowrap">${U.esc(d.number)}</td>
        <td>${U.esc(d.toName)}</td><td>${U.esc(d.subject)}</td><td class="r">${U.yen(total(d))}</td><td>${Docs.statusBadge(d)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted small">まだ帳票がありません。</p>'}
    </div>`;

  const btn = view.querySelector('#sample');
  if (btn) btn.onclick = async () => { await Sample.load(); Settings.invalidate(); U.toast('サンプルデータを読み込みました'); Pages.dashboard(view); };
};
