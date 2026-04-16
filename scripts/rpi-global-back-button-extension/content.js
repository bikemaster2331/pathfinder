(() => {
  const BUTTON_ID = '__pathfinder_global_back_button__';
  const STYLE_ID = '__pathfinder_global_back_style__';
  const NAV_STATE_KEY = 'pathfinderNavigationState';
  const LAST_PATHFINDER_PAGE_KEY = 'pathfinderLastPageUrl';
  const LAST_PATHFINDER_PDF_PAGE_KEY = 'pathfinderLastPdfPageUrl';

  // Used only when there is no previous page info available.
  const DEFAULT_FALLBACK_URL = 'http://localhost:5173/last';

  const PATHFINDER_HOST_ALLOWLIST = new Set([
    'localhost',
    '127.0.0.1',
    '172.27.230.182'
  ]);

  const isPathfinderHost = (hostname) => {
    const normalized = String(hostname || '').toLowerCase();

    if (PATHFINDER_HOST_ALLOWLIST.has(normalized)) return true;
    if (normalized.endsWith('.local')) return true;
    if (normalized.includes('pathfinder')) return true;

    return false;
  };

  const isPathfinderPage = () => {
    return isPathfinderHost(window.location.hostname);
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

    if (isPathfinderHost(host)) {
      if (parsed.pathname.startsWith('/last')) return 'Previous Page (PDF)';
      return `Previous Page (${path})`;
    }

    return `Previous Page (${host}${path === '/' ? '' : path})`;
  };

  const readStorage = async (keys) => {
    try {
      return await chrome.storage.local.get(keys);
    } catch {
      return {};
    }
  };

  const writeStorage = async (value) => {
    try {
      await chrome.storage.local.set(value);
    } catch {
      // Ignore storage errors.
    }
  };

  const readNavState = async () => {
    const stored = await readStorage([NAV_STATE_KEY]);
    const state = stored?.[NAV_STATE_KEY];
    if (state && typeof state === 'object') return state;

    return {
      previousUrl: '',
      currentUrl: ''
    };
  };

  const updateNavStateForCurrentPage = async () => {
    const currentUrl = window.location.href;
    const state = await readNavState();

    if (state.currentUrl === currentUrl) {
      return state;
    }

    const nextState = {
      previousUrl: state.currentUrl || state.previousUrl || '',
      currentUrl
    };

    await writeStorage({ [NAV_STATE_KEY]: nextState });
    return nextState;
  };

  const persistPathfinderHintsIfNeeded = async () => {
    if (!isPathfinderPage()) return;

    const currentUrl = window.location.href;
    const currentPath = String(window.location.pathname || '');
    const payload = {
      [LAST_PATHFINDER_PAGE_KEY]: currentUrl
    };

    if (currentPath.startsWith('/last')) {
      payload[LAST_PATHFINDER_PDF_PAGE_KEY] = currentUrl;
    }

    await writeStorage(payload);
  };

  const readHints = async () => {
    const stored = await readStorage([
      LAST_PATHFINDER_PAGE_KEY,
      LAST_PATHFINDER_PDF_PAGE_KEY
    ]);

    return {
      lastPathfinderPageUrl: stored?.[LAST_PATHFINDER_PAGE_KEY] || '',
      lastPdfPageUrl: stored?.[LAST_PATHFINDER_PDF_PAGE_KEY] || ''
    };
  };

  const resolveTargetUrl = async (previousUrl) => {
    const hints = await readHints();
    const parsedPrevious = parseUrl(previousUrl);

    if (parsedPrevious && previousUrl !== window.location.href) {
      if (!isPathfinderHost(parsedPrevious.hostname)) {
        return previousUrl;
      }

      const previousPath = String(parsedPrevious.pathname || '');
      if (previousPath && previousPath !== '/') {
        return previousUrl;
      }
    }

    if (typeof hints.lastPdfPageUrl === 'string' && hints.lastPdfPageUrl.startsWith('http')) {
      return hints.lastPdfPageUrl;
    }

    if (typeof hints.lastPathfinderPageUrl === 'string' && hints.lastPathfinderPageUrl.startsWith('http')) {
      return hints.lastPathfinderPageUrl;
    }

    if (typeof previousUrl === 'string' && previousUrl && previousUrl !== window.location.href) {
      return previousUrl;
    }

    return DEFAULT_FALLBACK_URL;
  };

  const injectStyle = () => {
    const existingStyle = document.getElementById(STYLE_ID);
    if (existingStyle) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html, body, * {
        cursor: none !important;
      }
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
      }
      #${BUTTON_ID}:hover {
        background: rgba(30, 41, 59, 0.95);
      }
      #${BUTTON_ID}:disabled {
        opacity: 0.84;
      }
    `;

    document.documentElement.appendChild(style);
  };

  const removeButton = () => {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
  };

  const navigateBack = () => {
    window.history.back();
  };

  const renderButton = async () => {
    const state = await updateNavStateForCurrentPage();
    await persistPathfinderHintsIfNeeded();
    injectStyle();

    if (isPathfinderPage()) {
      removeButton();
      return;
    }

    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      existing.textContent = 'Back';
      existing.onclick = navigateBack;
      return;
    }

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Back';
    button.addEventListener('click', navigateBack);

    if (document.body) {
      document.body.appendChild(button);
    }
  };

  const rerenderSoon = () => {
    window.setTimeout(() => {
      injectStyle();
      renderButton();
    }, 0);
  };

  const setupCursorEnforcement = () => {
    let rafId = 0;
    const queueStyleReapply = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        injectStyle();
      });
    };

    const observer = new MutationObserver(() => {
      queueStyleReapply();
    });

    const observeTarget = document.documentElement || document.body;
    if (observeTarget) {
      observer.observe(observeTarget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }

    window.addEventListener('beforeunload', () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    });
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
  setupCursorEnforcement();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderButton();
    });
  } else {
    renderButton();
  }
})();
