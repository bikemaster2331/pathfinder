import { useRef, useEffect, useState } from 'react';
import { Menu, FileDown, ChevronRight, MapPin, Calendar, Hotel, UtensilsCrossed, Trees, Eye, Church, X, Send, Minus } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as poiService from '../services/poiService';
import { generatePDF } from '../services/pdfService';
import { chatService } from '../services/chatService'; // ✅ Added Chat Service
import styles from '../styles/ItineraryPage.module.css';

const MUNICIPALITIES = [
  'BAGAMANOC', 'BARAS', 'BATO', 'CARAMORAN', 'GIGMOTO', 
  'PANDAN', 'PANGANIBAN', 'SAN ANDRES', 'SAN MIGUEL', 'VIGA', 'VIRAC'
];

const CATEGORIES = [
  { id: 'hotels', label: 'Places to Stay', Icon: Hotel },
  { id: 'restaurants', label: 'Food & Drink', Icon: UtensilsCrossed },
  { id: 'falls', label: 'Nature', Icon: Trees },
  { id: 'viewpoints', label: 'Things to Do', Icon: Eye },
  { id: 'religious', label: 'Religious Sites', Icon: Church }
];

const ItineraryPage = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef([]);
  const [showCards, setShowCards] = useState(true);
  
  // Existing State
  const [startDate, setStartDate] = useState('2025-11-30');
  const [endDate, setEndDate] = useState('2025-12-02');
  const [showCalendar, setShowCalendar] = useState(false);
  const [budgetRange, setBudgetRange] = useState(5000);
  const [preferredActivities, setPreferredActivities] = useState(new Set());
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(1);
  const [seniors, setSeniors] = useState(1);

  const [expandedDays, setExpandedDays] = useState({});
  const [collapsingDays, setCollapsingDays] = useState({});
  const [dayItineraries, setDayItineraries] = useState({});
  const [selectedMunicipality, setSelectedMunicipality] = useState({});
  const [selectedCategories, setSelectedCategories] = useState({});
  const [availablePois, setAvailablePois] = useState({});
  const [userSelectedMunicipality, setUserSelectedMunicipality] = useState({});
  const [activeDayPoi, setActiveDayPoi] = useState(null);
  const [addedPoiIds, setAddedPoiIds] = useState(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- 🤖 NEW CHAT STATE ---
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'ai', content: 'Hello! I am Pathfinder. Ask me for recommendations!' }
  ]);
  const chatEndRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Handle Sending Message
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatInput(''); // Clear input
    
    // 1. Add User Message
    setChatMessages(prev => [...prev, { role: 'user', content: userText }]);
    setIsChatLoading(true);

    try {
      // 2. Call Python Backend
      const data = await chatService.sendMessage(userText);
      
      // 3. Add AI Response
      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: data.answer,
        places: data.places 
      }]);
    } catch (error) {
      console.error(error);
      setChatMessages(prev => [...prev, { role: 'ai', content: "Sorry, I couldn't reach the server. Is the backend running?" }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // Helper to add a place suggested by AI to the Backend Itinerary
  const handleAddSuggestedPlace = async (placeName) => {
    try {
      await chatService.addToItinerary(placeName);
      setChatMessages(prev => [...prev, { role: 'system', content: `✅ Added ${placeName} to your saved list.` }]);
    } catch (error) {
      console.error(error);
    }
  };
  // ---------------------------

  const calculateDays = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // Map Initialization
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const catanduanesCenter = [124.25, 13.75];
    const isMobile = window.innerWidth <= 768;
    const zoomLevel = isMobile ? 7.5 : 9;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://api.maptiler.com/maps/019ad40c-2183-7e4a-a4f4-fd0b017d00b0/style.json?key=AMdEDMTHduiJsTINtmZT',
      center: catanduanesCenter,
      zoom: zoomLevel,
      maxZoom: 18,
      minZoom: 7,
      attributionControl: false,
      preserveDrawingBuffer: false,
      refreshExpiredTiles: false,
    });

    map.current.on('load', () => {
      fetch('/data/CATANDUANES.geojson')
        .then(response => response.json())
        .then(data => {
          if (!map.current) return;
          map.current.addSource('catanduanes', { type: 'geojson', data: data });
          map.current.addLayer({
            id: 'catanduanes-outline',
            type: 'line',
            source: 'catanduanes',
            paint: { 'line-color': '#ffffff', 'line-width': 2 }
          });
        })
        .catch(err => console.error('Failed to load Catanduanes GeoJSON:', err));
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      markersRef.current = [];
    };
  }, []);

  // State Initialization
  useEffect(() => {
    const days = calculateDays();
    const newExpandedDays = {};
    const newDayItineraries = {};
    const newSelectedMunicipality = {};
    const newSelectedCategories = {};
    const newUserSelectedMunicipality = {};

    for (let i = 0; i < days; i++) {
      const dayKey = `day-${i}`;
      newExpandedDays[dayKey] = i === 0;
      newDayItineraries[dayKey] = [];
      newSelectedMunicipality[dayKey] = '';
      newSelectedCategories[dayKey] = [];
      newUserSelectedMunicipality[dayKey] = false;
    }

    setExpandedDays(newExpandedDays);
    setDayItineraries(newDayItineraries);
    setSelectedMunicipality(newSelectedMunicipality);
    setSelectedCategories(newSelectedCategories);
    setUserSelectedMunicipality(newUserSelectedMunicipality);
  }, [startDate, endDate]);

  // Load POIs
  useEffect(() => {
    const loadPoisForDays = async () => {
      const newAvailablePois = {};
      for (const dayKey in selectedMunicipality) {
        const municipality = selectedMunicipality[dayKey];
        const categories = selectedCategories[dayKey] || [];
        const isUserSelected = userSelectedMunicipality[dayKey];

        if (!isUserSelected || !municipality || categories.length === 0) {
          newAvailablePois[dayKey] = [];
          continue;
        }

        try {
          const geojsonData = await poiService.loadMunicipalityData(municipality);
          let pois = poiService.getAllPOIs(geojsonData);
          pois = pois.filter(feature => {
            const poiCategory = poiService.featureToCarouselCard(feature, 0).category;
            return categories.includes(poiCategory);
          });
          newAvailablePois[dayKey] = pois.map((feature, index) =>
            poiService.featureToCarouselCard(feature, index)
          );
        } catch (error) {
          console.error(`Error loading POIs for ${dayKey}:`, error);
          newAvailablePois[dayKey] = [];
        }
      }
      setAvailablePois(newAvailablePois);
    };
    loadPoisForDays();
  }, [selectedMunicipality, selectedCategories, userSelectedMunicipality]);

  // Markers
  useEffect(() => {
    if (!map.current) return;
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const allPoiMarkersToAdd = [];
    for (const dayKey in availablePois) {
      const pois = availablePois[dayKey] || [];
      allPoiMarkersToAdd.push(...pois);
    }

    const uniquePois = Array.from(new Map(allPoiMarkersToAdd.map(poi => [poi.id, poi])).values());

    uniquePois.forEach(poi => {
      if (poi.coordinates) {
        const el = document.createElement('div');
        el.className = `${styles.marker}`;
        el.style.backgroundImage = 'url(/assets/beach_poi.svg)';
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.backgroundSize = 'contain';
        el.style.cursor = 'pointer';

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(poi.coordinates)
          .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`
            <div style="padding: 8px; background: #ffffff; border-radius: 8px;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #000000;">${poi.name}</h3>
              <p style="margin: 0; font-size: 12px; color: #333333;">${poi.description || ''}</p>
            </div>
          `))
          .addTo(map.current);
        markersRef.current.push(marker);
      }
    });
  }, [availablePois]);

  const handleContinue = () => setShowCards(false);

  const formatDateRange = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const startMonth = start.toLocaleString('en-US', { month: 'short' });
    const endMonth = end.toLocaleString('en-US', { month: 'short' });
    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
  };

  const getDayDate = (dayIndex) => {
    const start = new Date(startDate);
    const currentDay = new Date(start);
    currentDay.setDate(start.getDate() + dayIndex);
    return `${currentDay.toLocaleString('en-US', { month: 'short' })} ${currentDay.getDate()}, ${currentDay.toLocaleString('en-US', { weekday: 'short' })}`;
  };

  const toggleDay = (dayKey) => {
    const isCurrentlyExpanded = expandedDays[dayKey];
    if (isCurrentlyExpanded) {
      setCollapsingDays(prev => ({ ...prev, [dayKey]: true }));
      setTimeout(() => {
        setExpandedDays(prev => ({ ...prev, [dayKey]: false }));
        setCollapsingDays(prev => ({ ...prev, [dayKey]: false }));
      }, 400);
    } else {
      setExpandedDays(prev => ({ ...prev, [dayKey]: true }));
    }
  };

  const handleMunicipalityChange = (dayKey, municipality) => {
    setSelectedMunicipality(prev => ({ ...prev, [dayKey]: municipality }));
    setUserSelectedMunicipality(prev => ({ ...prev, [dayKey]: true }));

    if (map.current && municipality) {
      const normalizedMunicipality = municipality.replace(/ /g, '_');
      fetch(`/data/${normalizedMunicipality}.geojson`)
        .then(response => response.json())
        .then(data => {
          if (!data.features || data.features.length === 0) return;
          let minLng = Infinity, maxLng = -Infinity;
          let minLat = Infinity, maxLat = -Infinity;

          data.features.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
              const coords = feature.geometry.coordinates;
              if (feature.geometry.type === 'Point') {
                minLng = Math.min(minLng, coords[0]);
                maxLng = Math.max(maxLng, coords[0]);
                minLat = Math.min(minLat, coords[1]);
                maxLat = Math.max(maxLat, coords[1]);
              }
            }
          });

          if (minLng !== Infinity) {
            const centerLng = (minLng + maxLng) / 2;
            const centerLat = (minLat + maxLat) / 2;
            let zoomLevel = municipality === 'CARAMORAN' ? 10 : 11;
            map.current.flyTo({ center: [centerLng, centerLat], zoom: zoomLevel, duration: 1000 });
          }
        })
        .catch(err => console.error('Failed to calculate municipality center:', err));
    }
  };

  const toggleCategory = (dayKey, categoryId) => {
    setSelectedCategories(prev => {
      const currentCategories = prev[dayKey] || [];
      const newCategories = currentCategories.includes(categoryId)
        ? currentCategories.filter(id => id !== categoryId)
        : [...currentCategories, categoryId];
      return { ...prev, [dayKey]: newCategories };
    });
    
    if ((selectedCategories[dayKey] || []).length > 0 || (selectedCategories[dayKey] || []).length === 0) {
      setActiveDayPoi(dayKey);
    }
  };

  const addPoiToDay = (dayKey, poi) => {
    setDayItineraries(prev => {
      const currentItems = prev[dayKey] || [];
      if (currentItems.find(item => item.id === poi.id)) return prev;
      return { ...prev, [dayKey]: [...currentItems, poi] };
    });
    setAddedPoiIds(prev => new Set([...prev, poi.id]));
    setTimeout(() => {
      setAddedPoiIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(poi.id);
        return newSet;
      });
    }, 600);
  };

  const removePoiFromDay = (dayKey, poiId) => {
    setDayItineraries(prev => ({
      ...prev,
      [dayKey]: (prev[dayKey] || []).filter(item => item.id !== poiId)
    }));
  };

  const handleExportPDF = async () => {
    try {
      const days = Object.keys(dayItineraries).map((dayKey, index) => {
        const dayIndex = parseInt(dayKey.split('-')[1]);
        const actualDate = new Date(startDate);
        actualDate.setDate(actualDate.getDate() + dayIndex);
        
        return {
          day: index + 1,
          date: actualDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }),
          municipality: selectedMunicipality[dayKey] || '',
          items: dayItineraries[dayKey].map(item => ({
            name: item.name,
            description: item.description || ''
          }))
        };
      });

      const pdfData = {
        start_date: new Date(startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        end_date: new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        budget: budgetRange,
        days: days,
        adults, children, seniors
      };

      await generatePDF(pdfData);
      alert('PDF downloaded successfully!');
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert(error.message || 'Failed to export itinerary as PDF.');
    }
  };

  const renderDaySection = (dayIndex) => {
    const dayKey = `day-${dayIndex}`;
    const isExpanded = expandedDays[dayKey];
    const municipality = selectedMunicipality[dayKey];
    const categories = selectedCategories[dayKey] || [];
    const itineraryItems = dayItineraries[dayKey] || [];

    return (
      <div key={dayKey} className={styles.daySection}>
        <div className={styles.dayHeader} onClick={() => toggleDay(dayKey)}>
          <div className={styles.dayHeaderLeft}>
            <ChevronRight size={16} className={`${styles.chevronIcon} ${isExpanded ? styles.chevronExpanded : ''}`} strokeWidth={2} />
            <span className={styles.dayTitle}>Day {dayIndex + 1}</span>
            <span className={styles.dayDate}>{getDayDate(dayIndex)}</span>
            <div className={styles.municipalitySection} onClick={(e) => e.stopPropagation()}>
              <MapPin size={16} className={styles.locationIcon} strokeWidth={2} />
              <select
                className={styles.municipalitySelect}
                value={municipality}
                onChange={(e) => {
                  e.stopPropagation();
                  handleMunicipalityChange(dayKey, e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="">Select municipality</option>
                {MUNICIPALITIES.map(muni => (
                  <option key={muni} value={muni}>{muni.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {(isExpanded || collapsingDays[dayKey]) && (
          <div className={`${styles.dayContent} ${collapsingDays[dayKey] ? styles.dayContentCollapsing : ''}`}>
            <div className={styles.verticalLine}></div>
            <div className={styles.dayInstructions}>Add items from the list below to your travel itinerary.</div>
            <div className={styles.categoryPills}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`${styles.categoryPill} ${categories.includes(cat.id) ? styles.categoryPillActive : ''}`}
                  onClick={() => toggleCategory(dayKey, cat.id)}
                >
                  <cat.Icon size={16} strokeWidth={2} />
                  {cat.label}
                </button>
              ))}
            </div>
            {itineraryItems.length > 0 && (
              <div className={styles.dayItineraryList}>
                {itineraryItems.map((item, index) => (
                  <div key={item.id} className={styles.dayItineraryItem}>
                    <div className={styles.itemNumber}>{index + 1}</div>
                    <div className={styles.itemInfo}>
                      <h4 className={styles.itemName}>{item.name}</h4>
                      <p className={styles.itemDesc}>{item.description}</p>
                    </div>
                    <button className={styles.removeBtn} onClick={() => removePoiFromDay(dayKey, item.id)}>
                      <X size={18} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.itineraryPage}>
      {showCalendar && (
        <div className={styles.calendarOverlay} onClick={() => setShowCalendar(false)}>
          <div className={styles.calendarModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.calendarTitle}>Select Journey Dates</h3>
            <div className={styles.dateInputGroup}>
              <label className={styles.dateLabel}>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.dateInput} />
            </div>
            <div className={styles.dateInputGroup}>
              <label className={styles.dateLabel}>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.dateInput} />
            </div>
            <button className={styles.calendarDoneBtn} onClick={() => setShowCalendar(false)}>Done</button>
          </div>
        </div>
      )}
      <div className={styles.itineraryContent}>
        {showCards ? (
          <div className={styles.cardsSection}>
            <div className={styles.cardsGrid}>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Journey dates</h3>
                <div className={styles.cardContent}>
                  <div className={styles.dateBox} onClick={() => setShowCalendar(true)}>
                    <Calendar size={20} className={styles.calendarIcon} strokeWidth={2} />
                    <span className={styles.dateText}>{formatDateRange()}</span>
                  </div>
                  <p className={styles.cardNote}>Allowed period is from 1 to 3 days ({calculateDays()} days selected)</p>
                </div>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Budget</h3>
                <div className={styles.cardContent}>
                  <div className={styles.budgetSliderContainer}>
                    <input type="range" min="1000" max="50000" step="500" value={budgetRange} onChange={(e) => setBudgetRange(parseInt(e.target.value))} className={styles.budgetSlider} />
                    <div className={styles.budgetDisplayContainer}>
                      <span className={styles.budgetMin}>₱1,000</span>
                      <span className={styles.budgetDisplay}>₱{budgetRange.toLocaleString()}</span>
                      <span className={styles.budgetMax}>₱50,000</span>
                    </div>
                  </div>
                  <p className={styles.cardNote}>Price range for your trip</p>
                </div>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Reviews</h3>
                <div className={styles.cardContent}>
                  <p className={styles.reviewsText}>Visitors here consistently describe their experiences as joyful, a testament to the warmth of the locals despite the challenges of nature.</p>
                  <p className={styles.cardNote}>Traveler experiences and testimonials</p>
                </div>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>What would you like to do?</h3>
                <div className={styles.cardContent}>
                  <div className={styles.activitiesGrid}>
                    {['Swimming', 'Hiking', 'Sightseeing', 'Waterfalls', 'Historical'].map((act) => (
                      <label key={act} className={styles.activityCheckbox}>
                        <input
                          type="checkbox"
                          checked={preferredActivities.has(act)}
                          onChange={(e) => {
                            const newActivities = new Set(preferredActivities);
                            if (e.target.checked) newActivities.add(act);
                            else newActivities.delete(act);
                            setPreferredActivities(newActivities);
                          }}
                          className={styles.activityCheckboxInput}
                        />
                        <span className={styles.activityLabel}>{act}</span>
                      </label>
                    ))}
                  </div>
                  <p className={styles.cardNote}>Select your preferred activities</p>
                </div>
              </div>
            </div>
            <button className={styles.continueBtn} onClick={handleContinue}>Continue</button>
          </div>
        ) : (
          <div className={styles.mainLayout}>
            <button className={styles.mapIconBtn} onClick={() => setSidebarOpen(!sidebarOpen)} title="View Itinerary">
              <Menu size={20} strokeWidth={2} />
            </button>
            <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
              <div className={styles.sidebarContent}>
                <div className={styles.sidebarHeader}>
                  <h2 className={styles.sidebarTitle}>Itinerary</h2>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className={styles.sidebarCloseBtn} onClick={handleExportPDF} title="Export as PDF" style={{ background: 'rgba(255, 255, 255, 0.15)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <FileDown size={20} />
                    </button>
                    <button className={styles.sidebarCloseBtn} onClick={() => setSidebarOpen(false)} title="Close sidebar">×</button>
                  </div>
                </div>
                <div className={styles.itineraryScrollContainer}>
                  {Array.from({ length: calculateDays() }, (_, i) => renderDaySection(i))}
                </div>
              </div>
            </div>

            <div className={styles.mainContentContainer}>
              <div className={styles.chatContainer}>
                <div className={styles.chatTab}>
                  <h3 className={styles.chatHeading}>Where will you go today?</h3>
                  
                  {/* --- DYNAMIC CHAT MESSAGES START --- */}
                  <div className={styles.chatMessages}>
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} 
                        className={styles.chatMessage}
                        style={{ 
                          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          backgroundColor: msg.role === 'user' ? '#007bff' : '#2a2a2a',
                          color: msg.role === 'user' ? 'white' : '#e0e0e0',
                          padding: '10px 15px',
                          borderRadius: '12px',
                          marginBottom: '10px',
                          maxWidth: '85%',
                          width: 'fit-content'
                        }}
                      >
                        <p className={styles.chatMessageText}>{msg.content}</p>
                        {/* Suggestion Buttons */}
                        {msg.places && msg.places.length > 0 && (
                          <div style={{ marginTop: '10px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {msg.places.map((place, pIdx) => (
                              <button 
                                key={pIdx}
                                onClick={() => handleAddSuggestedPlace(place.name)}
                                style={{
                                  fontSize: '11px',
                                  padding: '4px 8px',
                                  background: '#28a745',
                                  border: 'none',
                                  borderRadius: '4px',
                                  color: 'white',
                                  cursor: 'pointer'
                                }}
                              >
                                + Save {place.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className={styles.chatMessage} style={{ color: '#888', fontStyle: 'italic', fontSize: '12px' }}>
                        Pathfinder is thinking...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  {/* --- DYNAMIC CHAT MESSAGES END --- */}

                  <div className={styles.chatInputContainer}>
                    <input 
                      type="text" 
                      placeholder="Ask about your trip..." 
                      className={styles.chatInput} 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      disabled={isChatLoading}
                    />
                    <button 
                      className={styles.chatSendBtn}
                      title="Send message"
                      onClick={handleSendMessage}
                      disabled={isChatLoading}
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {activeDayPoi && availablePois[activeDayPoi]?.length > 0 && (
                <div className={`${styles.poiCardContainer} ${activeDayPoi ? styles.poiCardContainerOpen : ''}`}>
                  <div className={styles.poiCard}>
                    <div className={styles.poiCardHeader}>
                      <h3 className={styles.poiCardTitle}>Nearby Attractions</h3>
                      <button className={styles.poiCardCloseBtn} onClick={() => setActiveDayPoi(null)} aria-label="Close">×</button>
                    </div>
                    <div className={styles.poiCardList}>
                      {availablePois[activeDayPoi]
                        .filter(poi => {
                          const itineraryItems = dayItineraries[activeDayPoi] || [];
                          return !itineraryItems.find(item => item.id === poi.id);
                        })
                        .map((poi) => (
                        <div key={poi.id} className={`${styles.availablePoiItem} ${addedPoiIds.has(poi.id) ? styles.poiItemSlideOut : ''}`}>
                          <div className={styles.poiInfo}>
                            <h4 className={styles.poiName}>{poi.name}</h4>
                            <p className={styles.poiDesc}>{poi.description}</p>
                          </div>
                          <button className={styles.addPoiBtn} onClick={() => addPoiToDay(activeDayPoi, poi)} disabled={addedPoiIds.has(poi.id)}>
                            {addedPoiIds.has(poi.id) ? '✓' : '+ Add'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={styles.mapWrapper}>
          <div className={styles.mapOverlayBox}>
            <div ref={mapContainer} className={styles.mapContainer} />
          </div>
        </div>
      </div>
      <div className={styles.overlayRectangle} />
    </div>
  );
};

export default ItineraryPage;