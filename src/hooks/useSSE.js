import { useSSE as useSSEContext } from '../context/SSEContext';

// [TASK-SE01] SSEProvider 미마운트 시 앱 크래시 방지 래퍼
// SSEContext.jsx의 useSSE가 이미 기본값(|| fallback)을 반환하지만,
// 엄격 모드(createContext undefined)나 SSEProvider 완전 누락 시 이중 방어
// [TASK-SE02] 단순 재수출에서 실질적 래퍼로 격상:
//   - 연결 실패 시 콘솔 경고로 디버깅 용이성 확보
//   - 향후 SSE 상태 변환/선택자 로직 추가 단일 진입점
export const useSSE = () => {
  try {
    const ctx = useSSEContext();
    return ctx;
  } catch (e) {
    // SSEProvider가 컴포넌트 트리에 없는 경우 (테스트·스토리북 등)
    console.error('[useSSE] SSEProvider가 마운트되지 않았습니다:', e.message);
    return {
      isConnected: false,
      lastSignal: null,
      progress: { current: 0, total: 350, timeframe: '', group: '', pct: 0 },
      error: 'SSEProvider missing',
      realtimePrices: {},
      notifications: []
    };
  }
};
