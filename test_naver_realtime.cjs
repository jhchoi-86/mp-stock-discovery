const axios = require('axios');
async function test() {
    try {
        const url = 'https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:005930';
        const res = await axios.get(url);
        const data = res.data.result.areas[0].datas[0];
        console.log(`[Naver Realtime] ${data.nm} (${data.cd}): ${data.nv}원`);
    } catch(e) {
        console.error(e.message);
    }
}
test();
