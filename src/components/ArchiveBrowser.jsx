import React from 'react';
import { Archive, Clock, ChevronRight } from 'lucide-react';
import useSWR from 'swr';
import reportService from '../api/reportService';

const ArchiveBrowser = ({ onSnapshotSelected, currentSnapshotId }) => {
  const { data: snapshots, error } = useSWR('reports/snapshots', reportService.getHistorySnapshots, {
    refreshInterval: 60000
  });

  if (error) return null;
  if (!snapshots || snapshots.length === 0) return null;

  return (
    <div className="card fade-in" style={{ marginBottom: '1.5rem', background: 'var(--glass)', border: '1px solid var(--glass-border)' }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <Archive size={18} color="var(--primary)" />
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: 0 }}>최근 분석 스냅샷 브라우저</h3>
      </div>
      <div style={{ padding: '0.5rem', display: 'flex', gap: '0.8rem', overflowX: 'auto', whiteSpace: 'nowrap' }} className="custom-scrollbar">
        {snapshots.map((snap) => (
          <button
            key={snap.id}
            onClick={() => onSnapshotSelected(snap)}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: currentSnapshotId === snap.id ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)',
              background: currentSnapshotId === snap.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              color: currentSnapshotId === snap.id ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
              fontSize: '0.85rem'
            }}
          >
            <Clock size={14} />
            {new Date(snap.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 스냅샷
            <ChevronRight size={14} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ArchiveBrowser;
