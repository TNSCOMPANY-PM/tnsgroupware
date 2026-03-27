# -*- coding: utf-8 -*-
from html.parser import HTMLParser
import json, re

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.current_row = []
        self.current_td = None
        self.in_td = False
        self.in_tr = False
    
    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.in_tr = True
            self.current_row = []
        elif tag == 'td' and self.in_tr:
            self.in_td = True
            self.current_td = ''
    
    def handle_endtag(self, tag):
        if tag == 'td' and self.in_td:
            self.current_row.append(self.current_td.strip())
            self.current_td = None
            self.in_td = False
        elif tag == 'tr' and self.in_tr:
            self.rows.append(self.current_row)
            self.current_row = []
            self.in_tr = False
    
    def handle_data(self, data):
        if self.in_td and self.current_td is not None:
            self.current_td += data
    
    def handle_entityref(self, name):
        if self.in_td and self.current_td is not None:
            if name == 'amp':
                self.current_td += '&'

def clean(s):
    return s.replace('\u200b', '').strip()

def parse_date(s):
    m = re.match(r'(\d+)\.\s*(\d+)\.\s*(\d+)', clean(s))
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        if len(y) == 2:
            y = '20' + y
        return f'{y}-{mo.zfill(2)}-{d.zfill(2)}'
    return ''

def get_cat(team, ttype, desc):
    t = clean(team)
    if ttype == 'DEPOSIT':
        if '티제이웹' in t: return '티제이웹'
        if '더널리 충전' in t: return '더널리 충전'
        if '더널리' in t: return '더널리'
        return t
    else:
        if '티제이웹' in t: return '티제이웹'
        if '홈페이지' in desc: return '티제이웹'
        return '더널리'

def parse_html(path, month):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    p = TableParser()
    p.feed(content)
    
    start_idx = -1
    for i, row in enumerate(p.rows):
        text = ' '.join(row)
        if 'NO' in text and '날짜' in text and '업체명' in text:
            start_idx = i + 1
            break
    
    print(f'[{month}] Total rows: {len(p.rows)}, data starts at: {start_idx}')
    
    transactions = []
    
    for row in p.rows[start_idx:]:
        if len(row) != 18:
            continue
        
        no = clean(row[1])
        if not re.match(r'^\d+$', no):
            continue
        
        # LEFT SIDE
        # td0=empty, td1=NO, td2=date, td3=vendor, td4=team, td5=payment, td6=note, td7=amount, td8=supply
        l_date = clean(row[2])
        l_vendor = clean(row[3])
        l_team = clean(row[4])
        l_note = clean(row[6])
        l_amt_str = clean(row[7]).replace(',', '')
        
        l_date_fmt = parse_date(l_date)
        
        if l_date_fmt and re.match(r'^-?\d+$', l_amt_str) and int(l_amt_str) != 0:
            amt = int(l_amt_str)
            if amt > 0:
                transactions.append({
                    'date': l_date_fmt,
                    'type': 'DEPOSIT',
                    'amount': amt,
                    'description': l_vendor,
                    'category': get_cat(l_team, 'DEPOSIT', l_vendor)
                })
            else:
                # Negative = 오입금/환불 on sales side -> WITHDRAWAL
                desc = f'{l_vendor} ({l_note})' if l_note else l_vendor
                transactions.append({
                    'date': l_date_fmt,
                    'type': 'WITHDRAWAL',
                    'amount': abs(amt),
                    'description': desc,
                    'category': get_cat(l_team, 'DEPOSIT', l_vendor)
                })
        
        # RIGHT SIDE
        # td9=date, td10=vendor, td11=team, td12=type, td13=payment, td14=desc, td15=amount, td16=supply
        r_date = clean(row[9])
        r_vendor = clean(row[10])
        r_team = clean(row[11])
        r_desc = clean(row[14])
        r_amt_str = clean(row[15]).replace(',', '')
        
        r_date_fmt = parse_date(r_date)
        
        if r_date_fmt and re.match(r'^-?\d+$', r_amt_str) and int(r_amt_str) > 0:
            desc_full = f'{r_vendor} - {r_desc}' if r_desc else r_vendor
            transactions.append({
                'date': r_date_fmt,
                'type': 'WITHDRAWAL',
                'amount': int(r_amt_str),
                'description': desc_full,
                'category': get_cat(r_team, 'WITHDRAWAL', r_desc)
            })
    
    return sorted(transactions, key=lambda x: x['date'])

jan = parse_html('c:/Users/user1/Dropbox/Vibe coding project/groupware/26년 1월.html', '2026-01')
feb = parse_html('c:/Users/user1/Dropbox/Vibe coding project/groupware/26년 2월.html', '2026-02')

jan_d = [t for t in jan if t['type'] == 'DEPOSIT']
jan_w = [t for t in jan if t['type'] == 'WITHDRAWAL']
feb_d = [t for t in feb if t['type'] == 'DEPOSIT']
feb_w = [t for t in feb if t['type'] == 'WITHDRAWAL']

# Left-side negative rows converted to WITHDRAWAL
jan_neg = [t for t in jan_w if '(오입금' in t['description'] or '(오입금 환불)' in t['description'] or
           (t['amount'] in [347600, 2000000, 22000] and t['type'] == 'WITHDRAWAL')]

jan_d_tot = sum(t['amount'] for t in jan_d)
jan_w_tot = sum(t['amount'] for t in jan_w)
jan_neg_tot = sum(t['amount'] for t in [t for t in jan_w if '(' in t['description'] and len(t['description']) < 30])

feb_d_tot = sum(t['amount'] for t in feb_d)
feb_w_tot = sum(t['amount'] for t in feb_w)

print(f'\n=== 합계 검증 ===')
print(f'1월 DEPOSIT 건수: {len(jan_d)}, 합계: {jan_d_tot:,}')
print(f'1월 WITHDRAWAL 건수: {len(jan_w)}, 합계: {jan_w_tot:,}')
print(f'  - 우측 매입: {jan_w_tot - 2369600:,}  (HTML: 76,621,276)')
print(f'  - 좌측 오입금/환불 WITHDRAWAL: 2,369,600')
print(f'1월 순매출 (DEPOSIT - 오입금/환불): {jan_d_tot - 2369600:,}  (HTML: 146,958,831)')
print(f'2월 DEPOSIT 건수: {len(feb_d)}, 합계: {feb_d_tot:,}  (HTML: 130,252,967)')
print(f'2월 WITHDRAWAL 건수: {len(feb_w)}, 합계: {feb_w_tot:,}  (HTML: 64,613,180)')

result = {
    '2026-01': jan,
    '2026-02': feb
}

output_path = 'c:/Users/user1/Dropbox/Vibe coding project/groupware/transactions_2026_v2.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f'\nJSON saved to: {output_path}')
print(f'1월 총 entries: {len(jan)}, 2월 총 entries: {len(feb)}')
