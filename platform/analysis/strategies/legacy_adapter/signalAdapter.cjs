function adaptSignalToCandidate(analyzerOutput, instrumentId, timeframe) {
  const entryPrice1 = analyzerOutput.entry_price || 0;
  const stopLoss    = Math.round(entryPrice1 * 0.9); // 손절가 -10% 고정 오차 0원

  // 진입가 2, 3 조건부 포함
  const entryPrice2 = analyzerOutput.result_3 < entryPrice1
    ? analyzerOutput.result_3 : null;
  const entryPrice3 = entryPrice2 && analyzerOutput.bb_lower < entryPrice2
    ? analyzerOutput.bb_lower : null;

  return {
    instrumentId,
    timeframe,
    condUp7:      !!analyzerOutput.cond_up7,
    dhh2:         !!analyzerOutput.DHH2,
    triggerRsi:   !!analyzerOutput.trigger_rsi,
    triggerVol:   !!analyzerOutput.trigger_vol,
    entryApproved: !!analyzerOutput.entry_approved,
    isTrending:   !!analyzerOutput.isTrending,
    signalHH:     !!analyzerOutput.signal_HH,  // 최종 추천 여부
    entryPrice1,
    entryPrice2,
    entryPrice3,
    targetPrice:  analyzerOutput.bb_upper || 0,
    stopLoss,
    category:     analyzerOutput.category || 'GENERAL',
  };
}

module.exports = { adaptSignalToCandidate };
