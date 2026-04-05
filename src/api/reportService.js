import axiosClient from './axiosClient';

const reportService = {
  getLatestReport: async () => {
    try {
      const response = await axiosClient.get('/api/reports/daily/latest');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch latest report:', error);
      throw error;
    }
  },
  
  getReportByDate: async (date) => {
    try {
      const response = await axiosClient.get(`/reports/daily/${date}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch report for ${date}:`, error);
      throw error;
    }
  },

  getTop5Strategy: async () => {
    try {
      const response = await axiosClient.get('/api/public/top5-strategy');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch top5 strategy:', error);
      throw error;
    }
  },
  
  getWatchlistStrategy: async () => {
    try {
      const response = await axiosClient.get('/api/public/watchlist-strategy');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch watchlist strategy:', error);
      return { updatedAt: new Date().toISOString(), stocks: [] };
    }
  }
};

export default reportService;
