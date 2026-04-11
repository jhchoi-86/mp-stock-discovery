import axiosClient from './axiosClient';

/**
 * Admin API Service
 * Exposes methods to manage users and view audit trails via the backend admin routes.
 */

const adminService = {
  /**
   * Fetches all registered users.
   * Requires ADMIN role.
   * @returns {Promise<Array>} Array of user objects
   */
  getUsers: async () => {
    try {
      const response = await axiosClient.get('/api/admin/users');
      return response.data;
    } catch (error) {
      console.error('[Admin Service] Fetching users failed:', error);
      throw error;
    }
  },

  /**
   * Updates a user's role and/or status.
   * Requires ADMIN role. Can only affect non-ADMIN users.
   * @param {string} userId - UUID of the user to update
   * @param {string} role - Enum ['FREE_TRIAL', 'FREE', 'PAID', 'ADMIN']
   * @param {string} status - Enum ['ACTIVE', 'SUSPENDED', 'DELETED']
   * @returns {Promise<Object>} The updated user object
   */
  updateUserStatus: async (userId, role, status) => {
    try {
      const response = await axiosClient.put(`/api/admin/users/${userId}/status`, {
        role,
        status
      });
      return response.data;
    } catch (error) {
      console.error(`[Admin Service] Updating user ${userId} failed:`, error);
      throw error;
    }
  },

  /**
   * Fetches daily stock snapshots for analytics (Public/Paid).
   */
  getPublicSnapshots: async (params) => {
    try {
      const response = await axiosClient.get('/api/public/daily-snapshots', { params });
      return response.data;
    } catch (error) {
      console.error('[Admin Service] Fetching public snapshots failed:', error);
      throw error;
    }
  },

  /**
   * Fetches available dates for daily snapshots (Public/Paid).
   */
  getPublicSnapshotDates: async () => {
    try {
      const response = await axiosClient.get('/api/public/daily-snapshot-dates');
      return response.data;
    } catch (error) {
      console.error('[Admin Service] Fetching public snapshot dates failed:', error);
      throw error;
    }
  },

  /**
   * Saves current Top 5 status as a historical snapshot.
   */
  saveSyncHistory: async () => {
    try {
      const response = await axiosClient.post('/api/admin/save-sync-history');
      return response.data;
    } catch (error) {
      console.error('[Admin Service] Saving sync history failed:', error);
      throw error;
    }
  },

  /**
   * Fetches available sync history tags (Date/Time).
   */
  getSyncHistoryTags: async () => {
    try {
      const response = await axiosClient.get('/api/public/sync-history-tags');
      return response.data;
    } catch (error) {
      console.error('[Admin Service] Fetching history tags failed:', error);
      throw error;
    }
  },

  /**
   * Fetches details for a specific historical snapshot.
   */
  getSyncHistoryDetails: async (tag) => {
    try {
      const response = await axiosClient.get('/api/public/sync-history-details', { params: { tag } });
      return response.data;
    } catch (error) {
      console.error('[Admin Service] Fetching history details failed:', error);
      throw error;
    }
  }
};

export default adminService;
