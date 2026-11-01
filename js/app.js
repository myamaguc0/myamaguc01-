/* ハッシュルーター。各ページは window.Pages に render(view, params) を登録する */
(() => {
  const routes = [
    [/^#?\/?$/, 'dashboard', () => Pages.dashboard],
    [/^#\/documents\/new\/(quote|invoice|delivery|receipt)$/, 'documents', (m) => (v) => Pages.documentEdit(v, { type: m[1] })],
    [/^#\/documents\/([\w-]+)$/, 'documents', (m) => (v) => Pages.documentEdit(v, { id: m[1] })],
    [/^#\/documents$/, 'documents', () => Pages.documents],
    [/^#\/products$/, 'documents', () => Pages.products],
    [/^#\/customers\/([\w-]+)$/, 'customers', (m) => (v) => Pages.customerDetail(v, { id: m[1] })],
    [/^#\/customers$/, 'customers', () => Pages.customers],
    [/^#\/templates$/, 'templates', () => Pages.templates],
    [/^#\/analyze$/, 'analyze', () => Pages.analyze],
    [/^#\/settings$/, 'settings', () => Pages.settings],
  ];

  let cleanup = null;

  async function render() {
    const hash = location.hash || '#/';
    const view = document.getElementById('view');
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    for (const [re, nav, get] of routes) {
      const m = hash.match(re);
      if (!m) continue;
      document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === nav));
      // ページごとに新しい要素を渡し、前のページのイベントリスナーが残らないようにする
      const page = document.createElement('div');
      view.replaceChildren(page);
      try {
        cleanup = await get(m)(page);
      } catch (e) {
        console.error(e);
        view.innerHTML = `<div class="card empty"><div class="big">⚠</div><p>エラーが発生しました：${U.esc(e.message)}</p></div>`;
      }
      view.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      return;
    }
    location.hash = '#/';
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', async () => {
    await Templates.seed();
    render();
  });
})();
