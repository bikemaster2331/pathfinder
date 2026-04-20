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
#root * {
    cursor: none !important;
}
`;

const enforceTouchCursorLock = () => {
    if (typeof document === 'undefined') return;

    let styleTag = document.getElementById(CURSOR_LOCK_STYLE_ID);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = CURSOR_LOCK_STYLE_ID;
        styleTag.textContent = CURSOR_LOCK_CSS;
        document.head.appendChild(styleTag);
    }

    document.documentElement.style.setProperty('cursor', 'none', 'important');
    document.body.style.setProperty('cursor', 'none', 'important');
    const root = document.getElementById('root');
    if (root) {
        root.style.setProperty('cursor', 'none', 'important');
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

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                enforceTouchCursorLock();
            }
        };

        enforceTouchCursorLock();
        window.addEventListener('focus', enforceTouchCursorLock);
        window.addEventListener('pageshow', enforceTouchCursorLock);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', enforceTouchCursorLock);
            window.removeEventListener('pageshow', enforceTouchCursorLock);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
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
