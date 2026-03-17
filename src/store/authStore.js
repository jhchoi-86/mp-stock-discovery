import { create } from 'zustand';
import axiosClient, { setAccessToken } from '../api/axiosClient';

/**
 * Global Authentication Store using Zustand
 */
const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false, // Prevents UI flickering on initial load

  // Action to set user after successful login
  setAuth: (userData) => {
    set({
      user: userData,
      isAuthenticated: !!userData,
      isInitialized: true
    });
  },

  // Action to clear auth on logout
  clearAuth: () => {
    set({
      user: null,
      isAuthenticated: false,
      isInitialized: true
    });
    setAccessToken(null); // Clear the transient axios token
  },

  // Initialize Auth Phase - Called in App.jsx useEffect
  initAuth: async () => {
    try {
      // Silently request a token refresh to check if an active HttpOnly Refresh Cookie is present
      const response = await axiosClient.post('/api/auth/refresh');
      
      if (response && response.data && response.data.accessToken) {
        // We successfully grabbed an access token, which means the user was logged in previously!
        // We need the user payload out of the JWT to define roles and UI access
        const token = response.data.accessToken;
        
        // Decode payload manually or fetch a full profile endpoint
        // Since we embedded {userId, role} into our JWT config initially:
        const payloadStr = token.split('.')[1];
        const payloadObj = JSON.parse(atob(payloadStr));
        
        // Reconstruct basic user object representing current session info
        get().setAuth({
          id: payloadObj.userId,
          role: payloadObj.role,
          name: 'Authorized User' // In a prod app, we'd GET /api/auth/me to get exact names
        });
        
        return true;
      }
    } catch (error) {
      // No active session or cookie was found. Safe to assume logged out.
      console.log('[AuthStore] No active session found during initialization.');
      set({ isInitialized: true, isAuthenticated: false, user: null });
    }
  }
}));

export default useAuthStore;
