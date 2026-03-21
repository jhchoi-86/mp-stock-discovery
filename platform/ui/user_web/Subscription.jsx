import React, { useState } from 'react';

export default function Subscription() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="subscription-container p-4">
      <h2 className="text-2xl font-bold mb-4">MP Stock 구독 플랜</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="border p-4 rounded text-center">
          <h3 className="text-xl">FREE</h3>
          <p>무료</p>
          <ul className="text-left mt-2">
            <li>- 기본 종목 분석</li>
            <li>- 7일 이력 제공</li>
          </ul>
          <button className="mt-4 px-4 py-2 bg-gray-200" disabled>현재 사용 중</button>
        </div>
        <div className="border p-4 rounded text-center bg-blue-50">
          <h3 className="text-xl font-bold text-blue-600">PAID</h3>
          <p>월 9,900원</p>
          <ul className="text-left mt-2">
            <li>- 전체 종목 (미국/코인 포함)</li>
            <li>- 90일 이력 제공</li>
            <li>- 실시간 텔레그램 알람</li>
            <li>- Excel 데이터 리포트</li>
          </ul>
          <button 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded font-bold"
            onClick={() => setShowModal(true)}
          >
            구독 시작하기
          </button>
        </div>
      </div>
      
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded shadow-lg text-center">
            <h3 className="text-lg font-bold mb-2">안내</h3>
            <p>결제 시스템 준비 중입니다.</p>
            <button className="mt-4 px-4 py-2 bg-gray-200" onClick={() => setShowModal(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
