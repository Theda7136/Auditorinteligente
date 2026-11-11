(() => {
    const links = [...document.querySelectorAll('[data-target-view]')];
    const views = [...document.querySelectorAll('.workspace-view')];
    const validViews = new Set(['audit', 'history', 'settings', 'account']);

    function showView(name) {
        const selected = validViews.has(name) ? name : 'audit';

        for (const view of views) {
            view.hidden = view.dataset.view !== selected;
        }

        for (const link of links) {
            const active = link.dataset.targetView === selected;
            link.classList.toggle('is-current', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        }

        const retryPanel = document.getElementById('geminiRetryPanel');
        if (retryPanel) retryPanel.classList.toggle('audit-only-hidden', selected !== 'audit');

        if (selected === 'settings') {
            document.getElementById('workspaceSettings').open = true;
        }
    }

    function navigate() {
        const selected = location.hash.replace('#workspace', '').toLowerCase();
        showView(selected);
    }

    window.addEventListener('hashchange', navigate);
    navigate();
})();
