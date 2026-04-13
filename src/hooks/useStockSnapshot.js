import useSWR from 'swr';
import reportService from '../api/reportService';

/**
 * [TASK-E4] 단일 종목 스냅샷 조회 훅
 * 모든 페이지에서 이 훅을 사용하여 데이터 소스를 통일합니다.
 */
export function useStockSnapshot(ticker, date) {
  const key = ticker ? [`stock-snapshot`, ticker, date] : null;
  
  return useSWR(key, async () => {
    return await reportService.getStockSnapshot(ticker, date);
  }, {
    revalidateOnFocus: false,
    dedupingInterval: 30000, 
    errorRetryCount: 2
  });
}

/**
 * [TASK-E4] Top5 종목 조회 훅 (모든 페이지 공통)
 */
export function useTop5Stocks(date) {
  const today = date || new Date().toISOString().split('T')[0];
  const key = [`top5`, today];

  return useSWR(key, async () => {
    return await reportService.getTop5Stocks(today);
  }, {
    revalidateOnFocus: true,
    dedupingInterval: 30000,
    errorRetryCount: 2
  });
}
