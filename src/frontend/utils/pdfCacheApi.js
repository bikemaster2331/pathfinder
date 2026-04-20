const PDF_CACHE_ROUTE = '/api/pdf-cache';

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

export const getApiBaseUrl = () => {
  const envBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_URL || '');
  if (envBaseUrl) return envBaseUrl;

  if (typeof window !== 'undefined' && window.location) {
    const { origin, protocol, hostname, port } = window.location;
    const isFrontendDevPort = port === '5173' || port === '4173';
    if (isFrontendDevPort) {
      return `${protocol}//${hostname}:8000`;
    }
    return trimTrailingSlash(origin);
  }

  return 'http://127.0.0.1:8000';
};

const toAbsoluteUrl = (urlPath) => {
  if (!urlPath) return '';
  if (String(urlPath).startsWith('http://') || String(urlPath).startsWith('https://')) {
    return String(urlPath);
  }
  return `${getApiBaseUrl()}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
};

export const buildPdfCacheUrl = (pdfCacheId, options = {}) => {
  const normalizedId = encodeURIComponent(String(pdfCacheId || '').trim());
  if (!normalizedId) return '';

  const appendTimestamp = Boolean(options?.appendTimestamp);
  const timestampSuffix = appendTimestamp ? `?t=${Date.now()}` : '';
  return `${getApiBaseUrl()}${PDF_CACHE_ROUTE}/${normalizedId}.pdf${timestampSuffix}`;
};

export const uploadPdfBlobToCache = async (pdfBlob) => {
  if (!(pdfBlob instanceof Blob)) {
    throw new Error('Cannot upload PDF: payload is not a Blob');
  }

  const uploadUrl = `${getApiBaseUrl()}${PDF_CACHE_ROUTE}`;
  const formData = new FormData();
  formData.append('file', pdfBlob, `itinerary_${Date.now()}.pdf`);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`PDF cache upload failed (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  const pdfCacheId = String(payload?.id || '').trim();
  if (!pdfCacheId) {
    throw new Error('PDF cache upload succeeded but no cache id was returned');
  }

  const url = payload?.url ? toAbsoluteUrl(payload.url) : buildPdfCacheUrl(pdfCacheId);
  return {
    id: pdfCacheId,
    url
  };
};

export const deletePdfCacheById = async (pdfCacheId) => {
  const normalizedId = encodeURIComponent(String(pdfCacheId || '').trim());
  if (!normalizedId) return false;

  const deleteUrl = `${getApiBaseUrl()}${PDF_CACHE_ROUTE}/${normalizedId}`;
  try {
    const response = await fetch(deleteUrl, { method: 'DELETE' });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => ({}));
    return Boolean(payload?.deleted);
  } catch {
    return false;
  }
};

export const finishPathfinderSession = async ({ pdfCacheId } = {}) => {
  const finishUrl = `${getApiBaseUrl()}/api/session/finish`;
  const payload = {
    pdf_cache_id: String(pdfCacheId || '').trim() || null
  };

  const response = await fetch(finishUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Failed to finish Pathfinder session (${response.status}): ${detail}`);
  }

  return response.json().catch(() => ({}));
};

export const createPdfShareSession = async (pdfCacheId) => {
  const normalizedId = encodeURIComponent(String(pdfCacheId || '').trim());
  if (!normalizedId) {
    throw new Error('Cannot create PDF share session: missing cache id');
  }

  const shareUrl = `${getApiBaseUrl()}${PDF_CACHE_ROUTE}/${normalizedId}/share`;
  const response = await fetch(shareUrl, {
    method: 'POST'
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Failed to create PDF share session (${response.status}): ${detail}`);
  }

  const payload = await response.json().catch(() => ({}));
  return {
    shareId: String(payload?.share_id || '').trim(),
    shareUrl: toAbsoluteUrl(payload?.share_url || ''),
    downloadUrl: toAbsoluteUrl(payload?.download_url || ''),
    alternateShareUrls: Array.isArray(payload?.alternate_share_urls)
      ? payload.alternate_share_urls.map((entry) => toAbsoluteUrl(entry)).filter(Boolean)
      : [],
    policy: String(payload?.policy || '').trim() || 'session_until_finish'
  };
};
