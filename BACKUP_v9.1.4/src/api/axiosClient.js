import axios from 'axios';

// Get base URL from environment or detect if we are in local development
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const baseURL = import.meta.env.VITE_API_BASE_URL || (isDevelopment ? 'http://localhost:3001' : window.location.origin);

// In-memory token storage (more secure than localStorage for XSS protection)
let accessToken = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

export const getAccessToken = () => {
  return accessToken;
};

const axiosClient = axios.create({
  baseURL,
  withCredentials: true, // IMPORTANT: Allows cross-origin cookies (HttpOnly Refresh Token) to be sent automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==========================================
// 1. Request Interceptor: Inject Access Token
// ==========================================
axiosClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ==========================================
// 2. Response Interceptor: Error Handling & RTR
// ==========================================
axiosClient.interceptors.response.use(
  (response) => {
    // Normal successful response
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // A. 401 Unauthorized (Token Expired or Invalid) -> Try Refresh Token Rotation (RTR)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true; // Prevent infinite loops

      // Avoid trying to refresh if the failure WAS the refresh endpoint itself or login
      if (originalRequest.url.includes('/api/auth/refresh') || originalRequest.url.includes('/api/auth/login')) {
        import('../store/authStore.js').then((module) => module.default.getState().clearAuth());
        return Promise.reject(error);
      }

      try {
        // Attempt to refresh token
        // Since withCredentials is true, the browser automatically sends the HttpOnly refreshToken cookie here
        const response = await axios.post(`${baseURL}/api/auth/refresh`, {}, { withCredentials: true });
        
        const newAccessToken = response.data.accessToken;
        
        // Update local state and original request header
        setAccessToken(newAccessToken);
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        
        // Retry the original failed request with the new access token
        return axiosClient(originalRequest);

      } catch (refreshError) {
        console.error('[Token Refresh Failed]', refreshError);
        // Refresh token is expired or invalid too -> Force Logout
        // Use Zustand getState to break outside of React Component scope and prevent circular imports
        import('../store/authStore.js').then((module) => {
          module.default.getState().clearAuth();
        });
        return Promise.reject(refreshError);
      }
    }

    // B. 403 Forbidden (RBAC Guard Check Failed)
    if (error.response?.status === 403) {
      const errorMsg = error.response?.data?.error || '접근 권한이 부족합니다. 회원 등급 혹은 승인 상태를 확인해주세요.';
      alert(errorMsg);
    }

    // C. 429 Too Many Requests (Usage Limit Reached)
    if (error.response?.status === 429) {
      const limit = error.response?.data?.limit || 0;
      alert(`일일 API 사용량(${limit}회)을 모두 소진했습니다. 내일 다시 시도해주세요.`);
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
