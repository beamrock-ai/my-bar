import { createServiceClient } from '@/lib/supabase'
import { whiskyInfo, LIQUORS } from '@/lib/translate'
import { readWhiskySheet, writeWhiskySheet, ensureMetaDropdowns } from '@/lib/sheets'

// 위스키명(PK) 기준 구글시트[위스키] ↔ DB 양방향 동기화 모듈.
//  - pullAdd    : 시트에만 있는 위스키명 → DB 추가(부족 언어 자동변환)
//  - deleteMirror: 시트에서 지워진(=DB에만 있는) 위스키 → DB 삭제 (빈 시트 가드)
//  - pushMirror : DB 전체 → 시트 덮어쓰기(뷰 갱신)
//  - fullSync   : pullAdd + deleteMirror + pushMirror

type DB = ReturnType<typeof createServiceClient>

// A~O: 주종 + 한글명 + 영문명 + 카테고리(드롭다운) + 구매 일자/상점/금액 분리(필터용)
const HEADER = ['주종', '한글명', '영문명', '카테고리', '구매일자', '구매상점', '구매금액', '구매횟수', '최저가(시점·상점)', '평균가', '최고가(시점·상점)', '추천인', '추천이유', '사진URL', '비고']
const LIQUOR_COL = 0 // A열(0-based) 주종
const CATEGORY_COL = 3 // D열(0-based, 술유형 추가로 C→D 이동)
const CATEGORY_VALUES = ['구매완료', '시음', '바이알시음', '지인선물', '구매희망', '지인추천', '전문가추천', '직접촬영']
// 구매형태: bottle=구매(완료), 그 외(glass/vial/miniature)=시음. 레거시(form=null)는 구매로 간주.
const isBottle = (form: string | null | undefined) => (form ?? 'bottle') === 'bottle'
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()

async function buildGrid(db: DB): Promise<string[][]> {
  const [whiskies, purchases, wishlists, recos, observations] = await Promise.all([
    db.from('whisky').select('*').order('name'),
    db.from('purchase').select('whisky_id, purchase_date, price, form, shop:shop_id(name)').order('purchase_date', { ascending: false }),
    db.from('wishlist').select('whisky_id'),
    db.from('recommendation').select('whisky_id, reason, recommender:recommender_id(name, kind)'),
    db.from('price_observation').select('whisky_id, price, observed_on, shop:shop_id(name)'),
  ])
  const won = (n: number) => `${Number(n).toLocaleString()}원`
  const wishOf = (id: string) => (wishlists.data ?? []).some((w) => w.whisky_id === id)

  type RecoR = { whisky_id: string; reason: string | null; recommender: { name: string; kind: string } | null }
  const recoData = (recos.data ?? []) as unknown as RecoR[]
  const recosOf = (id: string) => recoData.filter((r) => r.whisky_id === id)

  type BuyRow = { whisky_id: string; purchase_date: string; price: number | null; form: string | null; shop: { name: string } | null }
  const buyData = (purchases.data ?? []) as unknown as BuyRow[] // 날짜 내림차순
  const buysOf = (id: string) => buyData.filter((p) => p.whisky_id === id)

  type Obs = { whisky_id: string; price: number; observed_on: string | null; shop: { name: string } | null }
  const obsData = (observations.data ?? []) as unknown as Obs[]
  const obsOf = (id: string) => obsData.filter((o) => o.whisky_id === id)

  const grid: string[][] = [HEADER]
  for (const w of whiskies.data ?? []) {
    const buys = buysOf(w.id) // 최근순
    const buyCnt = buys.filter((p) => isBottle(p.form)).length   // 구매(bottle)
    const tasteCnt = buys.length - buyCnt                        // 시음(그 외)
    const recos2 = recosOf(w.id)
    const hasFriend = recos2.some((r) => r.recommender?.kind === 'friend')
    const hasExpert = recos2.some((r) => r.recommender?.kind === 'expert')
    const hasGift = recos2.some((r) => r.recommender?.kind === 'gift')
    const hasVial = recos2.some((r) => r.recommender?.kind === 'vial')
    const hasPhoto = recos2.some((r) => r.recommender?.kind === 'photo')

    // 카테고리(단일, 우선순위): 구매완료(bottle) > 시음(그 외 구매형태) > 바이알시음 > 지인선물 > 구매희망 > 지인추천 > 전문가추천 > 직접촬영
    const category = buyCnt ? '구매완료' : tasteCnt ? '시음' : hasVial ? '바이알시음' : hasGift ? '지인선물' : wishOf(w.id) ? '구매희망' : hasFriend ? '지인추천' : hasExpert ? '전문가추천' : hasPhoto ? '직접촬영' : ''

    // 구매(최근 1건) — 분리 컬럼
    const latest = buys[0]
    const buyDate = latest?.purchase_date ?? ''
    const buyShop = latest?.shop?.name ?? ''
    const buyPrice = latest?.price != null ? won(latest.price) : ''

    // 최저/최고가(시점·상점) = 시세(관측) + 구매가격. 단 구매는 bottle·price>0만(시음·free 제외 → 시세 왜곡 방지)
    const priceRecs: { price: number; when: string | null; shop?: string }[] = [
      ...obsOf(w.id).map((o) => ({ price: o.price, when: o.observed_on, shop: o.shop?.name })),
      ...buys.filter((p) => p.price != null && p.price > 0 && isBottle(p.form)).map((p) => ({ price: p.price as number, when: p.purchase_date, shop: p.shop?.name })),
    ]
    let minCell = '', avgCell = '', maxCell = ''
    if (priceRecs.length) {
      const mn = priceRecs.reduce((a, b) => (b.price < a.price ? b : a))
      const mx = priceRecs.reduce((a, b) => (b.price > a.price ? b : a))
      const c = (r: { when: string | null; shop?: string }) => [r.when, r.shop].filter(Boolean).join(', ')
      minCell = `${won(mn.price)}${c(mn) ? ` (${c(mn)})` : ''}`
      maxCell = `${won(mx.price)}${c(mx) ? ` (${c(mx)})` : ''}`
      avgCell = won(Math.round(priceRecs.reduce((s, r) => s + r.price, 0) / priceRecs.length))
    }

    // 추천(지인+전문가 합산)
    const recBy = recos2.map((r) => r.recommender?.name).filter(Boolean).join(', ')
    const recReason = recos2.map((r) => r.reason).filter(Boolean).join(' / ')

    grid.push([
      w.liquor || '',
      w.name_ko || w.name || '',
      w.name_en || '',
      category,
      buyDate,
      buyShop,
      buyPrice,
      `${buyCnt}${tasteCnt ? ` · 시음 ${tasteCnt}` : ''}`,
      minCell,
      avgCell,
      maxCell,
      recBy,
      recReason,
      w.image_url || '',
      '',
    ])
  }
  return grid
}

export async function pullAdd(db: DB): Promise<number> {
  const sheet = await readWhiskySheet()
  const rows = sheet.slice(1).filter((r) => (r[1] ?? '').trim() || (r[2] ?? '').trim()) // 한글명/영문명 있는 행
  if (!rows.length) return 0
  const { data: existing } = await db.from('whisky').select('name, name_ko, name_en')
  const known = new Set<string>()
  for (const w of existing ?? []) for (const v of [w.name, w.name_ko, w.name_en]) if (v) known.add(norm(v))

  let imported = 0
  for (const r of rows) {
    const sheetLiquor = (r[0] ?? '').trim() // A열 술유형
    const ko = (r[1] ?? '').trim()
    const en = (r[2] ?? '').trim()
    if ((ko && known.has(norm(ko))) || (en && known.has(norm(en)))) continue
    const info = await whiskyInfo(ko || en)
    const nk = ko || info.name_ko
    const ne = en || info.name_en
    const canon = nk || ne || ko || en
    await db.from('whisky').upsert(
      {
        name: canon, name_ko: nk, name_en: ne,
        liquor: sheetLiquor || info.liquor, style: info.style, cask: info.cask, oak_species: info.oak_species, peat: info.peat, peat_ppm: info.peat_ppm, sherry_type: info.sherry_type,
        image_url: (r[13] ?? '').trim() || null,
        type: info.type, distillery: info.distillery, abv: info.abv,
        description: info.description, nose: info.nose, palate: info.palate, finish: info.finish,
        aroma: info.aroma, flavour: info.flavour, evaluation: info.evaluation,
      },
      { onConflict: 'name' },
    )
    for (const v of [canon, nk, ne]) if (v) known.add(norm(v))
    imported++
  }
  return imported
}

export async function deleteMirror(db: DB): Promise<number> {
  const sheet = await readWhiskySheet()
  const rows = sheet.slice(1).filter((r) => (r[1] ?? '').trim() || (r[2] ?? '').trim())
  if (!rows.length) return 0 // 가드: 빈 시트로는 DB를 지우지 않음(전체 삭제는 webapp에서)
  const keys = new Set<string>()
  for (const r of rows) {
    const ko = (r[1] ?? '').trim() // 한글명(A=술유형 추가로 B열)
    const en = (r[2] ?? '').trim() // 영문명(C열)
    if (ko) keys.add(norm(ko))
    if (en) keys.add(norm(en))
  }
  const { data: whiskies } = await db.from('whisky').select('id, name, name_ko, name_en')
  const toDel = (whiskies ?? [])
    .filter((w) => {
      const names = [w.name, w.name_ko, w.name_en].filter(Boolean).map((v) => norm(v as string))
      return !names.some((nm) => keys.has(nm))
    })
    .map((w) => w.id as string)
  if (toDel.length) await db.from('whisky').delete().in('id', toDel)
  return toDel.length
}

export async function pushMirror(db: DB): Promise<number> {
  const grid = await buildGrid(db)
  await writeWhiskySheet(grid)
  return grid.length - 1
}

export async function fullSync(db: DB): Promise<{ imported: number; deleted: number; exported: number }> {
  const imported = await pullAdd(db)
  const deleted = await deleteMirror(db)
  const exported = await pushMirror(db)
  // 술유형(A)·카테고리(D) 드롭다운 유지(컬럼 이동 대비 전체 초기화 후 재적용)
  await ensureMetaDropdowns([{ colIndex: LIQUOR_COL, values: [...LIQUORS] }, { colIndex: CATEGORY_COL, values: CATEGORY_VALUES }]).catch(() => {})
  return { imported, deleted, exported }
}

// webapp 변경 후 시트 반영(push)을 안전하게(실패해도 요청은 성공) 호출
export async function pushMirrorSafe(): Promise<void> {
  try {
    await pushMirror(createServiceClient())
  } catch (e) {
    console.error('[whisky-sync] pushMirror 실패:', e)
  }
}
