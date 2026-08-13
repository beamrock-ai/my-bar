import { NextResponse } from 'next/server'
import { createServiceClient, getOrCreateShop } from '@/lib/supabase'
import { pushMirrorSafe } from '@/lib/whisky-sync'

const FORMS = ['bottle', 'glass', 'vial', 'miniature']
const toInt = (v: number | string | undefined) => {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '') return null
  if (s.toLowerCase() === 'free') return 0 // 'free' 프리셋 → 0원(무료)
  const n = parseInt(s.replace(/[^0-9-]/g, ''))
  return Number.isNaN(n) ? null : n
}

// 구매완료 1건 추가
export async function POST(req: Request) {
  const db = createServiceClient()
  const { whisky_id, shop_name, purchase_date, price, list_price, form, volume_ml } = (await req.json()) as {
    whisky_id?: string; shop_name?: string; purchase_date?: string; price?: number | string; list_price?: number | string; form?: string; volume_ml?: number | string
  }
  if (!whisky_id || !purchase_date) {
    return NextResponse.json({ error: 'whisky_id, purchase_date 필요' }, { status: 400 })
  }
  const shop_id = await getOrCreateShop(db, shop_name)
  const { data, error } = await db
    .from('purchase')
    .insert({ whisky_id, shop_id, purchase_date, price: toInt(price), list_price: toInt(list_price), form: FORMS.includes(form ?? '') ? form : 'bottle', volume_ml: toInt(volume_ml) })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // 구매완료 ↔ 구매희망 공존 불가: 구매하면 구매희망 자동 해제
  await db.from('wishlist').delete().eq('whisky_id', whisky_id)
  await pushMirrorSafe()
  return NextResponse.json(data)
}

// 구매 1건 수정 (id + 변경 필드)
export async function PATCH(req: Request) {
  const db = createServiceClient()
  const { id, shop_name, purchase_date, price, list_price, form, volume_ml } = (await req.json()) as {
    id?: string; shop_name?: string; purchase_date?: string; price?: number | string; list_price?: number | string; form?: string; volume_ml?: number | string
  }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const shop_id = await getOrCreateShop(db, shop_name)
  const { data, error } = await db
    .from('purchase')
    .update({ shop_id, purchase_date, price: toInt(price), list_price: toInt(list_price), form: FORMS.includes(form ?? '') ? form : 'bottle', volume_ml: toInt(volume_ml) })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await pushMirrorSafe()
  return NextResponse.json(data)
}

// 구매 1건 삭제
export async function DELETE(req: Request) {
  const db = createServiceClient()
  const { id } = (await req.json()) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await db.from('purchase').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await pushMirrorSafe()
  return NextResponse.json({ ok: true })
}
