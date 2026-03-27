import React, { useState } from 'react';
import axiosClient from '../api/axiosClient';
import { Play, BarChart3, Target, TrendingUp, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';

export default function BacktestReportWidget() {
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);

    const runBacktest = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axiosClient.post('/api/backtest/run');
            if (res.data.success) {
                setResults(res.data.metrics);
            } else {
                setError('백테스트 실행 실패: ' + (res.data.error || '알 수 없는 오류'));
            }
        } catch (err) {
            console.error('Backtest API Error:', err);
            const msg = err.response?.data?.error || err.response?.data?.details || err.message || '서버 통신 중 오류가 발생했습니다.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full bg-slate-900/60 backdrop-blur-2xl rounded-[2.5rem] p-10 border border-white/10 shadow-[0_22px_70px_4px_rgba(0,0,0,0.56)] relative overflow-hidden group">
            {/* Ambient Background Glows */}
            <div className="absolute -top-32 -right-32 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] group-hover:bg-emerald-500/20 transition-all duration-1000" />
            <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] group-hover:bg-blue-500/20 transition-all duration-1000" />
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6 relative z-10">
                <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                        <div className="bg-emerald-500/20 p-2 rounded-lg">
                            <BarChart3 size={24} className="text-emerald-400" />
                        </div>
                        <h2 className="text-3xl font-black tracking-tight text-white">
                            엔진 성능 검증 <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Backtest</span>
                        </h2>
                    </div>
                    <p className="text-slate-400 text-sm font-medium pl-12">
                        합성 틱 데이터 모델링 기반 <span className="text-emerald-400/80">공격적 슬리피지(0.7%)</span> 반영 시뮬레이션
                    </p>
                </div>
                
                <button 
                    onClick={runBacktest}
                    disabled={loading}
                    className={`group/btn relative flex items-center space-x-3 px-8 py-4 rounded-2xl font-black text-lg transition-all transform active:scale-95 shadow-2xl overflow-hidden ${
                        loading 
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                        : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white hover:shadow-emerald-500/40 hover:-translate-y-1'
                    }`}
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                    <span className="relative flex items-center gap-3">
                        {loading ? (
                            <>
                                <Loader2 size={24} className="animate-spin" />
                                <span>정밀 분석 중...</span>
                            </>
                        ) : (
                            <>
                                <Play size={24} fill="currentColor" className="group-hover/btn:scale-110 transition-transform" />
                                <span>시뮬레이션 시작</span>
                            </>
                        )}
                    </span>
                </button>
            </div>

            {error && (
                <div className="mb-8 p-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center space-x-4 text-rose-400 animate-in fade-in slide-in-from-top-4 duration-500">
                    <AlertCircle size={24} />
                    <span className="text-base font-bold">{error}</span>
                </div>
            )}

            {!results && !loading && !error && (
                <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2rem] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-500 group/empty">
                    <div className="bg-slate-800/50 p-6 rounded-full mb-6 group-hover/empty:scale-110 group-hover/empty:bg-slate-800 transition-all duration-500">
                        <BarChart3 size={64} className="text-slate-600 group-hover/empty:text-emerald-500/50" />
                    </div>
                    <p className="text-slate-500 text-lg font-bold">시뮬레이션을 통해 매매 전략의 원자성을 검증하세요.</p>
                    <p className="text-slate-600 text-sm mt-1">과거 틱 데이터를 기반으로 슬리피지와 세금을 포함한 실전 수익률을 계산합니다.</p>
                </div>
            )}

            {loading && (
                <div className="py-24 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
                    <div className="relative">
                        <div className="w-24 h-24 border-[6px] border-emerald-500/10 rounded-full" />
                        <div className="w-24 h-24 border-[6px] border-t-emerald-500 border-r-emerald-500/50 rounded-full animate-spin absolute top-0 left-0" />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-white font-black text-2xl animate-pulse tracking-tight">수급 데이터 스트리밍 중...</p>
                        <p className="text-emerald-500/60 text-sm font-bold flex items-center justify-center gap-2">
                            <Info size={14} /> 실시간 트래커 모델이 틱 단위로 정산을 수행하고 있습니다.
                        </p>
                    </div>
                </div>
            )}

            {results && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in slide-in-from-bottom-8 duration-700">
                    {/* Win Rate Card */}
                    <div className="bg-gradient-to-b from-white/[0.06] to-transparent border border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center text-center hover:border-emerald-500/30 transition-all group/card shadow-xl">
                        <div className="p-4 bg-emerald-500/10 rounded-2xl mb-6 group-hover/card:scale-110 group-hover/card:bg-emerald-500/20 transition-all duration-500">
                            <Target size={36} className="text-emerald-400" />
                        </div>
                        <span className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mb-2">전략 생존 승률</span>
                        <div className="text-5xl font-black text-white tracking-tighter">
                            {results.win_rate.toFixed(1)}<span className="text-2xl ml-1 text-emerald-500">%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800/50 rounded-full mt-6 overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]" 
                                style={{ width: `${results.win_rate}%` }}
                            />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-4 font-bold leading-relaxed">손절(-1.5%) 도달 전<br/>목표가(+3.0%) 터치 확률</p>
                    </div>

                    {/* Net PnL Card */}
                    <div className="bg-gradient-to-b from-white/[0.06] to-transparent border border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center text-center hover:border-blue-500/30 transition-all group/card shadow-xl">
                        <div className="p-4 bg-blue-500/10 rounded-2xl mb-6 group-hover/card:scale-110 group-hover/card:bg-blue-500/20 transition-all duration-500">
                            <TrendingUp size={36} className="text-blue-400" />
                        </div>
                        <span className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mb-2">최종 누적 수익률</span>
                        <div className={`text-5xl font-black tracking-tighter ${results.net_pnl >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                            {results.net_pnl >= 0 ? '+' : ''}{results.net_pnl.toFixed(2)}<span className="text-2xl ml-1">%</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-6 font-bold leading-relaxed px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                            거래세, 수수료 및<br/>
                            <span className="text-rose-400/90 font-black">슬리피지(0.7%)</span> 페널티 합산
                        </p>
                    </div>

                    {/* Total Trades Card */}
                    <div className="bg-gradient-to-b from-white/[0.06] to-transparent border border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center text-center hover:border-slate-500/30 transition-all group/card shadow-xl">
                        <div className="p-4 bg-white/5 rounded-2xl mb-6 group-hover/card:scale-110 group-hover/card:bg-white/10 transition-all duration-500">
                            <CheckCircle2 size={36} className="text-slate-300" />
                        </div>
                        <span className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] mb-2">체결 완료 건수</span>
                        <div className="text-5xl font-black text-white tracking-tighter">
                            {results.total_trades}<span className="text-2xl ml-1 text-slate-500">건</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-6 font-bold leading-relaxed">테스트 기간 내 포착된<br/>Grade A 이상 고정예 신호</p>
                    </div>
                </div>
            )}
        </div>
    );
}
