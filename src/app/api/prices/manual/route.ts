import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const toInt = (v: unknown) => { const n = parseInt(String(v ?? '').replace(/[^0-9]/g, '')); return Number.isFinite(n) && n > 0 ? n : null }

// 수동 판매점 시세 추가(일자·판매점·가격). 동기화가 건드리지 않는 별도 테이블.
export async function POST(req: Request) {
  const db = createServiceClient()
  const b = (await req.json()) as { name?: string; shop?: string; price?: unknown; observed_on?: string; volume_ml?: unknown; url?: string }
  const name = (b.name ?? '').trim()
  const price = toInt(b.price)
  if (!name) return NextResponse.json({ error: '술 이름 필요' }, { status: 400 })
  if (price == null) return NextResponse.json({ error: '가격 필요' }, { status: 400 })
  const observed_on = /^\d{4}-\d{2}-\d{2}$/.test(b.observed_on ?? '') ? b.observed_on : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const { data, error } = await db.from('liquor_price_manual').insert({
    name, shop: (b.shop ?? '').trim() || null, price, observed_on,
    volume_ml: toInt(b.volume_ml), url: (b.url ?? '').trim() || null, memo: '수동입력',
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}

export async function DELETE(req: Request) {
  const db = createServiceClient()
  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  const { error } = await db.from('liquor_price_manual').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
