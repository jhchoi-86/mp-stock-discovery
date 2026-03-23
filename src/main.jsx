import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#ff4d4d', background: '#1e1e2f', height: '100vh', width: '100vw', overflow: 'auto' }}>
          <h2 style={{ color: '#ffb3b3' }}>🚨 화면 오류(Crash) 발생 🚨</h2>
          <p style={{ color: '#fff' }}>앗! 로그인 후 대시보드를 그리는 중에 아래와 같은 시스템 에러가 발생했습니다.<br/>아래 <b>빨간색 에러 메시지 내용(전체)</b>을 봇에게 그대로 복사하거나 캡처해서 보여주시면, 1초 만에 원인을 찾고 바로 해결해드리겠습니다!</p>
          <div style={{ background: '#000', padding: '1rem', borderRadius: '8px', border: '1px solid #ff4d4d', marginTop: '1rem' }}>
            <h3 style={{ margin: 0, color: '#ff6b6b' }}>Error Message:</h3>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '1rem', fontWeight: 'bold' }}>
              {this.state.error?.toString()}
            </pre>
            <h4 style={{ margin: '1rem 0 0.5rem 0', color: '#ffb3b3' }}>Stack Trace (개발자용):</h4>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.8rem', color: '#ccc' }}>
              {this.state.error?.stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children; 
  }
}

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
