#!/usr/bin/env python3
"""데일리샷 상품 링크 → 위스키 시세(주류시세 시트 + liquor_price DB)에 데일리샷 가격 적재.

사용:
  python3 scripts/dailyshot_sync.py <데일리샷_상품URL_또는_ID> [URL2 ...]
  python3 scripts/dailyshot_sync.py --map scripts/dailyshot_map.txt   # "한글명<TAB>URL" 목록 파일

주의(개인용·저빈도): 데일리샷 비공식 SSR 데이터를 파싱. 사이트 개편 시 깨질 수 있음. ToS상 재배포 금지.
"""
import sys, os, re, json, urllib.request, datetime, subprocess

ENV = '/home/beamrock/claude-code-beamrock/projects/my-bar/deploy/vm01/env.production'
DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile'


def load_env():
    e = {}
    for line in open(ENV):
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1); e[k] = v.strip().strip('"').strip("'")
    return e


def fetch_item(url):
    """상품 URL → {name, en_name, price(실구매가=할인가 우선), list_price(정가), volume_ml, url}"""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    html = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'ignore')
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError('__NEXT_DATA__ 없음')
    data = json.loads(m.group(1))
    pp = data['props']['pageProps']
    best = None
    for q in (pp.get('dehydratedState') or {}).get('queries', []):
        d = q.get('state', {}).get('data')
        if isinstance(d, dict) and 'name' in d and ('price' in d or 'net_price' in d):
            best = d; break
    if not best:
        raise RuntimeError('가격 데이터 없음')
    name = best.get('name'); price = best.get('price')
    sl = best.get('seller') or {}
    return {
        'name': name, 'en_name': best.get('en_name'),
        'price': price, 'net_price': best.get('net_price'), 'discount': best.get('discount_percent'),
        'volume_ml': parse_volume(name), 'url': url, 'stock': best.get('stock'),
        'top_product_id': best.get('top_product_id'), 'item_id': best.get('id'),  # 품목ID / 상품(오퍼)ID
        # 판매점(매장) 정보
        'seller': sl.get('name'), 'region': sl.get('region'), 'address': sl.get('address'),
        'arrival': sl.get('expected_arrival_date'),
    }


def parse_volume(name):
    if not name:
        return None
    m = re.search(r'(\d+(?:\.\d+)?)\s*(L|리터)\b', name)
    if m:
        return int(float(m.group(1)) * 1000)
    m = re.search(r'(\d+)\s*ml', name, re.I)
    return int(m.group(1)) if m else None


def append_sheet(items, sid, sa):
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_file(sa, scopes=['https://www.googleapis.com/auth/spreadsheets'])
    svc = build('sheets', 'v4', credentials=creds)
    header = svc.spreadsheets().values().get(spreadsheetId=sid, range='주류시세!A1:M1').execute().get('values', [[]])[0]
    today = datetime.date.today().isoformat()
    rows = []
    for it in items:
        fields = {'주종': '위스키', '한글명': it['name'], '판매점': '데일리샷',
                  '가격': it['price'], '기준일자': today,
                  '용량ml': it['volume_ml'] or '', '링크': it['url'], '비고': '데일리샷'}
        rows.append([fields.get((h or '').strip(), '') for h in header])
    svc.spreadsheets().values().append(
        spreadsheetId=sid, range='주류시세!A1', valueInputOption='USER_ENTERED',
        insertDataOption='INSERT_ROWS', body={'values': rows}).execute()
    return today


def insert_db(items, today):
    vals = []
    for it in items:
        nm = it['name'].replace("'", "''")
        vol = it['volume_ml'] if it['volume_ml'] else 'NULL'
        vals.append(f"('위스키','{nm}','데일리샷',{it['price']},'{today}',{vol},'데일리샷')")
    sql = ("insert into hobby.liquor_price (liquor,name,shop,price,observed_on,volume_ml,memo) values "
           + ",".join(vals) + ";")
    subprocess.run(['psql', DB, '-c', sql], check=True)


SELLER_HEADER = ['수집일자', '품목ID', '상품ID', '상품명', '판매점', '지역', '판매가', '정가', '할인율', '용량ml', '재고', '도착예정', 'URL']


def append_sellers(items, sid, sa):
    """판매점별 가격을 구글시트 '데일리샷' 탭에 수집(없으면 탭 생성). 첫 행 헤더 보장."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_file(sa, scopes=['https://www.googleapis.com/auth/spreadsheets'])
    svc = build('sheets', 'v4', credentials=creds)
    titles = [s['properties']['title'] for s in svc.spreadsheets().get(spreadsheetId=sid).execute()['sheets']]
    if '데일리샷' not in titles:
        svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={'requests': [
            {'addSheet': {'properties': {'title': '데일리샷'}}}]}).execute()
    # 헤더 보장: A1 행이 헤더와 다르면(빈 탭 포함) 헤더 기록
    a1 = svc.spreadsheets().values().get(spreadsheetId=sid, range='데일리샷!A1:M1').execute().get('values', [[]])
    if not a1 or a1[0] != SELLER_HEADER:
        svc.spreadsheets().values().update(spreadsheetId=sid, range='데일리샷!A1', valueInputOption='RAW',
                                           body={'values': [SELLER_HEADER]}).execute()
    today = datetime.date.today().isoformat()
    rows = [[today, it.get('top_product_id', ''), it.get('item_id', ''), it['name'], it.get('seller') or '',
             it.get('region') or '', it['price'], it.get('net_price') or '',
             (f"{it['discount']}%" if it.get('discount') else ''), it['volume_ml'] or '',
             it.get('stock', ''), it.get('arrival') or '', it['url']] for it in items]
    svc.spreadsheets().values().append(spreadsheetId=sid, range='데일리샷!A1', valueInputOption='USER_ENTERED',
                                       insertDataOption='INSERT_ROWS', body={'values': rows}).execute()


def to_url(s):
    """전체 URL이면 그대로, 품목ID면 상품 URL로."""
    s = s.strip()
    return s if s.startswith('http') else f'https://dailyshot.co/m/item/{s}'


def collect_urls(args):
    urls = []
    if args and args[0] == '--map':
        for line in open(args[1]):
            line = line.strip()
            if line and not line.startswith('#'):
                urls.append(to_url(line.split('\t')[-1]))  # 한글명\t품목ID(또는 URL)
    else:
        urls = [to_url(a) for a in args]
    return urls


def main():
    args = sys.argv[1:]
    sellers_mode = False
    if args and args[0] == '--sellers':
        sellers_mode = True; args = args[1:]
    urls = collect_urls(args)
    if not urls:
        print('사용: dailyshot_sync.py [--sellers] <URL|ID> ...  (--sellers=판매점별 데일리샷탭 수집)'); sys.exit(1)

    env = load_env()
    sid = env['HOBBY_WHISKY_SHEET_ID']; sa = env['GOOGLE_SA_KEY_PATH']
    if not os.path.isabs(sa):
        sa = os.path.join('/home/beamrock/claude-code-beamrock/projects/my-bar', sa)
    today = datetime.date.today().isoformat()

    if sellers_mode:
        # 판매점별: 구글시트 '데일리샷' 탭에 수집(중복 방지 없음 — 매장별 다건)
        items = []
        for u in urls:
            try:
                it = fetch_item(u)
                print(f"  ✓ {it['name']} @ {it.get('seller')}({it.get('region')}) — {it['price']:,}원" + (f" ({it['discount']}%↓)" if it.get('discount') else ''))
                items.append(it)
            except Exception as e:
                print(f"  ✗ {u} — {e}")
        if not items:
            print('수집할 항목 없음'); return
        append_sellers(items, sid, sa)
        print(f"→ {len(items)}건 '데일리샷' 탭에 수집 완료 ({today})")
        return

    # 기본(일자별 대표가): 주류시세 시트 + liquor_price, 같은 날 중복 방지
    done = subprocess.run(['psql', DB, '-tAc',
        f"select name from hobby.liquor_price where shop='데일리샷' and observed_on='{today}'"],
        capture_output=True, text=True).stdout.split('\n')
    done = set(x.strip() for x in done if x.strip())
    items = []
    for u in urls:
        try:
            it = fetch_item(u)
            if it['name'] in done:
                print(f"  · {it['name']} — 오늘 이미 기록됨(스킵)"); continue
            print(f"  ✓ {it['name']} — {it['price']:,}원" + (f" · {it['volume_ml']}ml" if it['volume_ml'] else ''))
            items.append(it)
        except Exception as e:
            print(f"  ✗ {u} — {e}")
    if not items:
        print('반영할 신규 항목 없음'); return
    insert_db(items, today)  # 데일리샷은 DB(liquor_price)로만 관리(주류시세 시트 미기록) — syncPricesToDB가 보존
    print(f"→ {len(items)}건 시세 반영 완료 (판매점=데일리샷, {today})")


if __name__ == '__main__':
    main()
