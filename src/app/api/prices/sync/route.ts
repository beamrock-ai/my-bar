import { NextResponse } from 'next/server'
import { syncPricesToDB } from '@/lib/prices'

// 소스(구글시트[주류시세]) → DB(liquor_price) 동기화
export async function POST() {
  try {
    const count = await syncPricesToDB()
    return NextResponse.json({ ok: true, count })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'sync fail' }, { status: 200 })
  }
}
