const axios = require('axios');

async function test() {
    const res = await axios.get('http://127.0.0.1:3001/api/public/daily-snapshots?date=2026-04-05');
    const data = res.data;
    
    // Simulate the exact frontend deduplication code!
    const uniqueData = (data || []).reduce((acc, current) => {
        const x = acc.find(item => item.code === current.code);
        if (!x) return acc.concat([current]);
        return acc;
    }, []);
    
    console.log("data.length =>", data.length);
    console.log("uniqueData.length =>", uniqueData.length);
}
test();
