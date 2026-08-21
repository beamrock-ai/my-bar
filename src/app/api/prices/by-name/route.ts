import { NextResponse } from 'next/server'
import { getPricesFromDB } from '@/lib/prices'

const nkey = (s: string) => (s ?? '').replace(/\s+/g, '')

// 특정 술 이름의 시세 관측치(매칭된 노트에서 최저/평균/최고 계산용). nkey(공백제거) 일치.
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('name') ?? ''
  if (!name.trim()) return NextResponse.json({ prices: [] })
  try {
    const all = await getPricesFromDB()
    const k = nkey(name)
    const prices = all
      .filter((p) => nkey(p.name) === k)
      .map((p) => ({ price: p.price, date: p.date, shop: p.shop, source: p.source }))
    return NextResponse.json({ prices })
  } catch (e) {
    return NextResponse.json({ prices: [], error: e instanceof Error ? e.message : 'fail' }, { status: 200 })
  }
}
