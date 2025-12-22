// src/frontend-react/frontend/src/services/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://10.172.111.28:8000',
  timeout: 30000, // 30 second timeout for slow Gemini responses
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log(`[API REQUEST] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    return config;
  },
  (error) => {
    console.error('[API REQUEST ERROR]', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`[API RESPONSE] ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    if (error.response) {
      // Server responded with error status
      console.error('[API ERROR]', error.response.status, error.response.data);
    } else if (error.request) {
      // Request made but no response (backend down?)
      console.error('[API ERROR] No response from server. Is the backend running?');
    } else {
      // Something else happened
      console.error('[API ERROR]', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;