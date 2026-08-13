import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { whiskyInfo } from '@/lib/translate'
import { pushMirrorSafe } from '@/lib/whisky-sync'

// 등록된 주류의 빈 속성(구분·캐스크·피트·주종)을 AI로 채움. 이미 값이 있는 필드는 유지(덮어쓰지 않음).
export async function POST() {
  const db = createServiceClient()
  const { data: whiskies } = await db.from('whisky').select('id, name, name_ko, name_en, liquor, style, cask, oak_species, peat, peat_ppm, sherry_type')
  const results: Record<string, unknown>[] = []
  for (const w of whiskies ?? []) {
    if (w.style && w.cask && w.oak_species && w.peat && w.liquor && w.peat_ppm != null && w.sherry_type) continue // 모두 채워짐 → 스킵(LLM 호출 안 함)
    const info = await whiskyInfo(w.name_ko || w.name || w.name_en || '')
    const patch: Record<string, unknown> = {}
    if (!w.liquor && info.liquor) patch.liquor = info.liquor
    if (!w.style && info.style) patch.style = info.style
    if (!w.cask && info.cask) patch.cask = info.cask
    if (!w.oak_species && info.oak_species) patch.oak_species = info.oak_species
    if (!w.peat && info.peat) patch.peat = info.peat
    if (w.peat_ppm == null && info.peat_ppm != null) patch.peat_ppm = info.peat_ppm // 피트강도(확실할 때만)
    if (!w.sherry_type && info.sherry_type) patch.sherry_type = info.sherry_type // 셰리 종류
    if (Object.keys(patch).length) {
      await db.from('whisky').update(patch).eq('id', w.id)
      results.push({ name: w.name_ko || w.name, ...patch })
    }
  }
  if (results.length) await pushMirrorSafe()
  return NextResponse.json({ updated: results.length, results })
}
