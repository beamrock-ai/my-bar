import { NextResponse } from 'next/server'
import { getPricesFromDB } from '@/lib/prices'

// webapp 조회: DB(liquor_price)에서 시세 반환. (구글시트 직접 읽지 않음)
export async function GET() {
  try {
    const prices = await getPricesFromDB()
    return NextResponse.json({ prices })
  } catch (e) {
    return NextResponse.json({ prices: [], error: e instanceof Error ? e.message : 'db read fail' }, { status: 200 })
  }
}
