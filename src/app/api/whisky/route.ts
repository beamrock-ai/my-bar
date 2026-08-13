import { NextResponse } from 'next/server'
import { createServiceClient, uploadImage } from '@/lib/supabase'
import { whiskyInfo } from '@/lib/translate'
import { pullAdd, pushMirrorSafe } from '@/lib/whisky-sync'
import { getCatalog } from '@/lib/prices'
import { appendPriceRow } from '@/lib/sheets'

// 위스키 전체 + 통계 + 각 카테고리 관계 데이터 (화면 렌더용)
export async function GET() {
  const db = createServiceClient()
  // 시트에 수동 추가된 위스키를 먼저 DB로 가져옴(시트→DB 자동 연동)
  await pullAdd(db).catch(() => {})
  const [whiskies, stats, purchases, wishlists, wishlistShops, recommendations, shops, history] = await Promise.all([
    db.from('whisky').select('*').order('updated_at', { ascending: false }),
    db.from('whisky_stats').select('*'),
    db.from('purchase').select('*, shop:shop_id(name)').order('purchase_date', { ascending: false }),
    db.from('wishlist').select('*'),
    db.from('wishlist_shop').select('*, shop:shop_id(name)'),
    db.from('recommendation').select('*, recommender:recommender_id(name, kind)').order('created_at', { ascending: false }),
    db.from('shop').select('*').order('name'),
    db.from('whisky_history').select('whisky_id'),
  ])
  // 위스키별 히스토리(일자별 기록) 개수 = "노트 개수"
  const hcnt = new Map<string, number>()
  for (const h of (history.data ?? []) as { whisky_id: string }[]) hcnt.set(h.whisky_id, (hcnt.get(h.whisky_id) ?? 0) + 1)
  const whiskyRows = (whiskies.data ?? []).map((w) => ({ ...w, noteCount: hcnt.get(w.id as string) ?? 0 }))
  return NextResponse.json({
    whiskies: whiskyRows,
    stats: stats.data ?? [],
    purchases: purchases.data ?? [],
    wishlists: wishlists.data ?? [],
    wishlistShops: wishlistShops.data ?? [],
    recommendations: recommendations.data ?? [],
    shops: shops.data ?? [],
  })
}

// 위스키 생성 (이름 기준 upsert). multipart/form-data: name + 선택 image 파일.
export async function POST(req: Request) {
  const db = createServiceClient()
  const form = await req.formData()
  const n = String(form.get('name') ?? '').trim()
  if (!n) return NextResponse.json({ error: '위스키명을 입력하세요' }, { status: 400 })

  // "없을 때만 추가"(시세→노트 추가 등): 이미 있으면 프로필 덮어쓰지 않고 그대로 반환
  if (String(form.get('ifNew') ?? '') === '1') {
    const { data: exist } = await db.from('whisky').select('id, name').eq('name', n).maybeSingle()
    if (exist) return NextResponse.json({ ...exist, alreadyExists: true })
  }

  // 시세 카탈로그 조회(시트 원본) — 선택 시 주종·분류·캐스크·피트를 시트값으로 채움 + PK(한글명) 동일
  const catalog = await getCatalog().catch(() => [])
  const catHit = catalog.find((c) => c.name === n)
  const inCatalog = !!catHit

  // 이름(한/영) + 종류·증류소·도수 + 설명·향/맛/피니시 + 향/맛 레이더 + 평가 자동 생성
  const info = await whiskyInfo(n)
  const liquorInput = String(form.get('liquor') ?? '').trim() // 주종 수동 지정
  const styleInput = String(form.get('style') ?? '').trim() // 구분 수동 지정
  // 카탈로그 선택이면 이름을 시세 PK 그대로 유지, 아니면 AI 표준명
  const canonical = inCatalog ? n : (info.name_ko || info.name_en || n)
  // 객관 정보(공유)만 whisky에 저장. 주관 테이스팅은 beamrock 프로필로. (카탈로그값 > 수동 > AI)
  const record: Record<string, unknown> = {
    name: canonical,
    name_ko: inCatalog ? n : info.name_ko,
    name_en: info.name_en,
    liquor: catHit?.liquor || liquorInput || info.liquor,
    type: info.type,
    style: catHit?.style || styleInput || info.style,
    cask: catHit?.cask || info.cask,
    oak_species: info.oak_species,
    peat: catHit?.peat || info.peat,
    peat_ppm: catHit?.peat_ppm ?? info.peat_ppm,
    sherry_type: catHit?.sherry_type || info.sherry_type,
    volume_ml: catHit?.volume ?? null,
    distillery: info.distillery,
    abv: info.abv,
    description: info.description,
  }

  // 선택 사진
  const file = form.get('image')
  let uploadedUrl: string | null = null
  if (file instanceof File && file.size > 0) {
    try { uploadedUrl = await uploadImage(db, file) } catch (e) {
      return NextResponse.json({ error: `이미지 업로드 실패: ${e instanceof Error ? e.message : ''}` }, { status: 500 })
    }
    record.image_url = uploadedUrl
  }

  const { data, error } = await db.from('whisky').upsert(record, { onConflict: 'name' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // 대표 이미지로 등록
  if (uploadedUrl && data) {
    await db.from('whisky_image').update({ is_primary: false }).eq('whisky_id', data.id)
    await db.from('whisky_image').insert({ whisky_id: data.id, url: uploadedUrl, is_primary: true })
  }
  // beamrock 기본 프로필(AI 주관 baseline) — 재등록 시 개인기록(serving/color/rating 등)은 보존
  if (data) {
    await db.from('whisky_profile').upsert(
      { whisky_id: data.id, author: 'beamrock', nose: info.nose, palate: info.palate, finish: info.finish, aroma: info.aroma, flavour: info.flavour, evaluation: info.evaluation },
      { onConflict: 'whisky_id,author' },
    )
  }
  // 카탈로그에 없는 새 술 + 가격 입력 시 → 주류시세 시트에도 신규 등록(양방향, PK=한글명 동일)
  let addedToCatalog = false
  const priceIn = String(form.get('price') ?? '').replace(/[^0-9]/g, '')
  if (!inCatalog && priceIn) {
    const shopIn = String(form.get('shop') ?? '').trim() || '직접입력'
    const today = new Date().toISOString().slice(0, 10)
    const volIn = String(form.get('volume') ?? '').replace(/[^0-9]/g, '')
    try {
      // 소스(시트) 추가
      await appendPriceRow({
        주종: (record.liquor as string) || '', 분류: (record.style as string) || '',
        캐스크: (record.cask as string) || '', 피트: (record.peat as string) || '',
        PPM: record.peat_ppm != null ? String(record.peat_ppm) : '',
        셰리: (record.sherry_type as string) || '',
        한글명: canonical, 판매점: shopIn, 가격: parseInt(priceIn),
        기준일자: today, 용량ml: volIn, 비고: '주류노트 등록',
      })
      // DB(liquor_price)에도 즉시 반영(조회는 DB 기준이므로)
      await db.from('liquor_price').insert({
        liquor: (record.liquor as string) || null, style: (record.style as string) || null,
        cask: (record.cask as string) || null, peat: (record.peat as string) || null,
        peat_ppm: (record.peat_ppm as number | null) ?? null, sherry_type: (record.sherry_type as string) || null,
        name: canonical, shop: shopIn, price: parseInt(priceIn),
        observed_on: today, volume_ml: volIn ? parseInt(volIn) : null, memo: '주류노트 등록',
      })
      addedToCatalog = true
    } catch (e) {
      console.error('[whisky] 주류시세 append 실패:', e)
    }
  }

  await pushMirrorSafe() // webapp→시트 반영
  return NextResponse.json({ ...data, addedToCatalog })
}

// 위스키 삭제 (연관 데이터 CASCADE)
export async function DELETE(req: Request) {
  const db = createServiceClient()
  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await db.from('whisky').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await pushMirrorSafe() // webapp→시트 반영(삭제)
  return NextResponse.json({ ok: true })
}
