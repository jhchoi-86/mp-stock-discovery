import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * [Phase 4] 실시간 시그널 및 WBS 상태 관리 Hook
 * - SSE 연결 관리 (지수 백오프 재연결)
 * - 신호 히스토리 적재 (당일 최신 50개)
 * - 종목별 가격/수급 게이지 업데이트
 *
 * [TASK-RS01] 이벤트 타입을 서버 실제 브로드캐스트 타입과 일치하도록 수정:
 *   'signal'       → 'sniper_alert'      (realtime_engine.py POST → SSE 재브로드캐스트)
 *   'wbs_gauge'    → 'price_snapshot'    (가격/수급 스냅샷으로 대체)
 *   'notification' → 'live_notification'
 */
export const useRealtimeSignal = (active = false) => {
    const [status, setStatus] = useState('OFFLINE'); // OFFLINE | CONNECTING | ONLINE
    const [signals, setSignals] = useState([]);
    const [tickerStates, setTickerStates] = useState({}); // { ticker: { price, changeRate, lastUpdate } }
    const eventSourceRef = useRef(null);

    // [TASK-RS03] stale closure 방지: active 최신값을 ref로 추적
    const activeRef = useRef(active);
    useEffect(() => { activeRef.current = active; }, [active]);

    // [TASK-RS02] 지수 백오프 재연결 횟수 추적
    const retryCountRef = useRef(0);

    const connect = useCallback(() => {
        if (eventSourceRef.current) return;

        setStatus('CONNECTING');
        const es = new EventSource('/api/stream', { withCredentials: true });

        es.onopen = () => {
            console.log('✅ SSE Connected - Realtime Signal Monitoring');
            retryCountRef.current = 0; // 연결 성공 시 카운터 초기화
            setStatus('ONLINE');
        };

        es.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);

                // [TASK-RS01] 1. 스나이퍼 신호 처리 (server: type='sniper_alert')
                if (packet.type === 'sniper_alert') {
                    const signal = packet.payload || packet.data;
                    if (!signal) return;
                    // [TASK-RS04] 6시간 이상 경과 신호 제거 → 당일 신호만 유지
                    const SIX_HOURS = 6 * 60 * 60 * 1000;
                    setSignals(prev => {
                        const now = Date.now();
                        const fresh = prev.filter(s =>
                            now - (new Date(s.occurredAt || s.timestamp || 0).getTime()) < SIX_HOURS
                        );
                        return [signal, ...fresh].slice(0, 50);
                    });
                }

                // [TASK-RS01] 2. WBS 게이지 업데이트 (server: type='wbs_gauge')
                // /api/realtime/wbs-status 라우트가 이 타입으로 재브로드캐스트함
                if (packet.type === 'wbs_gauge' && packet.data) {
                    const { ticker, wbs1m, wbs3m, timestamp } = packet.data;
                    setTickerStates(prev => ({
                        ...prev,
                        [ticker]: { wbs1m, wbs3m, lastUpdate: timestamp || Date.now() }
                    }));
                }

                // [TASK-RS01] 3. 가격 스냅샷 → tickerStates 병합 (server: type='price_snapshot')
                if (packet.type === 'price_snapshot' && packet.data) {
                    setTickerStates(prev => {
                        const updated = { ...prev };
                        Object.entries(packet.data).forEach(([ticker, info]) => {
                            updated[ticker] = {
                                price: info.price,
                                changeRate: info.changeRate,
                                lastUpdate: Date.now()
                            };
                        });
                        return updated;
                    });
                }

                // [TASK-RS01] 3. 라이브 알림 처리 (server: type='live_notification')
                if (packet.type === 'live_notification') {
                    console.log('[SSE live_notification]', packet.data);
                }
            } catch (e) {
                // Heartbeat(': heartbeat') 등 파싱 불가 메시지 무시
            }
        };

        es.onerror = (err) => {
            console.error('❌ SSE Connection Error:', err);
            setStatus('OFFLINE');
            es.close();
            eventSourceRef.current = null;

            // [TASK-RS02] 지수 백오프: 5s → 7.5s → 11.25s → … 최대 30초
            retryCountRef.current += 1;
            const retryDelay = Math.min(30000, 5000 * Math.pow(1.5, retryCountRef.current - 1));
            console.log(`[SSE] 재연결 시도 #${retryCountRef.current} (${retryDelay / 1000}초 후)`);

            // [TASK-RS03] activeRef로 stale closure 방지
            setTimeout(() => {
                if (activeRef.current) connect();
            }, retryDelay);
        };

        eventSourceRef.current = es;
    }, []); // [TASK-RS03] active 의존성 제거 → activeRef로 대체

    // [TASK-RS05] disconnect 시 signals, tickerStates도 초기화하여 오래된 데이터 잔존 방지
    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        retryCountRef.current = 0;
        setStatus('OFFLINE');
        setSignals([]);
        setTickerStates({});
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
