
const askBtn = document.getElementById('askBtn');
const questionInput = document.getElementById('question');
const chatMessages = document.getElementById('chatMessages');

const API_URL = '';
askBtn.addEventListener('click', async () => {
    const question = questionInput.value.trim();

    if (!question) {
        alert('Please enter a question!');
        return;
    }
    addMessage('user', question);
    questionInput.value = '';
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
        removeMessage(loadingId);
        addMessage('bot', data.answer);
        if (data.places && data.places.length > 0) {
            updateMapWithPlaces(data.places);
            addPlaceButtons(data.places);
        }

    } catch (error) {
        console.error('Error:', error);
        removeMessage(loadingId);
        addMessage('bot', '❌ Error: Could not get response from server.');
    }
});
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        askBtn.click();
    }
});
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
function removeMessage(messageId) {
    const msg = document.getElementById(`msg-${messageId}`);
    if (msg) msg.remove();
}
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
        loadItinerary();
        addMessage('system', `✅ Added ${placeName} to your trip!`);

    } catch (error) {
        console.error('Error adding to itinerary:', error);
    }
}
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
loadItinerary();