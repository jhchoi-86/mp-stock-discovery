import { useState, useEffect, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { generateReportContent, generateTelegramContent } from '../utils/reportUtils';

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
  const [isSendingTg, setIsSendingTg] = useState(false);

  // Selections
  const [selectedStocks, setSelectedStocks] = useState(() => {
    try {
      const saved = localStorage.getItem('mp_selectedStocks');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // LocalStorage Persist
  useEffect(() => { localStorage.setItem('mp_marketFilter', marketFilter); }, [marketFilter]);
  useEffect(() => { localStorage.setItem('mp_categoryFilter', categoryFilter); }, [categoryFilter]);
  useEffect(() => { localStorage.setItem('mp_showAll', String(showAll)); }, [showAll]);
  useEffect(() => { localStorage.setItem('mp_uploadTimeframe', uploadTimeframe); }, [uploadTimeframe]);
  useEffect(() => { localStorage.setItem('mp_selectedStocks', JSON.stringify([...selectedStocks])); }, [selectedStocks]);

  const fetchData = async () => {
    try {
      const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : `https://mpstock.co.kr`;
      const [stocksRes, signalsRes] = await Promise.all([
        fetch(`${API_URL}/api/stocks`),
        fetch(`${API_URL}/api/signals`)
      ]);
      const stocksData = await stocksRes.json();
      const signalsData = await signalsRes.json();
      
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
    const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : import.meta.env.VITE_API_BASE_URL || `https://mpstock.co.kr`;
    const eventSource = new EventSource(`${API_URL}/api/stream`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'update') {
        fetchData();
      }
    };

    return () => {
      eventSource.close();
    };
  }, [isAuthenticated]);

  const getSignalsForStock = (code) => {
    const stockSignals = signals.filter(s => s.code === code);
    const timeframes = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"];
    const status = {};
    timeframes.forEach(tf => {
      const latest = stockSignals
        .filter(s => s.timeframe === tf)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      status[tf] = latest;
    });
    return status;
  };

  const getLatestGlobal = (code) => {
    return signals
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

  const filteredStocks = stocks.filter(stock => {
    const matchesSearch = stock.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stock.code.includes(searchQuery);
    const matchesMarket = marketFilter === "ALL" || stock.market === marketFilter;
    
    const timeframeSignals = getSignalsForStock(stock.code);
    const latest = getLatestGlobal(stock.code);
    const isTopSector = topSectors.includes(stock.sector);

    const hasSuSignal = Object.values(timeframeSignals).some(s => s && (s.signal_HH || s.DHH2));
    const hasHighAdx = latest && latest.adx >= 30;
    const isUpwardTrend = timeframeSignals['1D'] && timeframeSignals['1D'].cond_up7;
    const isExcludedCategory = latest && (latest.category === "하락 추세" || latest.category === "바닥권 반등");
    
    let matchesView = showAll ? true : (hasSuSignal && hasHighAdx && isUpwardTrend && !isExcludedCategory);

    if (showOnlyApproved && (!latest || !latest.entry_approved)) {
      matchesView = false;
    }
    if (showOnlyTopSectors && !isTopSector) {
      matchesView = false;
    }
    
    const matchesCategory = categoryFilter === 'ALL' || 
                            (categoryFilter === '추천종목' ? selectedStocks.has(stock.code) : (latest && latest.category === categoryFilter));

    return matchesSearch && matchesMarket && matchesCategory && matchesView;
  });

  const calculateTotalScore = (tfSigs, latest, isTopSector) => {
    let score = 0;

    // 2시간 봉 MACD 강세
    if (tfSigs['2H'] && tfSigs['2H'].cond_up7) score += 25;

    // 2시간 봉 강세 신호
    if (tfSigs['2H'] && (tfSigs['2H'].signal_HH || tfSigs['2H'].DHH2)) score += 25;

    // 거래량 1.5배 이상 평균 대비 폭발 여부
    if (latest && latest.trigger_vol) score += 10;

    // 급등1차 (ema5) 와 눌림1차 (result_2) 간격 차이 계산
    const targetData = (tfSigs['2H'] && tfSigs['2H'].ema5 > 0) ? tfSigs['2H'] : (tfSigs['1D'] && tfSigs['1D'].ema5 > 0 ? tfSigs['1D'] : latest);
    
    if (targetData && targetData.ema5 > 0 && targetData.result_2 > 0) {
      const diffPercent = Math.abs(targetData.ema5 - targetData.result_2) / targetData.result_2 * 100;
      if (diffPercent <= 0.5) {
        score += 40;
      } else if (diffPercent <= 1.0) {
        score += 25;
      }
    }
    
    return Math.min(score, 100);
  };

  const candidates = filteredStocks.map(stock => {
    const tfSigs = getSignalsForStock(stock.code);
    const latest = getLatestGlobal(stock.code);
    const isTopSector = topSectors.includes(stock.sector);
    return {
      ...stock,
      timeframeStatus: tfSigs,
      latestSignal: latest,
      isTopSector,
      total_score: calculateTotalScore(tfSigs, latest, isTopSector)
    };
  }).sort((a, b) => b.total_score - a.total_score);

  const activeCount = [...new Set(signals.filter(s => s.signal_HH).map(s => s.code))].length;

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
        fetchData();
      } else {
        alert("초기화 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Reset error:", error);
      alert("서버 연결에 실패했습니다.");
    }
  };

  const handleAutoSync = async () => {
    if (!window.confirm(`${uploadTimeframe} 시간대 데이터를 자동으로 동기화하시겠습니까? (이 작업은 약 1-2분 정도 소요될 수 있습니다.)`)) return;
    setIsSyncing(true);
    try {
      const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : `https://mpstock.co.kr`;
      const response = await fetch(`${API_URL}/api/auto-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe: uploadTimeframe }),
      });
      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        fetchData();
      } else {
        alert("동기화 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Auto-sync error:", error);
      alert("서버 연결에 실패했습니다.");
    } finally {
      setIsSyncing(false);
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
    const tvStocks = candidates
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

  const handleSendToTelegram = async (kisDatas = {}) => {
    const candidatesWithKis = candidates.map(c => ({
      ...c,
      kis_data: kisDatas[c.code] || c.kis_data
    }));
    const tgContent = generateTelegramContent(candidatesWithKis, selectedStocks);
    if (!tgContent) {
      alert("텔레그램으로 발송할 종목을 체크박스로 선택해주세요.");
      return;
    }

    const reportStocks = candidates.filter(stock => selectedStocks.has(stock.code));
    const approvedStocks = reportStocks.filter(s => s.latestSignal && s.latestSignal.entry_approved);

    const recommendations = approvedStocks.map(s => {
      const tfSigs = s.timeframeStatus || {};
      const sig2H = tfSigs['2H'];
      const ePrice = (sig2H && sig2H.ema5 > 0) ? Math.round(sig2H.ema5) : Math.round(s.latestSignal.entry_price || s.latestSignal.result_2 || 0);
      const tPrice = (sig2H && sig2H.ema5 > 0) ? Math.round(sig2H.bb_upper) : Math.round(s.latestSignal.target_price || 0);
      return { stockCode: s.code, stockName: s.name, entryPrice: ePrice, targetPrice: tPrice };
    });

    setIsSendingTg(true);
    try {
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
      alert("전송 실패: 권한이 부족하거나 서버 에러 발생 (" + err.message + ")");
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
    isSyncing, isSendingTg,
    
    // Derived
    candidates, topSectors, activeCount,
    
    // Actions
    fetchData,
    toggleSelectAll, toggleSelectStock,
    handleCsvUpload, handleReset, handleAutoSync,
    handleDownloadReport, handleDownloadTVList, handleSendToTelegram
  };
};
