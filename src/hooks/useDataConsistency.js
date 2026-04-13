import { useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

/**
 * [TASK-E3] 전역 데이터 정합성 훅
 * 역할: 동기화 저장 완료(`save_sync_complete`) 시 모든 페이지의 데이터를 동시에 갱신
 * 최적화: SSEContext에서 발행하는 'mp_sse_message' 이벤트를 활용하여 중복 연결 방지
 */
export function useDataConsistency(onRefresh) {
  
  const handleRefresh = useCallback((data) => {
    console.log('[Consistency] save_sync_complete 수신:', data);
    
    if (onRefresh) {
      onRefresh();
      toast.success('실시간 동기화 완료: 최신 데이터를 불러왔습니다.', {
        id: 'sync-complete-toast', // 중복 표시 방지
        duration: 3000,
        icon: '🔄'
      });
    }
  }, [onRefresh]);

  useEffect(() => {
    const handleSseMessage = (event) => {
      try {
        const data = JSON.parse(event.detail.data);
        
        // 동기화 저장 완료 이벤트 감지
        if (data.type === 'save_sync_complete') {
          handleRefresh(data);
        }
      } catch (err) {
        console.error('[Consistency] 이벤트 파싱 오류:', err);
      }
    };

    // SSEContext.jsx에서 dispatch하는 커스텀 이벤트 리슨
    window.addEventListener('mp_sse_message', handleSseMessage);
    
    return () => {
      window.removeEventListener('mp_sse_message', handleSseMessage);
    };
  }, [handleRefresh]);

  return null;
}
