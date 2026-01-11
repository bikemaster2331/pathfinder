import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import ItineraryPage from './pages/Itinerary';
import Last from './pages/Last';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/itinerary" element={<ItineraryPage />} />
                <Route path="/last" element={<Last />} />
            </Routes>
        </Router>
    );
}

export default App;