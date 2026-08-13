import { NextResponse } from 'next/server'
import { createServiceClient, uploadImage } from '@/lib/supabase'

// 사진 추가(multipart 'image'). 대표 없으면 대표로.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const file = (await req.formData()).get('image')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: '이미지 파일이 필요합니다' }, { status: 400 })
  let url: string
  try { url = await uploadImage(db, file) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : '업로드 실패' }, { status: 500 }) }
  const { data: prim } = await db.from('corkage_image').select('id').eq('place_id', id).eq('is_primary', true).maybeSingle()
  const isPrimary = !prim
  const { data, error } = await db.from('corkage_image').insert({ place_id: id, url, is_primary: isPrimary }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (isPrimary) await db.from('corkage_place').update({ image_url: url }).eq('id', id)
  return NextResponse.json(data)
}

// 대표 사진 지정 (body {imageId})
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const { imageId } = (await req.json()) as { imageId?: string }
  if (!imageId) return NextResponse.json({ error: 'imageId 필요' }, { status: 400 })
  await db.from('corkage_image').update({ is_primary: false }).eq('place_id', id)
  await db.from('corkage_image').update({ is_primary: true }).eq('id', imageId)
  const { data: img } = await db.from('corkage_image').select('url').eq('id', imageId).single()
  await db.from('corkage_place').update({ image_url: img?.url ?? null }).eq('id', id)
  return NextResponse.json({ ok: true })
}

// 사진 삭제 (body {imageId}). 대표 지우면 다른 사진을 대표로 승격.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const { imageId } = (await req.json()) as { imageId?: string }
  if (!imageId) return NextResponse.json({ error: 'imageId 필요' }, { status: 400 })
  const { data: img } = await db.from('corkage_image').select('is_primary').eq('id', imageId).single()
  await db.from('corkage_image').delete().eq('id', imageId)
  if (img?.is_primary) {
    const { data: next } = await db.from('corkage_image').select('id, url').eq('place_id', id).order('created_at').limit(1).maybeSingle()
    await db.from('corkage_image').update({ is_primary: true }).eq('id', next?.id ?? '00000000-0000-0000-0000-000000000000')
    await db.from('corkage_place').update({ image_url: next?.url ?? null }).eq('id', id)
  }
  return NextResponse.json({ ok: true })
}
