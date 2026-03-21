import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, User, ChevronRight, Activity } from 'lucide-react';
import axiosClient from '../api/axiosClient';
import useAuthStore from '../store/authStore';

const UserProfile = ({ isOpen, onClose }) => {
  const { user, setAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [usageData, setUsageData] = useState({ current: 0, max: 10 });
  
  const [editName, setEditName] = useState('');
  const [editTelegramId, setEditTelegramId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Password Change States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      fetchProfile();
    }
  }, [isOpen, user]);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const response = await axiosClient.get('/api/users/me');
      const data = response.data;
      setProfileData(data.user);
      setUsageData(data.usage);
      
      setEditName(data.user.name || '');
      setEditTelegramId(data.user.telegramId || '');
    } catch (error) {
      setMessage({ text: '프로필 정보를 불러오는데 실패했습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage({ text: '', type: '' });
    try {
      const response = await axiosClient.put('/api/users/me', {
        name: editName,
        telegramId: editTelegramId
      });
      
      const updatedUser = response.data.user;
      setProfileData(updatedUser);
      // Immediately sync Zustand global state
      setAuth(updatedUser);
      
      setMessage({ text: '프로필이 성공적으로 저장되었습니다.', type: 'success' });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (error) {
      setMessage({ text: '프로필 저장에 실패했습니다.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword) {
      setMessage({ text: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.', type: 'error' });
      return;
    }

    setIsChangingPassword(true);
    setMessage({ text: '', type: '' });
    try {
      const response = await axiosClient.put('/api/users/me/password', {
        currentPassword,
        newPassword
      });
      setMessage({ text: response.data.message || '비밀번호가 성공적으로 변경되었습니다.', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    } catch (error) {
      setMessage({ text: error.response?.data?.error || '비밀번호 변경에 실패했습니다.', type: 'error' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSubscribeRequest = async () => {
    setIsSubscribing(true);
    setMessage({ text: '', type: '' });
    try {
      await axiosClient.post('/api/subscriptions/request');
      setProfileData({ ...profileData, hasPendingSubscription: true });
      setMessage({ text: 'PRO 구독 신청이 접수되었습니다. 관리자 승인을 기다려주세요.', type: 'success' });
    } catch (error) {
      setMessage({ text: error.response?.data?.error || '구독 신청에 실패했습니다.', type: 'error' });
    } finally {
      setIsSubscribing(false);
    }
  };

  if (!isOpen) return null;

  const usagePercentage = Math.min((usageData.current / usageData.max) * 100, 100);
  let progressColor = '#34d399'; // Green default
  if (usagePercentage > 75) progressColor = '#fbbf24'; // Yellow warning
  if (usagePercentage > 95) progressColor = '#ef4444'; // Red limit

  return createPortal(
    <div style={overlayStyle}>
      <div className="card fade-in" style={modalStyle}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0, fontSize: '1.2rem', color: '#fff' }}>
            <User size={24} color="var(--accent)" /> 마이 프로필 
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>로딩중...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* User Meta */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>계정 등급</span>
                <span style={{ 
                  background: user?.role === 'PAID' ? 'rgba(245, 158, 11, 0.2)' : (user?.role === 'ADMIN' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(156, 163, 175, 0.2)'),
                  color: user?.role === 'PAID' ? '#fbbf24' : (user?.role === 'ADMIN' ? '#f87171' : '#9ca3af'),
                  padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold', border: `1px solid ${user?.role === 'PAID' ? 'rgba(245,158,11,0.5)' : 'rgba(156,163,175,0.5)'}`
                }}>
                  {user?.role?.replace('_USER', '')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>이메일</span>
                <span style={{ color: '#fff' }}>{profileData?.email}</span>
              </div>
            </div>

            {/* Usage Progress */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontSize: '0.95rem', fontWeight: 'bold' }}>
                  <Activity size={16} color="var(--primary)" /> 일 단위 분석 스캐너 사용량 
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <span style={{ color: '#fff', fontWeight: 'bold' }}>{usageData.current}</span> / {usageData.max} 회
                </span>
              </div>
              
              {/* Progress Bar Container */}
              <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${usagePercentage}%`, 
                    backgroundColor: progressColor,
                    transition: 'width 0.5s ease-in-out, background-color 0.3s'
                  }} 
                />
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                (매일 KST 자정 초기화)
              </div>
            </div>

            {/* Edit Forms */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>표시 이름</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={inputStyle}
                  placeholder="사용자 이름"
                />
              </div>
              
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem', color: '#38bdf8', fontSize: '0.9rem', fontWeight: 'bold' }}>
                  <Send size={16} /> Telegram Chat ID (푸시 알림용)
                </label>
                <input 
                  type="text" 
                  value={editTelegramId}
                  onChange={(e) => setEditTelegramId(e.target.value)}
                  style={{ ...inputStyle, borderColor: 'rgba(56, 189, 248, 0.3)' }}
                  placeholder="예: 123456789"
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  텔레그램에서 봇에게 메시지를 보낸 후 Chat ID를 가져와 등록하세요. (PRO 위젯 전용)
                </p>
              </div>
            </div>
            
            <button 
              onClick={handleSave}
              disabled={isSaving}
              style={{
                width: '100%', padding: '0.8rem', borderRadius: '6px', cursor: isSaving ? 'wait' : 'pointer',
                background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '1rem',
                marginTop: '0.5rem'
              }}
            >
              {isSaving ? '저장 중...' : '프로필 기본 정보 저장'}
            </button>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />

            {/* Password Change Form */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#fff', fontSize: '1rem' }}>비밀번호 변경</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <input 
                  type="password" 
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={inputStyle}
                  placeholder="현재 비밀번호"
                />
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={inputStyle}
                  placeholder="새 비밀번호"
                />
                <button 
                  onClick={handlePasswordChange}
                  disabled={isChangingPassword || !currentPassword || !newPassword}
                  style={{
                    padding: '0.6rem', borderRadius: '4px', cursor: (isChangingPassword || !currentPassword || !newPassword) ? 'not-allowed' : 'pointer',
                    background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)', 
                    fontWeight: 'bold', fontSize: '0.9rem', marginTop: '0.25rem',
                    transition: 'all 0.2s'
                  }}
                >
                  {isChangingPassword ? '변경 중...' : '비밀번호 변경하기'}
                </button>
              </div>
            </div>

            {/* Messages & Actions */}
            {message.text && (
              <div style={{ padding: '0.75rem', borderRadius: '4px', fontSize: '0.85rem', textAlign: 'center', 
                backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: message.type === 'success' ? '#34d399' : '#ef4444' }}>
                {message.text}
              </div>
            )}

            {user?.role === 'FREE_TRIAL' && (
              <button 
                onClick={handleSubscribeRequest}
                disabled={profileData?.hasPendingSubscription || isSubscribing}
                style={{
                  width: '100%', padding: '0.8rem', borderRadius: '6px', 
                  cursor: (profileData?.hasPendingSubscription || isSubscribing) ? 'not-allowed' : 'pointer',
                  background: profileData?.hasPendingSubscription ? 'rgba(255, 255, 255, 0.1)' : 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)', 
                  color: profileData?.hasPendingSubscription ? '#9ca3af' : '#fff', 
                  border: 'none', fontWeight: 'bold', fontSize: '1rem',
                  marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                  boxShadow: profileData?.hasPendingSubscription ? 'none' : '0 4px 14px 0 rgba(251, 191, 36, 0.39)'
                }}
              >
                {profileData?.hasPendingSubscription ? '⏳ 승인 대기 중' : '💎 PRO 구독 신청하기'}
              </button>
            )}

          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// Styles
const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000
};

const modalStyle = {
  width: '100%',
  maxWidth: '450px',
  background: 'var(--glass)',
  border: '1px solid var(--glass-border)',
  padding: '1.5rem',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
};

const inputStyle = {
  width: '100%',
  padding: '0.75rem 1rem',
  background: 'rgba(0,0,0,0.2)',
  border: '1px solid var(--glass-border)',
  color: '#fff',
  borderRadius: '4px',
  fontSize: '0.95rem'
};

export default UserProfile;
