import { NextResponse } from 'next/server'
import { searchNaverLocal } from '@/lib/geo'

// 장소명 → 주소/좌표/지도링크 검색 (네이버 검색 API '지역 검색')
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const r = await searchNaverLocal(q)
  return NextResponse.json(r)
}
