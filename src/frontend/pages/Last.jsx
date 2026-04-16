import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import styles from '../styles/pages/Last.module.css';
import { generateItineraryPDF } from '../utils/generatePDF';
import { generateDayMapSnapshots } from '../utils/dayMapSnapshots';
import { generateDayGoogleDirectionsLinks } from '../utils/dayDirections';
import { calculateDriveTimes, calculateTotalRoute } from '../utils/distance';
import { TRAVEL_HUBS } from '../constants/location';

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

const LAST_PDF_SNAPSHOT_KEY = 'pathfinder:lastGeneratedPdfDataUri';

const readPersistedPdfSnapshot = () => {
  try {
    const value = localStorage.getItem(LAST_PDF_SNAPSHOT_KEY);
    return (typeof value === 'string' && value.startsWith('data:application/pdf')) ? value : null;
  } catch {
    return null;
  }
};

const persistPdfSnapshotIfDataUri = (value) => {
  if (typeof value !== 'string' || !value.startsWith('data:application/pdf')) return;

  try {
    localStorage.setItem(LAST_PDF_SNAPSHOT_KEY, value);
  } catch (error) {
    console.warn('Failed to persist /last PDF snapshot:', error);
  }
};

export default function Last() {
  const navigate = useNavigate();
  const location = useLocation();
  const [rawPdfData, setRawPdfData] = useState(
    () => location.state?.pdfData || readPersistedPdfSnapshot() || null
  );
  const [isIframeError, setIsIframeError] = useState(false);
  const [previewBaseUrl, setPreviewBaseUrl] = useState(null);
  const [fallbackError, setFallbackError] = useState('');
  const [renderedPages, setRenderedPages] = useState([]);
  const [isRenderingPages, setIsRenderingPages] = useState(false);
  const [dayDirectionsLinks, setDayDirectionsLinks] = useState({});
  const [useImageFallbackPreview, setUseImageFallbackPreview] = useState(false);
  const [interactiveReady, setInteractiveReady] = useState(false);

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

  useEffect(() => {
    persistPdfSnapshotIfDataUri(rawPdfData);
  }, [rawPdfData]);

  // Fallback: if route state is missing (common in kiosk/reload scenarios),
  // regenerate PDF from saved itinerary info.
  useEffect(() => {
    if (rawPdfData) return;

    let cancelled = false;

    const regeneratePdfFallback = async () => {
      try {
        const context = readStoredTripContext();
        if (!context) {
          const persistedSnapshot = readPersistedPdfSnapshot();
          if (!cancelled && persistedSnapshot) {
            setRawPdfData(persistedSnapshot);
            setFallbackError('');
          }
          return;
        }

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

        if (!allSpotsFlat.length) {
          const persistedSnapshot = readPersistedPdfSnapshot();
          if (!cancelled && persistedSnapshot) {
            setRawPdfData(persistedSnapshot);
          }
          return;
        }

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
          saveFile: false
        });

        if (!cancelled && regeneratedPdf) {
          setRawPdfData(regeneratedPdf);
        }
      } catch (error) {
        const persistedSnapshot = readPersistedPdfSnapshot();
        if (!cancelled && persistedSnapshot) {
          setRawPdfData(persistedSnapshot);
        }
        if (!cancelled) {
          setFallbackError(persistedSnapshot ? '' : (error?.message || String(error)));
        }
        console.error('Failed to regenerate PDF preview from localStorage:', error);
      }
    };

    regeneratePdfFallback();

    return () => {
      cancelled = true;
    };
  }, [rawPdfData]);

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

  // Append toolbar params only for non-blob URLs.
  // Some Chromium builds on Raspberry Pi fail to render blob PDFs with fragments.
  const pdfData = useMemo(() => {
    if (!previewBaseUrl) return null;
    if (previewBaseUrl.startsWith('blob:')) return previewBaseUrl;
    return `${previewBaseUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`;
  }, [previewBaseUrl]);

  useEffect(() => {
    if (!pdfData) {
      setUseImageFallbackPreview(false);
      setInteractiveReady(false);
      setIsIframeError(false);
      setRenderedPages([]);
      setIsRenderingPages(false);
      return;
    }

    setUseImageFallbackPreview(false);
    setInteractiveReady(false);
    setIsIframeError(false);
    setRenderedPages([]);
    setIsRenderingPages(false);
  }, [pdfData]);

  useEffect(() => {
    if (!pdfData || useImageFallbackPreview || interactiveReady) return undefined;

    const timeoutId = window.setTimeout(() => {
      setUseImageFallbackPreview(true);
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pdfData, useImageFallbackPreview, interactiveReady]);

  // Render PDF pages into images only when interactive preview falls back.
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

      try {
        const pdfjs = await import('pdfjs-dist');
        const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

        const loadingTask = pdfjs.getDocument(source);
        const pdf = await loadingTask.promise;
        const pages = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.4 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d', { alpha: false });
          if (!context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);

          await page.render({
            canvasContext: context,
            viewport
          }).promise;

          pages.push(canvas.toDataURL('image/png'));
        }

        if (!cancelled) {
          setRenderedPages(pages);
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
  }, [useImageFallbackPreview, previewBaseUrl, rawPdfData]);

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
    if (!rawPdfData) {
      console.warn('No PDF data found in navigation state.');
    }
  }, [rawPdfData]);

  const handleBackToItinerary = () => {
    navigate(-1);
  };

  const handleBackToHome = () => {
    navigate('/');
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

  const handleInteractivePreviewError = () => {
    setIsIframeError(true);
    setUseImageFallbackPreview(true);
  };

  return (
    <div className={styles.container}>
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

      {useImageFallbackPreview && dayDirectionEntries.some((entry) => entry.hasRoute) && (
        <div className={styles.dayDirectionsFallback}>
          <span className={styles.dayDirectionsFallbackLabel}>Directions:</span>
          {dayDirectionEntries
            .filter((entry) => entry.hasRoute)
            .map((entry) => (
              <a
                key={`fallback-day-${entry.dayNumber}`}
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
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
              data={pdfData}
              type="application/pdf"
              className={styles.pdfFrame}
              aria-label="Itinerary PDF Preview"
              onLoad={handleInteractivePreviewLoaded}
              onError={handleInteractivePreviewError}
            >
              <embed
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
          isRenderingPages ? (
            <div className={styles.renderingState}>Rendering PDF preview...</div>
          ) : renderedPages.length > 0 ? (
            <div className={styles.paperStack}>
              {renderedPages.map((pageImage, index) => (
                <img
                  key={`pdf-page-${index + 1}`}
                  src={pageImage}
                  alt={`PDF Page ${index + 1}`}
                  className={styles.paperPage}
                  loading="lazy"
                />
              ))}
            </div>
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
