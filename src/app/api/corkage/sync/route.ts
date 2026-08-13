import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { readCorkageSheet, writeCorkageSheet } from '@/lib/sheets'
import { searchNaverLocal } from '@/lib/geo'

const VISITS = ['방문예정', '방문완료']
const TYPES = ['유료', '무료']
// 미러 헤더. 지도링크 맨 뒤(HYPERLINK). 머지 대상 컬럼 = MERGE_COLS
const HEADER = ['장소명', '방문상태', '콜키지', '콜키지내역', '종합평점', '메인 요리', '지역', '주소', '전화', '메모', '옵션', '등록일자', '지도링크']
const MERGE_COLS = ['방문상태', '콜키지', '콜키지내역', '메인 요리', '지역', '주소', '전화', '메모', '옵션'] as const

type Place = {
  id: string; name: string; visit_status: string | null; corkage_type: string | null; corkage_detail: string | null
  rating: number | null; cuisine: string | null; region: string | null; address: string | null
  phone: string | null; url: string | null; memo: string | null; options: string[] | null
  created_at: string; sheet_baseline: Record<string, string> | null
}
const nk = (s: string) => (s ?? '').replace(/\s+/g, '')

// DB 값 → 시트 문자열 표현(머지 비교용)
const dbStr = (p: Place): Record<string, string> => ({
  '방문상태': p.visit_status || '', '콜키지': p.corkage_type || '',
  '콜키지내역': p.corkage_detail || '',
  '메인 요리': p.cuisine || '', '지역': p.region || '', '주소': p.address || '',
  '전화': p.phone || '', '메모': p.memo || '', '옵션': (p.options ?? []).join(', '),
})
// 머지된 시트 문자열 → DB 컬럼값
const toDb = (m: Record<string, string>) => ({
  visit_status: VISITS.includes(m['방문상태']) ? m['방문상태'] : '방문예정',
  corkage_type: TYPES.includes(m['콜키지']) ? m['콜키지'] : null,
  corkage_detail: m['콜키지내역'] || null,
  cuisine: m['메인 요리'] || null, region: m['지역'] || null, address: m['주소'] || null,
  phone: m['전화'] || null, memo: m['메모'] || null,
  options: m['옵션'] ? m['옵션'].split(',').map((s) => s.trim()).filter(Boolean) : [],
})

// 구글시트[콜키지] ↔ corkage_place **양방향 머지**(기준 스냅샷 대비 양쪽 변경 병합, 충돌 시 웹앱 우선)
export async function POST() {
  try {
    const db = createServiceClient()
    const rows = await readCorkageSheet()
    const header = rows.length ? rows[0].map((h) => (h ?? '').trim()) : []
    const col = (name: string) => header.indexOf(name)
    const gcell = (r: string[], name: string) => { const i = col(name); return i >= 0 ? (r[i] ?? '').toString().trim() : '' }
    // 시트 행: 정규화 이름 → 필드 문자열맵
    const sheetByName = new Map<string, Record<string, string>>()
    for (const r of rows.slice(1)) {
      const name = gcell(r, '장소명'); if (!name) continue
      const m: Record<string, string> = {}
      for (const c of MERGE_COLS) m[c] = gcell(r, c)
      sheetByName.set(nk(name), m)
    }

    // ── ① 시트에만 있는 신규 장소 등록(네이버 주소 조회) ──
    const { data: existing0 } = await db.from('corkage_place').select('name')
    const have = new Set((existing0 ?? []).map((e) => nk(e.name as string)))
    let added = 0
    for (const r of rows.slice(1)) {
      const name = gcell(r, '장소명'); if (!name || have.has(nk(name))) continue
      const geo = (await searchNaverLocal(name)).results[0]
      const sm: Record<string, string> = {}; for (const c of MERGE_COLS) sm[c] = gcell(r, c)
      const merged = { ...toDb(sm) }
      // 신규는 시트값 우선, 없으면 지오값
      const { data, error } = await db.from('corkage_place').insert({
        name, ...merged,
        region: merged.region || geo?.region || null, address: merged.address || geo?.address || null,
        phone: merged.phone || geo?.phone || null, url: geo?.url || null,
      }).select('id').single()
      if (!error && data) { added++; have.add(nk(name)) }
    }

    // ── ② 양쪽 머지(기존 장소) + ③ DB→시트 미러 ──
    const { data: places } = await db.from('corkage_place')
      .select('id, name, visit_status, corkage_type, corkage_detail, rating, cuisine, region, address, phone, url, memo, options, created_at, sheet_baseline')
      .order('created_at')
    let merges = 0
    const grid: string[][] = [HEADER]
    for (const p of (places ?? []) as Place[]) {
      const cur = dbStr(p)
      const sheet = sheetByName.get(nk(p.name))
      const base = p.sheet_baseline ?? cur // 최초=현재 DB값 기준(시트가 마지막 미러 상태였다고 가정)
      // 필드별 머지: 시트만 바뀌면 시트값, 아니면 DB값(둘 다 바뀌면 DB 우선)
      const merged: Record<string, string> = {}
      for (const c of MERGE_COLS) {
        const s = sheet ? (sheet[c] ?? '') : cur[c]
        const sheetChanged = !!sheet && s !== (base[c] ?? '')
        const dbChanged = cur[c] !== (base[c] ?? '')
        merged[c] = (sheetChanged && !dbChanged) ? s : cur[c]
      }
      // DB에 반영(변경분만 → updated_at 불필요 갱신 방지)
      if (MERGE_COLS.some((c) => merged[c] !== cur[c])) {
        await db.from('corkage_place').update(toDb(merged)).eq('id', p.id)
        merges++
      }
      // 기준 스냅샷 갱신
      await db.from('corkage_place').update({ sheet_baseline: merged }).eq('id', p.id)
      // 미러 행(머지값 + rating/등록일자/지도링크)
      const regDate = p.created_at ? new Date(p.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) : ''
      const link = p.url ? `=HYPERLINK("${p.url}","Link")` : ''
      grid.push([
        p.name || '', merged['방문상태'], merged['콜키지'], merged['콜키지내역'],
        p.rating != null ? String(p.rating) : '', merged['메인 요리'], merged['지역'], merged['주소'],
        merged['전화'], merged['메모'], merged['옵션'], regDate, link,
      ])
    }
    await writeCorkageSheet(grid)

    return NextResponse.json({ ok: true, added, merged: merges, total: (places ?? []).length })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'sync fail' }, { status: 200 })
  }
}
