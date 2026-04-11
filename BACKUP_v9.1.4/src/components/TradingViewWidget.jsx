import React, { useEffect, useRef, memo } from 'react';
import { useSSE } from '../hooks/useSSE';

/**
 * [AI NOTICE: TradingViewWidget.jsx]
 * React.memo를 사용하여 부모 컴포넌트(SSE 진행률 등)의 잦은 리렌더링으로부터 위젯을 보호합니다.
 * symbol 또는 theme이 변경될 때만 내부 인스턴스를 업데이트합니다.
 */

const TradingViewWidget = memo(({ symbol = 'KRX:005930', theme = 'dark', autosize = true }) => {
    const container = useRef();

    useEffect(() => {
        // 이미 스크립트가 로드되어 있는지 확인
        const scriptId = 'tradingview-widget-script';
        let script = document.getElementById(scriptId);

        const createWidget = () => {
            if (container.current) {
                container.current.innerHTML = '';
                const widgetContainer = document.createElement('div');
                widgetContainer.id = 'tradingview_widget_container';
                widgetContainer.style.height = '100%';
                widgetContainer.style.width = '100%';
                container.current.appendChild(widgetContainer);

                if (window.TradingView) {
                    new window.TradingView.widget({
                        "autosize": autosize,
                        "symbol": symbol,
                        "interval": "D",
                        "timezone": "Asia/Seoul",
                        "theme": theme,
                        "style": "1",
                        "locale": "kr",
                        "toolbar_bg": "#f1f3f6",
                        "enable_publishing": false,
                        "hide_side_toolbar": false,
                        "allow_symbol_change": true,
                        "container_id": "tradingview_widget_container",
                    });
                }
            }
        };

        if (!script) {
            script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://s3.tradingview.com/tv.js';
            script.type = 'text/javascript';
            script.onload = createWidget;
            document.head.appendChild(script);
        } else {
            createWidget();
        }

        return () => {
            // Unmount 시 정리 로직
        };
    }, [symbol, theme, autosize]);

    return (
        <div 
            className="tradingview-widget-container card" 
            ref={container} 
            style={{ height: '500px', width: '100%', overflow: 'hidden', padding: 0, position: 'relative' }}
        >
            <div id="tradingview_widget_container" style={{ height: '100%', width: '100%' }} />
            
            {/* 실시간 신호 오버레이 레이어 */}
            <SignalOverlay symbol={symbol} />
        </div>
    );
});

// 내부 전용 오버레이 컴포넌트 (격리된 렌더링)
const SignalOverlay = ({ symbol }) => {
    // context를 안전하게 호출 (Provider 밖인 경우 대비)
    let sseData = {};
    try {
        sseData = useSSE() || {};
    } catch (e) {
        return null;
    }
    
    const { lastSignal } = sseData;
    const [showAlert, setShowAlert] = React.useState(false);
    
    useEffect(() => {
        if (lastSignal) {
            const ticker = lastSignal.code || lastSignal.ticker;
            const matches = [
                `KRX:${ticker}`, `KOSDAQ:${ticker}`,
                `XKRX:${ticker}`, `XKOSD:${ticker}`
            ].includes(symbol);
            
            if (matches) {
                setShowAlert(true);
                const timer = setTimeout(() => setShowAlert(false), 10000);
                return () => clearTimeout(timer);
            }
        }
    }, [lastSignal, symbol]);

    if (!showAlert || !lastSignal) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(255, 23, 68, 0.9)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '8px',
            zIndex: 10,
            fontSize: '0.8rem',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            border: '1px solid #FF1744'
        }}>
           🎯 신규 신호 포착: {lastSignal.score}점 ({lastSignal.grade})
        </div>
    );
};

export default TradingViewWidget;
