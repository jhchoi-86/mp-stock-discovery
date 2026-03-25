import os
from dotenv import load_dotenv
load_dotenv(".env")
import asyncio
from openai import AsyncOpenAI

async def main():
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        print(f"API Key exists: {bool(api_key)}")
        client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
        )
        response = await client.chat.completions.create(
            model="gemini-2.0-flash",
            messages=[
                {"role": "user", "content": "Hello"}
            ]
        )
        print("Success! Output:", response.choices[0].message.content)
    except Exception as e:
        print("Error:", str(e))

if __name__ == "__main__":
    asyncio.run(main())
