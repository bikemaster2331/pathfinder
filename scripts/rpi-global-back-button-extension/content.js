(() => {
  const BUTTON_ID = '__pathfinder_global_back_button__';
  const STYLE_ID = '__pathfinder_global_back_style__';
  const NAV_STATE_KEY = 'pathfinderNavigationState';

  // Used only when there is no previous page info available.
  const DEFAULT_FALLBACK_URL = 'http://localhost:5173/last';

  const PATHFINDER_HOST_ALLOWLIST = new Set([
    'localhost',
    '127.0.0.1',
    '172.27.230.182'
  ]);

  const isPathfinderPage = () => {
    const hostname = String(window.location.hostname || '').toLowerCase();

    if (PATHFINDER_HOST_ALLOWLIST.has(hostname)) return true;
    if (hostname.endsWith('.local')) return true;
    if (hostname.includes('pathfinder')) return true;

    return false;
  };

  const parseUrl = (value) => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };

  const compactPath = (pathname) => {
    const path = String(pathname || '/');
    if (!path || path === '/') return '/';

    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 2) {
      return `/${segments.join('/')}`;
    }

    return `/${segments[0]}/.../${segments[segments.length - 1]}`;
  };

  const previousPageLabel = (url) => {
    const parsed = parseUrl(url);
    if (!parsed) return 'Previous Page';

    const host = parsed.hostname.replace(/^www\./i, '');
    const path = compactPath(parsed.pathname);

    if (host === 'localhost' || host === '127.0.0.1' || host === '172.27.230.182') {
      if (parsed.pathname.startsWith('/last')) return 'Previous Page (PDF)';
      return `Previous Page (${path})`;
    }

    return `Previous Page (${host}${path === '/' ? '' : path})`;
  };

  const readNavState = async () => {
    try {
      const stored = await chrome.storage.local.get([NAV_STATE_KEY]);
      const state = stored?.[NAV_STATE_KEY];
      if (state && typeof state === 'object') return state;
    } catch {
      // Ignore storage errors.
    }
    return {
      previousUrl: '',
      currentUrl: ''
    };
  };

  const writeNavState = async (state) => {
    try {
      await chrome.storage.local.set({ [NAV_STATE_KEY]: state });
    } catch {
      // Ignore storage errors.
    }
  };

  const updateNavStateForCurrentPage = async () => {
    const currentUrl = window.location.href;
    const state = await readNavState();

    // Avoid churn on same URL re-renders.
    if (state.currentUrl === currentUrl) {
      return state;
    }

    const nextState = {
      previousUrl: state.currentUrl || state.previousUrl || '',
      currentUrl
    };

    await writeNavState(nextState);
    return nextState;
  };

  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 2147483647;
        border: none;
        border-radius: 12px;
        padding: 10px 14px;
        font-size: 14px;
        font-weight: 700;
        font-family: Arial, sans-serif;
        color: #ffffff;
        background: rgba(15, 23, 42, 0.92);
        box-shadow: 0 8px 20px rgba(2, 6, 23, 0.45);
        cursor: pointer;
      }
      #${BUTTON_ID}:hover {
        background: rgba(30, 41, 59, 0.95);
      }
      #${BUTTON_ID}:disabled {
        opacity: 0.84;
        cursor: wait;
      }
    `;

    document.documentElement.appendChild(style);
  };

  const removeButton = () => {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
  };

  const navigateToPrevious = async (previousUrl, button) => {
    button.disabled = true;
    button.textContent = 'Returning...';

    if (typeof previousUrl === 'string' && previousUrl && previousUrl !== window.location.href) {
      window.location.assign(previousUrl);
      return;
    }

    window.location.assign(DEFAULT_FALLBACK_URL);
  };

  const renderButton = async () => {
    const state = await updateNavStateForCurrentPage();

    if (isPathfinderPage()) {
      removeButton();
      return;
    }

    injectStyle();

    const previousUrl = state?.previousUrl || '';
    const label = previousPageLabel(previousUrl);

    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      existing.textContent = label;
      existing.onclick = () => {
        navigateToPrevious(previousUrl, existing);
      };
      return;
    }

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => navigateToPrevious(previousUrl, button));

    if (document.body) {
      document.body.appendChild(button);
    }
  };

  const rerenderSoon = () => {
    window.setTimeout(() => {
      renderButton();
    }, 0);
  };

  const patchHistory = () => {
    ['pushState', 'replaceState'].forEach((method) => {
      const original = window.history[method];
      if (typeof original !== 'function') return;

      window.history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        rerenderSoon();
        return result;
      };
    });
  };

  patchHistory();
  window.addEventListener('popstate', rerenderSoon);
  window.addEventListener('hashchange', rerenderSoon);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderButton();
    });
  } else {
    renderButton();
  }
})();
