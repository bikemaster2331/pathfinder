import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Analytics } from '@vercel/analytics/react';

// Components
import SharedNavbar from './components/navbar';

// Pages
import Home from './pages/Home';
import ItineraryPage from './pages/Itinerary';
import Creators from './pages/Creators';
import About from './pages/About';
import Contact from './pages/Contact';
// import Last from './pages/Last'; // Uncomment if you are using this

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

    return (
        <>
            <SharedNavbar />

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

                </Routes>
            </AnimatePresence>
        </>
    );
}

function App() {
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