// main.js - Enhanced version with chat history

const askBtn = document.getElementById('askBtn');
const questionInput = document.getElementById('question');
const chatMessages = document.getElementById('chatMessages');

const API_URL = '';

// Handle ask button click
askBtn.addEventListener('click', async () => {
    const question = questionInput.value.trim();
    
    if (!question) {
        alert('Please enter a question!');
        return;
    }
    
    // Add user message to chat
    addMessage('user', question);
    
    // Clear input
    questionInput.value = '';
    
    // Show loading
    const loadingId = addMessage('bot', 'Thinking...');
    
    try {
        const response = await fetch(`${API_URL}/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ question: question })
        });
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        
        const data = await response.json();
        
        // Remove loading message
        removeMessage(loadingId);
        
        // Add bot response
        addMessage('bot', data.answer);
        
        // Update map with places (if any)
        if (data.places && data.places.length > 0) {
            updateMapWithPlaces(data.places);
            
            // Show "Add to Trip" buttons
            addPlaceButtons(data.places);
        }
        
    } catch (error) {
        console.error('Error:', error);
        removeMessage(loadingId);
        addMessage('bot', '❌ Error: Could not get response from server.');
    }
});

// Allow Enter key to submit
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        askBtn.click();
    }
});

// Helper function to add messages to chat
function addMessage(sender, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.textContent = text;
    
    const messageId = Date.now();
    messageDiv.id = `msg-${messageId}`;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageId;
}

// Helper function to remove messages
function removeMessage(messageId) {
    const msg = document.getElementById(`msg-${messageId}`);
    if (msg) msg.remove();
}

// Add buttons to save places to itinerary
function addPlaceButtons(places) {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'place-buttons';
    
    places.forEach(place => {
        const btn = document.createElement('button');
        btn.className = 'add-to-trip-btn';
        btn.textContent = `📍 Add ${place.name} to trip`;
        btn.onclick = () => addToItinerary(place.name);
        buttonContainer.appendChild(btn);
    });
    
    chatMessages.appendChild(buttonContainer);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add place to itinerary
async function addToItinerary(placeName) {
    try {
        const response = await fetch(`${API_URL}/itinerary_add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ place_name: placeName })
        });
        
        const data = await response.json();
        console.log('Added to itinerary:', data);
        
        // Update itinerary display
        loadItinerary();
        
        // Show success message
        addMessage('system', `✅ Added ${placeName} to your trip!`);
        
    } catch (error) {
        console.error('Error adding to itinerary:', error);
    }
}

// Load and display itinerary
async function loadItinerary() {
    try {
        const response = await fetch(`${API_URL}/itinerary`);
        const data = await response.json();
        
        const itineraryList = document.getElementById('itineraryList');
        itineraryList.innerHTML = '';
        
        if (data.itinerary.length === 0) {
            itineraryList.innerHTML = '<li class="empty">No places added yet</li>';
            return;
        }
        
        data.itinerary.forEach(place => {
            const li = document.createElement('li');
            li.textContent = place;
            itineraryList.appendChild(li);
        });
        
    } catch (error) {
        console.error('Error loading itinerary:', error);
    }
}

// Load itinerary on page load
loadItinerary();