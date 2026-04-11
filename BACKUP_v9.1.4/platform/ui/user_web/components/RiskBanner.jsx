import React from 'react';

export default function RiskBanner() {
  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 text-sm text-yellow-800">
      <p className="font-bold">투자 안내 및 위험 고지</p>
      <p>추천 종목의 목표가 및 손절가는 과거 데이터를 기반으로 산출된 통곗값입니다. 변동성이 심한 시장에서는 진입가보다 빠르게 급락할 수 있으므로 반드시 제시된 <span className="font-bold text-red-600">손절가(-10%)</span>를 준수하시길 권장합니다.</p>
    </div>
  );
}
