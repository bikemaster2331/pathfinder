(() => {
  const BUTTON_ID = '__pathfinder_global_back_button__';
  const STYLE_ID = '__pathfinder_global_back_style__';
  const NAV_STATE_KEY = 'pathfinderNavigationState';
  const LAST_PATHFINDER_PAGE_KEY = 'pathfinderLastPageUrl';
  const LAST_PATHFINDER_PDF_PAGE_KEY = 'pathfinderLastPdfPageUrl';
  const LAST_PATHFINDER_PDF_CACHE_ID_KEY = 'pathfinderLastPdfCacheId';
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

  const PRIVATE_IPV4_PATTERN = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;
  const PATHFINDER_PORT_ALLOWLIST = new Set(['5173', '4173', '8000']);

  const isPathfinderHost = (hostname, port = '') => {
    const normalized = String(hostname || '').toLowerCase();
    const normalizedPort = String(port || '');

    if (PATHFINDER_HOST_ALLOWLIST.has(normalized)) return true;
    if (normalized.endsWith('.local')) return true;
    if (normalized.includes('pathfinder')) return true;
    if (PRIVATE_IPV4_PATTERN.test(normalized)) return true;
    if (PATHFINDER_PORT_ALLOWLIST.has(normalizedPort)) return true;

    return false;
  };

  const isPathfinderPage = () => {
    return isPathfinderHost(window.location.hostname, window.location.port);
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
    if (!isPathfinderHost(parsed.hostname, parsed.port)) return false;
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
    const currentParams = new URLSearchParams(String(window.location.search || ''));
    const currentPdfCacheIdParam = String(currentParams.get('pdf') || '').trim();
    const payload = {
      [LAST_PATHFINDER_PAGE_KEY]: currentUrl
    };

    if (currentPath.startsWith('/last')) {
      payload[LAST_PATHFINDER_PDF_PAGE_KEY] = currentUrl;

      if (currentPdfCacheIdParam) {
        payload[LAST_PATHFINDER_PDF_CACHE_ID_KEY] = currentPdfCacheIdParam;
      } else {
        try {
          const localPdfCacheId = String(window.localStorage.getItem('pathfinderPdfCacheId') || '').trim();
          if (localPdfCacheId) {
            payload[LAST_PATHFINDER_PDF_CACHE_ID_KEY] = localPdfCacheId;
          }
        } catch {
          // Ignore localStorage access issues.
        }
      }
    }

    await writeStorage(payload);
  };

  const readHints = async () => {
    const stored = await readStorage([
      LAST_PATHFINDER_PAGE_KEY,
      LAST_PATHFINDER_PDF_PAGE_KEY,
      LAST_PATHFINDER_PDF_CACHE_ID_KEY
    ]);

    return {
      lastPathfinderPageUrl: stored?.[LAST_PATHFINDER_PAGE_KEY] || '',
      lastPdfPageUrl: stored?.[LAST_PATHFINDER_PDF_PAGE_KEY] || '',
      lastPdfCacheId: stored?.[LAST_PATHFINDER_PDF_CACHE_ID_KEY] || ''
    };
  };

  const withPdfParamIfLastRoute = (candidateUrl, pdfCacheId) => {
    const normalizedCandidate = String(candidateUrl || '').trim();
    const normalizedCacheId = String(pdfCacheId || '').trim();
    if (!normalizedCandidate || !normalizedCacheId) return normalizedCandidate;

    const parsed = parseUrl(normalizedCandidate);
    if (!parsed) return normalizedCandidate;
    if (!String(parsed.pathname || '').startsWith('/last')) return normalizedCandidate;
    if (String(parsed.searchParams.get('pdf') || '').trim()) return normalizedCandidate;

    parsed.searchParams.set('pdf', normalizedCacheId);
    return parsed.toString();
  };

  const resolveTargetUrl = async (previousUrl) => {
    const hints = await readHints();
    const normalizedLastPdfCacheId = String(hints.lastPdfCacheId || '').trim();
    const fallbackUrlWithPdfParam = withPdfParamIfLastRoute(
      DEFAULT_FALLBACK_URL,
      normalizedLastPdfCacheId
    );

    const candidates = [
      withPdfParamIfLastRoute(hints.lastPdfPageUrl, normalizedLastPdfCacheId),
      withPdfParamIfLastRoute(previousUrl, normalizedLastPdfCacheId),
      withPdfParamIfLastRoute(hints.lastPathfinderPageUrl, normalizedLastPdfCacheId),
      fallbackUrlWithPdfParam,
      previousUrl,
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
      [style*="cursor"] {
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

  const enforceCursorInline = (target) => {
    if (!(target instanceof Element)) return;
    try {
      target.style.setProperty('cursor', 'none', 'important');
    } catch {
      // Ignore elements that reject inline style writes.
    }
  };

  const removeButton = () => {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
  };

  const navigateBack = async () => {
    const state = await readNavState();
    const previousUrl = String(state?.previousUrl || '').trim();
    if (isPathfinderAppUrl(previousUrl)) {
      window.history.back();
      return;
    }

    const targetUrl = await resolveTargetUrl(previousUrl);
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

    const handlePointerMovement = (event) => {
      enforceCursorInline(document.documentElement);
      if (document.body) enforceCursorInline(document.body);
      enforceCursorInline(event?.target);
    };

    document.addEventListener('pointermove', handlePointerMovement, true);
    document.addEventListener('mousemove', handlePointerMovement, true);
    document.addEventListener('mouseover', handlePointerMovement, true);

    window.addEventListener('beforeunload', () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      document.removeEventListener('pointermove', handlePointerMovement, true);
      document.removeEventListener('mousemove', handlePointerMovement, true);
      document.removeEventListener('mouseover', handlePointerMovement, true);
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
