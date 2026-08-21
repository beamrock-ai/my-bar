import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// 시세 이름 별칭(병합/개명). from_name(들) → to_name. 읽기 시점에 전이 적용되어 동기화에도 유지.
// 병합: from=[여러 이름], to=유지할 이름 / 개명: from=현재이름, to=새이름
export async function POST(req: Request) {
  const db = createServiceClient()
  const body = (await req.json()) as { from?: string | string[]; to?: string }
  const to = (body.to ?? '').trim()
  const froms = (Array.isArray(body.from) ? body.from : [body.from])
    .map((s) => (s ?? '').trim())
    .filter((s) => s && s !== to)
  if (!to || froms.length === 0) return NextResponse.json({ error: 'from/to 필요' }, { status: 400 })

  const rows = froms.map((f) => ({ from_name: f, to_name: to }))
  const { error } = await db.from('price_alias').upsert(rows, { onConflict: 'from_name' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, merged: froms.length, to })
}

// 별칭 해제(병합/개명 취소). from_name(들) 삭제.
export async function DELETE(req: Request) {
  const db = createServiceClient()
  const body = (await req.json()) as { from?: string | string[] }
  const froms = (Array.isArray(body.from) ? body.from : [body.from]).map((s) => (s ?? '').trim()).filter(Boolean)
  if (froms.length === 0) return NextResponse.json({ error: 'from 필요' }, { status: 400 })
  const { error } = await db.from('price_alias').delete().in('from_name', froms)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
