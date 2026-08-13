import { NextResponse } from 'next/server'
import { createServiceClient, getOrCreateRecommender } from '@/lib/supabase'
import { pushMirrorSafe } from '@/lib/whisky-sync'

// 추천 추가 (지인추천 friend / 전문가추천 expert / 지인선물 gift / 직접촬영 photo / 바이알시음 vial)
export async function POST(req: Request) {
  const db = createServiceClient()
  const { whisky_id, kind, name, reason } = (await req.json()) as {
    whisky_id?: string; kind?: 'friend' | 'expert' | 'gift' | 'photo' | 'vial'; name?: string; reason?: string
  }
  const nameOptional = kind === 'photo' || kind === 'vial' // 이름 없이도 등록 가능
  if (!whisky_id || !kind || (!nameOptional && !(name ?? '').trim())) {
    return NextResponse.json({ error: 'whisky_id, kind, name(지인명/출처) 필요' }, { status: 400 })
  }
  const fallback = kind === 'vial' ? '바이알시음' : '직접촬영'
  const recommender_id = await getOrCreateRecommender(db, (name ?? '').trim() || fallback, kind)
  const { data, error } = await db
    .from('recommendation')
    .insert({ whisky_id, recommender_id, reason: reason ?? null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await pushMirrorSafe()
  return NextResponse.json(data)
}

// 추천 삭제
export async function DELETE(req: Request) {
  const db = createServiceClient()
  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await db.from('recommendation').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await pushMirrorSafe()
  return NextResponse.json({ ok: true })
}
