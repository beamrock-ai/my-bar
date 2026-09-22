import { NextResponse } from 'next/server'
import { createServiceClient, getOrCreateShop } from '@/lib/supabase'
import { pushMirrorSafe } from '@/lib/whisky-sync'

const FORMS = ['bottle', 'glass', 'vial', 'miniature']
const PRICE_MAX = 100_000_000 // 실구매가/정가 상한 1억원
const VOL_MAX = 5000          // 용량 상한 5000ml(매그넘 여유)
const toInt = (v: number | string | undefined) => {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '') return null
  if (s.toLowerCase() === 'free') return 0 // 'free' 프리셋 → 0원(무료)
  const n = parseInt(s.replace(/[^0-9-]/g, ''))
  return Number.isNaN(n) ? null : n
}
// 가격/용량 sanity 검증(음수·비현실적 대량입력 차단) → 문제 메시지, 정상이면 null
function sanityError(price: number | null, list: number | null, vol: number | null): string | null {
  if (price != null && (price < 0 || price > PRICE_MAX)) return `실구매가가 허용 범위를 벗어났습니다 (0~${PRICE_MAX.toLocaleString()}원)`
  if (list != null && (list < 0 || list > PRICE_MAX)) return `정가가 허용 범위를 벗어났습니다 (0~${PRICE_MAX.toLocaleString()}원)`
  if (vol != null && (vol < 1 || vol > VOL_MAX)) return `용량(ml)이 허용 범위를 벗어났습니다 (1~${VOL_MAX}ml)`
  return null
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
  const priceN = toInt(price), listN = toInt(list_price), volN = toInt(volume_ml)
  const serr = sanityError(priceN, listN, volN)
  if (serr) return NextResponse.json({ error: serr }, { status: 400 })
  // 중복 폭주 방지: 동일 위스키·구매일자가 최근 10초 내 이미 추가됐으면 거부(연타·스턱키·재제출 방지)
  const since = new Date(Date.now() - 10_000).toISOString()
  const { data: dups } = await db
    .from('purchase').select('id')
    .eq('whisky_id', whisky_id).eq('purchase_date', purchase_date)
    .gte('created_at', since).limit(1)
  if (dups && dups.length) {
    return NextResponse.json({ error: '방금 동일 구매가 추가되었습니다(중복 방지). 잠시 후 다시 시도하세요.' }, { status: 409 })
  }
  const shop_id = await getOrCreateShop(db, shop_name)
  const { data, error } = await db
    .from('purchase')
    .insert({ whisky_id, shop_id, purchase_date, price: priceN, list_price: listN, form: FORMS.includes(form ?? '') ? form : 'bottle', volume_ml: volN })
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
  const priceN = toInt(price), listN = toInt(list_price), volN = toInt(volume_ml)
  const serr = sanityError(priceN, listN, volN)
  if (serr) return NextResponse.json({ error: serr }, { status: 400 })
  const shop_id = await getOrCreateShop(db, shop_name)
  const { data, error } = await db
    .from('purchase')
    .update({ shop_id, purchase_date, price: priceN, list_price: listN, form: FORMS.includes(form ?? '') ? form : 'bottle', volume_ml: volN })
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
