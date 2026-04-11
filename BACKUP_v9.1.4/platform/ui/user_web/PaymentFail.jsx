import React from 'react';

export default function PaymentFail() {
  const urlParams = new URLSearchParams(window.location.search);
  const message = urlParams.get('message') || '알 수 없는 오류가 발생했습니다.';
  
  return (
    <div className="p-8 text-center">
      <h2 className="text-2xl font-bold text-red-600">결제 실패</h2>
      <p className="mt-4">{message}</p>
      <button className="mt-4 px-4 py-2 bg-gray-200" onClick={() => window.location.href='/subscription'}>
        돌아가기
      </button>
    </div>
  );
}
