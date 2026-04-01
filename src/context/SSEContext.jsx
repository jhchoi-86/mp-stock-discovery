import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

/**
 * [AI NOTICE: SSEContext.jsx]
 * 전역에서 단 하나의 EventSource 연결만 유지하도록 관리하는 컨텍스트입니다.
 * 모든 실시간 와처(Progress, Signal 등)는 이 컨텍스트를 구독합니다.
 */

const SSEContext = createContext();
const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : "";

export const SSEProvider = ({ children, onUpdateRequested, onSyncComplete }) => {
    const [progress, setProgress] = useState({ current: 0, total: 350, timeframe: '' });
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [lastSignal, setLastSignal] = useState(null);
    
    const progressRef = useRef(progress);
    const frameId = useRef(null);
    const onUpdateRequestedRef = useRef(onUpdateRequested);
    const onSyncCompleteRef = useRef(onSyncComplete);

    // Update refs when props change
    useEffect(() => {
        onUpdateRequestedRef.current = onUpdateRequested;
        onSyncCompleteRef.current = onSyncComplete;
    }, [onUpdateRequested, onSyncComplete]);

    useEffect(() => {
        let eventSource = null;
        let retryCount = 0;
        const maxRetries = 10; // 🔴 [Stability] Increase retries

        const connect = () => {
            if (eventSource) eventSource.close();
            eventSource = new EventSource(`${API_URL}/api/stream`, { withCredentials: true });

            eventSource.onopen = () => {
                setIsConnected(true);
                setError(null);
                retryCount = 0;
                console.log("[SSE] Connected to stream");
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'update') {
                        if (onUpdateRequestedRef.current) onUpdateRequestedRef.current();
                    } 
                    else if (data.type === 'sync_progress') {
                        const payload = data.payload || data;
                        progressRef.current = { 
                            current: payload.current, 
                            total: payload.total, 
                            timeframe: payload.timeframe || '' 
                        };

                        if (!frameId.current) {
                            frameId.current = requestAnimationFrame(() => {
                                setProgress(progressRef.current);
                                frameId.current = null;
                            });
                        }
                    } 
                    else if (data.type === 'sync_complete') {
                        // 🔴 [BUG-11 Hotfix] 명시적 완료 신호 수신 시에만 콜백 호출
                        if (onSyncCompleteRef.current) onSyncCompleteRef.current();
                    }
                    else if (data.type === 'sync_error') {
                        console.error("[SSE] Sync Process Error:", data.message);
                        if (onSyncCompleteRef.current) onSyncCompleteRef.current();
                    }
                    else if (data.type === 'sniper_alert') {
                        setLastSignal(data.payload);
                    }
                } catch (e) {
                    console.error("[SSE] Data Error:", e);
                }
            };

            eventSource.onerror = (e) => {
                setIsConnected(false);
                eventSource.close();
                
                // 🔴 [Stability] 에러 시 재연결 주기를 더 보수적으로 잡고 무한 루프 방지
                const delay = Math.min(10000, 2000 * retryCount);
                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(connect, delay);
                }
            };
        };

        connect();

        return () => {
            if (eventSource) eventSource.close();
            if (frameId.current) cancelAnimationFrame(frameId.current);
        };
    }, []); // 🔴 Stable: Connection only runs once

    return (
        <SSEContext.Provider value={{ progress, lastSignal, isConnected, error }}>
            {children}
        </SSEContext.Provider>
    );
};

export const useSSE = () => useContext(SSEContext);
