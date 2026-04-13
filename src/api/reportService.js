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

  getTop5Strategy: async (url) => {
    try {
      // [v7.7.50] SWR 키가 전달되면 해당 경로를 사용하고, 없으면 기존 하드코딩 경로 사용
      const targetUrl = typeof url === 'string' ? `/api/${url}` : '/api/public/top5-strategy';
      const response = await axiosClient.get(targetUrl);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch top5 strategy:', error);
      throw error;
    }
  },
  
  getWatchlistStrategy: async (url) => {
    try {
      const targetUrl = typeof url === 'string' ? `/api/${url}` : '/api/public/watchlist-strategy';
      const response = await axiosClient.get(targetUrl);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch watchlist strategy:', error);
    }
  },
  
  getDailyTop5: async (date) => {
    try {
      const response = await axiosClient.get(`/api/daily-top5?date=${date}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch daily top 5 for ${date}:`, error);
      return [];
    }
  },

  getStockSnapshot: async (ticker, date) => {
    try {
      const params = new URLSearchParams({ ticker });
      if (date) params.append('date', date);
      const response = await axiosClient.get(`/api/stock-snapshot?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch snapshot for ${ticker}:`, error);
      throw error;
    }
  },

  getTop5Stocks: async (date) => {
    try {
      const params = date ? `?date=${date}` : '';
      const response = await axiosClient.get(`/api/top5${params}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch Top 5 stocks:', error);
      throw error;
    }
  }
};

export default reportService;
