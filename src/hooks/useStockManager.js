import { useState, useEffect, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { generateReportContent, generateTelegramContent } from '../utils/reportUtils';
import toast from 'react-hot-toast';

export const useStockManager = (isAuthenticated) => {
  const [stocks, setStocks] = useState(() => {
    try {
      const saved = localStorage.getItem('mp_stocks');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [signals, setSignals] = useState(() => {
    try {
      const saved = localStorage.getItem('mp_signals');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState(() => localStorage.getItem('mp_marketFilter') || "ALL");
  const [categoryFilter, setCategoryFilter] = useState(() => localStorage.getItem('mp_categoryFilter') || 'ALL');
  const [showAll, setShowAll] = useState(() => localStorage.getItem('mp_showAll') === 'true');
  const [showOnlyApproved, setShowOnlyApproved] = useState(false);
  const [showOnlyTopSectors, setShowOnlyTopSectors] = useState(false);
  const [uploadTimeframe, setUploadTimeframe] = useState(() => localStorage.getItem('mp_uploadTimeframe') || "1D");
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 100, timeframe: '' });
  const [isSendingTg, setIsSendingTg] = useState(false);

  // Archive Mode
  const [activeSnapshot, setActiveSnapshot] = useState(null); // { id, signals, createdAt }
  const [originalSignals, setOriginalSignals] = useState([]); // Backup of live signals

  // Selections
  const [selectedStocks, setSelectedStocks] = useState(new Set());

  // LocalStorage Persist
  useEffect(() => { localStorage.setItem('mp_marketFilter', marketFilter); }, [marketFilter]);
  useEffect(() => { localStorage.setItem('mp_categoryFilter', categoryFilter); }, [categoryFilter]);
  useEffect(() => { localStorage.setItem('mp_showAll', String(showAll)); }, [showAll]);
  useEffect(() => { localStorage.setItem('mp_uploadTimeframe', uploadTimeframe); }, [uploadTimeframe]);

  // 🔴 [Red Team 방어] Persistent Data Storage
  useEffect(() => { 
    if (stocks && stocks.length > 0) localStorage.setItem('mp_stocks', JSON.stringify(stocks)); 
  }, [stocks]);
  useEffect(() => { 
    if (signals && signals.length > 0) localStorage.setItem('mp_signals', JSON.stringify(signals)); 
  }, [signals]);

  const fetchData = async () => {
    try {
      const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : "";
      const [stocksRes, signalsRes] = await Promise.all([
        fetch(`${API_URL}/api/stocks`, { credentials: 'include' }),
        fetch(`${API_URL}/api/signals`, { credentials: 'include' })
      ]);
      
      let stocksData = await stocksRes.json();
      let signalsData = await signalsRes.json();
      
      // 방어 코드: 401/403 등 에러 JSON 객체가 반환되었을 경우 빈 배열로 강제 처리하여 React UI Crash(White Screen) 방지
      if (!Array.isArray(stocksData)) stocksData = [];
      if (!Array.isArray(signalsData)) signalsData = [];
      
      setStocks(stocksData);
      setSignals(signalsData);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    fetchData(); // Initial data load
    
    // 🔴 [Red Team 방어] 동기화 상태 복구 로직
    const checkSyncStatus = async () => {
      try {
        const res = await axiosClient.get('/api/auto-sync/status');
        if (res.data?.isSyncing) {
            setIsSyncing(true);
            // syncProgress는 이제 전역 SSEContext에서 관리함
        }
      } catch(e) { console.error('Sync status check failed:', e); }
    };
    checkSyncStatus();
    
    // SSE 관리 로직은 SSEContext.jsx로 이동됨 (중복 연결 방지)
  }, [isAuthenticated]);

  const getSignalsForStock = (code) => {
    const stockSignals = (Array.isArray(signals) ? signals : []).filter(s => s.code === code);
    const timeframes = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"];
    const status = {};
    timeframes.forEach(tf => {
      const latest = (Array.isArray(stockSignals) ? stockSignals : [])
        .filter(s => s.timeframe === tf)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      status[tf] = latest;
    });
    return status;
  };

  const getLatestGlobal = (code) => {
    return (Array.isArray(signals) ? signals : [])
      .filter(s => s.code === code)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  };

  const topSectors = useMemo(() => {
    const sectorCounts = {};
    if (Array.isArray(stocks)) {
      stocks.forEach(stock => {
        const latest = getLatestGlobal(stock.code);
        if (latest && latest.signal_HH) {
          const sector = stock.sector || '기타';
          if (sector !== '기타') {
            sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
          }
        }
      });
    }
    return Object.entries(sectorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
  }, [stocks, signals]);

  const filteredStocks = (Array.isArray(stocks) ? stocks : []).filter(stock => {
    const matchesSearch = stock.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stock.code.includes(searchQuery);
    const matchesMarket = marketFilter === "ALL" || stock.market === marketFilter;
    
    let matchesCategory = true;
    if (categoryFilter === '추천종목') {
      matchesCategory = selectedStocks.has(stock.code);
    } else if (categoryFilter !== 'ALL') {
      const latest = getLatestGlobal(stock.code);
      const cat = latest ? latest.category : '';
      matchesCategory = (cat === categoryFilter);
    }
    
    return matchesSearch && matchesMarket && matchesCategory;
  });

  const calculateTotalScore = (tfSigs, latest, isTopSector) => {
    let score = 0;
    const s2H = tfSigs['2H'];
    const s1D = tfSigs['1D'];
    
    if (!s2H) return { score: 0, bestTf: '1D' };

    // 1. 추세필터 (2H) - 15점
    if (s2H.cond_up7) score += 15;

    // 2. 눌림목감지 (2H) - 15점
    if (s2H.DHH2) score += 15;

    // 3. 이평선 정배열 (2H) - 30점 (5 > 10 > 20 > 60)
    const isAligned = s2H.ema5 > s2H.ema10 && s2H.ema10 > s2H.ema20 && s2H.ema20 > s2H.ema60;
    if (isAligned) score += 30;

    // 4. 이격도 A (2H) - 10점 (정배열 && 10 < Price < 5)
    if (isAligned && s2H.current_price < s2H.ema5 && s2H.current_price > s2H.ema10) score += 10;

    // 5. 이격도 B (2H) - 5점 (정배열 && 20 < Price < 10)
    if (isAligned && s2H.current_price < s2H.ema10 && s2H.current_price > s2H.ema20) score += 5;

    // Multi-TF 가산점 (1H, 2H, 4H, 1D, 2D)
    const checkTfs = ['1H', '2H', '4H', '1D', '2D'];
    
    // 6. 매수신호 중첩 - 각 2점 (Max 10)
    checkTfs.forEach(tf => {
      if (tfSigs[tf]?.signal_HH || tfSigs[tf]?.DHH2) score += 2;
    });

    // 7. 추세신호 중첩 - 각 2점 (Max 10)
    checkTfs.forEach(tf => {
      if (tfSigs[tf]?.cond_up7) score += 2;
    });

    // 8. 강력신호 보너스 - 각 1점 (Max 5)
    checkTfs.forEach(tf => {
      if (tfSigs[tf]?.cond_up7 && (tfSigs[tf]?.signal_HH || tfSigs[tf]?.DHH2)) score += 1;
    });

    // 9. 진입가 근접성 (2H) - 3점 (|현재가-result_2| < 1%)
    if (s2H.result_2 > 0) {
      const diff = Math.abs(s2H.current_price - s2H.result_2) / s2H.result_2;
      if (diff <= 0.01) score += 3;
    }

    // 10. 거래량 급증 (1D) - 2점 (1.5배 이상)
    if (s1D?.trigger_vol) score += 2;

    return { score: Math.min(score, 100), bestTf: '2H' };
  };

  const candidatesRaw = filteredStocks.map(stock => {
    const tfSigs = getSignalsForStock(stock.code);
    const latest = getLatestGlobal(stock.code);
    const isTopSector = topSectors.includes(stock.sector);
    const scoreData = calculateTotalScore(tfSigs, latest, isTopSector);
    const bestSignal = tfSigs[scoreData.bestTf] || latest;
    
    return {
      ...stock,
      timeframeStatus: tfSigs,
      latestSignal: latest,
      bestSignal: bestSignal,
      bestTfLabel: scoreData.bestTf,
      isTopSector,
      total_score: scoreData.score,
      is_alignment: tfSigs['2H']?.ema5 > tfSigs['2H']?.ema10 && tfSigs['2H']?.ema10 > tfSigs['2H']?.ema20 && tfSigs['2H']?.ema20 > tfSigs['2H']?.ema60,
      is_dip_area: tfSigs['2H']?.DHH2,
      is_mtf_signal: ['1H', '2H', '4H'].some(tf => tfSigs[tf]?.signal_HH)
    };
  });

  const candidates = showAll 
    ? [...candidatesRaw].sort((a, b) => b.total_score - a.total_score)
    : [...candidatesRaw].sort((a, b) => b.total_score - a.total_score).slice(0, 10);

  const activeCount = [...new Set((Array.isArray(signals) ? signals : []).filter(s => s.signal_HH).map(s => s.code))].length;

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedStocks(new Set(candidates.map(s => s.code)));
    } else {
      setSelectedStocks(new Set());
    }
  };

  const toggleSelectStock = (code) => {
    setSelectedStocks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(code)) {
        newSet.delete(code);
      } else {
        newSet.add(code);
      }
      return newSet;
    });
  };

  // Actions
  const handleCsvUpload = async (file) => {
    if (!file) return;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const csvData = e.target.result;
        try {
          const response = await axiosClient.post('/api/import-csv', { csv: csvData, timeframe: uploadTimeframe });
          if (response.status === 200) {
            alert('CSV 데이터가 성공적으로 업로드되었습니다.');
            fetchData();
            resolve(true);
          }
        } catch (error) {
          console.error('Upload error:', error);
          alert(`업로드 실패: ${error.response?.data?.error || '알 수 없는 오류'}`);
          reject(error);
        }
      };
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const handleReset = async () => {
    if (!window.confirm('정말 모든 분석 데이터를 초기화하시겠습니까? (복구할 수 없습니다)')) return;
    try {
      const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : `https://mpstock.co.kr`;
      const response = await fetch(`${API_URL}/api/reset`, { method: 'POST' });
      if (response.ok) {
        // Also explicitly call stop-sync to be sure
        await axiosClient.post('/api/auto-sync/stop').catch(() => {});
        
        const result = await response.json();
        alert(result.message);
        setSelectedStocks(new Set());
        setIsSyncing(false);
        setShowAll(true); // Show all 350 stocks at 0 points
        fetchData();
      } else {
        alert("초기화 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Reset error:", error);
      alert("서버 연결에 실패했습니다.");
    }
  };

  const handleIntegratedSync = async () => {
    if (!window.confirm(`1H, 2H, 4H, 1D, 1W 시간대 데이터를 차례대로 자동 동기화하시겠습니까?\n(이 작업은 약 2~3분 정도 소요됩니다.)`)) return;
    setIsSyncing(true);
    setSelectedStocks(new Set());
    setShowAll(false); 
    
    // Initial UI state: Indicate preparing
    setSyncProgress({ current: 0, total: 350, timeframe: '준비' });
    
    const timeframes = ['1H', '2H', '4H', '1D', '1W'];
    
    try {
      // One integrated request - Backend handles the loop and SSE
      await axiosClient.post('/api/auto-sync', { timeframe: timeframes }, { timeout: 600000 });
      // Upon final completion
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 100, timeframe: '' });
      alert("통합 자동 동기화가 완료되었습니다.");
      fetchData();
    } catch (error) {
      console.error("Integrated sync error:", error);
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 100, timeframe: '' });
      if (error.response?.status !== 403 && error.response?.status !== 429) {
        alert(error.response?.data?.error || "동기화 중 오류가 발생했습니다.");
      }
    }
  };

  const handleSnapshotSelected = async (snapshotHeader) => {
    if (!snapshotHeader) {
      // Return to Live Mode
      setSignals(originalSignals);
      setActiveSnapshot(null);
      return;
    }

    try {
      if (!activeSnapshot) setOriginalSignals(signals); // Backup live signals once
      
      const res = await axiosClient.get(`/api/archive/snapshots/${snapshotHeader.id}`);
      const fullSnapshot = res.data;
      
      setSignals(fullSnapshot.signals);
      setActiveSnapshot(fullSnapshot);
      toast.success(`${new Date(fullSnapshot.createdAt).toLocaleString()} 스냅샷을 불러왔습니다.`);
    } catch (e) {
      console.error('Snapshot load failed', e);
      toast.error('스냅샷 로드 실패');
    }
  };

  const handleDownloadReport = () => {
    const mdContent = generateReportContent(candidates);
    if (!mdContent) {
      alert("현재 확정된 HH 신호나 매수 승인 종목이 없습니다.");
      return;
    }
    const blob = new Blob([mdContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MP_REPORT_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTVList = () => {
    const tvStocks = (Array.isArray(candidates) ? candidates : [])
      .filter(s => s.total_score >= 50)
      .map(s => `KRX:${s.code}`)
      .join(', ');

    if (!tvStocks) {
      alert("50점 이상 종목이 없습니다.");
      return;
    }
    
    const blob = new Blob([tvStocks], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TV_WATCHLIST_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToTelegram = async () => {
    setIsSendingTg(true);

    const allCandidates = Array.isArray(candidates) ? candidates : [];
    let reportStocks = allCandidates.filter(stock => selectedStocks.has(stock.code));

    // 체크된 종목이 없으면, 총점(total_score) 기준 상위 5개를 추출
    if (reportStocks.length === 0) {
      reportStocks = [...allCandidates]
        .filter(stock => stock.total_score >= 50)  // 최소 50점 이상인 종목에 한하여
        .sort((a, b) => b.total_score - a.total_score)
        .slice(0, 5);
    } else {
      // 체크된 종목이 있어도 무조건 최대 5개로 잘라서 전송
      reportStocks = reportStocks.slice(0, 5);
    }

    const approvedStocks = reportStocks.filter(s => s.latestSignal && s.latestSignal.entry_approved);

    let aiCommentsMap = {};
    try {
      console.log('🚀 [RED-TEAM] FETCHING AI COMMENTS FOR:', reportStocks.map(s => s.code));
      const aiRes = await axiosClient.post('/api/send-report/preview-ai', { reportStocks });
      if (aiRes.data?.success) {
        aiCommentsMap = aiRes.data.aiCommentsMap || {};
        console.log('✅ [RED-TEAM] AI COMMENTS MAP RECEIVED:', JSON.stringify(aiCommentsMap));
      } else {
        console.error('❌ [RED-TEAM] AI COMMENTS FETCH SUCCESS FALSE:', aiRes.data);
      }
    } catch (e) {
      console.error("❌ [RED-TEAM] AI comments fetch failed", e);
    }

    try {
      const tgContent = generateTelegramContent(reportStocks, selectedStocks, aiCommentsMap);
      if (!tgContent) {
        alert("텔레그램으로 발송할 추천 종목이 존재하지 않습니다.");
        setIsSendingTg(false);
        return;
      }

      const recommendations = approvedStocks.map(s => {
        const tfSigs = s.timeframeStatus || {};
        const sig2H = tfSigs['2H'];
        const ePrice = (sig2H && sig2H.ema5 > 0) ? Math.round(sig2H.ema5) : Math.round(s.latestSignal?.entry_price || s.latestSignal?.result_2 || 0);
        const tPrice = (sig2H && sig2H.ema5 > 0) ? Math.round(sig2H.bb_upper) : Math.round(s.latestSignal?.target_price || 0);
        return { stockCode: s.code, stockName: s.name, entryPrice: ePrice, targetPrice: tPrice };
      });

      const safeContent = tgContent.length > 4000 
        ? tgContent.substring(0, 4000) + "\n\n... (내용이 너무 길어 요약되었습니다. 모바일에선 전체 리포트 파일을 확인하세요.)" 
        : tgContent;

      const response = await axiosClient.post('/api/send-report', { reportText: safeContent, recommendations });
      if (response.data && response.data.success) {
        alert(`텔레그램으로 리포트가 성공적으로 전송되었습니다! (완료: ${response.data.sentCount}건)`);
      } else {
        alert("전송 실패: " + (response.data?.error || "알 수 없는 에러"));
      }
    } catch (err) {
      console.error("Telegram Report Generation Error:", err);
      alert("전송 실패: 리포트 생성/전송 중 에러 발생 (" + err.message + ")");
    } finally {
      setIsSendingTg(false);
    }
  };

  return {
    // State
    stocks, signals, lastUpdate,
    searchQuery, setSearchQuery,
    marketFilter, setMarketFilter,
    categoryFilter, setCategoryFilter,
    showAll, setShowAll,
    uploadTimeframe, setUploadTimeframe,
    selectedStocks, setSelectedStocks,
    isSyncing, syncProgress, isSendingTg,
    
    // Derived
    candidates, topSectors, activeCount,
    
    // Actions
    fetchData,
    toggleSelectAll, toggleSelectStock,
    handleCsvUpload, handleReset, handleIntegratedSync,
    handleDownloadReport, handleDownloadTVList, handleSendToTelegram,
    handleSnapshotSelected, activeSnapshot
  };
};
