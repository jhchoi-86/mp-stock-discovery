'use strict';
require('dotenv').config();
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
const fs=require('fs');
const path=require('path');
const m=require('../ppp_filter.cjs');

// 1. DB 확인
p.pppWatchlist.count()
  .then(n=>console.log('pppWatchlist 행 수:',n))
  .catch(e=>console.error('테이블 없음:',e.message))
  .then(()=>{
    // 2. signals.json 확인
    const sigPath=path.join(__dirname,'data','signals.json');
    if(!fs.existsSync(sigPath)){console.log('signals.json 없음'); return;}
    const s=JSON.parse(fs.readFileSync(sigPath,'utf8'));
    const all=Object.values(s);
    const t=all.filter(x=>(x.totalScore??0)>=75).sort((a,b)=>b.totalScore-a.totalScore);
    console.log('전체:',all.length,'/ 75점↑:',t.length,'종목');
    if(t.length>0){
      const sample=t[0];
      const pf=Object.keys(sample).filter(k=>/price|close/i.test(k));
      console.log('가격 필드 후보:',pf);
      console.log('sample ticker:',sample.ticker,'score:',sample.totalScore);
    }
  })
  .then(()=>{
    // 3. calcPPPForStock export 확인
    ['calcPPPForStock','calcPPPAllTF','calcBBMacdMTF','calcPPP'].forEach(fn=>console.log(fn+':',typeof m[fn]));
    // 4. Gemini API KEY
    console.log('GEMINI_API_KEY:',process.env.GEMINI_API_KEY ? 'EXISTS' : 'MISSING');
    // 5. Gemini 패키지
    try{require('@google/generative-ai');console.log('Gemini 패키지: OK');}
    catch(e){console.log('Gemini 패키지: MISSING');}
  })
  .catch(e=>console.error('오류:',e.message))
  .finally(()=>p.$disconnect());
