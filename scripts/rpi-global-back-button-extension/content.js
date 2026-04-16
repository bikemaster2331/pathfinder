(() => {
  const BUTTON_ID = '__pathfinder_global_back_button__';
  const STYLE_ID = '__pathfinder_global_back_style__';

  // Update this if your kiosk app runs on a different origin.
  const DEFAULT_RETURN_URL = 'http://localhost:5173/last';

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

  const getReturnUrl = async () => {
    try {
      const stored = await chrome.storage.local.get(['lastPathfinderUrl']);
      const candidate = stored?.lastPathfinderUrl;
      if (typeof candidate === 'string' && candidate.startsWith('http')) {
        return candidate;
      }
    } catch {
      // Ignore storage failures and use default URL.
    }

    return DEFAULT_RETURN_URL;
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
    `;

    document.documentElement.appendChild(style);
  };

  const removeButton = () => {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      existing.remove();
    }
  };

  const renderButton = async () => {
    if (isPathfinderPage()) {
      removeButton();
      try {
        await chrome.storage.local.set({ lastPathfinderUrl: window.location.href });
      } catch {
        // Ignore storage errors.
      }
      return;
    }

    injectStyle();

    if (document.getElementById(BUTTON_ID)) return;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Back to PDF';

    button.addEventListener('click', async () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      const returnUrl = await getReturnUrl();
      window.location.assign(returnUrl);
    });

    document.body.appendChild(button);
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
