import { readPriceSheet, readDailyshotMeta } from '@/lib/sheets'
import { createServiceClient } from '@/lib/supabase'
import { normalizeCask } from '@/lib/translate'

const DS_SHOP = '데일리샷' // 데일리샷 시세는 별도 소스(데일리샷메타)로만 관리 — 주류시세 동기화가 건드리지 않음

export type PriceRow = {
  liquor: string; style: string; cask: string; peat: string; peat_ppm: number | null; sherry_type: string
  name: string; shop: string; price: number; date: string; volume: number | null; url: string; memo: string
  id?: string; source?: 'sheet' | 'dailyshot' | 'manual' // 조회 경로에서만 채움(병합/수동가격 처리용)
}
export type CatalogItem = { name: string; liquor: string; style: string; cask: string; peat: string; peat_ppm: number | null; sherry_type: string; volume: number | null; priceMin: number | null }

// 주류시세 시트 파싱(헤더명 기준, 컬럼 순서 변동 안전)
export async function getPrices(): Promise<PriceRow[]> {
  const rows = await readPriceSheet()
  if (!rows.length) return []
  const header = rows[0].map((h) => (h ?? '').trim())
  const idx = (name: string) => header.indexOf(name)
  const iLiquor = idx('주종'), iStyle = idx('분류'), iCask = idx('캐스크'), iPeat = idx('피트'), iPpm = idx('PPM'), iSherry = idx('셰리')
  const iName = idx('한글명'), iShop = idx('판매점'), iPrice = idx('가격'), iDate = idx('기준일자')
  const iVol = idx('용량ml'), iUrl = idx('링크'), iMemo = idx('비고')
  const g = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').toString().trim() : '')
  const num = (s: string) => { const n = parseInt(s.replace(/[^0-9]/g, '')); return Number.isFinite(n) && n > 0 ? n : null }
  const ppmNum = (s: string) => { if (!s.trim()) return null; const n = parseInt(s.replace(/[^0-9]/g, '')); return Number.isFinite(n) ? n : null } // 0(논피트) 허용
  return rows.slice(1)
    .filter((r) => g(r, iName) && num(g(r, iPrice)) && g(r, iShop) !== DS_SHOP) // 데일리샷 행은 별도 관리라 주류시세에서 제외
    .map((r) => ({
      liquor: g(r, iLiquor), style: g(r, iStyle), cask: g(r, iCask), peat: g(r, iPeat), peat_ppm: ppmNum(g(r, iPpm)), sherry_type: g(r, iSherry),
      name: g(r, iName), shop: g(r, iShop), price: num(g(r, iPrice)) as number,
      date: g(r, iDate), volume: num(g(r, iVol)), url: g(r, iUrl), memo: g(r, iMemo),
    }))
}

// webapp 조회용: DB(liquor_price + 수동가격)에서 읽고, 이름 별칭(병합/개명)을 적용.
// (구글시트는 소스 → 동기화로만 liquor_price에 반영. 별칭·수동가격은 동기화가 안 건드림)
export async function getPricesFromDB(): Promise<PriceRow[]> {
  const db = createServiceClient()
  const [{ data: base }, { data: manual }, { data: aliases }] = await Promise.all([
    db.from('liquor_price').select('id, liquor, style, cask, peat, peat_ppm, sherry_type, name, shop, price, observed_on, volume_ml, url, memo'),
    db.from('liquor_price_manual').select('id, name, shop, price, observed_on, volume_ml, url, memo'),
    db.from('price_alias').select('from_name, to_name'),
  ])
  // 이름 별칭 전이 해석(A→B→C ⇒ A는 C로)
  const aliasMap = new Map<string, string>((aliases ?? []).map((a) => [a.from_name as string, a.to_name as string]))
  const resolve = (name: string) => {
    let n = name; const seen = new Set<string>()
    while (aliasMap.has(n) && !seen.has(n)) { seen.add(n); n = aliasMap.get(n)! }
    return n
  }
  const baseRows: PriceRow[] = (base ?? []).map((r) => ({
    id: r.id as string, source: (r.shop === DS_SHOP ? 'dailyshot' : 'sheet') as PriceRow['source'],
    liquor: r.liquor ?? '', style: r.style ?? '', cask: normalizeCask(r.cask ?? '') ?? '', peat: r.peat ?? '', peat_ppm: r.peat_ppm ?? null, sherry_type: r.sherry_type ?? '',
    name: resolve(r.name), shop: r.shop ?? '', price: r.price ?? 0,
    date: r.observed_on ?? '', volume: r.volume_ml ?? null, url: r.url ?? '', memo: r.memo ?? '',
  }))
  const manualRows: PriceRow[] = (manual ?? []).map((r) => ({
    id: r.id as string, source: 'manual' as const,
    liquor: '', style: '', cask: '', peat: '', peat_ppm: null, sherry_type: '',
    name: resolve(r.name), shop: r.shop ?? '', price: r.price ?? 0,
    date: r.observed_on ?? '', volume: r.volume_ml ?? null, url: r.url ?? '', memo: r.memo ?? '',
  }))
  return [...baseRows, ...manualRows]
}

// 소스(구글시트[주류시세]) → DB(liquor_price) 동기화(전체 교체, 단 데일리샷 행은 보존). 반환=적재 건수
export async function syncPricesToDB(): Promise<number> {
  const prices = await getPrices()
  const db = createServiceClient()
  await db.from('liquor_price').delete().or(`shop.is.null,shop.neq.${DS_SHOP}`) // 데일리샷(별도 소스)은 남기고 나머지(널 판매점 포함)만 교체
  if (prices.length) {
    await db.from('liquor_price').insert(prices.map((p) => ({
      liquor: p.liquor || null, style: p.style || null, cask: p.cask || null, peat: p.peat || null, peat_ppm: p.peat_ppm, sherry_type: p.sherry_type || null,
      name: p.name, shop: p.shop || null, price: p.price,
      observed_on: /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null,
      volume_ml: p.volume, url: p.url || null, memo: p.memo || null,
    })))
  }
  return prices.length
}

// 데일리샷메타(구글시트) → DB(liquor_price, 판매점=데일리샷). **대표가 변동분만 오늘자로 append**(변동 없으면 스킵)
// → 술별 날짜별 가격 이력이 변동 시점에만 쌓임. 같은 날 재변동은 오늘 행을 갱신(날짜당 1행).
export async function syncDailyshotToDB(): Promise<{ total: number; new: number; changed: number; unchanged: number }> {
  const rows = await readDailyshotMeta()
  if (!rows.length) return { total: 0, new: 0, changed: 0, unchanged: 0 }
  const header = rows[0].map((h) => (h ?? '').trim())
  const idx = (n: string) => header.indexOf(n)
  const iId = idx('품목ID'), iName = idx('상품명'), iSub = idx('서브카테고리'), iPrice = idx('대표가(최저)')
  const g = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').toString().trim() : '')
  const num = (s: string) => { const n = parseInt(s.replace(/[^0-9]/g, '')); return Number.isFinite(n) && n > 0 ? n : null }
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) // YYYY-MM-DD(KST)
  // 한글명 기준 dedup(최저가) — 시세는 한글명이 PK
  const cur = new Map<string, { name: string; price: number; style: string; id: string }>()
  for (const r of rows.slice(1)) {
    const name = g(r, iName); const price = num(g(r, iPrice))
    if (!name || !price) continue
    const c = cur.get(name)
    if (!c || price < c.price) cur.set(name, { name, price, style: g(r, iSub), id: g(r, iId) })
  }
  const db = createServiceClient()
  // 술별 마지막 데일리샷 가격(최근 기준일자)
  const { data: existing } = await db.from('liquor_price')
    .select('name, price, observed_on').eq('shop', DS_SHOP).order('observed_on', { ascending: false })
  const last = new Map<string, { price: number; date: string }>()
  for (const r of (existing ?? []) as { name: string; price: number; observed_on: string }[]) {
    if (!last.has(r.name)) last.set(r.name, { price: r.price, date: r.observed_on })
  }
  const toInsert: { name: string; price: number; style: string; id: string }[] = []
  let isNew = 0, changed = 0, unchanged = 0
  for (const [name, c] of cur) {
    const l = last.get(name)
    if (!l) { toInsert.push(c); isNew++; continue }
    if (l.price === c.price) { unchanged++; continue }
    changed++
    if (l.date === today) {
      // 같은 날 재변동 → 오늘 행 갱신(날짜당 1행 유지)
      await db.from('liquor_price').update({ price: c.price }).eq('shop', DS_SHOP).eq('name', name).eq('observed_on', today)
    } else {
      toInsert.push(c) // 다른 날 → 새 날짜 행 append
    }
  }
  const CHUNK = 500
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    await db.from('liquor_price').insert(toInsert.slice(i, i + CHUNK).map((p) => ({
      liquor: '위스키', style: p.style || null, name: p.name, shop: DS_SHOP, price: p.price,
      observed_on: today, url: p.id ? `https://dailyshot.co/m/item/${p.id}` : null, memo: '데일리샷메타',
    })))
  }
  return { total: cur.size, new: isNew, changed, unchanged }
}

// 한글명 기준 카탈로그(최신 기준일자의 속성 + 최저가) — 등록 시 선택용. DB 기준.
export async function getCatalog(): Promise<CatalogItem[]> {
  const prices = await getPricesFromDB()
  const byName = new Map<string, { latest: PriceRow; min: number }>()
  for (const p of prices) {
    const cur = byName.get(p.name)
    if (!cur) { byName.set(p.name, { latest: p, min: p.price }); continue }
    if ((p.date || '').localeCompare(cur.latest.date || '') > 0) cur.latest = p
    if (p.price < cur.min) cur.min = p.price
  }
  return Array.from(byName.values())
    .map(({ latest, min }) => ({ name: latest.name, liquor: latest.liquor, style: latest.style, cask: latest.cask, peat: latest.peat, peat_ppm: latest.peat_ppm, sherry_type: latest.sherry_type, volume: latest.volume, priceMin: min }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}
