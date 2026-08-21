import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// 개별 시세 관측 행 삭제(드릴다운에서 선택 삭제). id 기준.
// liquorIds = liquor_price(시트/데일리샷) 행, manualIds = 수동가격 행.
// ※시트/데일리샷 원본 행은 다음 동기화 때 다시 생길 수 있음(항목 자체를 없애려면 목록의 삭제 사용).
export async function DELETE(req: Request) {
  const db = createServiceClient()
  const { liquorIds = [], manualIds = [] } = (await req.json()) as { liquorIds?: string[]; manualIds?: string[] }
  const liq = liquorIds.filter(Boolean)
  const man = manualIds.filter(Boolean)
  if (liq.length === 0 && man.length === 0) return NextResponse.json({ error: 'ids 필요' }, { status: 400 })
  if (liq.length) { const { error } = await db.from('liquor_price').delete().in('id', liq); if (error) return NextResponse.json({ error: error.message }, { status: 500 }) }
  if (man.length) { const { error } = await db.from('liquor_price_manual').delete().in('id', man); if (error) return NextResponse.json({ error: error.message }, { status: 500 }) }
  return NextResponse.json({ ok: true, deleted: liq.length + man.length })
}
