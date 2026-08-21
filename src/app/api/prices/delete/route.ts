import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// 시세 항목 삭제(숨김). 선택한 이름(들)을 price_hidden에 등록 + 현재 행 삭제.
// 동기화(시트/데일리샷)가 재적재하지 않도록 이름 기준으로 숨김 유지.
export async function POST(req: Request) {
  const db = createServiceClient()
  const body = (await req.json()) as { names?: string[] }
  const names = (body.names ?? []).map((s) => (s ?? '').trim()).filter(Boolean)
  if (names.length === 0) return NextResponse.json({ error: 'names 필요' }, { status: 400 })

  // 숨김 등록(멱등)
  const { error: hErr } = await db.from('price_hidden').upsert(names.map((n) => ({ name: n })), { onConflict: 'name', ignoreDuplicates: true })
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 })
  // 현재 행 즉시 삭제(시세 원본 + 수동가격 둘 다)
  await db.from('liquor_price').delete().in('name', names)
  await db.from('liquor_price_manual').delete().in('name', names)
  return NextResponse.json({ ok: true, deleted: names.length })
}

// 숨김 해제(복구). 이후 동기화 시 다시 적재됨(수동가격은 복구 불가).
export async function DELETE(req: Request) {
  const db = createServiceClient()
  const body = (await req.json()) as { names?: string[] }
  const names = (body.names ?? []).map((s) => (s ?? '').trim()).filter(Boolean)
  if (names.length === 0) return NextResponse.json({ error: 'names 필요' }, { status: 400 })
  const { error } = await db.from('price_hidden').delete().in('name', names)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
