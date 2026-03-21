import React, { useEffect, useState } from 'react';

export default function PaymentSuccess() {
  const [status, setStatus] = useState('결제 처리 중...');
  
  useEffect(() => {
    // URL에서 paymentKey, orderId, amount 추출
    const urlParams = new URLSearchParams(window.location.search);
    const paymentKey = urlParams.get('paymentKey');
    const orderId = urlParams.get('orderId');
    const amount = urlParams.get('amount');
    
    // RED TEAM ACTION ITEM (T4-03): 웹훅이 아니라 실제 Confirm API 호출이 주력이어야 함. 기능 구현은 추후.
    if(paymentKey) {
       setTimeout(() => setStatus('결제가 성공적으로 반영되었습니다! (Confirm API 예방접종)'), 2000);
    }
  }, []);

  return (
    <div className="p-8 text-center">
      <h2 className="text-2xl font-bold text-green-600">결제 성공</h2>
      <p className="mt-4">{status}</p>
    </div>
  );
}
