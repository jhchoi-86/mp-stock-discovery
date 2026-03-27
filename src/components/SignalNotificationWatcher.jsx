import React, { useEffect } from 'react';
import { useSSE } from '../hooks/useSSE';
import toast from 'react-hot-toast';

/**
 * [AI NOTICE: SignalNotificationWatcher.jsx]
 * SSE를 통해 들어오는 실시간 스나이퍼 알림(Sniper Alert)만 전담 처리하는 무형의 컴포넌트입니다.
 */
const SignalNotificationWatcher = () => {
    const { lastSignal } = useSSE();

    useEffect(() => {
        if (!lastSignal) return;

        const { ticker, type, price, grade, score, reason } = lastSignal;

        if (type === 'ENTRY') {
            toast.success(`[스나이퍼 🚨포착] ${ticker} | 진입가: ${Math.round(price).toLocaleString()}원 (점수: ${score}점, ${grade}등급)`, {
                duration: 6000,
                icon: '🎯',
                style: { background: '#1e1e2f', color: '#fff', border: '1px solid #FF1744' }
            });
        } else if (type === 'EXIT_WARN') {
            toast.error(`[청산 ⚠️경고] ${ticker} | 사유: ${reason}`, {
                duration: 8000,
                icon: '⚠️',
                style: { background: '#2d1a1a', color: '#ffb86c', border: '1px solid #ff5555' }
            });
        }
    }, [lastSignal]);

    return null; // UI를 직접 렌더링하지 않음
};

export default SignalNotificationWatcher;
