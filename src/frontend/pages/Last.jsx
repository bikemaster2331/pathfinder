import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo, useRef } from 'react';
import styles from '../styles/pages/Last.module.css';
import { generateItineraryPDF } from '../utils/generatePDF';
import { generateDayMapSnapshots } from '../utils/dayMapSnapshots';
import { generateDayGoogleDirectionsLinks } from '../utils/dayDirections';
import {
  loadPdfBlobSnapshotUrl,
  clearPdfBlobSnapshot,
  savePdfBlobSnapshot
} from '../utils/pdfSnapshotStore';
import { buildPdfCacheUrl, deletePdfCacheById, uploadPdfBlobToCache } from '../utils/pdfCacheApi';
import { calculateDriveTimes, calculateTotalRoute } from '../utils/distance';
import { TRAVEL_HUBS } from '../constants/location';

const PDF_CACHE_ID_STORAGE_KEY = 'pathfinderPdfCacheId';

const readPdfCacheIdFromSearch = (search = '') => {
  const params = new URLSearchParams(String(search || ''));
  return String(params.get('pdf') || '').trim();
};

const normalizeStoredItinerary = (parsedItinerary) => (
  Array.isArray(parsedItinerary) ? { 1: parsedItinerary } : (parsedItinerary || {})
);

const resolveStoredHub = (activeHubName) => {
  const normalizedHubName = String(activeHubName || '').trim();
  const hubs = Object.values(TRAVEL_HUBS || {});
  const hub =
    TRAVEL_HUBS?.[normalizedHubName] ||
    hubs.find((item) => item?.name === normalizedHubName) ||
    hubs.find((item) => Array.isArray(item?.coordinates));

  return {
    hub,
    normalizedHubName
  };
};

const readStoredTripContext = () => {
  const itineraryRaw = localStorage.getItem('finalItinerary');
  const activeHubName = localStorage.getItem('activeHubName');
  const dateRangeRaw = localStorage.getItem('dateRange');
  if (!itineraryRaw || !activeHubName) return null;

  const parsedItinerary = JSON.parse(itineraryRaw);
  const finalItinerary = normalizeStoredItinerary(parsedItinerary);
  const dateRange = dateRangeRaw ? JSON.parse(dateRangeRaw) : null;
  const { hub, normalizedHubName } = resolveStoredHub(activeHubName);
  if (!hub) return null;

  return {
    finalItinerary,
    dateRange,
    hub,
    normalizedHubName
  };
};

export default function Last() {
  const navigate = useNavigate();
  const location = useLocation();
  const [rawPdfData, setRawPdfData] = useState(null);
  const [pdfCacheId, setPdfCacheId] = useState(() => {
    const routeId = String(location.state?.pdfCacheId || '').trim();
    if (routeId) return routeId;
    const searchId = readPdfCacheIdFromSearch(location.search);
    if (searchId) return searchId;
    return String(localStorage.getItem(PDF_CACHE_ID_STORAGE_KEY) || '').trim() || null;
  });
  const [preferImageFallbackPreview, setPreferImageFallbackPreview] = useState(false);
  const [isIframeError, setIsIframeError] = useState(false);
  const [previewBaseUrl, setPreviewBaseUrl] = useState(null);
  const [fallbackError, setFallbackError] = useState('');
  const [renderedPages, setRenderedPages] = useState([]);
  const [isRenderingPages, setIsRenderingPages] = useState(false);
  const [dayDirectionsLinks, setDayDirectionsLinks] = useState({});
  const [useImageFallbackPreview, setUseImageFallbackPreview] = useState(false);
  const [interactiveReady, setInteractiveReady] = useState(false);
  const [isPdfSourceInitialized, setIsPdfSourceInitialized] = useState(false);
  const [snapshotRecoveryAttempted, setSnapshotRecoveryAttempted] = useState(false);
  const [viewerReloadKey, setViewerReloadKey] = useState(0);
  const hasEnsuredSnapshotRef = useRef(false);
  const rawPdfDataRef = useRef(null);
  const wasBackgroundedRef = useRef(false);
  const cachePromotionAttemptedRef = useRef(false);
  const interactiveWatchdogRetriedRef = useRef(false);
  const interactiveWatchdogSourceKeyRef = useRef('');

  const isRaspberryPiBrowser = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = String(navigator.userAgent || '').toLowerCase();
    const platform = String(navigator.platform || '').toLowerCase();
    const userAgentDataPlatform = String(navigator.userAgentData?.platform || '').toLowerCase();
    const fingerprint = `${userAgent} ${platform} ${userAgentDataPlatform}`;
    return /raspberry|rpi|aarch64|armv|arm64|linux arm/.test(fingerprint);
  }, []);

  const forceImageFallbackPreview = useMemo(
    () => preferImageFallbackPreview,
    [preferImageFallbackPreview]
  );

  const viewerCropStyle = useMemo(() => ({
    '--pdf-crop-left': '0px',
    '--pdf-crop-top': '0px'
  }), []);

  // Initialize preview source in priority order:
  // 1) server-backed PDF cache id (route state or localStorage),
  // 2) route state pdfData,
  // 3) IndexedDB snapshot fallback.
  useEffect(() => {
    let cancelled = false;

    const initializePdfSource = async () => {
      const routeStatePdf = location.state?.pdfData || null;
      const routeStateCacheId = String(location.state?.pdfCacheId || '').trim();
      const searchCacheId = readPdfCacheIdFromSearch(location.search);
      const storedCacheId = String(localStorage.getItem(PDF_CACHE_ID_STORAGE_KEY) || '').trim();
      const effectiveCacheId = routeStateCacheId || searchCacheId || storedCacheId;

      if (routeStateCacheId) {
        localStorage.setItem(PDF_CACHE_ID_STORAGE_KEY, routeStateCacheId);
      }

      if (!cancelled && effectiveCacheId) {
        setPdfCacheId(effectiveCacheId);
        setRawPdfData(buildPdfCacheUrl(effectiveCacheId));
        setFallbackError('');
        setIsPdfSourceInitialized(true);
        return;
      }

      if (!cancelled && routeStatePdf) {
        setRawPdfData(routeStatePdf);
        setFallbackError('');
        setIsPdfSourceInitialized(true);
        return;
      }

      try {
        const persistedSnapshotUrl = await loadPdfBlobSnapshotUrl();
        if (cancelled) return;

        if (persistedSnapshotUrl) {
          setRawPdfData(persistedSnapshotUrl);
          setFallbackError('');
          return;
        }
      } catch (error) {
        console.warn('Failed to initialize PDF source from IndexedDB snapshot:', error);
      }

      if (!cancelled) {
        setIsPdfSourceInitialized(true);
      }
    };

    initializePdfSource();

    return () => {
      cancelled = true;
    };
  }, [location.state, location.search]);

  useEffect(() => {
    try {
      const context = readStoredTripContext();
      if (!context) {
        setDayDirectionsLinks({});
        return;
      }

      const links = generateDayGoogleDirectionsLinks({
        activeHub: context.hub,
        finalItinerary: context.finalItinerary,
        travelMode: 'driving'
      });
      setDayDirectionsLinks(links || {});
    } catch (error) {
      console.warn('Failed to build day directions links from localStorage:', error);
      setDayDirectionsLinks({});
    }
  }, []);

  // Fallback: if route state is missing (common in kiosk/reload scenarios),
  // regenerate PDF from saved itinerary info.
  useEffect(() => {
    if (!isPdfSourceInitialized) return;
    if (rawPdfData) return;

    let cancelled = false;

    const regeneratePdfFallback = async () => {
      try {
        const persistedSnapshotUrl = await loadPdfBlobSnapshotUrl();
        if (!cancelled && persistedSnapshotUrl) {
          setRawPdfData(persistedSnapshotUrl);
          setFallbackError('');
          return;
        }

        const context = readStoredTripContext();
        if (!context) return;

        if (!cancelled) {
          setFallbackError('');
        }

        const {
          finalItinerary,
          dateRange,
          hub,
          normalizedHubName
        } = context;

        const allSpotsFlat = [];
        Object.keys(finalItinerary)
          .sort((a, b) => Number(a) - Number(b))
          .forEach((day) => {
            const daySpots = Array.isArray(finalItinerary[day]) ? finalItinerary[day] : [];
            allSpotsFlat.push(...daySpots);
          });

        if (!allSpotsFlat.length) return;

        const routeReadySpots = allSpotsFlat.filter(
          (spot) => Array.isArray(spot?.geometry?.coordinates) && spot.geometry.coordinates.length === 2
        );

        let fullTripDistance = 0;
        let fullTripDriveData = [];
        if (routeReadySpots.length > 0) {
          try {
            fullTripDistance = calculateTotalRoute(hub, routeReadySpots);
            fullTripDriveData = calculateDriveTimes(hub, routeReadySpots);
          } catch (routeError) {
            console.warn('Route metrics failed; continuing with PDF generation only:', routeError);
            fullTripDistance = 0;
            fullTripDriveData = [];
          }
        }

        let dayMapSnapshots = {};
        try {
          dayMapSnapshots = await generateDayMapSnapshots({
            activeHub: hub,
            finalItinerary
          });
        } catch (snapshotError) {
          console.warn('Map snapshots failed in /last fallback regeneration:', snapshotError);
          dayMapSnapshots = {};
        }

        let linksForPdf = {};
        try {
          linksForPdf = generateDayGoogleDirectionsLinks({
            activeHub: hub,
            finalItinerary,
            travelMode: 'driving'
          });
        } catch (directionsError) {
          console.warn('Day directions failed in /last fallback regeneration:', directionsError);
          linksForPdf = {};
        }

        if (!cancelled) {
          setDayDirectionsLinks(linksForPdf || {});
        }

        const regeneratedPdf = generateItineraryPDF({
          activeHubName: hub.name || normalizedHubName || 'Trip',
          dateRange,
          addedSpots: finalItinerary,
          totalDistance: fullTripDistance,
          driveData: fullTripDriveData,
          dayMapSnapshots,
          dayDirectionsLinks: linksForPdf,
          saveFile: false,
          includeBlob: true
        });

        let pdfData = regeneratedPdf?.pdfData || null;
        const pdfBlob = regeneratedPdf?.pdfBlob || null;
        let createdPdfCacheId = null;

        if (pdfBlob instanceof Blob) {
          try {
            const uploadedPdf = await uploadPdfBlobToCache(pdfBlob);
            createdPdfCacheId = uploadedPdf?.id || null;
            if (uploadedPdf?.url) {
              pdfData = uploadedPdf.url;
            }
          } catch (uploadError) {
            console.warn('PDF cache upload failed in /last regeneration fallback:', uploadError);
          }
        }

        if (!cancelled && pdfData) {
          if (createdPdfCacheId) {
            localStorage.setItem(PDF_CACHE_ID_STORAGE_KEY, createdPdfCacheId);
            setPdfCacheId(createdPdfCacheId);
          }
          setRawPdfData(pdfData);
        }
      } catch (error) {
        if (!cancelled) {
          setFallbackError(error?.message || String(error));
        }
        console.error('Failed to regenerate PDF preview from localStorage:', error);
      }
    };

    regeneratePdfFallback();

    return () => {
      cancelled = true;
    };
  }, [rawPdfData, isPdfSourceInitialized]);

  // Normalize preview source:
  // - keep blob/http URLs as-is
  // - convert large data URI PDFs to blob URLs for better browser compatibility
  useEffect(() => {
    let createdBlobUrl = null;

    if (!rawPdfData) {
      setPreviewBaseUrl(null);
      return undefined;
    }

    if (rawPdfData.startsWith('data:application/pdf')) {
      try {
        const base64Data = rawPdfData.split(',')[1];
        const byteString = atob(base64Data);
        const byteNumbers = new Array(byteString.length);

        for (let i = 0; i < byteString.length; i++) {
          byteNumbers[i] = byteString.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        createdBlobUrl = URL.createObjectURL(blob);
        setPreviewBaseUrl(createdBlobUrl);
      } catch (err) {
        console.error('Failed to convert data URI to Blob URL:', err);
        setPreviewBaseUrl(rawPdfData);
      }
    } else {
      setPreviewBaseUrl(rawPdfData);
    }

    return () => {
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [rawPdfData]);

  // Prefer native viewer chrome suppression via URL fragment when possible.
  // Raspberry Pi Chromium has stability issues with PDF fragments; keep raw URL there.
  const pdfData = useMemo(() => {
    if (!previewBaseUrl) return null;
    if (isRaspberryPiBrowser) return previewBaseUrl;

    const fragment = '#toolbar=0&navpanes=0&scrollbar=0&view=FitH';
    if (previewBaseUrl.includes('#')) return previewBaseUrl;
    return `${previewBaseUrl}${fragment}`;
  }, [previewBaseUrl, isRaspberryPiBrowser]);

  // Keep watchdog retries keyed to the logical PDF source, not cache-busted reload URLs.
  const interactiveWatchdogSourceKey = useMemo(() => {
    const normalizedCacheId = String(pdfCacheId || '').trim();
    if (normalizedCacheId) {
      return `cache:${normalizedCacheId}`;
    }

    const source = String(previewBaseUrl || rawPdfData || '').trim();
    if (!source) return '';

    return source
      .replace(/([?&])t=\d+/g, '$1')
      .replace(/[?&]$/, '')
      .replace(/#.*$/, '');
  }, [pdfCacheId, previewBaseUrl, rawPdfData]);

  useEffect(() => {
    if (!pdfData) {
      setUseImageFallbackPreview(false);
      setInteractiveReady(false);
      setIsIframeError(false);
      setRenderedPages([]);
      setIsRenderingPages(false);
      setSnapshotRecoveryAttempted(false);
      hasEnsuredSnapshotRef.current = false;
      interactiveWatchdogRetriedRef.current = false;
      interactiveWatchdogSourceKeyRef.current = '';
      return;
    }

    setUseImageFallbackPreview(forceImageFallbackPreview);
    setInteractiveReady(false);
    setIsIframeError(false);
    setRenderedPages([]);
    setIsRenderingPages(false);
    setSnapshotRecoveryAttempted(false);
  }, [pdfData, forceImageFallbackPreview]);

  useEffect(() => {
    if (!pdfData) return;
    if (interactiveWatchdogSourceKeyRef.current === interactiveWatchdogSourceKey) return;
    interactiveWatchdogSourceKeyRef.current = interactiveWatchdogSourceKey;
    interactiveWatchdogRetriedRef.current = false;
  }, [pdfData, interactiveWatchdogSourceKey]);

  useEffect(() => {
    if (!interactiveWatchdogSourceKey) return;
    setPreferImageFallbackPreview(false);
  }, [interactiveWatchdogSourceKey]);

  // On history return or app re-focus after visiting external pages,
  // force-restore preview from IndexedDB snapshot and remount the viewer.
  useEffect(() => {
    if (!isPdfSourceInitialized) return undefined;

    const isBackForwardNavigation = () => {
      if (typeof window === 'undefined' || typeof window.performance === 'undefined') return false;
      const navEntries = window.performance.getEntriesByType('navigation');
      const navEntry = Array.isArray(navEntries) && navEntries.length > 0 ? navEntries[0] : null;
      return navEntry?.type === 'back_forward';
    };

    const restoreFromSnapshot = async () => {
      const effectiveCacheId = String(
        localStorage.getItem(PDF_CACHE_ID_STORAGE_KEY) || pdfCacheId || ''
      ).trim();

      if (effectiveCacheId) {
        setPdfCacheId(effectiveCacheId);
        setRawPdfData(buildPdfCacheUrl(effectiveCacheId));
        setFallbackError('');
        setUseImageFallbackPreview(forceImageFallbackPreview);
        setInteractiveReady(false);
        setIsIframeError(false);
        setSnapshotRecoveryAttempted(false);
        setViewerReloadKey((current) => current + 1);
        return true;
      }

      try {
        const persistedSnapshotUrl = await loadPdfBlobSnapshotUrl();
        if (persistedSnapshotUrl) {
          hasEnsuredSnapshotRef.current = true;
          setRawPdfData(persistedSnapshotUrl);
          setFallbackError('');
          setUseImageFallbackPreview(forceImageFallbackPreview);
          setInteractiveReady(false);
          setIsIframeError(false);
          setSnapshotRecoveryAttempted(false);
          setViewerReloadKey((current) => current + 1);
          return true;
        }
      } catch (error) {
        console.warn('Failed to restore PDF snapshot after external navigation:', error);
      }

      hasEnsuredSnapshotRef.current = false;
      if (String(rawPdfDataRef.current || '').startsWith('blob:')) {
        setRawPdfData(null);
      }
      return false;
    };

    const handlePageShow = (event) => {
      const isHistoryReturn = Boolean(event?.persisted) || isBackForwardNavigation();
      if (!isHistoryReturn) return;
      void restoreFromSnapshot();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wasBackgroundedRef.current = true;
        return;
      }

      if (document.visibilityState === 'visible' && wasBackgroundedRef.current) {
        wasBackgroundedRef.current = false;
        void restoreFromSnapshot();
      }
    };

    const handleWindowFocus = () => {
      if (!wasBackgroundedRef.current) return;
      wasBackgroundedRef.current = false;
      void restoreFromSnapshot();
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPdfSourceInitialized, pdfCacheId, forceImageFallbackPreview]);

  // Ensure we always keep a durable PDF snapshot in IndexedDB while on /last.
  // This avoids stale blob-url failures after external navigation.
  useEffect(() => {
    if (!isPdfSourceInitialized || !rawPdfData) return;
    if (hasEnsuredSnapshotRef.current) return;

    let cancelled = false;

    const ensureSnapshot = async () => {
      try {
        let snapshotBlob = null;

        if (rawPdfData.startsWith('data:application/pdf')) {
          const base64Data = rawPdfData.split(',')[1];
          const byteString = atob(base64Data);
          const byteNumbers = new Array(byteString.length);

          for (let i = 0; i < byteString.length; i += 1) {
            byteNumbers[i] = byteString.charCodeAt(i);
          }

          snapshotBlob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
        } else {
          const response = await fetch(rawPdfData);
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF source (${response.status})`);
          }
          snapshotBlob = await response.blob();
        }

        if (!cancelled && snapshotBlob instanceof Blob) {
          const saved = await savePdfBlobSnapshot(snapshotBlob);
          if (saved) {
            hasEnsuredSnapshotRef.current = true;
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to ensure durable PDF snapshot from current source:', error);
        }
      }
    };

    ensureSnapshot();

    return () => {
      cancelled = true;
    };
  }, [isPdfSourceInitialized, rawPdfData]);

  // When /last lands on a blob/data source (usually after upload hiccup),
  // immediately promote it to the server cache so history navigation remains stable.
  useEffect(() => {
    if (!rawPdfData || pdfCacheId) return;
    if (cachePromotionAttemptedRef.current) return;

    const isBlobLikeSource = rawPdfData.startsWith('blob:') || rawPdfData.startsWith('data:application/pdf');
    if (!isBlobLikeSource) return;

    let cancelled = false;
    cachePromotionAttemptedRef.current = true;

    const promotePreviewToServerCache = async () => {
      try {
        const sourceResponse = await fetch(rawPdfData);
        if (!sourceResponse.ok) {
          throw new Error(`Unable to read local PDF source (${sourceResponse.status})`);
        }

        const blob = await sourceResponse.blob();
        if (!(blob instanceof Blob)) {
          throw new Error('Local PDF source did not resolve to a Blob');
        }

        const uploadedPdf = await uploadPdfBlobToCache(blob);
        const createdPdfCacheId = String(uploadedPdf?.id || '').trim();
        if (!createdPdfCacheId || cancelled) return;

        localStorage.setItem(PDF_CACHE_ID_STORAGE_KEY, createdPdfCacheId);
        setPdfCacheId(createdPdfCacheId);
        setRawPdfData(buildPdfCacheUrl(createdPdfCacheId));
        setUseImageFallbackPreview(forceImageFallbackPreview);
        setInteractiveReady(false);
        setIsIframeError(false);
        setSnapshotRecoveryAttempted(false);
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to promote local PDF preview to server cache id:', error);
        }
      }
    };

    void promotePreviewToServerCache();

    return () => {
      cancelled = true;
    };
  }, [rawPdfData, pdfCacheId, forceImageFallbackPreview]);

  // Safety net for Chromium builds where <object>/<embed> hangs without firing load/error.
  // Retry the server cache URL once, then fall back to image preview instead of a black screen.
  useEffect(() => {
    if (!pdfData || useImageFallbackPreview || interactiveReady) return undefined;

    const timeoutMs = isRaspberryPiBrowser ? 2800 : 6000;
    const timeoutId = window.setTimeout(() => {
      if (interactiveReady || useImageFallbackPreview) return;

      const activeCacheId = String(localStorage.getItem(PDF_CACHE_ID_STORAGE_KEY) || pdfCacheId || '').trim();
      if (activeCacheId && !interactiveWatchdogRetriedRef.current) {
        interactiveWatchdogRetriedRef.current = true;
        setRawPdfData(buildPdfCacheUrl(activeCacheId, { appendTimestamp: true }));
        setViewerReloadKey((current) => current + 1);
        return;
      }

      setPreferImageFallbackPreview(true);
      setUseImageFallbackPreview(true);
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    pdfData,
    useImageFallbackPreview,
    interactiveReady,
    pdfCacheId,
    isRaspberryPiBrowser,
    interactiveWatchdogSourceKey,
    viewerReloadKey
  ]);

  // Render PDF pages into images only when interactive preview falls back.
  // We also preserve external link annotations so directions can still be opened.
  useEffect(() => {
    if (!useImageFallbackPreview) return undefined;

    let cancelled = false;

    const renderPdfPages = async () => {
      const source = previewBaseUrl || rawPdfData;
      if (!source) {
        setRenderedPages([]);
        setIsRenderingPages(false);
        return;
      }

      setIsRenderingPages(true);
      setRenderedPages([]);

      try {
        const pdfjs = await import('pdfjs-dist');
        const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

        const loadingTask = pdfjs.getDocument(source);
        const pdf = await loadingTask.promise;
        const pages = [];
        const renderScale = isRaspberryPiBrowser ? 0.92 : 1.2;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: renderScale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d', { alpha: false });
          if (!context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);

          await page.render({
            canvasContext: context,
            viewport
          }).promise;

          const annotations = await page.getAnnotations({ intent: 'display' });
          const links = [];

          if (Array.isArray(annotations)) {
            annotations.forEach((annotation) => {
              const href = String(annotation?.url || annotation?.unsafeUrl || '').trim();
              if (!href) return;
              if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href) && !/^tel:/i.test(href)) return;
              if (!Array.isArray(annotation?.rect) || annotation.rect.length < 4) return;

              const mappedRect = viewport.convertToViewportRectangle(annotation.rect);
              if (!Array.isArray(mappedRect) || mappedRect.length < 4) return;

              const left = Math.max(0, Math.min(mappedRect[0], mappedRect[2]));
              const top = Math.max(0, Math.min(mappedRect[1], mappedRect[3]));
              const width = Math.abs(mappedRect[0] - mappedRect[2]);
              const height = Math.abs(mappedRect[1] - mappedRect[3]);
              if (width < 2 || height < 2) return;

              links.push({
                href,
                left,
                top,
                width,
                height
              });
            });
          }

          pages.push({
            imageSrc: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
            links
          });

          if (!cancelled) {
            setRenderedPages([...pages]);
          }
        }

        if (!cancelled) {
          setIsIframeError(false);
        }
      } catch (error) {
        console.error('Custom PDF page rendering failed after fallback:', error);
        if (!cancelled) {
          setRenderedPages([]);
        }
      } finally {
        if (!cancelled) {
          setIsRenderingPages(false);
        }
      }
    };

    renderPdfPages();

    return () => {
      cancelled = true;
    };
  }, [useImageFallbackPreview, previewBaseUrl, rawPdfData, isRaspberryPiBrowser]);

  const dayDirectionEntries = useMemo(() => {
    return Object.keys(dayDirectionsLinks || {})
      .sort((a, b) => Number(a) - Number(b))
      .map((dayNumber) => {
        const entry = dayDirectionsLinks?.[dayNumber] || {};
        return {
          dayNumber,
          hasRoute: Boolean(entry?.hasRoute && entry?.url),
          url: entry?.url || '',
          reason: entry?.reason || ''
        };
      });
  }, [dayDirectionsLinks]);

  useEffect(() => {
    if (isPdfSourceInitialized && !rawPdfData) {
      console.warn('No PDF data found in navigation state.');
    }
  }, [rawPdfData, isPdfSourceInitialized]);

  useEffect(() => {
    rawPdfDataRef.current = rawPdfData;
  }, [rawPdfData]);

  useEffect(() => {
    const normalizedId = String(pdfCacheId || '').trim();
    if (normalizedId) {
      localStorage.setItem(PDF_CACHE_ID_STORAGE_KEY, normalizedId);
    } else {
      localStorage.removeItem(PDF_CACHE_ID_STORAGE_KEY);
    }

    if (typeof window === 'undefined') return;

    const currentUrl = new URL(window.location.href);
    const currentParam = String(currentUrl.searchParams.get('pdf') || '').trim();
    if (normalizedId && currentParam !== normalizedId) {
      currentUrl.searchParams.set('pdf', normalizedId);
      window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      return;
    }

    if (!normalizedId && currentParam) {
      currentUrl.searchParams.delete('pdf');
      window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    }
  }, [pdfCacheId]);

  const handleBackToItinerary = () => {
    navigate(-1);
  };

  const handleBackToHome = async () => {
    try {
      const activeCacheId = String(localStorage.getItem(PDF_CACHE_ID_STORAGE_KEY) || pdfCacheId || '').trim();
      if (activeCacheId) {
        await deletePdfCacheById(activeCacheId);
      }
      localStorage.removeItem(PDF_CACHE_ID_STORAGE_KEY);
      setPdfCacheId(null);
      await clearPdfBlobSnapshot();
      hasEnsuredSnapshotRef.current = false;
    } finally {
      navigate('/');
    }
  };

  const handleDownload = () => {
    const target = previewBaseUrl || rawPdfData;
    if (!target) return;
    const link = document.createElement('a');
    link.href = target;
    link.download = `Catanduanes_Itinerary_${Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInNewTab = () => {
    const target = previewBaseUrl || rawPdfData;
    if (!target) return;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  const handleInteractivePreviewLoaded = () => {
    setInteractiveReady(true);
    setIsIframeError(false);
  };

  const restoreFromIndexedSnapshot = async () => {
    try {
      const recoveredSnapshotUrl = await loadPdfBlobSnapshotUrl();
      if (recoveredSnapshotUrl) {
        hasEnsuredSnapshotRef.current = true;
        setRawPdfData(recoveredSnapshotUrl);
        setUseImageFallbackPreview(forceImageFallbackPreview);
        setInteractiveReady(false);
        setIsIframeError(false);
        return true;
      }
    } catch (error) {
      console.warn('Failed to restore PDF snapshot from IndexedDB:', error);
    }

    return false;
  };

  const handleInteractivePreviewError = async () => {
    setIsIframeError(true);

    if (!snapshotRecoveryAttempted) {
      setSnapshotRecoveryAttempted(true);

      const activeCacheId = String(localStorage.getItem(PDF_CACHE_ID_STORAGE_KEY) || pdfCacheId || '').trim();
      if (activeCacheId) {
        setPdfCacheId(activeCacheId);
        setRawPdfData(buildPdfCacheUrl(activeCacheId, { appendTimestamp: true }));
        setUseImageFallbackPreview(forceImageFallbackPreview);
        setInteractiveReady(false);
        setIsIframeError(false);
        setViewerReloadKey((current) => current + 1);
        return;
      }

      const restoredFromSnapshot = await restoreFromIndexedSnapshot();
      if (restoredFromSnapshot) {
        return;
      }
    }

    const activeCacheIdAfterRetry = String(localStorage.getItem(PDF_CACHE_ID_STORAGE_KEY) || pdfCacheId || '').trim();
    if (activeCacheIdAfterRetry) {
      let cacheFetchFailed = false;
      try {
        const refreshedCacheResponse = await fetch(
          buildPdfCacheUrl(activeCacheIdAfterRetry, { appendTimestamp: true }),
          { cache: 'no-store' }
        );
        if (refreshedCacheResponse.ok) {
          const refreshedBlob = await refreshedCacheResponse.blob();
          if (refreshedBlob instanceof Blob) {
            const persisted = await savePdfBlobSnapshot(refreshedBlob);
            if (persisted) {
              const restoredFromSnapshot = await restoreFromIndexedSnapshot();
              if (restoredFromSnapshot) {
                return;
              }
            }
          }
        } else {
          cacheFetchFailed = true;
        }
      } catch (error) {
        cacheFetchFailed = true;
        console.warn('Failed to refresh server-backed PDF cache after preview error:', error);
      }

      if (cacheFetchFailed) {
        localStorage.removeItem(PDF_CACHE_ID_STORAGE_KEY);
        setPdfCacheId(null);
        hasEnsuredSnapshotRef.current = false;
        setRawPdfData(null);
        return;
      }
    }

    const restoredFromSnapshot = await restoreFromIndexedSnapshot();
    if (restoredFromSnapshot) {
      return;
    }

    if (rawPdfData?.startsWith('blob:')) {
      // Blob URL became stale and snapshot recovery failed; trigger robust regeneration path.
      setRawPdfData(null);
      return;
    }

    setPreferImageFallbackPreview(true);
    setUseImageFallbackPreview(true);
  };

  return (
    <div className={styles.container} style={viewerCropStyle}>
      {/* Floating Controls Overlay */}
      <div className={styles.floatingControls}>
        <button
          className={styles.secondaryButton}
          onClick={handleBackToItinerary}
          title="Return to Itinerary Editor"
        >
          Back to Itinerary
        </button>
        <button
          className={styles.primaryButton}
          onClick={handleBackToHome}
          title="Finish and Return to Home"
        >
          Finish & Home
        </button>
        {(rawPdfData || previewBaseUrl) && (
          <button
            className={styles.downloadButton}
            onClick={handleDownload}
            title="Download PDF"
          >
            Download PDF
          </button>
        )}
      </div>

      {dayDirectionEntries.some((entry) => entry.hasRoute) && (
        <div className={styles.dayDirectionsFallback}>
          <span className={styles.dayDirectionsFallbackLabel}>Directions:</span>
          {dayDirectionEntries
            .filter((entry) => entry.hasRoute)
            .map((entry) => (
              <a
                key={`fallback-day-${entry.dayNumber}`}
                href={entry.url}
                className={styles.dayDirectionsFallbackLink}
                title={`Open Day ${entry.dayNumber} directions`}
              >
                Day {entry.dayNumber}
              </a>
            ))}
        </div>
      )}

      <main className={styles.viewerContainer}>
        {!useImageFallbackPreview && pdfData ? (
          <div className={styles.pdfViewportCrop}>
            <object
              key={`pdf-object-${viewerReloadKey}-${pdfData || 'none'}`}
              data={pdfData}
              type="application/pdf"
              className={styles.pdfFrame}
              aria-label="Itinerary PDF Preview"
              onLoad={handleInteractivePreviewLoaded}
              onError={handleInteractivePreviewError}
            >
              <embed
                key={`pdf-embed-${viewerReloadKey}-${pdfData || 'none'}`}
                src={pdfData}
                type="application/pdf"
                className={styles.pdfFrame}
                onLoad={handleInteractivePreviewLoaded}
                onError={handleInteractivePreviewError}
              />
            </object>
            {!interactiveReady && (
              <div className={styles.interactiveLoadingHint}>
                Loading interactive preview...
              </div>
            )}
          </div>
        ) : useImageFallbackPreview ? (
          renderedPages.length > 0 ? (
            <div className={styles.paperStack}>
              {renderedPages.map((page, index) => (
                <div key={`pdf-page-${index + 1}`} className={styles.paperPageLayer}>
                  <img
                    src={page.imageSrc}
                    alt={`PDF Page ${index + 1}`}
                    className={styles.paperPage}
                    loading="lazy"
                  />
                  {Array.isArray(page.links) && page.links.map((link, linkIndex) => (
                    <a
                      key={`pdf-page-${index + 1}-link-${linkIndex + 1}`}
                      href={link.href}
                      className={styles.pageLinkOverlay}
                      style={{
                        left: `${(link.left / Math.max(page.width || 0, 1)) * 100}%`,
                        top: `${(link.top / Math.max(page.height || 0, 1)) * 100}%`,
                        width: `${(link.width / Math.max(page.width || 0, 1)) * 100}%`,
                        height: `${(link.height / Math.max(page.height || 0, 1)) * 100}%`
                      }}
                      title={`Open PDF link on page ${index + 1}`}
                      aria-label={`Open PDF link on page ${index + 1}`}
                    />
                  ))}
                </div>
              ))}
              {isRenderingPages && (
                <div className={styles.renderingState}>Loading remaining pages...</div>
              )}
            </div>
          ) : isRenderingPages ? (
            <div className={styles.renderingState}>Rendering PDF preview...</div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.errorIcon}>⚠️</div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--app-text)' }}>Preview Unavailable</h2>
              <p style={{ color: 'var(--navbar-muted)', marginBottom: '24px' }}>
                Browser preview fallback failed. You can still download and open the PDF directly.
              </p>
              {(rawPdfData || previewBaseUrl) && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className={styles.downloadButton} onClick={handleDownload}>
                    Download PDF
                  </button>
                  <button className={styles.secondaryButton} onClick={handleOpenInNewTab}>
                    Open in New Tab
                  </button>
                </div>
              )}
            </div>
          )
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.errorIcon}>⚠️</div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--app-text)' }}>Preview Unavailable</h2>
            <p style={{ color: 'var(--navbar-muted)', marginBottom: '24px' }}>
              {isIframeError
                ? 'Interactive preview failed to load. Retrying fallback...'
                : rawPdfData
                  ? 'Browser security prevented on-screen preview. Your itinerary has still been saved.'
                  : "We couldn't generate your itinerary preview. Please go back and try again."}
            </p>
            {!rawPdfData && fallbackError && (
              <p style={{ color: '#b91c1c', marginBottom: '18px' }}>
                {`Debug: ${fallbackError}`}
              </p>
            )}
            <div style={{ display: 'flex', gap: '12px' }}>
              {(rawPdfData || previewBaseUrl) && (
                <>
                  <button className={styles.downloadButton} onClick={handleDownload}>
                    Download PDF
                  </button>
                  <button className={styles.secondaryButton} onClick={handleOpenInNewTab}>
                    Open in New Tab
                  </button>
                </>
              )}
              <button className={styles.secondaryButton} onClick={handleBackToItinerary}>
                Go Back
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
