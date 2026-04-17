import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

/**
 * [AI NOTICE: SSEContext.jsx]
 * 전역에서 단 하나의 EventSource 연결만 유지하도록 관리하는 컨텍스트입니다.
 * 모든 실시간 와처(Progress, Signal 등)는 이 컨텍스트를 구독합니다.
 */

const SSEContext = createContext();
const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : "";

export const SSEProvider = ({ children, onUpdateRequested }) => {
    const [progress, setProgress] = useState({ current: 0, total: 350, timeframe: '' });
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [lastSignal, setLastSignal] = useState(null);
    const [realtimePrices, setRealtimePrices] = useState({}); // { code: { price, changeRate } }
    const [notifications, setNotifications] = useState([]); // [v6.1.1] 실시간 알림 피드
    
    const progressRef = useRef(progress);
    const frameId = useRef(null);

    // Throttle UI updates for prices to 500ms to keep UI snappy but not overloaded
    const pendingPrices = useRef({});
    const updateTimer = useRef(null);
    const onUpdateRef = useRef(onUpdateRequested);
    useEffect(() => { 
        onUpdateRef.current = onUpdateRequested; 
    }, [onUpdateRequested]);

    useEffect(() => {
        let eventSource = null;
        let retryCount = 0;
        const maxRetries = 5;

        const connect = () => {
            if (eventSource) {
                eventSource.onopen = null;
                eventSource.onmessage = null;
                eventSource.onerror = null;
                eventSource.close();
            }
            
            console.log("[SSE] Attempting connection...");
            eventSource = new EventSource(`${API_URL}/api/stream`, { withCredentials: true });

            eventSource.onopen = () => {
                setIsConnected(true);
                setError(null);
                retryCount = 0;
                console.log("[SSE] Connected to stream");
            };

            eventSource.onmessage = (event) => {
                // [FIX-03] 전역 커스텀 이벤트로 전파
                window.dispatchEvent(new CustomEvent('mp_sse_message', { detail: event }));

                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'update') {
                        if (onUpdateRef.current) onUpdateRef.current();
                    } 
                    else if (data.type === 'sync_progress') {
                        const payload = data.payload || data;
                        progressRef.current = { 
                            current: payload.current, 
                            total: payload.total, 
                            timeframe: payload.timeframe || '',
                            group: payload.group || '',
                            pct: payload.pct || Math.round((payload.current / payload.total) * 100)
                        };

                        if (!frameId.current) {
                            frameId.current = requestAnimationFrame(() => {
                                setProgress(progressRef.current);
                                frameId.current = null;
                            });
                        }

                        if (payload.current === payload.total) {
                            if (onUpdateRef.current) onUpdateRef.current();
                        }
                    } 
                    else if (data.type === 'sniper_alert') {
                        setLastSignal(data.payload);
                    }
                    else if (data.type === 'price_update' || data.type === 'price_snapshot') {
                        // [v6.2.0] Support both individual updates and snapshots
                        if (data.type === 'price_snapshot') {
                            Object.assign(pendingPrices.current, data.data);
                        } else {
                            pendingPrices.current[data.code] = { 
                                price: data.price, 
                                changeRate: data.changeRate,
                                updatedAt: Date.now()
                            };
                        }

                        if (!updateTimer.current) {
                            updateTimer.current = setTimeout(() => {
                                setRealtimePrices(prev => ({ ...prev, ...pendingPrices.current }));
                                pendingPrices.current = {};
                                updateTimer.current = null;
                            }, 300); // 0.3s batching (Tuned for snapiness)
                        }
                    }
                    else if (data.type === 'live_notification') {
                        // [v6.1.1] Push new notification to the front
                        setNotifications(prev => [data.data, ...prev].slice(0, 20));
                    }
                    else if (data.type === 'system_reset') {
                        // [Step 4] Clear realtime data on system reset
                        setRealtimePrices({});
                        setNotifications([]);
                        setLastSignal(null);
                    }
                } catch (e) {
                    console.error("[SSE] Data Error:", e);
                }
            };

            eventSource.onerror = (e) => {
                setIsConnected(false);
                // Don't set error message immediately to avoid noise on transient failures
                if (retryCount > 0) setError("연결 재시도 중...");
                
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                
                if (retryCount < maxRetries) {
                    retryCount++;
                    const delay = Math.min(10000, 2000 * retryCount);
                    setTimeout(connect, delay);
                } else {
                    setError("연결 실패 (새로고침이 필요할 수 있습니다)");
                }
            };
        };

        connect();

        return () => {
            if (eventSource) eventSource.close();
            if (frameId.current) cancelAnimationFrame(frameId.current);
        };
    }, []); // Task 9: onUpdateRequested 제거

    return (
        <SSEContext.Provider value={{ progress, lastSignal, isConnected, error, realtimePrices, notifications }}>
            {children}
        </SSEContext.Provider>
    );
};

export const useSSE = () => useContext(SSEContext) || { 
    progress: { current: 0, total: 350, timeframe: '' }, 
    lastSignal: null, 
    isConnected: false, 
    error: null, 
    realtimePrices: {},
    notifications: []
};
