import { useState, useEffect, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { generateReportContent, generateTelegramContent } from '../utils/reportUtils';
import toast from 'react-hot-toast';

export const useStockManager = (isAuthenticated) => {
  const [stocks, setStocks] = useState([]);
  const [signals, setSignals] = useState([]);
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
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, timeframe: '' });
  const [isSendingTg, setIsSendingTg] = useState(false);

  // Selections
  const [selectedStocks, setSelectedStocks] = useState(new Set());

  // LocalStorage Persist
  useEffect(() => { localStorage.setItem('mp_marketFilter', marketFilter); }, [marketFilter]);
  useEffect(() => { localStorage.setItem('mp_categoryFilter', categoryFilter); }, [categoryFilter]);
  useEffect(() => { localStorage.setItem('mp_showAll', String(showAll)); }, [showAll]);
  useEffect(() => { localStorage.setItem('mp_uploadTimeframe', uploadTimeframe); }, [uploadTimeframe]);

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
    
    // Setup Server-Sent Events (SSE)
    const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : "";
    const eventSource = new EventSource(`${API_URL}/api/stream`, { withCredentials: true });
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'update') {
        fetchData();
      } else if (data.type === 'sniper_alert') {
        const { ticker, type: alertType, price, grade, score, reason } = data.payload;
        if (alertType === 'ENTRY') {
            toast.success(`[스나이퍼 🚨포착] ${ticker} | 진입가: ${Math.round(price).toLocaleString()}원 (점수: ${score}점, ${grade}등급)`, {
                duration: 6000,
                icon: '🎯',
                style: { background: '#1e1e2f', color: '#fff', border: '1px solid #FF1744' }
            });
        } else if (alertType === 'EXIT_WARN') {
            toast.error(`[청산 ⚠️경고] ${ticker} | 사유: ${reason}`, {
                duration: 8000,
                icon: '⚠️',
                style: { background: '#2d1a1a', color: '#ffb86c', border: '1px solid #ff5555' }
            });
        }
      } else if (data.type === 'sync_progress') {
        const { current, total, timeframe } = data.payload || data;
        setSyncProgress({ current, total, timeframe });
        setIsSyncing(true);
        
        if (current === total) {
          setIsSyncing(false);
          fetchData();
        }
      }
    };

    return () => {
      eventSource.close();
    };
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
    
    // 1️⃣ 베스트 타임프레임 코어 점수 (Max 50점)
    let coreScore = 0;
    let bestTf = '1D'; // default
    const coreTfs = ['1H', '2H', '4H', '1D', '1W'];
    
    let activeTfCount = 0;
    coreTfs.forEach(tf => {
      let tfScore = 0;
      let hasCondUp7 = tfSigs[tf] && tfSigs[tf].cond_up7;
      let hasSignal = tfSigs[tf] && (tfSigs[tf].signal_HH || tfSigs[tf].DHH2);
      
      if (hasCondUp7) tfScore += 20;
      if (hasSignal) tfScore += 20;
      
      if (hasCondUp7 || hasSignal) {
        activeTfCount++;
      }
      
      if (tfScore >= coreScore) {
        coreScore = tfScore; 
        if (tfScore > 0) bestTf = tf;
      }
    });

    if (activeTfCount >= 2) {
      coreScore += 10;
    }
    score += Math.min(coreScore, 50);
    
    // 2️⃣ 다중 시간대(MTF) 프랙탈 매수 보너스 (Max 30점)
    let mtfScore = 0;
    let mtfSignalCount = 0;
    
    coreTfs.forEach(tf => {
      if (tfSigs[tf] && (tfSigs[tf].signal_HH || tfSigs[tf].DHH2)) {
        mtfScore += 5;
        mtfSignalCount++;
      }
    });
    
    if (mtfSignalCount >= 3) {
      mtfScore += 10;
    } else if (mtfSignalCount === 2) {
      mtfScore += 5;
    }
    score += Math.min(mtfScore, 30);

    // 3️⃣ 장기 수급(거래량) 폭발 보너스 (Max 10점)
    let volScore = 0;
    if (tfSigs['2H'] && tfSigs['2H'].trigger_vol) volScore += 2;
    if (tfSigs['4H'] && tfSigs['4H'].trigger_vol) volScore += 2;
    if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) volScore += 4;
    if (tfSigs['1W'] && tfSigs['1W'].trigger_vol) volScore += 4;
    score += Math.min(volScore, 10);

    // 5️⃣ 실시간 외국인/기관 수급 보너스 (최대 11점) - server.cjs에서 처리된 bonus_score
    const bonus = latest?.kis_change_data?.bonus_score || 0;
    score += bonus;

    return { score: Math.min(score, 100), bestTf };
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
      total_score: scoreData.score
    };
  });

  const candidates = showAll 
    ? [...candidatesRaw].sort((a, b) => b.total_score - a.total_score)
    : [...candidatesRaw].sort((a, b) => b.total_score - a.total_score).slice(0, 5);

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
        const result = await response.json();
        alert(result.message);
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
    if (!window.confirm(`1H, 2H, 4H, 1D, 1W 시간대 데이터를 차례대로 자동 동기화하시겠습니까?\n(이 작업은 약 2~3분 정도 소요됩니다.)`)) return;
    setIsSyncing(true);
    setSelectedStocks(new Set());
    setShowAll(false); // Top 5 노출 보장
    
    // 순차적 동기화 순서 (1H -> 1W)
    const timeframes = ['1H', '2H', '4H', '1D', '1W'];
    
    try {
      const { default: axiosClient } = await import('../api/axiosClient.js');
      
      setSyncProgress({ current: 0, total: 348, timeframe: timeframes[0] });
      // 백엔드에서 배열 처리를 지원하므로 한 번만 요청 (Mutex Lock 우회 및 순차 처리 보장)
      const response = await axiosClient.post('/api/auto-sync', { timeframes: timeframes }, { timeout: 300000 });
      
      alert(response.data.message);
      // fetchData()는 SSE의 `current === total` 완료 이벤트 수신 시점(useStockManager)에서 자동 실행되므로 여기선 생략해도 무방하나,
      // immediate fallback 보장 차원에서 호출
      fetchData();
    } catch (error) {
      console.error("Integrated auto-sync error:", error);
      if (error.response?.status !== 403 && error.response?.status !== 429) {
        alert(error.response?.data?.error || "동기화 중 오류가 발생했습니다.");
      }
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 348, timeframe: '완료' });
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
    handleDownloadReport, handleDownloadTVList, handleSendToTelegram
  };
};
