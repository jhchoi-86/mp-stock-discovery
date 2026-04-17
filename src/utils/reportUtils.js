import { getChartUrl } from './chartUtils';

export const generateReportContent = (candidates) => {
  // Collect all stocks that match current filter or at least have HH signal
  const reportStocks = candidates.filter(stock => {
    // [Design v3.0] 객체 순환 대신 신호 배열 includes 체크로 변경
    const hasSuSignal = stock.buy_signal_timeframes?.length > 0;
    const hasHighAdx = stock.latestSignal && stock.latestSignal.adx >= 30;
    const isUpwardTrend = stock.trend_signal_timeframes?.includes('1D');
    const isExcludedCategory = stock.latestSignal && (stock.latestSignal.category === "하락 추세" || stock.latestSignal.category === "바닥권 반등");
    return (hasSuSignal && hasHighAdx && isUpwardTrend && !isExcludedCategory) || stock.latestSignal?.entry_approved;
  });

  if (reportStocks.length === 0) {
    return null;
  }

  const approvedStocks = reportStocks.filter(s => s.latestSignal && s.latestSignal.entry_approved);

  let header = `# 📈 MP KOSPI 200, KOSDAQ 150 우량주 매수 추천 종목 리서치\n`;
  header += `**생성 일시:** ${new Date().toLocaleString()}\n`;
  header += `**분석 종목 수:** ${reportStocks.length}개\n\n`;

  if (approvedStocks.length > 0) {
    header += `## 🔥 [강력 추천] 매수 진입 승인 종목 (RSI 반등 + 거래량 발생 + 양봉)\n`;
    approvedStocks.forEach(s => {
      const tfSigs = s.timeframeStatus || {};
      const sig2H = tfSigs['2H'];
      
      const priceText = (sig2H && sig2H.ema5 > 0) ? `현재가: ${s.latestSignal?.current_price ? Math.round(s.latestSignal.current_price).toLocaleString() : '-'}원 / 급등1차: ${Math.round(sig2H.ema5).toLocaleString()}원, 눌림1차: ${Math.round(sig2H.result_2).toLocaleString()}원, 눌림2차: ${Math.round(sig2H.result_3).toLocaleString()}원, 1차목표가: ${Math.round(sig2H.bb_upper).toLocaleString()}원` : `현재가: ${s.latestSignal?.current_price ? Math.round(s.latestSignal.current_price).toLocaleString() : '-'}원 / 타점: ${Math.round(s.latestSignal.entry_price || s.latestSignal.result_2).toLocaleString()}원`;
      header += `- **${s.name}** (${s.code}): ${s.latestSignal.category} / 💡 추천매매(분할매수전략): **${priceText}**\n`;
    });
    header += `\n---\n\n`;
  }

  header += `## 📋 전체 모니터링 리스트 (HH 신호 발생)\n\n`;
  header += `| 종목명 | 코드 | 세력강도 | 추천매매(분할매수매도전략) | 1D | 1W | 추세 방향 | 진행률 |\n` +
            `| :--- | :--- | :---: | :---: | :---: | :---: | :--- | :---: |\n`;

  const rows = reportStocks.map(stock => {
    const tfSigs = stock.timeframeStatus || {};
    const getStatus = (tf) => {
      const isStrong = stock.strong_signal_timeframes?.includes(tf);
      const isBuy = stock.buy_signal_timeframes?.includes(tf);
      if (isStrong) return "**강력(HH)**";
      if (isBuy) return "**수(HH)**";
      return "-";
    };

    const trend = stock.trend_signal_timeframes?.includes('1D') ? "상승" : (stock.timeframeStatus?.['1D'] ? "관찰" : "-");
    const prog = stock.timeframeStatus?.['1D'] ? `${(stock.timeframeStatus['1D'].progress * 100).toFixed(0)}%` : "-";
    let category = stock.latestSignal ? stock.latestSignal.category : '-';
    if (stock.isTopSector && category === "추세 지속형") category = "🔥주도주 눌림목🔥";
    
    const sig2H = tfSigs['2H'];

    const entryPrice = (sig2H && sig2H.ema5 > 0) 
      ? `현재가:${stock.latestSignal?.current_price ? Math.round(stock.latestSignal.current_price).toLocaleString() : '-'}원 <br/>급등1차:${Math.round(sig2H.ema5).toLocaleString()}원 <br/>눌림1차:${Math.round(sig2H.result_2).toLocaleString()}원 <br/>눌림2차:${Math.round(sig2H.result_3).toLocaleString()}원 <br/>1차목표가:${Math.round(sig2H.bb_upper).toLocaleString()}원` 
      : `현재가:${stock.latestSignal?.current_price ? Math.round(stock.latestSignal.current_price).toLocaleString() : '-'}원`;

    return `| ${stock.name} | ${stock.code} | ${category} | **${entryPrice}** | ${getStatus('1D')} | ${getStatus('1W')} | ${trend} | ${prog} |`;
  }).join('\n');

  const footer = `\n\n* 본 리포트는 MP 자동 분석 시스템에 의해 생성되었습니다.`;
  
  return header + rows + footer;
};

export const generateTelegramContent = (reportStocks, selectedStocksSet, aiCommentsMap = {}) => {
  if (!reportStocks || reportStocks.length === 0) {
    return null;
  }

  const sortedReportStocks = [...reportStocks].sort((a, b) => b.total_score - a.total_score);

  let content = `📈 MP KOSPI 200, KOSDAQ 150 매수 추천 리서치\n`;
  content += `생성 일시: ${new Date().toLocaleString()}\n`;
  content += `분석 종목 수: ${reportStocks.length}개\n\n`;

  content += `🔥 [추천 종목 감시 명단]\n`;

  sortedReportStocks.forEach(s => {
    const tfSigs = s.timeframeStatus || {};
    const t1H = tfSigs['1H'];
    const t2H = tfSigs['2H'];
    const t4H = tfSigs['4H'];
    const t1D = tfSigs['1D'];
    
    const curPrice = s.latestSignal?.current_price || s.latestSignal?.entry_price || s.current_price || 0;
    let curChange = 0;
    if (s.latestSignal?.kis_change_data) {
      const kd = s.latestSignal.kis_change_data;
      const isUp = ['1', '2', '3'].includes(String(kd.sign));
      curChange = isUp ? Math.abs(parseFloat(kd.rate)||0) : -Math.abs(parseFloat(kd.rate)||0);
    }
    const score = s.total_score || 0;
    const stars = '★'.repeat(Math.max(0, Math.min(5, Math.round(score / 20)))) + '☆'.repeat(Math.max(0, Math.min(5, 5 - Math.round(score / 20))));
    
    let priceText = "-";
    // [v9.4.34] 수동 편집 가격 우선 적용 (PriceEditSection에서 저장된 필드)
    const target1H = s.inst_buy_manual || t1H?.result_2 || 0;
    const target2H = s.inst_buy_manual || t2H?.result_2 || 0;
    const target4H = s.inst_buy_manual || t4H?.result_2 || 0;
    const target1D = s.target_manual || t1D?.bb_upper || 0;

    if (target1H || target2H || target4H || target1D) {
      const formatGap = (target) => {
        if (!curPrice || typeof target !== 'number') return '';
        const diff = Math.round(target - curPrice);
        const sign = diff > 0 ? '+' : '';
        const pct = ((target - curPrice) / curPrice * 100).toFixed(2);
        return `(${sign}${diff.toLocaleString()}원, ${pct}%)`;
      };
      const formatProfit = (target) => {
        if (!curPrice || typeof target !== 'number') return '';
        const diff = Math.round(target - curPrice);
        const sign = diff >= 0 ? '⬆️' : '⬇️';
        const pct = Math.abs((target - curPrice) / curPrice * 100).toFixed(2);
        return `${sign} ${pct}%`;
      };
      const curPriceStr = curPrice > 0 ? `현재가: ${Math.round(curPrice).toLocaleString()}원 (${curChange >= 0 ? '⬆️' : '⬇️'}${Math.abs(curChange).toFixed(2)}%)` : '';
      
      // [v7.7.2] Remove Target & SL Correction Logic (Use raw sync values)
      const displayTarget1D = target1D;
      
      const stopLoss = s.stop_loss_manual || (t2H?.result_3 > 0 ? t2H.result_3 * 0.98 : 0); 
      
      let pLines = [curPriceStr];
      if (target2H > 0) pLines.push(`1차 매수진입가(추천): ${Math.round(target2H).toLocaleString()}원 ${formatGap(target2H)}`);
      // Use result_3 for 2nd entry strictly from 2H or manual
      const entry2H_2 = s.inst_buy2_manual || t2H?.result_3 || 0;
      if (entry2H_2 > 0) pLines.push(`2차 매수진입가(추천): ${Math.round(entry2H_2).toLocaleString()}원 ${formatGap(entry2H_2)}`);
      if (stopLoss > 0) pLines.push(`손절가 (SL): ${Math.round(stopLoss).toLocaleString()}원 ${formatGap(stopLoss)}`);
      if (displayTarget1D > 0) pLines.push(`1차 목표가(Target): ${Math.round(displayTarget1D).toLocaleString()}원 ${formatProfit(displayTarget1D)}`);
      if (displayTarget1D > 0) pLines.push(`2차 목표가(최종): ${Math.round(displayTarget1D * 1.05).toLocaleString()}원 ${formatProfit(displayTarget1D * 1.05)}`);
      
      priceText = pLines.filter(Boolean).join('\n');
    } else {
      const curPriceStr = curPrice > 0 ? `현재가: ${Math.round(curPrice).toLocaleString()}원 (${curChange >= 0 ? '⬆️' : '⬇️'}${Math.abs(curChange).toFixed(2)}%)` : '';
      priceText = `${curPriceStr ? curPriceStr + '\n' : ''}타점: ${Math.round(s.latestSignal?.entry_price || s.latestSignal?.result_2 || 0).toLocaleString()}원`;
    }
    
    content += `🔹 ${s.name} (${s.code})\n`;
    content += `분류: ${s.latestSignal?.category || '-'} | 총점: ${stars} (${score}점)\n`;
    const adx = (s.latestSignal && typeof s.latestSignal.adx === 'number') ? Math.round(s.latestSignal.adx) : "-";
    const trend = s.trend_signal_timeframes?.includes('1D') ? "상승" : (tfSigs['1D'] ? "관망" : "-");
    content += `주가 추세 강도: ${adx} | 추세 판별: ${trend}\n`;
    
    let kisVolumeText = '';
    if (s.latestSignal?.kis_change_data) {
      const kd = s.latestSignal.kis_change_data;
      if (kd.trade_amount !== undefined) {
        kisVolumeText = `\n📊 거래대금(백만): ${Number(kd.trade_amount).toLocaleString()}, 외국인수급: ${kd.foreign_buy}, 기관수급: ${kd.inst_buy}`;
      }
    }
    
    content += `${priceText}${kisVolumeText}\n`;
    if (aiCommentsMap[s.code]) {
      content += `💡 AI 코멘트: ${aiCommentsMap[s.code]}\n`;
    }
    content += `차트: ${getChartUrl(s.code, 'KR_STOCK')}\n\n`;
  });

  content += `---\n\n`;
  content += `\n* 본 리포트는 MP 자동 분석 로봇에 의해 생성되었습니다.\n`;
  content += `⚠️ 본 리포트는 알고리즘에 의한 자동 분석 결과일 뿐이며, 투자 매수/매도 리딩이 아닙니다. 투자 결과에 대한 법적 책임을 지지 않으며, 모든 투자의 최종 판단과 책임은 투자자 본인에게 있습니다.`;
  return content;
};

export const generateTop5StrategyContent = (top5) => {
  if (!top5 || top5.length === 0) return null;

  const todayStr = new Date().toLocaleDateString();
  let content = `🚀 [내일 매매 전략 Top 5 리서치]\n`;
  content += `평가 일시: ${todayStr} ${new Date().toLocaleTimeString()}\n\n`;

  top5.forEach((s, idx) => {
    const sig2H = s.tfSigs['2H'];
    const score = s.score || 0;
    const curPrice = sig2H?.current_price || 0;
    
    content += `${idx + 1}️⃣ ${s.name} (${s.code}) - 점수: ${score}점\n`;
    content += `- 현황: ${sig2H?.category || '-'} | 추세강도: ${Math.round(sig2H?.adx || 0)}\n`;
    content += `- 매수전략: ${Math.round(sig2H?.result_2 || 0).toLocaleString()}원(1차) / ${Math.round(sig2H?.result_3 || 0).toLocaleString()}원(2차) 분할진입 유효\n`;
    
    let target1 = sig2H?.bb_upper || 0;
    if (target1 > 0 && curPrice >= target1) target1 = curPrice * 1.05;
    
    content += `- 목표가: 1차 ${Math.round(target1).toLocaleString()}원 / 2차 ${Math.round(target1 * 1.05).toLocaleString()}원\n`;
    content += `- 손절가: ${Math.round((sig2H?.result_3 || 0) * 0.98).toLocaleString()}원 (2차 진입가 대비 -2%)\n`;
    content += `- 차트: ${getChartUrl(s.code, 'KR_STOCK')}\n\n`;
  });

  content += `💡 Antigravity Tip: 시초가 급등 시 무리한 추격보다는 오전 눌림 지지를 확인하고 진입하는 것을 권장합니다.\n`;
  content += `---\n`;
  content += `* 본 리포트는 MP AI 분석 시스템에 의해 생성되었습니다.`;

  return content;
};
