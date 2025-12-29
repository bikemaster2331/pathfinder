import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Itinerary from './pages/Itinerary';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/itinerary" element={<Itinerary />} />
            </Routes>
        </Router>
    );
}

export default App;