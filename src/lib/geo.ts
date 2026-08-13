// 네이버 검색 API '지역 검색'(POI 키워드 → 주소/좌표/지도링크). geo-search 라우트·콜키지 동기화 공용.
const clean = (s: string) => (s || '')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .trim()

export type GeoResult = { name: string; address: string; region: string; category: string; phone: string; url: string; homepage: string; lat: string; lon: string }

export async function searchNaverLocal(q: string): Promise<{ results: GeoResult[]; error?: string }> {
  const query = (q ?? '').trim()
  if (!query) return { results: [] }
  const id = process.env.NAVER_SEARCH_CLIENT_ID
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET
  if (!id || !secret) return { results: [], error: 'no_key' }
  try {
    const r = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=random`, {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
      cache: 'no-store',
    })
    if (!r.ok) return { results: [], error: `naver ${r.status}` }
    const d = (await r.json()) as { items?: Record<string, string>[] }
    const results = (d.items ?? []).map((x) => {
      const addr = x.roadAddress || x.address || ''
      const name = clean(x.title)
      const region = addr.split(' ').slice(0, 2).join(' ')
      return {
        name, address: addr, region, category: x.category || '',
        phone: x.telephone || '',
        url: `https://map.naver.com/p/search/${encodeURIComponent(`${name} ${region}`.trim())}`,
        homepage: x.link || '',
        lat: x.mapy ? String(Number(x.mapy) / 1e7) : '',
        lon: x.mapx ? String(Number(x.mapx) / 1e7) : '',
      }
    })
    return { results }
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : 'fail' }
  }
}
