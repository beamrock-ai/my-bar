import { NextResponse } from 'next/server'
import { syncDailyshotToDB } from '@/lib/prices'

// 데일리샷메타(구글시트) → DB(liquor_price, 판매점=데일리샷). 대표가 변동분만 오늘자 append
export async function POST() {
  try {
    const r = await syncDailyshotToDB()
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'sync fail' }, { status: 200 })
  }
}
