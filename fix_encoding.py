import json

def fix_encoding(text):
    try:
        # The text was likely read as Latin-1 or CP1252 instead of EUC-KR, then saved as UTF-8
        # We need to reverse this by encoding to latin1 and decoding from euc-kr
        return text.encode('latin1').decode('euc-kr')
    except:
        return text

try:
    with open('data/stock_master.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    changed = 0
    for stock in data:
        original = stock['name']
        fixed = fix_encoding(original)
        if fixed != original:
            stock['name'] = fixed
            changed += 1
            
    if changed > 0:
        with open('data/stock_master.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Fixed {changed} corrupted names!")
    else:
        print("No corrupted names found or couldn't fix them.")

except Exception as e:
    print(f"Error: {e}")
