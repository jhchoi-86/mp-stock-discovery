import React from 'react';
import usePriceEdit from '../hooks/usePriceEdit';
import '../css/price-edit.css'; // [STEP-07] CSS 경로 미리 설정

const fmt = (v) => v != null ? Number(v).toLocaleString('ko-KR') + '원' : '-';

const FIELDS = [
  { label: '1차 매수진입가 (2H)', field: 'entry1' },
  { label: '2차 매수진입가 (2H)', field: 'entry2' },
  { label: '목표가 (Target)',      field: 'target' },
  { label: '손절가 (SL)',          field: 'stop_loss' }
];

const PriceEditSection = ({ stockCode, initialPrices, hideTitle = false, onEdit = null }) => {
  const { isEditing, isSaving, prices, editValues, isManual, error,
          setIsEditing, handleChange, save, cancel, handleKeyDown }
    = usePriceEdit(stockCode, initialPrices, onEdit);

  return (
    <div className={`price-edit-section ${isEditing ? 'editing' : ''} ${hideTitle ? 'compact' : ''}`}>
      {!hideTitle && (
        <div className="price-header">
          <span className="section-title">추천매매 (Manual)</span>
          <div className="price-actions">
            {isManual && !isEditing && (
              <span className="manual-badge">● 수동수정</span>
            )}
            {!isEditing ? (
              <button className="edit-btn" onClick={() => setIsEditing(true)}>✏️ 편집</button>
            ) : (
              <>
                <button className="save-btn" onClick={save} disabled={isSaving}>
                  {isSaving ? '저장 중...' : '저장'}
                </button>
                <button className="cancel-btn" onClick={cancel} disabled={isSaving}>취소</button>
              </>
            )}
          </div>
        </div>
      )}
      {hideTitle && (
         <div className="price-actions-compact">
            {!isEditing ? (
              <button className="edit-btn-compact" onClick={() => setIsEditing(true)}>✏️ 편집</button>
            ) : (
              <div className="compact-save-wrapper">
                <button className="save-btn" onClick={save} disabled={isSaving}>저장</button>
                <button className="cancel-btn" onClick={cancel} disabled={isSaving}>취소</button>
              </div>
            )}
         </div>
      )}

      <div className="price-grid">
        {FIELDS.map(({ label, field }) => (
          <div className="price-row" key={field}>
            <span className="price-label">{label}</span>
            {isEditing ? (
              <input
                type="text" inputMode="numeric"
                className="price-input"
                value={editValues[field] ?? ''}
                onChange={e => handleChange(field, e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus={field === 'entry1'}
              />
            ) : (
              <span className="price-value">{fmt(prices[field])}</span>
            )}
          </div>
        ))}
      </div>

      {error && <div className="price-error">⚠️ {error}</div>}
      {isEditing && (
        <div className="price-hint">
          Enter: 저장 | ESC: 취소 | 순서: 손절가 &lt; 2차 &lt; 1차 &lt; 목표
        </div>
      )}
    </div>
  );
};

export default PriceEditSection;
