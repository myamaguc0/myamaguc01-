/* 動作確認・デモ用のサンプルデータ（日付は今日を基準に作る） */
window.Sample = {
  async load() {
    const t = U.ymd();
    const d = (n) => U.addDays(t, n);
    await Settings.save({
      companyName: '株式会社ネクストワークス', representative: '代表取締役 山田 太郎', zip: '150-0002',
      address: '東京都渋谷区渋谷2-0-0 サンプルビル5F', tel: '03-1234-5678', email: 'info@nextworks.example.jp',
      regNumber: 'T1234567890123', bankInfo: 'サンプル銀行 渋谷支店 普通 1234567\n口座名義 カ）ネクストワークス', senderName: '山田 太郎',
    });

    const cs = [
      { company: '株式会社みらい商事', dept: '総務部', contactName: '佐藤 花子', title: '課長', email: 'sato@mirai.example.jp', phone: '03-0000-1111', address: '東京都港区芝公園1-1', status: '見積提出', expectedAmount: 660000, nextActionDate: d(-2), nextAction: '見積の検討状況を電話で確認', source: '紹介', notes: '決裁は部長。予算は年度内に確定。',
        activities: [{ date: d(-20), type: '訪問', memo: '初回訪問。社内の請求業務が属人化しているとの課題。' }, { date: d(-9), type: 'メール', memo: '見積書を送付。' }] },
      { company: '有限会社さくら工房', dept: '', contactName: '鈴木 一郎', title: '代表', email: 'suzuki@sakura.example.jp', phone: '06-0000-2222', address: '大阪府大阪市北区梅田1-1', status: '商談中', expectedAmount: 300000, nextActionDate: t, nextAction: 'デモ画面を見せる（オンライン）', source: 'Web問合せ',
        activities: [{ date: d(-5), type: 'オンライン商談', memo: 'ヒアリング。月20件ほどの見積作成を効率化したい。' }] },
      { company: '株式会社ひかり物流', dept: '営業企画部', contactName: '高橋 健', title: '主任', email: 'takahashi@hikari.example.jp', status: 'リード', expectedAmount: 1200000, nextActionDate: d(3), nextAction: '資料送付のお礼と日程調整', source: '展示会', activities: [] },
      { company: '合同会社あおば', contactName: '田中 美咲', email: 'tanaka@aoba.example.jp', status: '受注', expectedAmount: 150000, nextActionDate: d(25), nextAction: '月次の定例ミーティング', source: '紹介', activities: [{ date: d(-30), type: '訪問', memo: '保守契約で受注。' }] },
      { company: '株式会社たいよう不動産', dept: '管理部', contactName: '伊藤 誠', status: '失注', expectedAmount: 400000, source: 'テレアポ', notes: '他社に決定。半年後に再アプローチ。', activities: [] },
    ];
    const saved = [];
    for (const c of cs) {
      c.activities = (c.activities || []).map((a) => ({ id: DB.uid(), ...a }));
      saved.push(await DB.put('customers', { ...Customers.blank(), ...c }));
    }
    const [mirai, sakura, , aoba] = saved;
    const to = (c) => ({ customerId: c.id, toName: c.company, honorific: '御中', toAttention: `${c.dept ? c.dept + ' ' : ''}${c.contactName} 様`, toAddress: c.address || '' });

    const docs = [
      { ...(await Docs.blank('quote')), ...to(mirai), issueDate: d(-9), dueDate: d(21), status: '提出済', subject: '請求業務 効率化支援', deliveryDate: 'ご発注後3週間',
        items: [{ name: '業務ヒアリング・要件整理', qty: 1, unit: '式', price: 200000, taxRate: 10 }, { name: '業務アプリ導入・初期設定', qty: 1, unit: '式', price: 300000, taxRate: 10 }, { name: '操作説明会（2時間）', qty: 2, unit: '回', price: 50000, taxRate: 10 }] },
      { ...(await Docs.blank('invoice')), ...to(aoba), issueDate: d(-40), dueDate: d(-10), status: '送付済', subject: 'Webサイト保守（先月分）',
        items: [{ name: 'Webサイト保守 月額', qty: 1, unit: '月', price: 50000, taxRate: 10 }, { name: '更新作業（追加分）', qty: 3, unit: '時間', price: 6000, taxRate: 10 }] },
      { ...(await Docs.blank('invoice')), ...to(sakura), issueDate: d(-3), status: '送付済', subject: '打ち合わせ用 茶菓子・資料印刷',
        items: [{ name: '資料印刷・製本', qty: 20, unit: '部', price: 800, taxRate: 10 }, { name: '茶菓子（軽減税率対象）', qty: 2, unit: '箱', price: 1500, taxRate: 8 }] },
    ];
    docs.push({ ...(await Docs.blank('receipt')), ...to(aoba), issueDate: d(-35), status: '発行済', subject: 'Webサイト保守費（前々月分）',
      items: [{ name: 'Webサイト保守 月額', qty: 1, unit: '月', price: 50000, taxRate: 10 }, { name: '更新作業（追加分）', qty: 2, unit: '時間', price: 6000, taxRate: 10 }] });
    // 番号は保存のたびに採番し直して重複を避ける
    for (const doc of docs) {
      doc.number = await Docs.nextNumber(doc.type, doc.issueDate);
      await DB.put('documents', doc);
    }

    const known = new Set((await DB.all('products')).map((p) => p.name));
    const products = [
      ['Webサイト保守 月額', '月', 50000, 10], ['更新作業（追加分）', '時間', 6000, 10], ['LP制作', '式', 180000, 10],
      ['業務ヒアリング・要件整理', '式', 200000, 10], ['操作説明会（2時間）', '回', 50000, 10], ['資料印刷・製本', '部', 800, 10], ['茶菓子（軽減税率対象）', '箱', 1500, 8],
    ];
    for (const [name, unit, price, taxRate] of products) if (!known.has(name)) await DB.put('products', { name, unit, price, taxRate });
  },
};
