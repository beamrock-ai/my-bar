import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { analyzeWhiskyKeywords } from '@/lib/translate'

// 노트 사진 분석 → 특성 키워드 추출 + 용어사전 연동(없으면 추가), whisky.keywords 저장.
// body { image_ids? }: 선택한 여러 장(최대 8), 미지정 시 대표사진 1장 분석.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const { image_ids } = (await req.json().catch(() => ({}))) as { image_ids?: string[] }

  const { data: w } = await db.from('whisky').select('id, name, name_ko').eq('id', id).single()
  if (!w) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // 분석 대상(선택 이미지들, 미지정 시 대표사진 1장)
  let q = db.from('whisky_image').select('url').eq('whisky_id', id)
  q = image_ids && image_ids.length ? q.in('id', image_ids) : q.order('is_primary', { ascending: false }).order('created_at').limit(1)
  const { data: imgs } = await q
  if (!imgs || !imgs.length) return NextResponse.json({ error: '먼저 사진을 추가하세요' }, { status: 400 })

  // 이미지 → base64 (최대 8장)
  const images: { media_type: string; data: string }[] = []
  for (const im of imgs.slice(0, 8)) {
    try {
      const r = await fetch(im.url as string)
      if (!r.ok) continue
      const ct = r.headers.get('content-type') || 'image/jpeg'
      const buf = Buffer.from(await r.arrayBuffer())
      images.push({ media_type: ct.split(';')[0], data: buf.toString('base64') })
    } catch { /* skip */ }
  }
  if (!images.length) return NextResponse.json({ error: '사진을 불러오지 못했습니다' }, { status: 400 })

  const { keywords, summary } = await analyzeWhiskyKeywords(images, w.name_ko || w.name || '')
  if (!keywords.length) return NextResponse.json({ error: '키워드를 추출하지 못했습니다' }, { status: 200 })

  // 용어사전 연동: 없으면 추가(중복 무시), 있으면 유지
  const rows = keywords.map((k) => ({ term: k.term, term_en: k.term_en, category: k.category, definition: k.definition ?? '', source: `사진분석: ${w.name_ko || w.name}` }))
  const { data: inserted } = await db.from('term').upsert(rows, { onConflict: 'term', ignoreDuplicates: true }).select('term')
  const added = (inserted ?? []).map((r) => r.term)

  // 키워드 + 설명 저장
  const terms = keywords.map((k) => k.term)
  await db.from('whisky').update({ keywords: terms, analysis: summary || null }).eq('id', id)

  return NextResponse.json({ keywords: terms, analysis: summary, added, addedCount: added.length })
}
