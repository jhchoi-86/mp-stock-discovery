import axiosClient, { setAccessToken, getAccessToken } from './axiosClient';
import useAuthStore from '../store/authStore';

/**
 * Authentication Service
 * Exposes API methods for user authentication and session management.
 */
const authService = {
  /**
   * Register a new user
   * @param {string} email 
   * @param {string} password 
   * @param {string} name 
   * @param {string} phone 
   * @returns {Promise<Object>} The registered user data
   */
  async register(email, password, name, phone) {
    const response = await axiosClient.post('/api/auth/register', {
      email,
      password,
      name,
      phone
    });
    return response.data;
  },

  /**
   * Login an existing user
   * Sets the access token in memory upon success.
   * Refresh token is strictly handled via HttpOnly Cookies by the backend.
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<Object>} The user profile data and access token
   */
  async login(email, password) {
    const response = await axiosClient.post('/api/auth/login', {
      email,
      password
    });
    
    // Store the transient Access Token in memory
    if (response.data && response.data.accessToken) {
      setAccessToken(response.data.accessToken);
    }
    
    return response.data;
  },

  /**
   * Logout the user
   * Invalidates the refresh token on the DB, clears the HttpOnly cookie, and purges the local access token.
   */
  async logout() {
    try {
      // Notify backend to revoke refresh token and clear cookie
      await axiosClient.post('/api/auth/logout');
    } catch (error) {
      console.error('[Logout Service Error]', error);
    } finally {
      // Regardless of backend success, always clear local state
      useAuthStore.getState().clearAuth();
    }
  },

  /**
   * Helper to verify if the user is currently holding a local access session
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!getAccessToken();
  }
};

export default authService;
