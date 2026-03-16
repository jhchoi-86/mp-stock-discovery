const axios = require('axios');
(async () => {
    try {
        const url = 'https://api.telegram.org/bot8629426971:AAGTzFaw9TqcF4V2PWY9dKCcX9tUIELzuM4/sendMessage';
        let r1 = await axios.post(url, {chat_id: '6741237663', text: 'Test1'});
        console.log('r1 success');
    } catch(e) { console.error('r1 failed', e.response?.data); }

    try {
        const url = 'https://api.telegram.org/bot8629426971:AAGTzFaw9TqcF4V2PWY9dKCcX9tUIELzuM4/sendMessage';
        let r2 = await axios.post(url, {chat_id: '-1003821536889', text: 'Test2'});
        console.log('r2 success');
    } catch(e) { console.error('r2 failed', e.response?.data); }
})();
