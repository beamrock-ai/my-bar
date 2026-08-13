import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const EDITABLE = ['name', 'region', 'address', 'corkage_type', 'corkage_detail', 'visit_status', 'rating', 'service_note', 'memo', 'phone', 'url', 'options', 'service_ratings', 'cuisine']

// 상세(장소 + 사진들)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const [place, images, comments] = await Promise.all([
    db.from('corkage_place').select('*').eq('id', id).single(),
    db.from('corkage_image').select('*').eq('place_id', id).order('is_primary', { ascending: false }).order('created_at'),
    db.from('corkage_comment').select('*').eq('place_id', id).order('created_at'),
  ])
  if (!place.data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ place: place.data, images: images.data ?? [], comments: comments.data ?? [] })
}

// 편집
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const body = (await req.json()) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE) if (k in body) patch[k] = body[k]
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })
  const { error } = await db.from('corkage_place').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
