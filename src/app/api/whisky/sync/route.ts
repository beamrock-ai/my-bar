import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { fullSync, pushMirror } from '@/lib/whisky-sync'

// 전체 양방향 동기화 (시트→DB 추가/삭제 미러 + DB→시트 미러). 버튼·크론에서 호출.
// ?mode=push : DB→시트 단방향 덮어쓰기만(pullAdd 없음). DB 클렌징 후 시트를 되살림 없이 정리할 때 사용.
export async function POST(req: Request) {
  const mode = new URL(req.url).searchParams.get('mode')
  try {
    const db = createServiceClient()
    if (mode === 'push') {
      const pushed = await pushMirror(db)
      return NextResponse.json({ pushed })
    }
    const r = await fullSync(db)
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
