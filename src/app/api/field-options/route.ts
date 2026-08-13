import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// 가격·용량 드롭다운 프리셋(사용자 관리). field ∈ 'price'|'volume'
const FIELDS = ['price', 'volume'] as const

// 전체 조회 → { price:[], volume:[] } (숫자 오름차순)
export async function GET() {
  const db = createServiceClient()
  const { data } = await db.from('field_option').select('field, value')
  const out: Record<string, string[]> = { price: [], volume: [] }
  for (const r of (data ?? []) as { field: string; value: string }[]) {
    if (out[r.field]) out[r.field].push(r.value)
  }
  for (const f of FIELDS) out[f].sort((a, b) => Number(a) - Number(b))
  return NextResponse.json(out)
}

// 값 추가 { field, value }
export async function POST(req: Request) {
  const db = createServiceClient()
  const { field, value } = (await req.json()) as { field?: string; value?: string | number }
  if (!field || !FIELDS.includes(field as typeof FIELDS[number])) return NextResponse.json({ error: 'field 오류' }, { status: 400 })
  const v = String(value ?? '').replace(/[^0-9]/g, '')
  if (!v) return NextResponse.json({ error: '숫자 값이 필요합니다' }, { status: 400 })
  const { error } = await db.from('field_option').upsert({ field, value: v }, { onConflict: 'field,value', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// 값 삭제 { field, value }
export async function DELETE(req: Request) {
  const db = createServiceClient()
  const { field, value } = (await req.json()) as { field?: string; value?: string | number }
  if (!field || value == null) return NextResponse.json({ error: 'field, value 필요' }, { status: 400 })
  const { error } = await db.from('field_option').delete().eq('field', field).eq('value', String(value))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
