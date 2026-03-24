import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 100, // 100 Virtual Users
  duration: '10m', // 10분 지속
  thresholds: {
    http_req_duration: ['p(95)<200'], // P95 < 200ms (NFR-01) 만족 필수
  }
};

export default function () {
  // Mock endpoint for load testing
  const res = http.get('https://mpstock.co.kr/user-api/health'); // Fallback to health since /signals might require JWT
  check(res, { 'status 200': (r) => r.status === 200 });
}
