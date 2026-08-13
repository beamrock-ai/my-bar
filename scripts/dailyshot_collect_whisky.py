#!/usr/bin/env python3
"""데일리샷 위스키 품목ID 대량 수집 → 구글시트 '데일리샷메타' 탭.

검색 API(getSearchItems, SSR)로 위스키 브랜드/증류소 키워드를 훑어 category='위스키'만
top_product_id(품목ID) 기준 dedup 후 시트에 기록. (SSR은 1페이지만 → 키워드 폭으로 커버)
개인용·저빈도. python3 scripts/dailyshot_collect_whisky.py
"""
import re, json, os, time, urllib.request, urllib.parse

ENV = '/home/beamrock/claude-code-beamrock/projects/my-bar/deploy/vm01/env.production'
UA = 'Mozilla/5.0 (Linux; Android 12) Mobile Safari'
HEADER = ['품목ID', '상품명', '서브카테고리', '대표가(최저)', '리뷰수', 'URL']
EXCLUDE = ('코스터', '글라스', '디캔터', '노징 글라스', '잔 세트', '전용잔')  # 액세서리 노이즈 제외
# 대표가(최저) 산정에서 제외할 판매 채널(service_type). 국내 실구매 시세가 아니라 대표가를 왜곡함.
#   5 = 면세점(신라면세점 등, 여권/출국 필요)  ※실측 매핑 2026-08-01
#   (참고) 6 = 해외직구/구매대행(cross_border=True). 필요 시 여기 6 추가로 함께 제외 가능.
EXCLUDE_SERVICE_TYPES = {5}

KEYWORDS = [
    '위스키', '싱글몰트', '스카치', '버번', '블렌디드 위스키', '라이 위스키', '아이리시 위스키',
    # 스카치 싱글몰트 증류소
    '맥캘란', '글렌피딕', '글렌리벳', '발베니', '글렌모렌지', '아드벡', '라프로익', '라가불린',
    '탈리스커', '하이랜드파크', '부나하벤', '보모어', '카올일라', '아벨라워', '글렌드로낙',
    '글렌파클라스', '벤리악', '벤로막', '달모어', '오번', '클라이넬리시', '글렌고인', '아란',
    '스프링뱅크', '킬커란', '글렌알라키', '토모어', '토마틴', '올드풀트니', '크래건모어',
    '몰트락', '스카파', '주라', '브룩라디', '옥토모어', '포트샬롯', '킬호만', '아드모어',
    '더 글렌그란트', '글렌그란트', '글렌킨치', '달유안', '로크로몬드', '안녹', '스페이번',
    '텀블도어', '토버모리', '레데익', '딘스톤', '부나하벤', '글렌캐덤', '녹두', '벤네비스',
    '올트모어', '크라겐모어', '카듀', '모틀락', '롱몬', '글렌버기', '만녹모어',
    # 블렌디드 스카치
    '조니워커', '발렌타인', '시바스', '시바스 리갈', '로얄 살루트', '듀어스', '그란츠',
    '몽키숄더', '벨즈', '페이머스 그라우스', '커티삭', '화이트 홀스', '올드 파', '시바스리갈',
    '조니워커 블루', '조니워커 블랙', '발렌타인 21', '윈저', '골든블루', '임페리얼', '랭스',
    # 버번/아메리칸
    '버팔로 트레이스', '메이커스 마크', '짐 빔', '잭 다니엘', '와일드 터키', '우드포드',
    '불렛', '놉 크릭', '에반 윌리엄스', '이글 레어', '포 로지스', '엘리야 크레이그',
    '조지 티 스탁', '사제락', '블랑톤', '위슬피그', '하이 웨스트', '미크터스', '러셀 리저브',
    '올드 그랜대드', '베이질 헤이든', '메이플', '가빈', '헤븐 힐', '올드 포레스터',
    # 재패니즈
    '야마자키', '하쿠슈', '히비키', '산토리', '니카', '다케츠루', '요이치', '미야기쿄',
    '가쿠빈', '치타', '이치로스 몰트', '아카시', '토가우치', '마르스', '후지', '오키',
    # 아이리시
    '제임슨', '부시밀즈', '레드브레스트', '털러모어', '그린 스팟', '옐로 스팟', '코네마라',
    '틸링', '로우스', '미들턴', '파워스', '슬레인',
    # 월드
    '카발란', '암룻', '폴 존', '맥미라', '스타워드', '밀크 앤 허니', '우슈바', '펜더린',
    '킹스반스', '코츠월드', '레이크스', '바스티유', '텔서', '나오미치',
]


def load_env():
    e = {}
    for line in open(ENV):
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1); e[k] = v.strip().strip('"').strip("'")
    return e


def search(kw):
    url = "https://dailyshot.co/m/search/result?q=" + urllib.parse.quote(kw)
    html = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=25).read().decode('utf-8', 'ignore')
    d = json.loads(re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S).group(1))
    q = d['props']['pageProps']['dehydratedState']['queries'][0]['state']['data']
    return q['pages'][0]['results']


def main():
    products = {}  # top_product_id -> dict
    for i, kw in enumerate(KEYWORDS, 1):
        try:
            res = search(kw)
        except Exception as e:
            print(f"  [{i}/{len(KEYWORDS)}] {kw}: 실패 {e}"); continue
        added = 0
        for x in res:
            if x.get('category') != '위스키':
                continue
            if x.get('service_type') in EXCLUDE_SERVICE_TYPES:  # 면세점 등 제외
                continue
            nm = x.get('top_product_name') or x.get('name') or ''
            if any(w in nm for w in EXCLUDE):
                continue
            pid = x.get('top_product_id')
            if not pid:
                continue
            price = x.get('price') or 0
            if pid not in products:
                products[pid] = {'name': nm, 'sub': x.get('subcategory') or '', 'price': price, 'review': x.get('review_count') or 0}
                added += 1
            else:
                if price and (not products[pid]['price'] or price < products[pid]['price']):
                    products[pid]['price'] = price
        print(f"  [{i}/{len(KEYWORDS)}] {kw}: +{added} (누적 {len(products)})")
        time.sleep(0.35)

    rows = [[pid, p['name'], p['sub'], p['price'] or '', p['review'], f'https://dailyshot.co/m/item/{pid}']
            for pid, p in sorted(products.items(), key=lambda kv: kv[1]['name'])]
    print(f"\n총 위스키 품목: {len(rows)}개 → '데일리샷메타' 탭 기록")

    env = load_env()
    sid = env['HOBBY_WHISKY_SHEET_ID']; sa = env['GOOGLE_SA_KEY_PATH']
    if not os.path.isabs(sa):
        sa = os.path.join('/home/beamrock/claude-code-beamrock/projects/my-bar', sa)
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_file(sa, scopes=['https://www.googleapis.com/auth/spreadsheets'])
    svc = build('sheets', 'v4', credentials=creds)
    svc.spreadsheets().values().clear(spreadsheetId=sid, range='데일리샷메타!A1:Z100000').execute()
    svc.spreadsheets().values().update(spreadsheetId=sid, range='데일리샷메타!A1', valueInputOption='RAW',
                                       body={'values': [HEADER] + rows}).execute()
    print(f"완료: 헤더 + {len(rows)}행 기록")


if __name__ == '__main__':
    main()
