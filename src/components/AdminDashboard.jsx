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
    let newRole = 'FREE_TRIAL';
    if (targetUser.role === 'PENDING') newRole = 'FREE_TRIAL';
    else if (targetUser.role === 'FREE_TRIAL' || targetUser.role === 'FREE') newRole = 'PAID';
    else if (targetUser.role === 'PAID') newRole = 'FREE_TRIAL';

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

  const handleResetPassword = async (targetUser) => {
    if (!confirm(`'${targetUser.email}' 유저의 비밀번호를 '0000'으로 초기화하시겠습니까?`)) return;
    try {
      await axiosClient.put(`/api/admin/users/${targetUser.id}/reset-password`);
      alert(`[완료] ${targetUser.email} 유저의 비밀번호가 0000으로 초기화되었습니다.`);
    } catch (err) {
      alert('비밀번호 초기화에 실패했습니다.');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`정말로 이 회원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.\n\n대상: ${targetUser.email}`)) return;
    try {
      await axiosClient.delete(`/api/admin/users/${targetUser.id}`);
      setUsers(prev => (Array.isArray(prev) ? prev : []).filter(u => u.id !== targetUser.id));
      alert(`[완료] ${targetUser.email} 유저가 성공적으로 영구 삭제되었습니다.`);
    } catch (err) {
      alert('유저 삭제에 실패했습니다.');
    }
  };

  const filteredUsers = (Array.isArray(users) ? users : []).filter(u => 
    (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderRoleBadge = (role) => {
    switch (role) {
      case 'ADMIN':
        return <span style={{ ...badgeStyle, backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.5)' }}>ADMIN</span>;
      case 'PAID':
        return <span style={{ ...badgeStyle, backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.5)' }}>PRO</span>;
      case 'PENDING':
        return <span style={{ ...badgeStyle, backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.5)' }}>승인 대기</span>;
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
              <th style={thStyle}>전화번호</th>
              <th style={thStyle}>가입일</th>
              <th style={thStyle}>권한 등급</th>
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
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={tdStyle}>{u.name || '미입력'}</td>
                    <td style={tdStyle}>{u.email}</td>
                    <td style={tdStyle}>{u.phone || '미등록'}</td>
                    <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td style={tdStyle}>{renderRoleBadge(u.role)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          disabled={isSelf || isAdmin}
                          onClick={() => handleToggleRole(u)}
                          title={u.role === 'PENDING' ? "가입 승인 처리" : "PRO / FREE 등급 토글"}
                          style={{
                            ...actionButtonStyle,
                            color: u.role === 'PENDING' ? '#c084fc' : '#fbbf24',
                            border: `1px solid ${u.role === 'PENDING' ? 'rgba(168, 85, 247, 0.5)' : 'rgba(245, 158, 11, 0.5)'}`,
                            opacity: isSelf || isAdmin ? 0.3 : 1,
                            cursor: isSelf || isAdmin ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <ShieldCheck size={16} /> {u.role === 'PENDING' ? '승인' : '등급'}
                        </button>
                        
                        <button 
                          disabled={isSelf || isAdmin}
                          onClick={() => handleResetPassword(u)}
                          title="비밀번호를 초기화합니다 (0000)"
                          style={{
                            ...actionButtonStyle,
                            color: '#9ca3af',
                            background: 'rgba(156, 163, 175, 0.1)',
                            border: '1px solid rgba(156, 163, 175, 0.5)',
                            opacity: isSelf || isAdmin ? 0.3 : 1,
                            cursor: isSelf || isAdmin ? 'not-allowed' : 'pointer'
                          }}
                        >
                          초기화
                        </button>
                        
                        <button 
                          disabled={isSelf || isAdmin}
                          onClick={() => handleDeleteUser(u)}
                          title="해당 회원을 영구 삭제합니다"
                          style={{
                            ...actionButtonStyle,
                            color: '#ef4444',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.5)',
                            opacity: isSelf || isAdmin ? 0.3 : 1,
                            cursor: isSelf || isAdmin ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <Trash2 size={16} /> 삭제
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
