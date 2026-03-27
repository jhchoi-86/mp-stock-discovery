import React, { useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient';
import { TrendingUp, Trophy, AlertCircle } from 'lucide-react';

export default function RoiRankingWidget() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        const res = await axiosClient.get('/api/roi-ranking');
        setRankings(res.data);
      } catch (err) {
        // Silently handle 401 if it's just a timing issue during initial load
        if (err.response?.status !== 401) {
          console.error('Failed to fetch ROI rankings:', err);
          setError('수익률 데이터를 불러오는데 실패했습니다.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
    
    // Refresh ranking smoothly every 30 seconds
    const interval = setInterval(fetchRankings, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return null; // Or a subtle skeleton loader
  
  if (error || rankings.length === 0) {
    return (
      <div className="w-full bg-slate-900/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 mb-6 flex items-center justify-center text-slate-400">
        <AlertCircle size={20} className="mr-2" />
        <span className="text-sm">{error || "아직 집계된 추천 적중 데이터가 없습니다."}</span>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 mb-8 shadow-xl relative overflow-hidden">
      {/* Decorative gradient blob */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      
      <div className="flex items-center space-x-3 mb-6 relative z-10">
        <div className="p-2 bg-emerald-500/20 rounded-lg">
          <Trophy size={24} className="text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          실시간 적중률 & 수익률 TOP
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
        {rankings.map((r, idx) => (
          <div 
            key={r.id} 
            className="flex flex-col bg-slate-800/80 rounded-xl p-4 border border-slate-600/50 hover:border-emerald-500/50 transition-all group"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center space-x-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-xs font-bold text-slate-300 shadow-inner">
                  {idx + 1}
                </span>
                <span className="font-bold text-slate-100 truncate">{r.stockName}</span>
              </div>
            </div>
            
            <div className="flex flex-col space-y-1 mt-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">진입가</span>
                <span className="text-slate-300 font-medium">{r.entryPrice.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">최고가 (현재)</span>
                <span className="text-slate-300 font-medium">{r.highestPrice ? r.highestPrice.toLocaleString() : r.currentPrice.toLocaleString()}원 <span className="text-slate-500 text-[10px]">({r.currentPrice.toLocaleString()})</span></span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 font-semibold">최대 수익률</span>
                <div className={`flex items-center font-bold text-lg ${r.roi >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                  {r.roi >= 0 ? <TrendingUp size={16} className="mr-1" /> : <TrendingUp size={16} className="mr-1 rotate-180" />}
                  {r.roi > 0 ? '+' : ''}{r.roi}%
                </div>
              </div>
              
              {r.isTargetHit && (
                <div className="flex justify-center items-center bg-rose-500/20 text-rose-400 text-xs mt-1 font-bold py-1.5 px-2 rounded-lg border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
                  🎯 목표가 달성!
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
