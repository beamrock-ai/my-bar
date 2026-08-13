import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const DIMS = ['맛', '분위기', '응대', '쉐어링', '가성비']
type DB = ReturnType<typeof createServiceClient>

// 장소 종합평점 = 모든 댓글 부문평점의 부문별 평균 → 그 평균(0.5단위). 댓글 변경 시 재계산.
async function recomputeRating(db: DB, placeId: string) {
  const { data } = await db.from('corkage_comment').select('service_ratings').eq('place_id', placeId)
  const sum: Record<string, number> = {}, cnt: Record<string, number> = {}
  for (const c of (data ?? []) as { service_ratings: Record<string, number> | null }[]) {
    const sr = c.service_ratings; if (!sr) continue
    for (const d of DIMS) { const v = sr[d]; if (typeof v === 'number' && v > 0) { sum[d] = (sum[d] ?? 0) + v; cnt[d] = (cnt[d] ?? 0) + 1 } }
  }
  const perDim = DIMS.filter((d) => cnt[d]).map((d) => sum[d] / cnt[d])
  const overall = perDim.length ? Math.round((perDim.reduce((a, b) => a + b, 0) / perDim.length) * 2) / 2 : null
  await db.from('corkage_place').update({ rating: overall }).eq('id', placeId)
}

// 댓글 작성 (body {author?, body, service_ratings?}) — 누구나
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const { author, body, service_ratings } = (await req.json()) as { author?: string; body?: string; service_ratings?: Record<string, number> }
  if (!body || !body.trim()) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 })
  const { data, error } = await db.from('corkage_comment')
    .insert({ place_id: id, author: (author ?? '').trim() || null, body: body.trim(), service_ratings: service_ratings ?? null }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recomputeRating(db, id)
  return NextResponse.json(data)
}

// 댓글 수정 (body {commentId, body, author?, service_ratings?}) — 누구나
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const { commentId, body, author, service_ratings } = (await req.json()) as { commentId?: string; body?: string; author?: string; service_ratings?: Record<string, number> }
  if (!commentId || !body || !body.trim()) return NextResponse.json({ error: 'commentId, 내용 필요' }, { status: 400 })
  const patch: Record<string, unknown> = { body: body.trim() }
  if (author !== undefined) patch.author = (author ?? '').trim() || null
  if (service_ratings !== undefined) patch.service_ratings = service_ratings ?? null
  const { error } = await db.from('corkage_comment').update(patch).eq('id', commentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recomputeRating(db, id)
  return NextResponse.json({ ok: true })
}

// 댓글 삭제 (body {commentId}) — 누구나
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const { commentId } = (await req.json()) as { commentId?: string }
  if (!commentId) return NextResponse.json({ error: 'commentId 필요' }, { status: 400 })
  const { error } = await db.from('corkage_comment').delete().eq('id', commentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recomputeRating(db, id)
  return NextResponse.json({ ok: true })
}
