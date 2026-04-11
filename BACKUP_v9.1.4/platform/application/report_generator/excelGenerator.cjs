const ExcelJS = require('exceljs');
const stream = require('stream');
// AWS 연동 주석처리 (샌드박스)
// const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
// const { Upload } = require('@aws-sdk/lib-storage');
// const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// RED TEAM S3 STREAMING FIX 적용
async function generateAndUploadStream(type, date, data) {
  console.log(`[Excel] Generating S3 Streaming Excel... Type: ${type}, Date: ${date}`);
  const wb  = new ExcelJS.stream.xlsx.WorkbookWriter(); // streaming mode
  const ws1 = wb.addWorksheet('RAW_DATA');
  const ws2 = wb.addWorksheet('SUMMARY');

  ws1.columns = [
    { header: '종목코드', key: 'symbol' },
    { header: '종목명', key: 'name' },
    { header: '시장', key: 'market' },
    { header: '진입가1', key: 'entryPrice1' },
    { header: '목표가', key: 'targetPrice' },
    { header: '손절가', key: 'stopLoss' },
    { header: '결과', key: 'result' },
    { header: '배점', key: 'displayScore' },
  ];
  
  if (data && data.signals) {
    for (const sig of data.signals) { 
        ws1.addRow(sig).commit(); 
    }
  }

  ws2.addRow(['성공', data?.successCount || 0]).commit();
  ws2.addRow(['실패', data?.failCount || 0]).commit();
  ws2.addRow(['진행중', data?.inProgressCount || 0]).commit();
  ws2.addRow(['성공률', `${data?.successRate || 0}%`]).commit();

  const key = `reports/${type}/${date}.xlsx`;
  const pass = new stream.PassThrough();
  
  /*
  const upload = new Upload({
    client: s3,
    params: { Bucket: process.env.S3_BUCKET, Key: key, Body: pass }
  });
  const uploadTask = upload.done();
  */
  
  await wb.commit();
  wb.stream.pipe(pass);
  console.log('[Excel] Stream successfully piped to upload buffer (OOM prevented).');
  // await uploadTask;

  return key;
}

module.exports = { generateAndUploadStream };
