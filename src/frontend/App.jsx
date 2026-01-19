import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import Home from './pages/Home';
import ItineraryPage from './pages/Itinerary';
import Last from './pages/Last';
import About from './pages/About';       
import Contact from './pages/Contact';   
import Creators from './pages/Creators'; 

function App() {
    return (
        <>
            <Router>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/itinerary" element={<ItineraryPage />} />
                    <Route path="/last" element={<Last />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/creators" element={<Creators />} />
                </Routes>
            </Router>

            <Analytics />
        </>
    );
}

export default App;