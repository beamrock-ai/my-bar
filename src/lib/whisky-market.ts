// 공신력 있는 위스키 판매량 통계(정적 큐레이션 — 출처·기준연도 명시, 수작업 갱신).
// 사용자 실데이터 아님. 개별 위스키 품목(브랜드) 순위. 인도 위스키 제외.
// 국가×연도별 세트 구조 → 새 국가/연도 데이터는 BESTSELLERS에 항목만 추가하면 드롭박스에 자동 노출.

export const MARKET_YEAR = 2024

const FLAG: Record<string, string> = {
  '스코틀랜드': '🏴', '미국': '🇺🇸', '아일랜드': '🇮🇪', '캐나다': '🇨🇦', '일본': '🇯🇵',
}
export const flagOf = (country: string) => FLAG[country] ?? '🥃'

export type BrandRow = { brand: string; sub?: string; country?: string; cases?: number }
export type BestsellerSet = { year: number; note?: string; source: { label: string; url: string }; rows: BrandRow[] }

// ── 국가별·연도별 베스트셀러 (인도 제외) ──
export const BESTSELLERS: Record<string, BestsellerSet[]> = {
  // 글로벌: 판매량 수치 있음(9L 케이스 백만). 출처 DI Brands Report 2024 / Forbes. 상위 25개 중 인도 제외.
  '🌍 글로벌': [
    {
      year: 2024,
      source: { label: 'Drinks International Brands Report 2024 / Forbes', url: 'https://www.forbes.com/sites/felipeschrieberg/2025/06/24/these-are-the-25-bestselling-whisky-brands-in-the-world/' },
      rows: [
        { brand: 'Johnnie Walker', sub: '스카치 · Diageo', country: '스코틀랜드', cases: 21.6 },
        { brand: 'Jim Beam', sub: '아메리칸 · Suntory', country: '미국', cases: 17.5 },
        { brand: "Jack Daniel's", sub: '아메리칸 · Brown-Forman', country: '미국', cases: 14.1 },
        { brand: 'Jameson', sub: '아이리시 · Pernod Ricard', country: '아일랜드', cases: 10.8 },
        { brand: "Ballantine's", sub: '스카치 · Pernod Ricard', country: '스코틀랜드', cases: 9.3 },
        { brand: 'Crown Royal', sub: '캐나디안 · Diageo', country: '캐나다', cases: 8.0 },
        { brand: 'Canadian Club', sub: '캐나디안 · Suntory', country: '캐나다', cases: 5.3 },
        { brand: 'Chivas Regal', sub: '스카치 · Pernod Ricard', country: '스코틀랜드', cases: 4.8 },
        { brand: 'Kakubin (角瓶)', sub: '재패니즈 · Suntory', country: '일본', cases: 4.0 },
        { brand: 'Black Nikka', sub: '재패니즈 · Asahi', country: '일본', cases: 4.0 },
        { brand: "Dewar's", sub: '스카치 · Bacardi', country: '스코틀랜드', cases: 3.3 },
      ],
    },
  ],
  // 미국: Circana 오프프레미스(리커·그로서리·편의점) 판매 순위. 순위만(판매량 비공개).
  '🇺🇸 미국': [
    {
      year: 2024,
      note: '순위만 — Circana 오프프레미스 판매 기준(판매량 비공개).',
      source: { label: 'Circana (US Whiskey Report)', url: 'https://uswhiskeyreport.com/top-20-best-selling-whiskeys-in-the-united-states/' },
      rows: [
        { brand: 'Jim Beam', country: '미국' }, { brand: "Jack Daniel's", country: '미국' },
        { brand: 'Crown Royal', country: '캐나다' }, { brand: 'Jameson', country: '아일랜드' },
        { brand: 'Fireball', country: '캐나다' }, { brand: "Maker's Mark", country: '미국' },
        { brand: 'Evan Williams', country: '미국' }, { brand: 'Wild Turkey', country: '미국' },
        { brand: 'Bulleit', country: '미국' }, { brand: 'Woodford Reserve', country: '미국' },
        { brand: "Seagram's 7 Crown", country: '미국' }, { brand: 'Southern Comfort', country: '미국' },
        { brand: 'Canadian Club', country: '캐나다' }, { brand: 'Knob Creek', country: '미국' },
        { brand: 'Buffalo Trace', country: '미국' },
      ],
    },
  ],
  // 한국: 데일리샷(국내 위스키 플랫폼) 판매량 순위. 순위만.
  '🇰🇷 한국': [
    {
      year: 2024,
      note: '순위만 — 데일리샷(국내 위스키 플랫폼) 판매량 기준.',
      source: { label: '데일리샷 2024 (위키트리 보도)', url: 'https://www.wikitree.co.kr/articles/1023664' },
      rows: [
        { brand: '산토리 가쿠빈 (角瓶)', country: '일본' },
        { brand: '맥캘란 12년 더블캐스크', country: '스코틀랜드' },
        { brand: '발베니 12년 더블우드', country: '스코틀랜드' },
      ],
    },
  ],
}

// ── 베스트셀러 싱글몰트 스카치 (순위=scotchwhisky.com, 판매량=VinePair 2024) ──
export const SINGLE_MALT: { brand: string; region: string; cases?: number }[] = [
  { brand: 'Glenfiddich', region: '스페이사이드', cases: 1.7 },
  { brand: 'The Glenlivet', region: '스페이사이드', cases: 1.4 },
  { brand: 'The Macallan', region: '스페이사이드', cases: 1.0 },
  { brand: 'Glenmorangie', region: '하이랜드' },
  { brand: 'The Singleton', region: '스페이사이드' },
  { brand: 'The Balvenie', region: '스페이사이드' },
  { brand: 'Laphroaig', region: '아일라 · 피트' },
  { brand: 'Aberlour', region: '스페이사이드' },
  { brand: 'Cardhu', region: '스페이사이드' },
]

export const SOURCES = {
  malt: { label: 'scotchwhisky.com(순위) · VinePair 2024(판매량)', url: 'https://scotchwhisky.com/magazine/features/20897/top-10-best-selling-scotch-malt-whiskies/' },
}
