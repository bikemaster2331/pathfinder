import api from './api';
import { useAuthStore } from '../store/authStore';

export const authService = {
  register: async (email, password, fullName) => {
    const response = await api.post('/auth/register', {
      email,
      password,
      full_name: fullName,
    });
    return response.data;
  },

  login: async (email, password) => {
    // OAuth2PasswordRequestForm expects form-urlencoded data
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);
    
    const response = await api.post('/auth/login', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    const { access_token } = response.data;
    const userResponse = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    
    useAuthStore.getState().setAuth(userResponse.data, access_token);
    return { user: userResponse.data, token: access_token };
  },

  logout: () => {
    useAuthStore.getState().logout();
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};
