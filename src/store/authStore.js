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
  setAuth: (userData, token = null) => {
    if (token) setAccessToken(token);
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
    // [v9.4.10] Break circular dependency by registering listener during init
    if (typeof window !== 'undefined' && !window._mpAuthListenerRegistered) {
      window.addEventListener('mp_auth_failed', (e) => {
        console.warn('[authStore] Auth failure detected via event:', e.detail?.reason);
        get().clearAuth();
      });
      window._mpAuthListenerRegistered = true;
    }

    try {
      // Silently request a token refresh to check if an active HttpOnly Refresh Cookie is present
      const response = await axiosClient.post('/api/auth/refresh');
      
      if (response && response.data && response.data.accessToken) {
        // We successfully grabbed an access token, which means the user was logged in previously!
        const token = response.data.accessToken;
        
        // Decode payload safely (Base64URL aware)
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(byte) {
              return '%' + ('00' + byte.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          
          const payloadObj = JSON.parse(jsonPayload);
          
          // Reconstruct basic user object representing current session info
          get().setAuth({
            id: payloadObj.userId,
            role: payloadObj.role,
            name: 'Authorized User'
          }, token);
          
          return true;
        } catch (decodeError) {
          console.error('[AuthStore] JWT Decode Error:', decodeError);
          set({ isInitialized: true, isAuthenticated: false, user: null });
          return false;
        }
      }
      // No token received but no error thrown
      set({ isInitialized: true, isAuthenticated: false, user: null });
      return false;
    } catch (error) {
      // No active session or cookie was found. Safe to assume logged out.
      console.log('[AuthStore] No active session found during initialization.');
      set({ isInitialized: true, isAuthenticated: false, user: null });
      return false;
    }
  }
}));


export default useAuthStore;
