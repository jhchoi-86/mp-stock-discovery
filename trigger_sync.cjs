async function triggerSync() {
    console.log('Triggering production sync...');
    try {
        const response = await fetch('https://mpstock.co.kr/api/auto-sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-cron-secret': 'mp-stock-sync-key-2024'
            },
            body: JSON.stringify({ timeframes: ['1D'] })
        });
        const data = await response.json();
        console.log('Response:', data);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

triggerSync();
