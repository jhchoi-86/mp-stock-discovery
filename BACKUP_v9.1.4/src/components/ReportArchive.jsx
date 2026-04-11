import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axiosClient from '../api/axiosClient';
import { Archive, X, Clock, FileText, ChevronRight } from 'lucide-react';

export default function ReportArchive({ isOpen, onClose }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchReports = async () => {
      setLoading(true);
      try {
        const res = await axiosClient.get('/api/reports');
        setReports(res.data);
      } catch (err) {
        console.error('Failed to fetch reports:', err);
        setError('리포트 목록을 불러오는데 실패했습니다. 권한이 없거나 네트워크 오류입니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', color: '#e2e8f0'
    }}>
      {/* Backdrop */}
      <div 
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(2, 6, 23, 0.8)', backdropFilter: 'blur(4px)', transition: 'opacity 0.2s'
        }}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div style={{
        position: 'relative', backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid #334155',
        width: '100%', maxWidth: '896px', maxHeight: '90vh', borderRadius: '1rem', 
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', borderBottom: '1px solid #1e293b', backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.5rem', backgroundColor: 'rgba(99, 102, 241, 0.2)', borderRadius: '0.5rem' }}>
              <Archive size={24} color="#818cf8" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', margin: 0 }}>VIP 자료실</h2>
              <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>과거 발송된 종목 리서치 텔레그램 리포트 보관함</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{ padding: '0.5rem', color: '#94a3b8', background: 'transparent', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', backgroundColor: 'rgba(15, 23, 42, 0.3)' }} className="custom-scrollbar">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '12rem', gap: '1rem' }}>
              <div className="spin" style={{ width: '2rem', height: '2rem', border: '4px solid rgba(99, 102, 241, 0.2)', borderTopColor: '#6366f1', borderRadius: '50%' }} />
              <p style={{ color: '#94a3b8' }}>VIP 원장 데이터를 로딩중입니다...</p>
            </div>
          ) : error ? (
            <div style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.5)', color: '#fb7185', padding: '1rem', borderRadius: '0.75rem', textAlign: 'center' }}>
              {error}
            </div>
          ) : reports.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <FileText size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p>아직 발송된 리포트가 없습니다.</p>
            </div>
          ) : (
            reports.map(report => (
              <div 
                key={report.id} 
                style={{ backgroundColor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(51, 65, 85, 0.6)', borderRadius: '0.75rem', padding: '1.25rem', transition: 'all 0.2s' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(51, 65, 85, 0.5)', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#a5b4fc' }}>
                    <Clock size={16} />
                    <span style={{ fontWeight: 600 }}>
                      {new Date(report.sentAt).toLocaleString('ko-KR', {
                        year: 'numeric', month: 'long', day: 'numeric', 
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', backgroundColor: '#334155', color: '#cbd5e1', padding: '0.25rem 0.75rem', borderRadius: '9999px', border: '1px solid #475569' }}>
                    발송자: {report.author.name}
                  </div>
                </div>
                
                <div style={{ maxWidth: '100%' }}>
                  <pre style={{ 
                    fontSize: '0.875rem', fontFamily: 'inherit', color: '#cbd5e1', whiteSpace: 'pre-wrap', 
                    backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '1rem', borderRadius: '0.5rem', 
                    border: '1px solid rgba(30, 41, 59, 0.8)', lineHeight: 1.6, maxHeight: '24rem', overflowY: 'auto' 
                  }} className="custom-scrollbar">
                    {report.content}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
