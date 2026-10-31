/* 共通ユーティリティ：HTMLエスケープ、日付・金額の書式、トースト、モーダル、ダウンロード */
window.U = (() => {
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const yen = (n) => '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP');
  const num = (n) => (Number(n) || 0).toLocaleString('ja-JP', { maximumFractionDigits: 2 });

  // ローカル日付を YYYY-MM-DD で返す（toISOString は UTC になるため使わない）
  const ymd = (d = new Date()) => {
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const addDays = (s, n) => {
    const d = s ? new Date(s + 'T00:00:00') : new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  const endOfNextMonth = (s) => {
    const d = s ? new Date(s + 'T00:00:00') : new Date();
    return ymd(new Date(d.getFullYear(), d.getMonth() + 2, 0));
  };
  const jpDate = (s) => {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d)) return s;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const daysFromToday = (s) => {
    if (!s) return null;
    const t = new Date(ymd() + 'T00:00:00');
    return Math.round((new Date(s + 'T00:00:00') - t) / 86400000);
  };

  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  // シンプルなモーダル。onOk が false を返すと閉じない
  function modal({ title, body, okText = 'OK', cancelText = 'キャンセル', danger = false, onOk, wide = false }) {
    const bd = document.getElementById('modal');
    bd.innerHTML = `
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="閉じる">×</button></header>
        <div class="modal-body">${body}</div>
        <footer class="modal-foot">
          ${cancelText ? `<button class="btn" data-x>${esc(cancelText)}</button>` : ''}
          ${okText ? `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>` : ''}
        </footer>
      </div>`;
    bd.hidden = false;
    const close = () => { bd.hidden = true; bd.innerHTML = ''; document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bd.querySelectorAll('[data-x]').forEach((b) => (b.onclick = close));
    bd.onclick = (e) => { if (e.target === bd) close(); };
    const ok = bd.querySelector('[data-ok]');
    if (ok) ok.onclick = async () => { if ((await onOk?.(bd)) !== false) close(); };
    const first = bd.querySelector('input, textarea, select');
    (first || ok)?.focus();
    return { el: bd, close };
  }

  const confirm = (title, message, onOk) =>
    modal({ title, body: `<p>${esc(message)}</p>`, okText: '削除する', danger: true, onOk });

  function download(filename, content, type = 'text/plain') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Excel で文字化けしないよう BOM 付き UTF-8 の CSV を作る
  function toCSV(rows) {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('クリップボードにコピーしました');
  }

  const readFileAsDataURL = (file) =>
    new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

  // フォーム内の [name] 要素を {name: value} にまとめる
  const formData = (root) => {
    const o = {};
    root.querySelectorAll('[name]').forEach((el) => {
      o[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
    });
    return o;
  };

  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  return { esc, yen, num, ymd, addDays, endOfNextMonth, jpDate, daysFromToday, toast, modal, confirm, download, toCSV, copy, readFileAsDataURL, formData, debounce };
})();
