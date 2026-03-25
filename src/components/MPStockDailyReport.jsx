import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const MPStockDailyReport = ({ data, isLoading, isFallback }) => {
  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center space-y-4 animate-pulse">
        <Loader2 className="animate-spin text-[#D4AF37]" size={40} />
        <p className="text-gray-500 font-medium">데이터를 실시간으로 불러오는 중...</p>
      </div>
    );
  }

  if (!data || !data.stocks || data.stocks.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 italic p-8 border-2 border-dashed border-white/5 rounded-3xl">
        <p>오늘의 매수 체결 데이터가 아직 수집되지 않았습니다.</p>
        <p className="text-sm mt-2">장중 실시간 업데이트 예정입니다.</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-[#111] rounded-3xl border border-white/5 overflow-hidden shadow-2xl"
    >
      {/* Header Info */}
      <div className="p-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-white/[0.02] to-transparent">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <span className="w-2 h-6 bg-[#D4AF37] rounded-full"></span>
            Daily Performance Highlights
          </h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-400">{data.header?.report_date || '오늘'}</span>
            {isFallback && (
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20">
                최근 장 마감 기준
              </span>
            )}
          </div>
        </div>
        
        {/* Summary Stats */}
        <div className="flex gap-4 md:gap-8">
            <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Execution Rate</p>
                <p className="text-lg font-black text-white">{data.summary?.execution_rate || 0}%</p>
            </div>
            <div className="text-right border-l border-white/10 pl-4 md:pl-8">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Avg Yield</p>
                <p className={`text-lg font-black ${data.summary?.avg_yield >= 0 ? 'text-[#EF4444]' : 'text-[#3B82F6]'}`}>
                    {data.summary?.avg_yield >= 0 ? '+' : ''}{data.summary?.avg_yield || 0}%
                </p>
            </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/[0.02] border-b border-white/5">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 bg-[#111] z-10 transition-colors">종목명</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">타점 (t1/t2)</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">상태</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">수익률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.stocks.map((stock, idx) => (
              <tr key={stock.code || idx} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-5 sticky left-0 bg-[#111] z-10 font-bold text-white group-hover:bg-[#1a1a1a] transition-colors">
                  <div className="flex flex-col">
                    <span>{stock.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono tracking-tighter uppercase">{stock.code}</span>
                  </div>
                </td>
                <td className="px-6 py-5">
                    <div className="text-sm font-medium">
                        {(stock.targets?.entry_1st || 0).toLocaleString()}원
                    </div>
                    <div className="text-[10px] text-gray-500">
                        저가: {(stock.market_data?.low || 0).toLocaleString()}원
                    </div>
                </td>
                <td className="px-6 py-5 text-center">
                  <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold border ${
                    stock.status === 'EXECUTED' 
                      ? 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20' 
                      : 'text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/20'
                  }`}>
                    {stock.status === 'EXECUTED' ? '체결 완료' : '미체결'}
                  </span>
                </td>
                <td className="px-6 py-5 text-right font-black">
                  <div className={`flex items-center justify-end gap-1 ${
                    stock.yield_pct > 0 ? 'text-[#EF4444]' : stock.yield_pct < 0 ? 'text-[#3B82F6]' : 'text-gray-400'
                  }`}>
                    {stock.yield_pct > 0 ? <ArrowUpRight size={14} strokeWidth={3} /> : stock.yield_pct < 0 ? <ArrowDownRight size={14} strokeWidth={3} /> : <Minus size={14} />}
                    <span className="text-lg">{Math.abs(stock.yield_pct || 0)}%</span>
                  </div>
                  <div className="text-[10px] text-gray-500 font-normal">Max: +{stock.max_yield_pct || 0}%</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Footer Info */}
      <div className="px-6 py-3 bg-white/[0.01] border-t border-white/5 text-[10px] text-gray-600 flex justify-between">
          <span>* 실시간 체결가는 KIS API 연동 공식 데이터입니다.</span>
          <span>Last Updated: {new Date(data.header?.generated_at || Date.now()).toLocaleTimeString()}</span>
      </div>
    </motion.div>
  );
};

export default MPStockDailyReport;
