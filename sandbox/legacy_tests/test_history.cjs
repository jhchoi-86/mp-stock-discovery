require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { evaluatePastRecommendations, generateSummaryReport, EXCEL_FILE } = require('./src/utils/historyManager.cjs');

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

async function getKisToken() {
    const res = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET
    });
    return res.data.access_token;
}

async function runTest() {
    console.log('--- 1. 어제자 가상의 추천 종목 임시 파일 생성 (삼성전자, SK하이닉스) ---');
    // 실제 종가보다 약간 낮은 가상의 '추천가'를 넣어서 수익률을 강제로 만들어봅니다.
    const dummyData = [
        { code: '005930', name: '삼성전자', rec_price: 75000, date: '2026-03-19', category: '테스트카테고리' },
        { code: '000660', name: 'SK하이닉스', rec_price: 155000, date: '2026-03-19', category: '테스트카테고리' }
    ];
    fs.writeFileSync('./data/past_recommendations.json', JSON.stringify(dummyData, null, 2));

    console.log('--- 2. KIS API 토큰 발급 중... ---');
    const token = await getKisToken();

    console.log('\n--- 3. 성과 검증 로직 실행 (전일 종목 성과 리뷰 텔레그램 메세지) ---');
    const reviewText = await evaluatePastRecommendations(token, KIS_APP_KEY, KIS_APP_SECRET);
    console.log(reviewText);

    console.log('--- 4. 주간 리포트 로직 실행 (엑셀 기반 누적 성과 요약) ---');
    // evaluatePastRecommendations가 방금 엑셀에 삼성전자/SK하이닉스를 기록했으므로, 주간 리포트에 잡혀야 합니다.
    const weeklyText = await generateSummaryReport('weekly');
    console.log(weeklyText);

    console.log('--- 5. 엑셀 파일 정상 기록 확인 ---');
    if (fs.existsSync(EXCEL_FILE)) {
        console.log(`✅ 성공! 엑셀 파일이 정상적으로 기록되었습니다: ${EXCEL_FILE}`);
    } else {
        console.log(`❌ 실패! 엑셀 파일 기록 누락.`);
    }
}

runTest().catch(console.error);
