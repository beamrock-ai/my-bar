import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { pushMirrorSafe } from '@/lib/whisky-sync'

// 단건 상세 (테이스팅 노트용): 위스키 + 구매/시세/추천
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const [whisky, purchases, observations, recommendations, wishlist, images, history] = await Promise.all([
    db.from('whisky').select('*').eq('id', id).single(),
    db.from('purchase').select('*, shop:shop_id(name)').eq('whisky_id', id).order('purchase_date', { ascending: false }),
    db.from('price_observation').select('*, shop:shop_id(name)').eq('whisky_id', id).order('price'),
    db.from('recommendation').select('*, recommender:recommender_id(name, kind)').eq('whisky_id', id),
    db.from('wishlist').select('id').eq('whisky_id', id).maybeSingle(),
    db.from('whisky_image').select('*').eq('whisky_id', id).order('is_primary', { ascending: false }).order('created_at'),
    db.from('whisky_history').select('*').eq('whisky_id', id).order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
  ])
  if (whisky.error) return NextResponse.json({ error: whisky.error.message }, { status: 404 })

  // 작성자별 프로필 (없으면 beamrock 기본 생성)
  let { data: profiles } = await db.from('whisky_profile').select('*').eq('whisky_id', id).order('created_at')
  if (!profiles || profiles.length === 0) {
    await db.from('whisky_profile').insert({ whisky_id: id, author: 'beamrock' })
    profiles = (await db.from('whisky_profile').select('*').eq('whisky_id', id).order('created_at')).data ?? []
  }

  return NextResponse.json({
    whisky: whisky.data,
    profiles,
    purchases: purchases.data ?? [],
    observations: observations.data ?? [],
    recommendations: recommendations.data ?? [],
    hasWishlist: !!wishlist.data,
    images: images.data ?? [],
    history: history.data ?? [],
  })
}

// 위스키(객관, 공유) 편집 필드 — 주관 테이스팅은 /profile 라우트에서 처리
const EDITABLE = ['name_ko', 'name_en', 'liquor', 'type', 'style', 'cask', 'oak_species', 'peat', 'peat_ppm', 'sherry_type', 'distillery', 'abv', 'volume_ml', 'description', 'blend_ratio', 'price_name']

// 편집 저장
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const body = (await req.json()) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE) if (k in body) patch[k] = body[k]
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })
  const { error } = await db.from('whisky').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await pushMirrorSafe()
  return NextResponse.json({ ok: true })
}
