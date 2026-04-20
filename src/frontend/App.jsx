import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Analytics } from '@vercel/analytics/react';
import { useEffect } from 'react';

// Components
import SharedNavbar from './components/navbar';

// Pages
import Home from './pages/Home';
import ItineraryPage from './pages/Itinerary';
import Creators from './pages/Creators';
import About from './pages/About';
import Contact from './pages/Contact';
import Last from './pages/Last';

const CURSOR_LOCK_STYLE_ID = 'pathfinder-cursor-lock-style';
const CURSOR_LOCK_CSS = `
html,
body,
#root,
#root *,
#root *::before,
#root *::after {
    cursor: none !important;
}
`;

const applyInlineCursorLock = (node) => {
    if (!node || !node.style || typeof node.style.setProperty !== 'function') return;
    node.style.setProperty('cursor', 'none', 'important');
};

const lockElementTree = (rootNode) => {
    if (!(rootNode instanceof Element)) return;
    applyInlineCursorLock(rootNode);
    const descendants = rootNode.querySelectorAll('*');
    descendants.forEach((node) => {
        applyInlineCursorLock(node);
    });
};

const enforceTouchCursorLock = () => {
    if (typeof document === 'undefined') return;

    let styleTag = document.getElementById(CURSOR_LOCK_STYLE_ID);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = CURSOR_LOCK_STYLE_ID;
        styleTag.textContent = CURSOR_LOCK_CSS;
        document.head.appendChild(styleTag);
    }

    applyInlineCursorLock(document.documentElement);
    applyInlineCursorLock(document.body);
    const root = document.getElementById('root');
    if (root) {
        applyInlineCursorLock(root);
    }
};

const PageTransition = ({ children }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }} // Starts slightly lower and transparent
            animate={{ opacity: 1, y: 0 }}  // Slides up and fades in
            exit={{ opacity: 0, y: -20 }}   // Slides up and fades out
            transition={{ duration: 0.4, ease: "easeInOut" }} // Slightly faster for snappier feel
            style={{ width: "100%" }}
        >
            {children}
        </motion.div>
    );
};

function AnimatedRoutes() {
    const location = useLocation();
    useEffect(() => {
        document.body.setAttribute('data-pathfinder-route', location.pathname || '/');
        document.body.setAttribute('data-pathfinder-app', '1');
        enforceTouchCursorLock();

        return () => {
            document.body.removeAttribute('data-pathfinder-route');
            document.body.removeAttribute('data-pathfinder-app');
        };
    }, [location.pathname]);

    return (
        <>
            {location.pathname !== '/last' && <SharedNavbar />}

            {/* mode="wait" ensures the old page leaves before the new one enters */}
            <AnimatePresence mode="wait">
                <Routes location={location} key={location.pathname}>

                    <Route path="/" element={
                        <PageTransition>
                            <Home />
                        </PageTransition>
                    } />

                    <Route path="/itinerary" element={
                        <PageTransition>
                            <ItineraryPage />
                        </PageTransition>
                    } />

                    <Route path="/creators" element={
                        <PageTransition>
                            <Creators />
                        </PageTransition>
                    } />

                    <Route path="/about" element={
                        <PageTransition>
                            <About />
                        </PageTransition>
                    } />

                    <Route path="/contact" element={
                        <PageTransition>
                            <Contact />
                        </PageTransition>
                    } />

                    <Route path="/last" element={
                        <PageTransition>
                            <Last />
                        </PageTransition>
                    } />

                </Routes>
            </AnimatePresence>
        </>
    );
}

function App() {
    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

        let frameId = null;
        const scheduleCursorLock = () => {
            if (frameId !== null) return;
            frameId = window.requestAnimationFrame(() => {
                frameId = null;
                enforceTouchCursorLock();
            });
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                scheduleCursorLock();
            }
        };

        const handlePointerActivity = (event) => {
            if (event?.target instanceof Element) {
                applyInlineCursorLock(event.target);
            }
            scheduleCursorLock();
        };

        const mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        lockElementTree(node);
                    });
                    return;
                }
                if (mutation.type === 'attributes' && mutation.target instanceof Element) {
                    applyInlineCursorLock(mutation.target);
                }
            });
            scheduleCursorLock();
        });

        enforceTouchCursorLock();
        lockElementTree(document.documentElement);
        window.addEventListener('focus', scheduleCursorLock, true);
        window.addEventListener('pageshow', scheduleCursorLock, true);
        document.addEventListener('visibilitychange', handleVisibilityChange, true);
        document.addEventListener('pointermove', handlePointerActivity, true);
        document.addEventListener('mousemove', handlePointerActivity, true);
        document.addEventListener('pointerdown', handlePointerActivity, true);
        document.addEventListener('touchstart', handlePointerActivity, true);
        mutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
        const periodicLock = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                scheduleCursorLock();
            }
        }, 1500);

        return () => {
            window.removeEventListener('focus', scheduleCursorLock, true);
            window.removeEventListener('pageshow', scheduleCursorLock, true);
            document.removeEventListener('visibilitychange', handleVisibilityChange, true);
            document.removeEventListener('pointermove', handlePointerActivity, true);
            document.removeEventListener('mousemove', handlePointerActivity, true);
            document.removeEventListener('pointerdown', handlePointerActivity, true);
            document.removeEventListener('touchstart', handlePointerActivity, true);
            mutationObserver.disconnect();
            window.clearInterval(periodicLock);
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
                frameId = null;
            }
        };
    }, []);

    return (
        <>
            <Router>
                <AnimatedRoutes />
            </Router>
            <Analytics />
        </>
    );
}

export default App;
