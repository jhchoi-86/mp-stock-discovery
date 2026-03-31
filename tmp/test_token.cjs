const axios = require('axios');
require('dotenv').config();

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();

async function testToken() {
    console.log('Testing KIS Token Acquisition...');
    console.log('App Key:', KIS_APP_KEY);
    // Do not log the full secret for security, just prefix/suffix
    console.log('App Secret Length:', KIS_APP_SECRET.length);
    
    try {
        const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: 'client_credentials', 
            appkey: KIS_APP_KEY, 
            appsecret: KIS_APP_SECRET
        });
        console.log('SUCCESS: Token acquired!');
        console.log('Expires in:', response.data.expires_in);
    } catch (error) {
        console.error('FAILURE: Token acquisition failed!');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data));
        } else {
            console.error('Error:', error.message);
        }
    }
}

testToken();
