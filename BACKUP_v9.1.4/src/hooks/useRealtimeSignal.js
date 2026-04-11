import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * [Phase 4] 실시간 시그널 및 WBS 상태 관리 Hook
 * - SSE 연결 관리
 * - 신호 히스토리 적재
 * - 종목별 수급(WBS) 게이지 업데이트
 */
export const useRealtimeSignal = (active = false) => {
    const [status, setStatus] = useState('OFFLINE'); // OFFLINE | CONNECTING | ONLINE
    const [signals, setSignals] = useState([]);
    const [tickerStates, setTickerStates] = useState({}); // { ticker: { wbs1m, wbs3m, lastUpdate } }
    const eventSourceRef = useRef(null);

    const connect = useCallback(() => {
        if (eventSourceRef.current) return;

        setStatus('CONNECTING');
        const es = new EventSource('/api/stream', { withCredentials: true });

        es.onopen = () => {
            console.log('✅ SSE Connected - Realtime Signal Monitoring');
            setStatus('ONLINE');
        };

        es.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                
                // 1. 신호 브로드캐스트 처리 (type: signal)
                if (packet.type === 'signal') {
                    setSignals(prev => [packet.data, ...prev].slice(0, 50)); // 최신 50개 유지
                }
                
                // 2. WBS 게이지 업데이트 처리 (type: wbs_gauge)
                if (packet.type === 'wbs_gauge') {
                    const { ticker, wbs1m, wbs3m, timestamp } = packet.data;
                    setTickerStates(prev => ({
                        ...prev,
                        [ticker]: { wbs1m, wbs3m, lastUpdate: timestamp }
                    }));
                }

                // 3. 기존 시스탬 알림 등 기타 메시지 처리
                if (packet.type === 'notification') {
                    console.log('[SSE Notification]', packet.payload);
                }
            } catch (e) {
                // Heartbeat 등 무시
            }
        };

        es.onerror = (err) => {
            console.error('❌ SSE Connection Error:', err);
            setStatus('OFFLINE');
            es.close();
            eventSourceRef.current = null;
            
            // 5초 후 재연결 시도
            setTimeout(() => {
                if (active) connect();
            }, 5000);
        };

        eventSourceRef.current = es;
    }, [active]);

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            setStatus('OFFLINE');
        }
    }, []);

    useEffect(() => {
        if (active) {
            connect();
        } else {
            disconnect();
        }
        return () => disconnect();
    }, [active, connect, disconnect]);

    return {
        status,
        signals,
        tickerStates,
        clearSignals: () => setSignals([])
    };
};
