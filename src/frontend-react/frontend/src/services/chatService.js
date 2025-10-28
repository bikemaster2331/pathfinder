import api from './api';

export const chatService = {
  // Send message to Python Backend
async sendMessage(question) {
    try {
      // This sends POST /ask to your FastAPI server
      // Note: We use 'question' here because your Python 'AskRequest' model expects it
    const response = await api.post('/ask', { question });
    return response.data;
    } catch (error) {
    console.error("Chat Error:", error);
    throw error;
    }
},

  // Save place to Itinerary
async addToItinerary(placeName) {
    try {
    const response = await api.post('/itinerary_add', { place_name: placeName });
    return response.data;
    } catch (error) {
    console.error("Itinerary Error:", error);
    throw error;
    }
},

  // Get current Itinerary
async getItinerary() {
    try {
    const response = await api.get('/itinerary');
    return response.data;
    } catch (error) {
    console.error("Fetch Itinerary Error:", error);
    throw error;
    }
}
};