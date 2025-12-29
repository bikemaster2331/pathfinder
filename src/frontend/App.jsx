import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import ItineraryPage from './pages/Itinerary';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/itinerary" element={<ItineraryPage />} />
            </Routes>
        </Router>
    );
}

export default App;