import React from 'react';
import { Menu, X, Rocket, Shield, BarChart3, ChevronRight, Sparkles } from 'lucide-react';
import useSWR from 'swr';
import reportService from '../api/reportService';
import MPStockDailyReport from './MPStockDailyReport';

const LandingPage = ({ onLoginClick }) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [honeypot, setHoneypot] = React.useState('');
  const [submitStatus, setSubmitStatus] = React.useState('idle'); // idle | loading | success
  
  // Task 2: SWR Data Fetching
  const { data, error, isLoading } = useSWR('reports/latest', reportService.getLatestReport, {
    revalidateOnFocus: true,
    refreshInterval: 60000 // 1 min refresh
  });

  const isFallback = !data && !isLoading; 

  // Task 4: Lead Generation Submit
  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (honeypot) return; // Silent discard for bots
    
    setSubmitStatus('loading');
    
    try {
        // Mock API call for Task 4
        await new Promise(resolve => setTimeout(resolve, 1500));
        console.log('Lead Captured:', email);
        setSubmitStatus('success');
        setEmail('');
    } catch (err) {
        console.error(err);
        setSubmitStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-[#D4AF37] selection:text-black font-sans">
      {/* Task 1: GNB (Sticky Header) with Glassmorphism */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#0a0a0a]/80 border-b border-gray-800 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex items-center gap-2 group cursor-pointer">
              <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.3)] group-hover:scale-110 transition-transform">
                <Rocket className="text-black" size={24} fill="currentColor" />
              </div>
              <span className="text-2xl font-black tracking-tighter text-white">
                MP <span className="text-[#D4AF37]">STOCK</span>
              </span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              {['Home', 'MP 시그널', 'Daily 성과', '프리미엄 구독'].map((item) => (
                <a
                  key={item}
                  href={`#${item}`}
                  className="text-sm font-medium text-gray-400 hover:text-[#D4AF37] transition-colors"
                >
                  {item}
                </a>
              ))}
              <button 
                onClick={onLoginClick}
                className="px-6 py-2.5 bg-[#D4AF37] hover:bg-[#b5952f] text-black font-bold rounded-lg transition-all shadow-[0_0_15px_rgba(212,175,55,0.2)] active:scale-95"
              >
                로그인
              </button>
            </div>

            {/* Mobile Menu Toggle */}
            <div className="md:hidden">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-[#0d0d0d] border-b border-gray-800 animate-in slide-in-from-top duration-300">
            <div className="px-4 pt-2 pb-6 space-y-2">
              {['Home', 'MP 시그널', 'Daily 성과', '프리미엄 구독'].map((item) => (
                <a
                  key={item}
                  href={`#${item}`}
                  className="block px-3 py-4 text-base font-medium text-gray-300 hover:bg-white/5 hover:text-[#D4AF37] rounded-lg transition-colors"
                >
                  {item}
                </a>
              ))}
              <div className="pt-4 px-3">
                <button 
                  onClick={onLoginClick}
                  className="w-full py-4 bg-[#D4AF37] text-black font-bold rounded-xl shadow-lg shadow-yellow-500/20"
                >
                  로그인
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Task 2 Placeholder (Next Task) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center space-y-6">
            <h1 className="text-5xl md:text-7xl font-black leading-tight">
                AI 시그널의 압도적 성치,<br/>
                <span className="text-[#D4AF37] drop-shadow-[0_0_20px_rgba(212,175,55,0.3)]">지금 바로 증명합니다.</span>
            </h1>
            <p className="text-gray-400 text-xl max-w-2xl mx-auto">
                데이터로 증명하고 결과로 말하는 MP Stock의 정밀 알고리즘.<br/>
                오늘의 실시간 성과를 아래 대시보드에서 확인하세요.
            </p>
        </div>
        
        {/* Task 2: Dashboard Slot with SWR Data */}
        <div className="mt-16 max-w-4xl mx-auto">
            <MPStockDailyReport 
              data={data} 
              isLoading={isLoading} 
              isFallback={isFallback} 
            />
        </div>
      </main>

      {/* Task 3: Value Proposition (Grid) */}
      <section id="MP 시그널" className="py-24 bg-[#141414] border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mb-16"
            >
                <h2 className="text-3xl md:text-5xl font-black mb-4">
                    왜 <span className="text-[#D4AF37]">MP Stock</span> 인가?
                </h2>
                <p className="text-gray-400">데이터가 증명하는 흔들리지 않는 원칙 투자</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                    {
                        title: "Data-Driven",
                        desc: "KIS API와 연동된 실시간 시세 및 기술적 지표를 바탕으로 오차 없는 타점을 산출합니다.",
                        icon: <BarChart3 className="text-[#D4AF37]" size={32} />
                    },
                    {
                        title: "Zero-Emotion",
                        desc: "인간의 탐욕과 공포를 배제한 AI 알고리즘이 냉철하게 최적의 진입 시점을 결정합니다.",
                        icon: <Shield className="text-[#D4AF37]" size={32} />
                    },
                    {
                        title: "Transparency",
                        desc: "매일의 수익률과 적중률을 숨김없이 공개하여 서비스의 가치를 투명하게 증명합니다.",
                        icon: <Sparkles className="text-[#D4AF37]" size={32} />
                    }
                ].map((item, idx) => (
                    <motion.div 
                        key={item.title}
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-[#0a0a0a] p-10 rounded-3xl border border-white/5 hover:border-[#D4AF37]/30 transition-all group"
                    >
                        <div className="w-16 h-16 bg-[#D4AF37]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            {item.icon}
                        </div>
                        <h4 className="text-xl font-bold mb-4">{item.title}</h4>
                        <p className="text-gray-500 leading-relaxed text-sm">
                            {item.desc}
                        </p>
                    </motion.div>
                ))}
            </div>
        </div>
      </section>

      {/* Task 4: CTA & Lead Generation Section */}
      <section id="프리미엄 구독" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] rounded-[3rem] p-12 md:p-20 border border-white/5 relative overflow-hidden text-center">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#D4AF37]/10 blur-[100px] -mr-48 -mt-48 rounded-full"></div>
            
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
            >
                <h2 className="text-3xl md:text-5xl font-black mb-6 leading-tight">
                    AI의 시그널, <br className="md:hidden"/>
                    <span className="text-[#D4AF37]">실시간으로 받아보시겠습니까?</span>
                </h2>
                <p className="text-gray-400 mb-12 max-w-xl mx-auto">
                    수만 개의 데이터를 분석하여 도출된 최적의 타점.<br/>
                    지금 유료 멤버십을 시작하거나, 무료 리포트 구독을 신청하세요.
                </p>

                <div className="flex flex-col md:flex-row gap-6 justify-center items-stretch max-w-2xl mx-auto">
                    {/* Primary CTA */}
                    <button className="flex-1 px-8 py-5 bg-[#D4AF37] hover:bg-[#b5952f] text-black font-black rounded-2xl transition-all shadow-[0_0_30px_rgba(212,175,55,0.3)] hover:shadow-[0_0_40px_rgba(212,175,55,0.5)] active:scale-95 text-lg">
                        프리미엄 멤버십 시작하기
                    </button>

                    {/* Secondary CTA (Lead Gen Form) */}
                    <form onSubmit={handleSubscribe} className="flex-1 flex flex-col gap-3">
                        <div className="relative">
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="무료 Daily 리포트 신청 (이메일)"
                                required
                                className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-[#D4AF37] focus:outline-none transition-all placeholder:text-gray-600 text-white"
                            />
                            {/* Honeypot Field */}
                            <input 
                                type="text"
                                value={honeypot}
                                onChange={(e) => setHoneypot(e.target.value)}
                                className="hidden"
                                tabIndex="-1"
                                autoComplete="off"
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={submitStatus !== 'idle'}
                            className="px-8 py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitStatus === 'loading' ? '처리 중...' : submitStatus === 'success' ? '신청 완료! ✨' : '무료 구독 신청'}
                        </button>
                    </form>
                </div>
                
                {submitStatus === 'success' && (
                    <p className="mt-4 text-[#4ADE80] text-sm font-bold animate-bounce">
                        성공적으로 신청되었습니다. 내일부터 리포트가 발송됩니다!
                    </p>
                )}
            </motion.div>
        </div>
      </section>

      {/* Task 4: Footer (Compliance) */}
      <footer className="py-16 border-t border-white/5 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center md:text-left">
            <div className="flex flex-col md:flex-row justify-between items-start gap-12">
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gray-800 rounded flex items-center justify-center">
                            <Rocket className="text-gray-400" size={14} fill="currentColor" />
                        </div>
                        <span className="font-black tracking-tighter text-gray-400">MP <span className="text-gray-600">STOCK</span></span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed max-w-md">
                        대한민국 No.1 AI 주식 시그널 플랫폼 MP Stock.<br/>
                        객관적인 데이터와 투명한 성과 공개를 원칙으로 합니다.
                    </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-12 text-sm text-gray-500">
                    <div>
                        <h5 className="font-bold text-gray-400 mb-4">대표이사 / 전략가</h5>
                        <p className="text-xs">최종한 (Jong-han Choi)</p>
                    </div>
                    <div>
                        <h5 className="font-bold text-gray-400 mb-4">사업자 정보</h5>
                        <p className="text-xs">준비중</p>
                    </div>
                    <div>
                        <h5 className="font-bold text-gray-400 mb-4">고객지원</h5>
                        <p className="text-xs">전용 텔레그램 채널 @mpstock_support</p>
                    </div>
                </div>
            </div>

            <div className="mt-16 pt-8 border-t border-white/5 space-y-4">
                <p className="text-[10px] text-gray-600 leading-normal">
                    본 사이트에서 제공하는 모든 정보는 투자 참고용이며, 실제 투자 결과에 대한 법적 책임은 투자자의 판단과 책임에 따라 달라지며 회사 및 정보 제공자는 이에 대해 어떠한 법적 책임도 지지 않습니다. 주식 투자는 원금 손실의 위험이 있으며, 과거의 수익률이 미래의 수익을 보장하지 않습니다.
                </p>
                <p className="text-[10px] text-gray-700">Copyright © 2026 MP Stock. All rights reserved.</p>
            </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
