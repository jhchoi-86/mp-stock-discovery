import os
import asyncio
from openai import AsyncOpenAI

async def main():
    try:
        client = AsyncOpenAI(
            api_key=os.getenv("GEMINI_API_KEY"),
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
        )
        response = await client.chat.completions.create(
            model="gemini-2.0-flash",
            messages=[
                {"role": "user", "content": "Return exactly 100 characters of 'A': AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
            ],
            max_tokens=4000
        )
        print("Success!", response.choices[0].message.content)
    except Exception as e:
        print("Error:", str(e))

asyncio.run(main())
