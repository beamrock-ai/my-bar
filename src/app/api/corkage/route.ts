import { NextResponse } from 'next/server'
import { createServiceClient, uploadImage } from '@/lib/supabase'

const TYPES = ['유료', '무료']
const VISITS = ['방문예정', '방문완료']
const toNum = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); if (!s) return null; const n = parseFloat(s); return Number.isFinite(n) ? n : null }

// 목록 + 각 장소 사진 수
export async function GET() {
  const db = createServiceClient()
  const [places, images, comments] = await Promise.all([
    db.from('corkage_place').select('*').order('updated_at', { ascending: false }),
    db.from('corkage_image').select('place_id'),
    db.from('corkage_comment').select('place_id'),
  ])
  const cnt = new Map<string, number>(), ccnt = new Map<string, number>()
  for (const im of (images.data ?? []) as { place_id: string }[]) cnt.set(im.place_id, (cnt.get(im.place_id) ?? 0) + 1)
  for (const c of (comments.data ?? []) as { place_id: string }[]) ccnt.set(c.place_id, (ccnt.get(c.place_id) ?? 0) + 1)
  const rows = (places.data ?? []).map((p) => ({ ...p, imageCount: cnt.get(p.id) ?? 0, commentCount: ccnt.get(p.id) ?? 0 }))
  return NextResponse.json({ places: rows })
}

// 등록 (multipart: name 필수 + 선택 사진)
export async function POST(req: Request) {
  const db = createServiceClient()
  const form = await req.formData()
  const name = String(form.get('name') ?? '').trim()
  if (!name) return NextResponse.json({ error: '장소명이 필요합니다' }, { status: 400 })
  const corkage_type = TYPES.includes(String(form.get('corkage_type'))) ? String(form.get('corkage_type')) : null
  const visit_status = VISITS.includes(String(form.get('visit_status'))) ? String(form.get('visit_status')) : '방문예정'
  const record: Record<string, unknown> = {
    name, region: String(form.get('region') ?? '').trim() || null,
    address: String(form.get('address') ?? '').trim() || null,
    phone: String(form.get('phone') ?? '').trim() || null,
    url: String(form.get('url') ?? '').trim() || null,
    corkage_type, corkage_detail: String(form.get('corkage_detail') ?? '').trim() || null,
    visit_status, rating: toNum(form.get('rating')),
  }
  const file = form.get('image')
  if (file instanceof File && file.size > 0) {
    try { record.image_url = await uploadImage(db, file) } catch (e) {
      return NextResponse.json({ error: `사진 업로드 실패: ${e instanceof Error ? e.message : ''}` }, { status: 500 })
    }
  }
  const { data, error } = await db.from('corkage_place').insert(record).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (record.image_url && data) {
    await db.from('corkage_image').insert({ place_id: data.id, url: record.image_url, is_primary: true })
  }
  return NextResponse.json(data)
}

// 삭제 (body {id})
export async function DELETE(req: Request) {
  const db = createServiceClient()
  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await db.from('corkage_place').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
