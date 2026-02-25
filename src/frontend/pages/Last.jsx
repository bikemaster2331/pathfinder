import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import styles from '../styles/itinerary_page/Last.module.css';

export default function Last() {
  const navigate = useNavigate();
  const location = useLocation();
  const rawPdfData = location.state?.pdfData;
  const [isIframeError, setIsIframeError] = useState(false);

  // Append toolbar=0 to the data URI for the iframe to hide browser PDF controls
  const pdfData = useMemo(() => {
    if (!rawPdfData) return null;
    // Data URIs can have fragments like #toolbar=0
    return `${rawPdfData}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`;
  }, [rawPdfData]);

  useEffect(() => {
    if (!rawPdfData) {
      console.warn("No PDF data found in navigation state.");
    }
  }, [rawPdfData]);

  const handleBackToItinerary = () => {
    navigate(-1);
  };

  const handleBackToHome = () => {
    navigate('/');
  };

  const handleDownload = () => {
    if (!rawPdfData) return;
    const link = document.createElement('a');
    link.href = rawPdfData;
    link.download = `Catanduanes_Itinerary_${Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      </div>

      <main className={styles.viewerContainer}>
        {pdfData && !isIframeError ? (
          <iframe
            src={pdfData}
            className={styles.pdfFrame}
            title="Itinerary PDF Preview"
            onError={() => setIsIframeError(true)}
          />
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.errorIcon}>⚠️</div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--app-text)' }}>Preview Unavailable</h2>
            <p style={{ color: 'var(--navbar-muted)', marginBottom: '24px' }}>
              {rawPdfData
                ? "Browser security prevented on-screen preview. Your itinerary has still been saved."
                : "We couldn't generate your itinerary preview. Please go back and try again."}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
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