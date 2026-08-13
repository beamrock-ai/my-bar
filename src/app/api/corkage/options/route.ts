import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const KINDS = ['무료', '유료']

// 콜키지내역 프리셋(무료/유료별, 사용자 관리)
export async function GET() {
  const db = createServiceClient()
  const { data } = await db.from('corkage_option').select('kind, value').order('created_at')
  const out: Record<string, string[]> = { 무료: [], 유료: [] }
  for (const r of (data ?? []) as { kind: string; value: string }[]) if (out[r.kind]) out[r.kind].push(r.value)
  return NextResponse.json(out)
}

export async function POST(req: Request) {
  const db = createServiceClient()
  const { kind, value } = (await req.json()) as { kind?: string; value?: string }
  if (!kind || !KINDS.includes(kind)) return NextResponse.json({ error: 'kind 오류' }, { status: 400 })
  const v = (value ?? '').trim()
  if (!v) return NextResponse.json({ error: '값 필요' }, { status: 400 })
  const { error } = await db.from('corkage_option').upsert({ kind, value: v }, { onConflict: 'kind,value', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const db = createServiceClient()
  const { kind, value } = (await req.json()) as { kind?: string; value?: string }
  if (!kind || value == null) return NextResponse.json({ error: 'kind, value 필요' }, { status: 400 })
  const { error } = await db.from('corkage_option').delete().eq('kind', kind).eq('value', String(value))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
