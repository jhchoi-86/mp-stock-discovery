const { OpenAI } = require('openai');
require('dotenv').config();

async function test() {
  const client = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
  });

  try {
    const response = await client.chat.completions.create({
      model: "gemini-2.0-flash", // Try 2.0
      messages: [
        {"role": "system", "content": "Return exactly 100 A characters: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
      ],
      max_tokens: 4000
    });
    console.log("Success! Output:", response.choices[0].message.content);
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
