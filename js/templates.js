/* メールテンプレート：顧客情報の差し込み、コピー、メールソフト起動 */
window.Pages = window.Pages || {};

window.Templates = (() => {
  // 顧客・自社情報から自動で埋まる差し込み項目
  const AUTO = {
    会社名: (c) => c?.company,
    部署: (c) => c?.dept,
    担当者名: (c) => c?.contactName,
    役職: (c) => c?.title,
    次回アクション日: (c) => (c?.nextActionDate ? U.jpDate(c.nextActionDate) : ''),
    見込金額: (c) => (c?.expectedAmount ? U.yen(c.expectedAmount) : ''),
    自社名: (c, s) => s.companyName,
    自分の名前: (c, s) => s.senderName,
    自社電話番号: (c, s) => s.tel,
    自社メール: (c, s) => s.email,
    今日: () => U.jpDate(U.ymd()),
  };

  const SIGNATURE = '\n\n――――――――――――――――\n{{自社名}}\n{{自分の名前}}\nTEL：{{自社電話番号}}\nMail：{{自社メール}}\n――――――――――――――――';

  const SEEDS = [
    { name: '初回面談のお礼', subject: '【御礼】本日のお打ち合わせについて（{{自社名}}）',
      body: '{{会社名}}\n{{部署}} {{担当者名}} 様\n\nお世話になっております。{{自社名}}の{{自分の名前}}です。\n\n本日はご多忙のところ、お打ち合わせのお時間をいただき誠にありがとうございました。\n{{話した内容}}について詳しくお伺いでき、大変参考になりました。\n\nいただいたご要望をもとに、{{次回の提案日}}までにご提案資料をお送りいたします。\nご不明な点がございましたら、お気軽にお申し付けください。\n\n引き続き、どうぞよろしくお願いいたします。' + SIGNATURE },
    { name: '見積書の送付', subject: '【お見積書送付】{{件名}}（{{自社名}}）',
      body: '{{会社名}}\n{{部署}} {{担当者名}} 様\n\nお世話になっております。{{自社名}}の{{自分の名前}}です。\n\n先日ご相談いただきました「{{件名}}」につきまして、お見積書を添付にてお送りいたします。\n\n・お見積金額：{{見積金額}}（税込）\n・有効期限：{{有効期限}}\n\nご検討のほど、よろしくお願いいたします。\n内容についてご不明な点がございましたら、お気軽にお問い合わせください。' + SIGNATURE },
    { name: '請求書の送付', subject: '【請求書送付】{{請求月}}分のご請求について（{{自社名}}）',
      body: '{{会社名}}\n{{部署}} {{担当者名}} 様\n\nいつもお世話になっております。{{自社名}}の{{自分の名前}}です。\n\n{{請求月}}分の請求書を添付にてお送りいたします。\nお手数ですが、{{お支払期限}}までにお振込みくださいますようお願い申し上げます。\n\n今後とも変わらぬお引き立てのほど、よろしくお願いいたします。' + SIGNATURE },
    { name: '検討状況のフォロー', subject: '先日のご提案について（{{自社名}}）',
      body: '{{会社名}}\n{{部署}} {{担当者名}} 様\n\nお世話になっております。{{自社名}}の{{自分の名前}}です。\n\n先日お送りしましたご提案について、その後のご検討状況はいかがでしょうか。\nご不明な点や、追加でお知りになりたい情報がございましたら、お気軽にお申し付けください。\n\nもしよろしければ、15分ほどオンラインで補足のご説明をさせていただくことも可能です。\nご都合のよい日時を2〜3候補いただけますと幸いです。\n\nお忙しいところ恐縮ですが、どうぞよろしくお願いいたします。' + SIGNATURE },
    { name: 'ご入金のお礼', subject: 'ご入金確認のご連絡（{{自社名}}）',
      body: '{{会社名}}\n{{部署}} {{担当者名}} 様\n\nお世話になっております。{{自社名}}の{{自分の名前}}です。\n\n{{入金日}}に、{{入金額}}のご入金を確認いたしました。\nお忙しい中、迅速にご対応いただき誠にありがとうございます。\n\n今後ともよろしくお願い申し上げます。' + SIGNATURE },
    { name: '日程調整', subject: 'お打ち合わせ日程のご相談（{{自社名}}）',
      body: '{{会社名}}\n{{部署}} {{担当者名}} 様\n\nお世話になっております。{{自社名}}の{{自分の名前}}です。\n\n{{目的}}のため、お打ち合わせのお時間を頂戴できればと存じます。\n下記の日程でご都合のよい日時はございますでしょうか。\n\n・{{候補日1}}\n・{{候補日2}}\n・{{候補日3}}\n\n所要時間は30分程度を想定しております。\n上記以外でも調整いたしますので、お気軽にお申し付けください。' + SIGNATURE },
  ];

  async function seed() {
    if (await DB.get('settings', 'seeded')) return;
    for (const t of SEEDS) await DB.put('templates', { ...t });
    await DB.put('settings', { id: 'seeded', value: true });
  }

  const vars = (text) => [...new Set([...String(text).matchAll(/\{\{([^{}]+?)\}\}/g)].map((m) => m[1].trim()))];

  // 差し込み。空の項目は {{名前}} のまま残して、プレビューで目立たせる
  function fill(text, customer, settings, manual = {}) {
    return String(text).replace(/\{\{([^{}]+?)\}\}/g, (all, k) => {
      k = k.trim();
      const v = manual[k] || (AUTO[k] ? AUTO[k](customer, settings) : '');
      return v ? v : all;
    });
  }

  return { AUTO, seed, vars, fill };
})();

Pages.templates = async (view) => {
  const s = await Settings.get();
  let list = (await DB.all('templates')).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const customers = (await DB.all('customers')).sort((a, b) => (a.company || '').localeCompare(b.company || '', 'ja'));
  let cur = list[0] || null;
  let customer = customers.find((c) => c.id === sessionStorage.getItem('tpl.customer')) || null;
  sessionStorage.removeItem('tpl.customer');
  const manual = {};

  view.innerHTML = `
    <div class="page-head">
      <div><h1>メールテンプレート</h1><p>よく使う文面を登録し、顧客名などを差し込んでワンクリックでコピーできます。</p></div>
      <div class="actions"><button class="btn btn-primary" id="new">＋ テンプレートを追加</button></div>
    </div>
    <div class="tpl-layout">
      <div class="card" style="padding:6px"><ul class="tpl-list" id="tl"></ul></div>
      <div id="main"></div>
    </div>`;

  const $ = (sel) => view.querySelector(sel);

  function drawList() {
    $('#tl').innerHTML = list.map((t) => `<li data-id="${t.id}" class="${cur && t.id === cur.id ? 'on' : ''}">${U.esc(t.name)}</li>`).join('')
      || '<li class="muted">テンプレートがありません</li>';
  }

  function drawMain() {
    if (!cur) { $('#main').innerHTML = '<div class="card empty">左の一覧から選ぶか、新しく追加してください。</div>'; return; }
    $('#main').innerHTML = `
      <div class="card">
        <div class="card-head"><h2>差し込みとコピー</h2>
          <select class="input" id="cu" style="width:auto; max-width:100%">
            <option value="">宛先の顧客を選ぶ…</option>
            ${customers.map((c) => `<option value="${c.id}" ${customer && customer.id === c.id ? 'selected' : ''}>${U.esc(c.company)}${c.contactName ? `（${U.esc(c.contactName)}）` : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-grid" id="mv" style="margin-bottom:12px"></div>
        <div class="mail-preview" id="pv"></div>
        <div class="actions" style="margin-top:12px">
          <button class="btn" id="cpS">件名をコピー</button>
          <button class="btn btn-primary" id="cpB">本文をコピー</button>
          <button class="btn" id="mailto">メールソフトで開く</button>
          <label class="small" style="display:flex; gap:6px; align-items:center; margin-left:auto"><input type="checkbox" id="log" ${customer ? 'checked' : ''}> 顧客の活動履歴に記録する</label>
        </div>
        ${!s.companyName || !s.senderName ? '<p class="small muted" style="margin-top:8px">自社名・あなたの名前は <a href="#/settings">設定</a> で登録すると自動で差し込まれます。</p>' : ''}
      </div>
      <div class="card" id="ed">
        <div class="card-head"><h2>テンプレートの編集</h2>
          <div class="actions"><button class="btn btn-sm btn-ghost danger-text" id="del">削除</button><button class="btn btn-sm" id="dup">複製</button><button class="btn btn-sm btn-primary" id="save">保存</button></div></div>
        <div class="form-grid">
          <label class="field span-2"><span>テンプレート名</span><input name="name" value="${U.esc(cur.name)}"></label>
          <label class="field span-2"><span>件名</span><input name="subject" value="${U.esc(cur.subject)}"></label>
          <label class="field span-2"><span>本文</span><textarea name="body" rows="14">${U.esc(cur.body)}</textarea></label>
        </div>
        <div style="margin-top:10px"><div class="small muted" style="margin-bottom:6px">クリックで本文のカーソル位置に挿入（自動で埋まる項目）。<code>{{任意の名前}}</code> と書けば、手入力の項目も作れます。</div>
          <div class="chips">${Object.keys(Templates.AUTO).map((k) => `<button class="chip" data-v="${k}">{{${k}}}</button>`).join('')}</div></div>
      </div>`;
    bindMain();
    refresh();
  }

  function draft() {
    return { subject: $('[name=subject]').value, body: $('[name=body]').value };
  }

  // 自動で埋まらない項目は入力欄を出す
  function drawManual() {
    const d = draft();
    const keys = Templates.vars(d.subject + '\n' + d.body).filter((k) => !Templates.AUTO[k]);
    $('#mv').innerHTML = keys.map((k) => `<label class="field"><span>${U.esc(k)}</span><input data-mv="${U.esc(k)}" value="${U.esc(manual[k] || '')}"></label>`).join('');
    $('#mv').style.display = keys.length ? '' : 'none';
  }

  function refresh() {
    const d = draft();
    const mark = (t) => U.esc(t).replace(/\{\{([^{}]+?)\}\}/g, '<mark>{{$1}}</mark>');
    $('#pv').innerHTML = `<div class="subj">${mark(Templates.fill(d.subject, customer, s, manual))}</div>${mark(Templates.fill(d.body, customer, s, manual))}`;
  }

  async function logActivity(what) {
    if (!customer || !$('#log').checked) return;
    customer.activities = [...(customer.activities || []), { id: DB.uid(), date: U.ymd(), type: 'メール', memo: `${what}：${Templates.fill(draft().subject, customer, s, manual)}` }];
    await DB.put('customers', customer);
    $('#log').checked = false;
  }

  function bindMain() {
    $('#cu').onchange = (e) => { customer = customers.find((c) => c.id === e.target.value) || null; $('#log').checked = !!customer; refresh(); };
    $('#mv').oninput = (e) => { if (e.target.dataset.mv) { manual[e.target.dataset.mv] = e.target.value; refresh(); } };
    $('#ed').oninput = U.debounce(() => { drawManual(); refresh(); }, 150);
    $('#cpS').onclick = () => U.copy(Templates.fill(draft().subject, customer, s, manual));
    $('#cpB').onclick = async () => { await U.copy(Templates.fill(draft().body, customer, s, manual)); logActivity('メール作成'); };
    $('#mailto').onclick = () => {
      const d = draft();
      const url = `mailto:${encodeURIComponent(customer?.email || '')}?subject=${encodeURIComponent(Templates.fill(d.subject, customer, s, manual))}&body=${encodeURIComponent(Templates.fill(d.body, customer, s, manual))}`;
      logActivity('メール作成');
      location.href = url;
    };
    view.querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
      const ta = $('[name=body]');
      const ins = `{{${b.dataset.v}}}`;
      const p = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, p) + ins + ta.value.slice(ta.selectionEnd ?? p);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = p + ins.length;
      drawManual(); refresh();
    }));
    $('#save').onclick = async () => {
      Object.assign(cur, U.formData($('#ed')));
      if (!cur.name) return U.toast('テンプレート名を入力してください', 'err');
      await DB.put('templates', cur);
      drawList();
      U.toast('保存しました');
    };
    $('#dup').onclick = async () => {
      const copy = { ...cur, ...U.formData($('#ed')), id: undefined, createdAt: undefined };
      copy.name += '（コピー）';
      cur = await DB.put('templates', copy);
      list.push(cur);
      drawList(); drawMain();
    };
    $('#del').onclick = () => U.confirm('テンプレートを削除', `「${cur.name}」を削除します。`, async () => {
      await DB.remove('templates', cur.id);
      list = list.filter((t) => t.id !== cur.id);
      cur = list[0] || null;
      drawList(); drawMain();
    });
    drawManual();
  }

  $('#tl').onclick = (e) => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    cur = list.find((t) => t.id === li.dataset.id);
    drawList(); drawMain();
  };
  $('#new').onclick = async () => {
    cur = await DB.put('templates', { name: '新しいテンプレート', subject: '', body: '{{会社名}}\n{{担当者名}} 様\n\nお世話になっております。{{自社名}}の{{自分の名前}}です。\n\n' + '\n\nよろしくお願いいたします。' });
    list.push(cur);
    drawList(); drawMain();
    $('[name=name]').select();
  };

  drawList();
  drawMain();
};
