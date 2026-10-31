/* 自社情報・帳票設定・バックアップ */
window.Pages = window.Pages || {};

window.Settings = (() => {
  const DEFAULTS = {
    id: 'company',
    companyName: '',
    representative: '',
    zip: '',
    address: '',
    tel: '',
    email: '',
    regNumber: '',
    bankInfo: '',
    sealImage: '',
    senderName: '',
    rounding: 'floor',
    quotePrefix: 'Q',
    invoicePrefix: 'INV',
    deliveryPrefix: 'DN',
    receiptPrefix: 'RC',
    quoteValidDays: 30,
    quoteNotes: '',
    invoiceNotes: '恐れ入りますが、振込手数料は貴社にてご負担くださいますようお願い申し上げます。',
    deliveryNotes: '',
    receiptNotes: '',
  };
  let cache = null;

  async function get() {
    if (!cache) cache = { ...DEFAULTS, ...((await DB.get('settings', 'company')) || {}) };
    return cache;
  }
  async function save(data) {
    cache = await DB.put('settings', { ...(await get()), ...data, id: 'company' });
    return cache;
  }
  const invalidate = () => { cache = null; };
  // 適格請求書発行事業者の登録番号は「T + 13桁の数字」
  const validRegNumber = (s) => !s || /^T\d{13}$/.test(s);

  return { get, save, invalidate, validRegNumber, DEFAULTS };
})();

Pages.settings = async (view) => {
  const s = await Settings.get();
  const f = (name, label, opts = {}) => `
    <label class="field ${opts.span ? 'span-2' : ''}"><span>${label}</span>
      ${opts.textarea
        ? `<textarea name="${name}" rows="${opts.rows || 3}" placeholder="${U.esc(opts.ph || '')}">${U.esc(s[name])}</textarea>`
        : `<input name="${name}" type="${opts.type || 'text'}" value="${U.esc(s[name])}" placeholder="${U.esc(opts.ph || '')}">`}
      ${opts.help ? `<small>${opts.help}</small>` : ''}
    </label>`;

  view.innerHTML = `
    <div class="page-head">
      <div><h1>設定・バックアップ</h1><p>見積書・請求書に印字される自社情報と、データのバックアップを管理します。</p></div>
      <div class="actions"><button class="btn btn-primary" id="save">保存する</button></div>
    </div>

    <div class="card" id="form">
      <h2>自社情報</h2>
      <div class="form-grid">
        ${f('companyName', '会社名・屋号', { ph: '株式会社サンプル' })}
        ${f('representative', '代表者・担当者名', { ph: '代表取締役 山田 太郎' })}
        ${f('zip', '郵便番号', { ph: '100-0001' })}
        ${f('tel', '電話番号', { ph: '03-0000-0000' })}
        ${f('address', '住所', { ph: '東京都千代田区千代田1-1 サンプルビル3F', span: true })}
        ${f('email', 'メールアドレス', { type: 'email', ph: 'info@example.co.jp' })}
        ${f('regNumber', '適格請求書発行事業者 登録番号', { ph: 'T1234567890123', help: 'インボイス制度の登録番号（T＋13桁）。請求書・見積書に印字されます。' })}
        ${f('bankInfo', '振込先', { textarea: true, span: true, ph: '○○銀行 ○○支店 普通 1234567\n口座名義 カ）サンプル' })}
      </div>
      <div class="field" style="margin-top:14px"><span>印影（角印）画像</span>
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap">
          <div class="seal-preview" id="sealPrev">${s.sealImage ? `<img src="${s.sealImage}" alt="印影">` : '<span class="small muted">未設定</span>'}</div>
          <label class="btn btn-sm">画像を選択<input type="file" accept="image/*" id="sealFile" hidden></label>
          <button class="btn btn-sm btn-ghost" id="sealClear">削除</button>
          <small>背景が透明なPNGがおすすめです。社名の右側に重ねて表示されます。</small>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>帳票の設定</h2>
      <div class="form-grid" id="form2">
        <label class="field"><span>消費税の端数処理</span>
          <select name="rounding">
            <option value="floor" ${s.rounding === 'floor' ? 'selected' : ''}>切り捨て（一般的）</option>
            <option value="round" ${s.rounding === 'round' ? 'selected' : ''}>四捨五入</option>
            <option value="ceil" ${s.rounding === 'ceil' ? 'selected' : ''}>切り上げ</option>
          </select>
          <small>インボイス制度にあわせて、1枚の書類につき税率ごとに1回だけ端数を処理します。</small>
        </label>
        <label class="field"><span>見積書の有効期限（発行日から何日後）</span>
          <input name="quoteValidDays" type="number" min="1" value="${U.esc(s.quoteValidDays)}">
        </label>
        ${f('quotePrefix', '見積書番号の接頭辞', { help: '例：Q → Q-202611-001' })}
        ${f('invoicePrefix', '請求書番号の接頭辞', { help: '例：INV → INV-202611-001' })}
        ${f('deliveryPrefix', '納品書番号の接頭辞', { help: '例：DN → DN-202611-001' })}
        ${f('receiptPrefix', '領収書番号の接頭辞', { help: '例：RC → RC-202611-001' })}
        ${f('quoteNotes', '見積書の備考（初期値）', { textarea: true, span: true })}
        ${f('invoiceNotes', '請求書の備考（初期値）', { textarea: true, span: true })}
        ${f('deliveryNotes', '納品書の備考（初期値）', { textarea: true, span: true })}
        ${f('receiptNotes', '領収書の備考（初期値）', { textarea: true, span: true })}
      </div>
    </div>

    <div class="card">
      <h2>メールの署名</h2>
      <div class="form-grid" id="form3">
        ${f('senderName', 'あなたの名前', { ph: '山田 太郎', help: 'メールテンプレートの {{自分の名前}} に差し込まれます。' })}
      </div>
    </div>

    <div class="card">
      <h2>バックアップ</h2>
      <p class="muted small" style="margin-top:-6px">データはこのブラウザの中にだけ保存されています。ブラウザのデータ削除やPCの買い替えに備えて、定期的に書き出してください。別のPCに移すときにも使えます。</p>
      <div class="actions" style="margin-top:10px">
        <button class="btn" id="exp">⬇ すべてのデータを書き出す（JSON）</button>
        <label class="btn">⬆ バックアップから復元<input type="file" accept="application/json,.json" id="imp" hidden></label>
        <button class="btn btn-ghost danger-text" id="sample">サンプルデータを読み込む</button>
      </div>
    </div>`;

  let seal = s.sealImage;
  const $ = (sel) => view.querySelector(sel);

  $('#sealFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) return U.toast('1MB以下の画像を選んでください', 'err');
    seal = await U.readFileAsDataURL(file);
    $('#sealPrev').innerHTML = `<img src="${seal}" alt="印影">`;
  };
  $('#sealClear').onclick = () => { seal = ''; $('#sealPrev').innerHTML = '<span class="small muted">未設定</span>'; };

  $('#save').onclick = async () => {
    const data = { ...U.formData($('#form')), ...U.formData($('#form2')), ...U.formData($('#form3')), sealImage: seal };
    data.regNumber = data.regNumber.replace(/[\s-]/g, '').toUpperCase();
    if (!Settings.validRegNumber(data.regNumber)) return U.toast('登録番号は「T＋13桁の数字」で入力してください', 'err');
    await Settings.save(data);
    U.toast('設定を保存しました');
  };

  $('#exp').onclick = async () => {
    const data = await DB.exportAll();
    U.download(`biz-assistant-backup-${U.ymd()}.json`, JSON.stringify(data, null, 2), 'application/json');
    U.toast('バックアップを書き出しました');
  };
  $('#imp').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    U.modal({
      title: 'バックアップから復元',
      body: '<p>現在のデータはすべて置き換えられます。よろしいですか？</p>',
      okText: '復元する', danger: true,
      onOk: async () => {
        try {
          await DB.importAll(JSON.parse(await file.text()));
          Settings.invalidate();
          U.toast('復元しました');
          Pages.settings(view);
        } catch (err) {
          U.toast('復元できませんでした：' + err.message, 'err');
        }
      },
    });
  };
  $('#sample').onclick = () => U.modal({
    title: 'サンプルデータを読み込む',
    body: '<p>動作確認用の自社情報・顧客・見積書・請求書を追加します。既存のデータは消えませんが、自社情報は上書きされます。</p>',
    okText: '読み込む',
    onOk: async () => { await Sample.load(); Settings.invalidate(); U.toast('サンプルデータを読み込みました'); location.hash = '#/'; },
  });
};
