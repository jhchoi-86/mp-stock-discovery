import { useState, useCallback } from 'react';


const usePriceEdit = (stockCode, initialPrices, onEdit = null) => {
  const [isEditing, setIsEditing]   = useState(false);
  const [isSaving, setIsSaving]     = useState(false); // R-04: 중복 클릭 방지
  const [prices, setPrices]         = useState(initialPrices);
  const [editValues, setEditValues] = useState(initialPrices);
  const [isManual, setIsManual]     = useState(initialPrices?.is_manual_price ?? initialPrices?.is_manual ?? false);
  const [error, setError]           = useState(null);

  const validate = useCallback((v) => {
    const fields = [v.entry1, v.entry2, v.target, v.stop_loss];
    if (fields.some(f => !Number.isInteger(Number(f)) || Number(f) <= 0))
      return '모든 가격은 0보다 큰 정수여야 합니다.';
    if (Number(v.stop_loss) >= Number(v.entry2))
      return '손절가는 2차 진입가보다 낮아야 합니다.';
    if (Number(v.entry2) >= Number(v.entry1))
      return '2차 진입가는 1차 진입가보다 낮아야 합니다.';
    if (Number(v.entry1) >= Number(v.target))
      return '1차 진입가는 목표가보다 낮아야 합니다.';
    return null;
  }, []);

  const handleChange = useCallback((field, value) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    const nextValues = { ...editValues, [field]: cleanValue };
    setEditValues(nextValues);
    setError(null);
    
    // [v9.5.8] Notify external manager of changes
    if (onEdit) {
      onEdit(stockCode, {
        entry1: Number(nextValues.entry1),
        entry2: Number(nextValues.entry2),
        target: Number(nextValues.target),
        stop_loss: Number(nextValues.stop_loss)
      });
    }
  }, [editValues, onEdit, stockCode]);

  const save = useCallback(async () => {
    if (isSaving) return; // R-04: 중복 클릭 차단
    const err = validate(editValues);
    if (err) { setError(err); return; }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/signals/price-edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`
        },
        body: JSON.stringify({
          ticker:    stockCode,
          entry1:    Number(editValues.entry1),
          entry2:    Number(editValues.entry2),
          target:    Number(editValues.target),
          stopLoss:  Number(editValues.stop_loss),
          aiComment: editValues.aiComment || null
        })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || data.message || '저장 실패'); return; }
      setPrices({ ...editValues });
      setIsManual(true);
      setIsEditing(false);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, editValues, stockCode, validate]);

  const cancel = useCallback(() => {
    setEditValues({ ...prices });
    setError(null);
    setIsEditing(false);
  }, [prices]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  }, [save, cancel]);

  return { isEditing, isSaving, prices, editValues, isManual, error,
           setIsEditing, handleChange, save, cancel, handleKeyDown };
};

export default usePriceEdit;
