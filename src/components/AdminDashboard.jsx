import React, { useState, useEffect } from 'react';
import adminService from '../api/adminService';
import axiosClient from '../api/axiosClient';
import useAuthStore from '../store/authStore';
import { UserCog, ShieldAlert, ShieldCheck, ToggleLeft, ToggleRight, Trash2, CheckCircle } from 'lucide-react';

const AdminDashboard = () => {
  const { user } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);

  // Fetch users on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([loadUsers(), loadRequests()]);
    setIsLoading(false);
  };

  const loadRequests = async () => {
    try {
      const res = await axiosClient.get('/api/admin/subscriptions');
      setPendingRequests(res.data);
    } catch (err) {
      console.error('Failed to load subscriptions', err);
    }
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await adminService.getUsers();
      // Ensure data is array
      setUsers(Array.isArray(data) ? data : data.users || []);
      setErrorMsg('');
    } catch (err) {
      console.error(err);
      setErrorMsg('유저 목록을 불러오는데 실패했습니다.');
    }
  };

  const handleApproveRequest = async (requestId) => {
    if (!confirm('해당 유저의 PRO 구독을 승인하시겠습니까?')) return;
    try {
      await axiosClient.post(`/api/admin/subscriptions/${requestId}/approve`);
      loadData();
      alert('PRO 승인 완료되었습니다. 해당 유저에게 알림이 전송됩니다.');
    } catch (err) {
      alert('승인 중 오류가 발생했습니다.');
    }
  };

  const handleToggleRole = async (targetUser) => {
    const newRole = targetUser.role === 'PRO_USER' ? 'FREE_USER' : 'PRO_USER';
    try {
      const updatedUser = await adminService.updateUserStatus(targetUser.id, newRole, targetUser.status);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, role: updatedUser.user.role } : u));
    } catch (err) {
      alert('등급 변경에 실패했습니다.');
    }
  };

  const handleToggleStatus = async (targetUser) => {
    const newStatus = targetUser.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const updatedUser = await adminService.updateUserStatus(targetUser.id, targetUser.role, newStatus);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, status: updatedUser.user.status } : u));
    } catch (err) {
      alert('상태 변경에 실패했습니다.');
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderRoleBadge = (role) => {
    switch (role) {
      case 'ADMIN':
        return <span style={{ ...badgeStyle, backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.5)' }}>ADMIN</span>;
      case 'PRO_USER':
        return <span style={{ ...badgeStyle, backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.5)' }}>PRO</span>;
      default:
        return <span style={{ ...badgeStyle, backgroundColor: 'rgba(156, 163, 175, 0.2)', color: '#9ca3af', border: '1px solid rgba(156, 163, 175, 0.5)' }}>FREE</span>;
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <span style={{ ...badgeStyle, backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.5)' }}>정상</span>;
      case 'SUSPENDED':
        return <span style={{ ...badgeStyle, backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.5)' }}>정지됨</span>;
      default:
        return <span style={{ ...badgeStyle, backgroundColor: 'rgba(156, 163, 175, 0.2)', color: '#9ca3af', border: '1px solid rgba(156, 163, 175, 0.5)' }}>{status}</span>;
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#fff' }}>
        <p>로딩중...</p>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ padding: '1.5rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#fff', margin: 0 }}>
          <UserCog size={28} color="var(--accent)" />
          회원 관리 블록 
        </h2>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input 
            type="text"
            placeholder="이름 또는 이메일 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.6rem 1rem', width: '250px', background: 'rgba(0,0,0,0.2)', 
              border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '4px'
            }}
          />
          <button className="card" onClick={loadData} style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            목록 새로고침
          </button>
        </div>
      </div>

      {pendingRequests.length > 0 && (
        <div className="card fade-in" style={{ padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid rgba(245, 158, 11, 0.5)', background: 'rgba(245, 158, 11, 0.05)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: '#fbbf24', fontSize: '1.1rem' }}>
            <ShieldCheck size={20} /> 구독 요청 대기열 ({pendingRequests.length})
          </h3>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ padding: '1rem', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#fff' }}>{req.user.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{req.user.email}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>요청일: {new Date(req.createdAt).toLocaleString()}</div>
                </div>
                <button 
                  onClick={() => handleApproveRequest(req.id)}
                  style={{
                    padding: '0.5rem 1rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold'
                  }}
                >
                  <CheckCircle size={16} /> 승인
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: '1rem', backgroundColor: 'rgba(231, 76, 60, 0.2)', color: '#e74c3c', borderRadius: '4px', marginBottom: '1.5rem' }}>
          {errorMsg}
        </div>
      )}

      <div className="card" style={{ padding: '0', overflowX: 'auto', border: '1px solid var(--glass-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#fff' }}>
          <thead style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
            <tr>
              <th style={thStyle}>이름</th>
              <th style={thStyle}>이메일</th>
              <th style={thStyle}>가입일</th>
              <th style={thStyle}>권한 등급</th>
              <th style={thStyle}>계정 상태</th>
              <th style={thStyle}>관리 액션</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>가입된 유저가 없습니다.</td>
              </tr>
            ) : (
              filteredUsers.map(u => {
                const isSelf = user?.id === u.id;
                const isAdmin = u.role === 'ADMIN';

                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background-color 0.2s', ':hover': { backgroundColor: 'rgba(255,255,255,0.02)' } }}>
                    <td style={tdStyle}>{u.name}</td>
                    <td style={tdStyle}>{u.email}</td>
                    <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td style={tdStyle}>{renderRoleBadge(u.role)}</td>
                    <td style={tdStyle}>{renderStatusBadge(u.status)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          disabled={isSelf || isAdmin}
                          onClick={() => handleToggleRole(u)}
                          title="PRO / FREE 등급 토글"
                          style={{
                            ...actionButtonStyle,
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.5)',
                            opacity: isSelf || isAdmin ? 0.3 : 1,
                            cursor: isSelf || isAdmin ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <ShieldCheck size={16} /> 등급
                        </button>
                        
                        <button 
                          disabled={isSelf || isAdmin}
                          onClick={() => handleToggleStatus(u)}
                          title="정상 / 정지 상태 토글"
                          style={{
                            ...actionButtonStyle,
                            color: u.status === 'ACTIVE' ? '#f87171' : '#34d399',
                            border: `1px solid ${u.status === 'ACTIVE' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)'}`,
                            opacity: isSelf || isAdmin ? 0.3 : 1,
                            cursor: isSelf || isAdmin ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {u.status === 'ACTIVE' ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />} 
                          {u.status === 'ACTIVE' ? '정지' : '해제'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const thStyle = {
  padding: '1rem',
  borderBottom: '1px solid var(--glass-border)',
  fontWeight: '600',
  color: 'var(--text-muted)'
};

const tdStyle = {
  padding: '1rem',
};

const badgeStyle = {
  padding: '0.25rem 0.5rem',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontWeight: 'bold',
  display: 'inline-block'
};

const actionButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.4rem 0.75rem',
  borderRadius: '4px',
  background: 'rgba(0,0,0,0.2)',
  transition: 'all 0.2s ease',
  fontSize: '0.8rem'
};

export default AdminDashboard;
