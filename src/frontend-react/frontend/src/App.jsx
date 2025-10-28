import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
const Discover = lazy(() => import('./pages/Discover'));
const ItineraryPage = lazy(() => import('./pages/ItineraryPage'));

function AppContent() {
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <>
      {!isHomePage && (
        <nav className="nav-container">
          <NavLink
            to="/"
            className={({ isActive }) => isActive ? 'nav-button nav-button-active' : 'nav-button'}
          >
            Home
          </NavLink>
          <NavLink
            to="/itinerary"
            className={({ isActive }) => isActive ? 'nav-button nav-button-active' : 'nav-button'}
          >
            Itinerary
          </NavLink>
          <NavLink
            to="/discover"
            className={({ isActive }) => isActive ? 'nav-button nav-button-active' : 'nav-button'}
          >
            Discover
          </NavLink>
        </nav>
      )}

      <Suspense fallback={<div style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/itinerary" element={<ItineraryPage />} />
          <Route path="/discover" element={<Discover />} />
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <Router>
      <div className="app-container">
        <AppContent />
      </div>
    </Router>
  );
}

export default App;