import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

const SubscriptionModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleSubscribe = () => {
    toast.error('결제 시스템 연동이 준비 중입니다.', { 
      icon: '🚧', 
      style: { background: '#2d1a1a', color: '#ffb86c', border: '1px solid #ff5555' } 
    });
  };

  const modalContent = (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem'
    }}>
      <div className="modal-content fade-in" onClick={(e) => e.stopPropagation()} style={{ 
        maxWidth: '650px', width: '100%', padding: '2rem', textAlign: 'center',
        background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        <button onClick={onClose} style={{ 
          position: 'absolute', top: '15px', right: '15px', 
          background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', 
          cursor: 'pointer', borderRadius: '50%', padding: '6px', display: 'flex' 
        }}>
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.6rem', marginBottom: '0.5rem', fontWeight: '800', background: 'linear-gradient(to right, var(--primary), var(--secondary))', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          MP STOCK 프리미엄
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>
          가장 빠르고 강력한 코스피/코스닥 스나이퍼 AI를 경험하세요.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Free Plan */}
          <div style={{ flex: '1 1 250px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#fff' }}>Basic 플랜</h3>
            <div style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#fff' }}>무료</div>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="var(--text-muted)" /> 기본 우량주 추천 스코어링</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="var(--text-muted)" /> 장 종료 후 일간 요약 리포트</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.3 }}><X size={16} /> ⚡ 초지연 스나이퍼 실시간 알림</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.3 }}><X size={16} /> 텔레그램 VIP 상시 모니터링 연동</li>
            </ul>
             <button 
              disabled
              style={{ width: '100%', marginTop: '1.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontWeight: 'bold', cursor: 'not-allowed' }}
            >
              현재 이용 중인 플랜
            </button>
          </div>

          {/* Premium Plan */}
          <div style={{ flex: '1 1 250px', background: 'linear-gradient(145deg, rgba(99,102,241,0.1), rgba(236,72,153,0.1))', border: '1px solid var(--primary)', borderRadius: '12px', padding: '1.5rem', textAlign: 'left', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'absolute', top: '-12px', right: '15px', background: 'var(--primary)', color: '#fff', fontSize: '0.75rem', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)' }}>
              추천
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--primary)' }}>VIP 플랜</h3>
            <div style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#fff' }}>월 99,000원</div>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: '#fff', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="var(--primary)" /> 전 종목 실시간 VIP 스코어링</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="var(--primary)" /> <strong style={{color:'#ffb86c'}}>1초 지연 스나이퍼 포착 알림</strong></li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="var(--primary)" /> 텔레그램 메신저 직통 연동 발송</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Check size={16} color="var(--primary)" /> 독점 AI 종목 분석 코멘트 제공</li>
            </ul>

            <button 
              onClick={handleSubscribe} 
              style={{ width: '100%', marginTop: '1.5rem', padding: '0.75rem', background: 'linear-gradient(to right, var(--primary), var(--secondary))', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
            >
              VIP 구독 시작하기 <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Explicit Exit Button */}
        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
          <button 
            onClick={onClose} 
            style={{ 
              padding: '0.6rem 2rem', background: 'transparent', color: 'var(--text-muted)', 
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontWeight: 'bold',
              cursor: 'pointer', fontSize: '0.9rem', transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
            onMouseOut={(e) => e.target.style.background = 'transparent'}
          >
            모달 창 닫기 (나가기)
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default SubscriptionModal;
