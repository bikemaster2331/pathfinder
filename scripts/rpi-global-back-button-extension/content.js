(() => {
  const BUTTON_ID = '__pathfinder_global_back_button__';
  const STYLE_ID = '__pathfinder_global_back_style__';
  const NAV_STATE_KEY = 'pathfinderNavigationState';
  const LAST_PATHFINDER_PAGE_KEY = 'pathfinderLastPageUrl';
  const LAST_PATHFINDER_PDF_PAGE_KEY = 'pathfinderLastPdfPageUrl';
  const PATHFINDER_LOADING_TOKENS = [
    'pathfinder is loading',
    'pathfinder is starting',
    'pathfinder starting',
    'starting pathfinder',
    'pipeline initializing'
  ];

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

  const isPathfinderApiPath = (pathname, port) => {
    const normalizedPath = String(pathname || '/').toLowerCase();
    const normalizedPort = String(port || '');

    if (normalizedPath === '/api' || normalizedPath.startsWith('/api/')) return true;
    if (normalizedPath === '/health') return true;
    if (normalizedPath === '/openapi.json') return true;
    if (normalizedPath === '/itinerary_add') return true;
    if (normalizedPath === '/docs' || normalizedPath.startsWith('/docs/')) return true;
    if (normalizedPath === '/redoc' || normalizedPath.startsWith('/redoc/')) return true;
    if (normalizedPath === '/admin' || normalizedPath.startsWith('/admin/')) return true;
    if (normalizedPath.endsWith('.pdf')) return true;

    // Backend API route collision: /itinerary is JSON on :8000 in this project.
    if (normalizedPath === '/itinerary' && normalizedPort === '8000') return true;

    return false;
  };

  const isPathfinderAppPath = (pathname, port) => {
    const normalizedPath = String(pathname || '/').toLowerCase();
    if (isPathfinderApiPath(normalizedPath, port)) return false;
    if (normalizedPath === '/') return true;
    if (normalizedPath.startsWith('/last')) return true;
    if (normalizedPath.startsWith('/itinerary')) return true;
    if (normalizedPath.startsWith('/creators')) return true;
    if (normalizedPath.startsWith('/about')) return true;
    if (normalizedPath.startsWith('/contact')) return true;
    return false;
  };

  const isPathfinderAppUrl = (value) => {
    const parsed = parseUrl(value);
    if (!parsed) return false;
    if (!isPathfinderHost(parsed.hostname)) return false;
    return isPathfinderAppPath(parsed.pathname, parsed.port);
  };

  const isPathfinderAppPage = () => {
    return isPathfinderAppUrl(window.location.href);
  };

  const isPathfinderLoadingScreen = () => {
    const includesLoadingToken = (input) => PATHFINDER_LOADING_TOKENS.some(
      (token) => String(input || '').toLowerCase().includes(token)
    );

    const pageTitle = String(document.title || '').toLowerCase();
    if (includesLoadingToken(pageTitle)) return true;

    const bodyText = String(document.body?.innerText || '').toLowerCase();
    if (includesLoadingToken(bodyText)) return true;

    const pathname = String(window.location.pathname || '').toLowerCase();
    if (pathname.includes('loading') || pathname.includes('starting')) return true;

    return false;
  };

  const isKioskBootstrapPage = () => {
    const protocol = String(window.location.protocol || '').toLowerCase();
    return protocol === 'about:' || protocol === 'data:' || protocol === 'chrome-error:';
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
    if (!isPathfinderAppPage()) return;

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
    const candidates = [
      hints.lastPdfPageUrl,
      previousUrl,
      hints.lastPathfinderPageUrl,
      DEFAULT_FALLBACK_URL
    ];

    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (!normalized) continue;
      if (normalized === window.location.href) continue;
      if (isPathfinderAppUrl(normalized)) {
        return normalized;
      }
    }

    return DEFAULT_FALLBACK_URL;
  };

  const injectStyle = () => {
    const existingStyle = document.getElementById(STYLE_ID);
    if (existingStyle) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html, body, *, *::before, *::after, iframe, canvas, svg {
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

    document.documentElement.style.setProperty('cursor', 'none', 'important');
    if (document.body) {
      document.body.style.setProperty('cursor', 'none', 'important');
    }
  };

  const removeButton = () => {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
  };

  const navigateBack = async () => {
    const state = await readNavState();
    const targetUrl = await resolveTargetUrl(state?.previousUrl || '');
    if (targetUrl && targetUrl !== window.location.href) {
      window.location.assign(targetUrl);
      return;
    }

    window.history.back();
  };

  const renderButton = async () => {
    const state = await updateNavStateForCurrentPage();
    await persistPathfinderHintsIfNeeded();
    injectStyle();

    if (isPathfinderAppPage() || isPathfinderLoadingScreen() || isKioskBootstrapPage()) {
      removeButton();
      return;
    }

    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      existing.textContent = 'Back';
      existing.onclick = () => { void navigateBack(); };
      return;
    }

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Back';
    button.onclick = () => { void navigateBack(); };

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
        renderButton();
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
