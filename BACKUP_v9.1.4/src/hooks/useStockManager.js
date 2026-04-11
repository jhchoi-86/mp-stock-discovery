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
  // [Phase 3] signalsSummary replaces flat signals array.
  // Shape: Map<code, { latestSignal, timeframeStatus }>
  // No localStorage caching → eliminates QuotaExceededError.
  const [signalsSummary, setSignalsSummary] = useState(new Map());
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState(() => localStorage.getItem('mp_marketFilter') || "ALL");
  const [categoryFilter, setCategoryFilter] = useState(() => localStorage.getItem('mp_categoryFilter') || 'ALL');
  const [showAll, setShowAll] = useState(() => localStorage.getItem('mp_showAll') === 'true');
  const [showOnlyTopSectors, setShowOnlyTopSectors] = useState(false);
  const [uploadTimeframe, setUploadTimeframe] = useState(() => localStorage.getItem('mp_uploadTimeframe') || "1D");
  const [tfFilter, setTfFilter] = useState("ALL"); // 7-Timeframe Dynamic Filter
  
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

  // [Phase 3] signals localStorage caching REMOVED - all data is server-side now.

  const fetchData = async () => {
    try {
      const [stocksRes, summaryRes] = await Promise.all([
        axiosClient.get('/api/stocks'),
        axiosClient.get('/api/signals-summary')  // [Phase 3] Server-side grouped data
      ]);
      
      let stocksData = stocksRes.data;
      let summaryData = summaryRes.data;
      
      if (!Array.isArray(stocksData)) stocksData = [];
      if (!Array.isArray(summaryData)) summaryData = [];
      
      // Build O(1) lookup map from array [ { code, latestSignal, timeframeStatus } ]
      const summaryMap = new Map(summaryData.map(item => [item.code, item]));
      
      setStocks(stocksData);
      setSignalsSummary(summaryMap);
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
    // [Phase 3] O(1) lookup from server-side grouped map
    return signalsSummary.get(code)?.timeframeStatus || {};
  };

  const buildSignalTimeframes = (tfSigs) => {
    // [Design v3.0] '30M' 키 표기 통일 및 2D(7개) 타임프레임 지원
    const ALL_TIMEFRAMES = ["30M", "1H", "2H", "4H", "1D", "2D", "1W"];
    
    const buy = [];
    const trend = [];
    const strong = [];
    const absolute = [];
    
    ALL_TIMEFRAMES.forEach(tf => {
      const s = tfSigs[tf];
      if (s) {
        // [Design v3.0] Restore consistency: Check both new (v6.4+) and old field names
        const isBuy = s.signal_HH === true;
        const isTrend = s.cond_up7 === true;
        const isStrong = s.signal_H === true;
        const isAbsolute = (s.signal_HHH === true || s.is_strong_signal === true);

        if (isBuy) buy.push(tf);
        if (isTrend) trend.push(tf);
        if (isStrong) strong.push(tf);
        if (isAbsolute) absolute.push(tf);
      }
    });
    
    return {
      buy_signal_timeframes: buy,
      trend_signal_timeframes: trend,
      strong_signal_timeframes: strong,
      absolute_signal_timeframes: absolute
    };
  };

  const getLatestGlobal = (code) => {
    // [Phase 3] O(1) lookup from server-side grouped map
    return signalsSummary.get(code)?.latestSignal || null;
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
  }, [stocks, signalsSummary]);

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
    
    let matchesTf = true;
    if (tfFilter !== "ALL") {
      const tfSigs = getSignalsForStock(stock.code);
      const s = tfSigs[tfFilter];
      // Filter for stocks that have a Buy or Strong signal in the selected TF
      matchesTf = s && (s.signal_HH || s.is_strong_signal);
    }
    
    return matchesSearch && matchesMarket && matchesCategory && matchesTf;
  });



  const candidates = useMemo(() => {
    const raw = (filteredStocks || []).map(stock => {
      const tfSigs = getSignalsForStock(stock.code);
      const latest = getLatestGlobal(stock.code);
      const isTopSector = topSectors.includes(stock.sector);
      
      // [SSOT] Unified Score logic exclusively trusts backend 'latest.score'
      const rawScore = latest?.score;
      const backendScore = (typeof rawScore === 'object' && rawScore !== null) ? rawScore.total : (rawScore || 0);
      const total_score = backendScore; // Unified scoring from API

      const bestSignal = tfSigs['2H'] || latest;
      const signalTimeframes = buildSignalTimeframes(tfSigs);
      const t2H = tfSigs['2H'] ? {
        sma5: tfSigs['2H'].sma5 || null,
        sma10: tfSigs['2H'].sma10 || null,
        sma20: tfSigs['2H'].sma20 || null,
        sma60: tfSigs['2H'].sma60 || null,
      } : null;

      return {
        ...stock,
        ...signalTimeframes,
        t2H,
        timeframeStatus: tfSigs,
        latestSignal: latest,
        kis_change_data: latest?.kis_change_data, // [v7.7.28 RESTORED] Supply data visibility
        bestSignal: tfSigs['2H'] || latest,
        bestTfLabel: '2H',
        isTopSector,
        score: total_score,        
        total_score: total_score
      };
    });

    return showAll 
      ? [...raw].sort((a, b) => b.total_score - a.total_score)
      : [...raw].sort((a, b) => b.total_score - a.total_score).slice(0, 5);
  }, [filteredStocks, signalsSummary, showAll, topSectors]);

  const activeCount = [...signalsSummary.values()].filter(s => s.latestSignal?.signal_HH).length;

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
      const response = await axiosClient.post('/api/reset');
      if (response.status === 200) {
        alert(response.data.message);
        setSelectedStocks(new Set());
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
    const timeframes = ['30M', '1H', '2H', '4H', '1D', '2D', '1W'];
    if (!window.confirm(`${timeframes.join(', ')} 시간대 데이터를 일괄 동기화하시겠습니까?\n(분석량이 많아 약 3~5분 정도 소요될 수 있습니다.)`)) return;
    
    setIsSyncing(true);
    setSelectedStocks(new Set());
    setShowAll(false); 
    
    try {
      // [v7.7.20] Bulk Sync: Send ALL timeframes in one single request to avoid UI stall
      setSyncProgress({ current: 0, total: 100, timeframe: '준비 중...' });
      
      // 🔴 [Red Team 방어] 350종목 x 7개 TF 처리 시 최대 15분 이상 소요될 수 있으므로 20분(1,200초) 설정
      await axiosClient.post('/api/auto-sync', { timeframes }, { timeout: 1200000 });
      
      await fetchData();
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 100, timeframe: '' });
      alert("통합 자동 동기화가 성공적으로 완료되었습니다.");
    } catch (error) {
      console.error("Bulk sync error:", error);
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 100, timeframe: '' });
      
      if (error.response?.status === 409) {
        alert("이미 분석이 진행 중입니다. 잠시만 기다려 주시면 자동으로 결과가 업데이트됩니다.");
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        alert("분석 작업이 길어지고 있습니다. 백엔드에서 분석은 계속 진행 중이며, 잠시 후 대시보드에 결과가 나타납니다.");
      } else if (error.response?.status !== 403 && error.response?.status !== 429) {
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
      if (!activeSnapshot) setOriginalSignals([...signalsSummary.values()]); // Backup live signals once
      
      const res = await axiosClient.get(`/api/archive/snapshots/${snapshotHeader.id}`);
      const fullSnapshot = res.data;
      
      // Archive snapshots are flat arrays — rebuild summary map from them
      const archiveMap = new Map();
      if (Array.isArray(fullSnapshot.signals)) {
        fullSnapshot.signals.forEach(s => {
          if (!archiveMap.has(s.code)) archiveMap.set(s.code, { code: s.code, latestSignal: s, timeframeStatus: {} });
          archiveMap.get(s.code).timeframeStatus[s.timeframe] = s;
        });
      }
      setSignalsSummary(archiveMap);
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
        const curPrice = s.latestSignal?.current_price || 0;
        
        // [v6.6.0] Sync Logic with reportUtils.js
        let ePrice = Math.round(sig2H?.result_2 || s.latestSignal?.entry_price || s.latestSignal?.result_2 || 0);
        let tPrice = Math.round(s.timeframeStatus?.['1D']?.bb_upper || s.latestSignal?.target_price || 0);
        
        // Auto-correct target if already breached
        if (tPrice > 0 && curPrice >= tPrice) {
          tPrice = Math.round(curPrice * 1.05);
        }
        
        const sPrice = Math.round((sig2H?.result_3 || s.latestSignal?.result_3 || 0) * 0.98); // [v6.6.1] Pine Script Base: Entry2 - 2%
        
        return { 
          stockCode: s.code, 
          stockName: s.name, 
          entryPrice: ePrice, 
          targetPrice: tPrice, 
          stopLoss: sPrice 
        };
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
    stocks, signalsSummary, lastUpdate,
    searchQuery, setSearchQuery,
    marketFilter, setMarketFilter,
    categoryFilter, setCategoryFilter,
    showAll, setShowAll,
    uploadTimeframe, setUploadTimeframe,
    selectedStocks, setSelectedStocks,
    isSyncing, syncProgress, isSendingTg,
    tfFilter, setTfFilter,
    
    // Derived
    candidates, topSectors, activeCount,
    
    // Actions
    fetchData,
    toggleSelectAll, toggleSelectStock,
    handleCsvUpload, handleReset,
    handleAutoSync: handleIntegratedSync, // Task-015 Alias
    handleIntegratedSync,
    handleDownloadReport, handleDownloadTVList, handleSendToTelegram,
    handleSnapshotSelected, activeSnapshot
  };
};
