import axiosClient from './axiosClient';

const reportService = {
  getLatestReport: async () => {
    try {
      const response = await axiosClient.get('/reports/daily/latest');
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
  }
};

export default reportService;
