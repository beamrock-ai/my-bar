'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { sherryInfoOf } from '@/lib/sherry'

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const nkey = (s: string) => (s ?? '').replace(/\s+/g, '') // PK 비교: 띄어쓰기 제거 풀네임
const won = (n: number | null | undefined) => (n == null ? '-' : `${n.toLocaleString()}원`)
// 시세엔 오크품종 데이터가 없어 캐스크에서 추론(버번캐스크·버진오크=아메리칸오크, 셰리·포트류는 둘 다 가능→불명)
const AMERICAN_OAK = new Set(['버번캐스크', '버진오크'])
function oakFromCask(cask: string): string {
  if (!cask) return ''
  const parts = cask.split('+').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return ''
  if (parts.every((p) => AMERICAN_OAK.has(p))) return '아메리칸오크'
  if (parts.some((p) => AMERICAN_OAK.has(p))) return '혼합'
  return '불명'
}

type Price = {
  liquor: string; style: string; cask: string; peat: string; peat_ppm: number | null; sherry_type: string
  name: string; shop: string; price: number; date: string; volume: number | null; url: string; memo: string
  id?: string; source?: 'sheet' | 'dailyshot' | 'manual'
}
type SortKey = 'price' | 'name' | 'date' | 'count'

export default function PricesPage() {
  const [prices, setPrices] = useState<Price[] | null>(null)
  const [q, setQ] = useState('')
  const [fLiquor, setFLiquor] = useState('')
  const [fStyle, setFStyle] = useState('')
  const [fShop, setFShop] = useState('')
  const [fPeat, setFPeat] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('price')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selected, setSelected] = useState<string | null>(null) // 드릴다운: 특정 주류
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState('')
  const [noteMap, setNoteMap] = useState<Map<string, string>>(new Map()) // 정규화된 한글명 → 노트 id
  // 삭제(체크박스) · 상세 수동가격
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [mForm, setMForm] = useState({ date: '', shop: '', price: '' })
  const [rowChecked, setRowChecked] = useState<Set<string>>(new Set()) // 상세: 선택된 개별 시세 행 id

  // 조회: DB(liquor_price)에서 읽음 (구글시트 직접 읽지 않음)
  const load = async () => {
    const res = await fetch(`${BP}/api/prices`, { cache: 'no-store' })
    setPrices((await res.json()).prices ?? [])
  }
  // 노트 목록 → 한글명(띄어쓰기 제거) → id 맵. 시세 상세에서 "노트로 이동" 버튼 판단용
  const loadNotes = async () => {
    try {
      const j = await (await fetch(`${BP}/api/whisky`, { cache: 'no-store' })).json()
      const m = new Map<string, string>()
      // 자동 매칭(한글명) → 수동 매칭(price_name)이 있으면 우선 적용(덮어씀)
      for (const w of (j.whiskies ?? [])) { const k = nkey(w.name_ko || w.name || ''); if (k) m.set(k, w.id) }
      for (const w of (j.whiskies ?? [])) { const k = nkey(w.price_name || ''); if (k) m.set(k, w.id) }
      setNoteMap(m)
    } catch { /* ignore */ }
  }
  // 동기화: 소스(구글시트[주류시세]) → DB 적재 후 다시 조회
  const sync = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch(`${BP}/api/prices/sync`, { method: 'POST' })
      const j = await res.json()
      if (j.error || j.ok === false) { setSyncMsg(`동기화 실패: ${j.error ?? '오류'}`); return }
      await load()
      setSyncMsg(`${(j.count ?? 0).toLocaleString()}건 동기화 완료`)
    } catch {
      setSyncMsg('동기화 실패: 네트워크 오류')
    } finally {
      setSyncing(false)
    }
  }
  // 데일리샷 동기화: 데일리샷메타(구글시트) → DB(판매점=데일리샷, 오늘자)
  const syncDailyshot = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const j = await (await fetch(`${BP}/api/prices/dailyshot-sync`, { method: 'POST' })).json()
      if (j.error || j.ok === false) { setSyncMsg(`데일리샷 동기화 실패: ${j.error ?? '오류'}`); return }
      await load()
      setSyncMsg(`데일리샷 ${(j.total ?? 0).toLocaleString()}종 중 변동 ${((j.changed ?? 0) + (j.new ?? 0)).toLocaleString()}건 반영 (신규 ${(j.new ?? 0).toLocaleString()})`)
    } catch {
      setSyncMsg('데일리샷 동기화 실패: 네트워크 오류')
    } finally { setSyncing(false) }
  }

  // 시세에서 선택한 술을 노트(컬렉션)에 추가(이미 있으면 덮어쓰지 않음)
  const addToNote = async (name: string) => {
    setAdding(true); setAddMsg('')
    try {
      const fd = new FormData(); fd.append('name', name); fd.append('ifNew', '1')
      const res = await fetch(`${BP}/api/whisky`, { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) { setAddMsg(`추가 실패: ${j.error ?? '오류'}`); return }
      setAddMsg(j.alreadyExists ? '이미 노트에 있습니다' : '✓ 노트에 추가했습니다')
      await loadNotes() // 추가 후 "노트로 이동" 버튼으로 전환
    } catch {
      setAddMsg('추가 실패: 네트워크 오류')
    } finally { setAdding(false) }
  }

  const toggleCheck = (name: string) => setChecked((prev) => {
    const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n
  })
  // 삭제(숨김): 체크된 이름들을 제거. 동기화에도 재적재 안 됨(price_hidden).
  const doDelete = async () => {
    const names = [...checked]
    if (names.length === 0 || busy) return
    if (!confirm(`${names.map((n) => `[${n}]`).join(', ')} ${names.length}종을 삭제할까요?\n동기화해도 다시 나타나지 않습니다. (시세 메뉴에서 복구 가능)`)) return
    setBusy(true)
    try {
      await fetch(`${BP}/api/prices/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names }) })
      setChecked(new Set())
      if (selected && names.includes(selected)) setSelected(null)
      await load()
    } finally { setBusy(false) }
  }
  // 수동 판매점 시세 추가/삭제
  const addManual = async () => {
    if (!selected || !mForm.price.trim() || busy) return
    setBusy(true)
    try {
      await fetch(`${BP}/api/prices/manual`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: selected, shop: mForm.shop, price: mForm.price, observed_on: mForm.date }) })
      setMForm({ date: '', shop: '', price: '' })
      await load()
    } finally { setBusy(false) }
  }
  // 상세: 선택한 개별 시세 관측 행 삭제(id 기준, 소스별로 분리)
  const toggleRow = (id: string) => setRowChecked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const deleteRows = async () => {
    if (rowChecked.size === 0 || busy) return
    const rows = (prices ?? []).filter((p) => p.id && rowChecked.has(p.id))
    const liquorIds = rows.filter((p) => p.source !== 'manual').map((p) => p.id as string)
    const manualIds = rows.filter((p) => p.source === 'manual').map((p) => p.id as string)
    if (!confirm(`선택한 시세 ${rowChecked.size}건을 삭제할까요?\n(시트/데일리샷 행은 다음 동기화 때 다시 생길 수 있음)`)) return
    setBusy(true)
    try {
      await fetch(`${BP}/api/prices/row`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ liquorIds, manualIds }) })
      setRowChecked(new Set())
      await load()
    } finally { setBusy(false) }
  }

  const [pendingName, setPendingName] = useState<string | null>(null) // ?name= 딥링크(노트→시세)
  useEffect(() => { void load(); void loadNotes(); setPendingName(new URLSearchParams(window.location.search).get('name')) }, [])
  useEffect(() => { setAddMsg(''); setMForm({ date: '', shop: '', price: '' }); setRowChecked(new Set()) }, [selected])
  // 시세 로드 후 딥링크 적용: PK(띄어쓰기 제거) 일치 술이 있으면 드릴다운 열고, 없으면 검색어로
  useEffect(() => {
    if (!pendingName || !prices) return
    const hit = prices.find((p) => nkey(p.name) === nkey(pendingName))
    if (hit) setSelected(hit.name); else setQ(pendingName)
    setPendingName(null)
  }, [prices, pendingName])

  const { liquors, styles, shops, peats, names } = useMemo(() => {
    const set = (key: keyof Price) => Array.from(new Set((prices ?? []).map((p) => String(p[key] ?? '').trim()).filter(Boolean))).sort()
    return { liquors: set('liquor'), styles: set('style'), shops: set('shop'), peats: set('peat'), names: set('name') }
  }, [prices])

  // 필터만 적용(중복제거 전) — 통계·목록 공유
  const filteredAll = useMemo(() => {
    if (!prices) return []
    return prices
      .filter((p) => (q.trim() ? p.name.toLowerCase().includes(q.trim().toLowerCase()) : true))
      .filter((p) => (fLiquor ? p.liquor === fLiquor : true))
      .filter((p) => (fStyle ? p.style === fStyle : true))
      .filter((p) => (fShop ? p.shop === fShop : true))
      .filter((p) => (fPeat ? p.peat === fPeat : true))
  }, [prices, q, fLiquor, fStyle, fShop, fPeat])

  // 술별 시세(일자별 가격) 개수 = 해당 한글명의 관측 행 수
  const cntByName = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of filteredAll) m.set(p.name, (m.get(p.name) ?? 0) + 1)
    return m
  }, [filteredAll])

  // 목록: 한글명 기준 1건(최신일자·동일자면 최저가) + 정렬
  const rows = useMemo(() => {
    const cmp = (a: Price, b: Price) => {
      let v = 0
      if (sortKey === 'price') v = a.price - b.price
      else if (sortKey === 'name') v = a.name.localeCompare(b.name, 'ko')
      else if (sortKey === 'count') v = (cntByName.get(a.name) ?? 0) - (cntByName.get(b.name) ?? 0)
      else v = (a.date || '').localeCompare(b.date || '')
      return sortDir === 'asc' ? v : -v
    }
    const byName = new Map<string, Price>()
    for (const p of filteredAll) {
      const cur = byName.get(p.name)
      if (!cur) { byName.set(p.name, p); continue }
      const d = (p.date || '').localeCompare(cur.date || '')
      if (d > 0 || (d === 0 && p.price < cur.price)) byName.set(p.name, p)
    }
    return Array.from(byName.values()).sort(cmp)
  }, [filteredAll, sortKey, sortDir, cntByName])

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'price' ? 'asc' : 'asc') }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')

  const filterOn = !!(q || fLiquor || fStyle || fShop || fPeat)
  const sel = 'rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500'
  const sortBtn = (k: SortKey, label: string) =>
    <button onClick={() => setSort(k)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${sortKey === k ? 'bg-amber-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{label}{arrow(k)}</button>

  if (!prices) return <div className="text-sm text-neutral-400">불러오는 중...</div>

  // 드릴다운: 선택된 주류의 기준일자 × 판매점 가격표
  if (selected) {
    const det = prices.filter((p) => p.name === selected)
    const shopList = Array.from(new Set(det.map((d) => d.shop || '상점미상'))).sort()
    const dateList = Array.from(new Set(det.map((d) => d.date || '-'))).sort()
    const cell = (shop: string, date: string) => det.find((d) => (d.shop || '상점미상') === shop && (d.date || '-') === date)?.price ?? null
    // 대표 속성: 비어있지 않은 행에서 값 채택(첫 행이 비어도 표시되게)
    const pick = (k: 'liquor' | 'style' | 'cask' | 'peat') => det.find((d) => d[k])?.[k] ?? ''
    const attr = { liquor: pick('liquor'), style: pick('style'), cask: pick('cask'), peat: pick('peat'), peat_ppm: det.find((d) => d.peat_ppm != null)?.peat_ppm ?? null, sherry_type: det.find((d) => d.sherry_type && d.sherry_type !== '없음')?.sherry_type ?? '', volume: det.find((d) => d.volume)?.volume ?? null }
    const vals = det.map((d) => d.price)
    const mn = Math.min(...vals), mx = Math.max(...vals), avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    const noteId = noteMap.get(nkey(selected)) ?? null // 이 술이 노트에 등록돼 있으면 그 id
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-amber-300 hover:bg-amber-50">← 주류시세 목록</button>
          {noteId
            ? <Link href={`/whisky/${noteId}`}
                title="이 술의 노트로 이동합니다"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                📖 노트로 이동
              </Link>
            : <button onClick={() => void addToNote(selected)} disabled={adding}
                title="이 술을 노트(내 컬렉션)에 추가합니다"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {adding ? '추가 중…' : '🍶 노트에 추가'}
              </button>}
        </div>
        {addMsg && <p className={`mt-2 text-xs ${addMsg.startsWith('추가 실패') ? 'text-red-600' : addMsg.startsWith('이미') ? 'text-neutral-500' : 'text-emerald-600'}`}>{addMsg}</p>}
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900">{selected}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {attr.liquor && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600">{attr.liquor}</span>}
          {attr.style && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">{attr.style}</span>}
          {attr.cask && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">🛢 {attr.cask}</span>}
          {oakFromCask(attr.cask) && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[11px] text-yellow-800" title="캐스크 기반 추론">🌳 {oakFromCask(attr.cask)}</span>}
          {attr.peat && <span className={`rounded px-1.5 py-0.5 text-[11px] ${attr.peat === '피트' ? 'bg-orange-100 text-orange-700' : 'bg-neutral-100 text-neutral-500'}`}>{attr.peat}</span>}
          {attr.peat_ppm != null && attr.peat_ppm > 0 && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-700">🔥 {attr.peat_ppm} ppm</span>}
          {attr.sherry_type && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700" title={sherryInfoOf(attr.sherry_type) ? `당도 ${sherryInfoOf(attr.sherry_type)!.sweet} · 향 ${sherryInfoOf(attr.sherry_type)!.aroma}` : ''}>🍇 {attr.sherry_type}{sherryInfoOf(attr.sherry_type) ? ` · ${sherryInfoOf(attr.sherry_type)!.sweet}` : ''}</span>}
          {attr.volume && <span className="text-[11px] text-neutral-400">{attr.volume}ml</span>}
        </div>
        <div className="mt-2 text-sm text-neutral-600">최저 <b className="text-neutral-900">{won(mn)}</b> · 평균 {won(avg)} · 최고 {won(mx)} <span className="text-xs text-neutral-400">({det.length}건)</span></div>

        {/* 일자별·판매점별 가격 추이 */}
        <PriceTrendChart rows={det.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))} />

        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-50">
                <th className="sticky left-0 z-10 border-b border-r border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600">판매점＼일자</th>
                {dateList.map((d) => <th key={d} className="border-b border-neutral-200 px-3 py-2 text-right font-medium text-neutral-600 whitespace-nowrap">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {shopList.map((shop) => (
                <tr key={shop} className="odd:bg-white even:bg-neutral-50/40">
                  <td className="sticky left-0 z-10 border-r border-neutral-200 bg-inherit px-3 py-2 font-medium text-neutral-800 whitespace-nowrap">{shop}</td>
                  {dateList.map((d) => {
                    const v = cell(shop, d)
                    const isMin = v != null && v === mn
                    return <td key={d} className={`px-3 py-2 text-right tabular-nums ${v == null ? 'text-neutral-300' : isMin ? 'font-bold text-emerald-600' : 'text-neutral-800'}`}>{v == null ? '-' : v.toLocaleString()}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {det.some((d) => d.memo || d.url) && (
          <div className="mt-2 space-y-0.5 text-[11px] text-neutral-400">
            {det.filter((d) => d.memo || d.url).map((d, i) => (
              <div key={i}>· {d.shop} {d.date}: {d.memo}{d.url && <> <a href={d.url} target="_blank" rel="noreferrer" className="text-amber-600 hover:underline">🔗출처</a></>}</div>
            ))}
          </div>
        )}
        {/* 개별 시세 내역(체크 후 선택 삭제) */}
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-600">개별 시세 내역 ({det.length})</span>
            {rowChecked.size > 0 && (<>
              <button onClick={deleteRows} disabled={busy} className="rounded-md bg-red-600 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-40">🗑 선택 {rowChecked.size}건 삭제</button>
              <button onClick={() => setRowChecked(new Set())} className="text-[11px] text-neutral-400 hover:underline">해제</button>
            </>)}
          </div>
          <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-neutral-200 p-1.5">
            {[...det].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((d) => (
              <label key={d.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-neutral-50">
                <input type="checkbox" checked={!!d.id && rowChecked.has(d.id)} onChange={() => d.id && toggleRow(d.id)} className="h-3.5 w-3.5 shrink-0 accent-red-600" />
                <span className="w-[76px] shrink-0 tabular-nums text-neutral-500">{d.date || '-'}</span>
                <span className="min-w-0 flex-1 truncate text-neutral-700">{d.shop || '상점미상'}</span>
                <span className={`shrink-0 rounded px-1 text-[10px] ${d.source === 'manual' ? 'bg-amber-50 text-amber-600' : d.source === 'dailyshot' ? 'bg-rose-50 text-rose-600' : 'bg-neutral-100 text-neutral-500'}`}>{d.source === 'manual' ? '수동' : d.source === 'dailyshot' ? '데일리샷' : '시트'}</span>
                <span className="w-20 shrink-0 text-right font-semibold tabular-nums text-neutral-800">{won(d.price)}</span>
                {d.url && <a href={d.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-amber-600">🔗</a>}
              </label>
            ))}
          </div>
        </div>
        {/* 수동 판매점 시세 입력(일자·판매점·가격) — 동기화에 지워지지 않음 */}
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3">
          <p className="text-xs font-semibold text-neutral-600">＋ 판매점 시세 수동 입력</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input type="date" value={mForm.date} onChange={(e) => setMForm({ ...mForm, date: e.target.value })} title="일자(미입력=오늘)" className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-700" />
            <input value={mForm.shop} onChange={(e) => setMForm({ ...mForm, shop: e.target.value })} placeholder="판매점" className="w-28 rounded-md border border-neutral-200 px-2 py-1 text-sm" />
            <input value={mForm.price} onChange={(e) => setMForm({ ...mForm, price: e.target.value })} placeholder="가격" inputMode="numeric" className="w-24 rounded-md border border-neutral-200 px-2 py-1 text-sm" />
            <button onClick={addManual} disabled={busy || !mForm.price.trim()} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40">추가</button>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">추가한 항목은 위 &apos;개별 시세 내역&apos;에서 선택해 삭제할 수 있어요.</p>
        </div>
        <button onClick={() => setSelected(null)} className="mt-4 inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-amber-300 hover:bg-amber-50">← 주류시세 목록으로</button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-neutral-900">🏷️ 시세</h1>
          <p className="mt-1 text-sm text-neutral-500">주류명별 최신 시세 1건. 주류명을 누르면 해당 술의 일자×장소 전체 가격표. 조회=DB(liquor_price) · 소스=구글시트[주류시세]([시트 동기화]로 반영).</p>
        </div>
        <div className="mt-1 flex shrink-0 flex-col gap-1.5">
          <button
            onClick={() => void sync()}
            disabled={syncing}
            title="구글시트[주류시세]를 다시 읽어 DB(liquor_price)에 반영합니다"
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? '⏳ 동기화 중…' : '🔄 시트 동기화'}
          </button>
          <button
            onClick={() => void syncDailyshot()}
            disabled={syncing}
            title="데일리샷메타(위스키 품목) 대표가를 오늘자 시세로 반영합니다"
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? '⏳ …' : '🥃 데일리샷 동기화'}
          </button>
        </div>
      </div>
      {syncMsg && (
        <p className={`mt-2 text-xs ${syncMsg.includes('실패') ? 'text-red-600' : 'text-emerald-600'}`}>{syncMsg}</p>
      )}

      {/* 필터 */}
      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3">
        <input list="price-name-list" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 주류명 선택/검색 (전체)"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
        <datalist id="price-name-list">
          {names.map((n) => <option key={n} value={n} />)}
        </datalist>
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={fLiquor} onChange={(e) => setFLiquor(e.target.value)} className={sel}>
            <option value="">주종: 전체</option>
            {liquors.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={fStyle} onChange={(e) => setFStyle(e.target.value)} className={sel}>
            <option value="">분류: 전체</option>
            {styles.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fShop} onChange={(e) => setFShop(e.target.value)} className={sel}>
            <option value="">판매점: 전체</option>
            {shops.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {peats.length > 0 && (
            <select value={fPeat} onChange={(e) => setFPeat(e.target.value)} className={sel}>
              <option value="">피트: 전체</option>
              {peats.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {filterOn && <button onClick={() => { setQ(''); setFLiquor(''); setFStyle(''); setFShop(''); setFPeat('') }}
            className="rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-xs text-neutral-500 hover:bg-neutral-100">초기화</button>}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[11px] text-neutral-500">정렬:</span>
          {sortBtn('price', '가격')}{sortBtn('name', '이름')}{sortBtn('date', '일자')}{sortBtn('count', '시세수')}
          <span className="ml-auto text-[11px] text-neutral-500">{rows.length}종 · 전체 {prices.length}건</span>
        </div>
      </div>

      {/* 삭제 바(1종 이상 체크 시) */}
      {checked.size >= 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <span className="text-xs font-semibold text-red-700">{checked.size}종 선택</span>
          <button onClick={doDelete} disabled={busy} className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40">🗑 삭제</button>
          <button onClick={() => setChecked(new Set())} className="text-[11px] text-red-500 hover:underline">선택해제</button>
          <span className="text-[11px] text-red-400">삭제하면 동기화해도 다시 안 나옵니다(복구 가능)</span>
        </div>
      )}

      {/* 목록 */}
      <div className="mt-4 space-y-1.5">
        {rows.length === 0 && <p className="text-sm text-neutral-400">조건에 맞는 시세가 없습니다.</p>}
        {rows.map((p, i) => {
          const perMl = p.volume ? Math.round(p.price / p.volume) : null
          return (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
              <input type="checkbox" checked={checked.has(p.name)} onChange={() => toggleCheck(p.name)} title="병합 선택" className="shrink-0 h-4 w-4 accent-amber-600" />
              <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-neutral-300">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={() => setSelected(p.name)} className="text-sm font-semibold text-neutral-900 hover:text-amber-700 hover:underline">{p.name}</button>
                  {p.liquor && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600">{p.liquor}</span>}
                  {p.style && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">{p.style}</span>}
                  {p.cask && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">{p.cask}</span>}
                  {p.peat === '피트' && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[11px] text-orange-700">피트{p.peat_ppm ? ` 🔥${p.peat_ppm}` : ''}</span>}
                  {p.sherry_type && p.sherry_type !== '없음' && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">🍇 {p.sherry_type}</span>}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {p.shop || '상점미상'}{p.volume ? ` · ${p.volume}ml` : ''}{p.date ? ` · ${p.date}` : ''}
                  {p.url && <> · <a href={p.url} target="_blank" rel="noreferrer" className="text-amber-600 hover:underline">🔗</a></>}
                  {p.memo && <span className="text-neutral-400"> · {p.memo}</span>}
                </div>
              </div>
              <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-neutral-400" title="시세(일자별 가격) 개수">{cntByName.get(p.name) ?? 1}</span>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-neutral-900">{won(p.price)}</div>
                {perMl && <div className="text-[10px] text-neutral-400">{perMl.toLocaleString()}원/ml</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// 일자별·판매점별 가격 추이 (무의존 SVG 라인차트)
const CHART_COLORS = ['#d97706', '#2563eb', '#059669', '#db2777', '#7c3aed', '#dc2626', '#0891b2', '#65a30d']
function PriceTrendChart({ rows }: { rows: { shop: string; date: string; price: number }[] }) {
  if (!rows.length) return null
  const dates = Array.from(new Set(rows.map((r) => r.date))).sort()
  const shops = Array.from(new Set(rows.map((r) => r.shop || '상점미상'))).sort()
  const prices = rows.map((r) => r.price)
  let min = Math.min(...prices), max = Math.max(...prices)
  if (min === max) { min = Math.max(0, min - Math.round(min * 0.05) - 1); max = max + Math.round(max * 0.05) + 1 }

  const W = 640, H = 280, L = 68, R = 16, T = 16, B = 44
  const pw = W - L - R, ph = H - T - B
  const xAt = (i: number) => (dates.length === 1 ? L + pw / 2 : L + (pw * i) / (dates.length - 1))
  const yAt = (v: number) => T + ph * (1 - (v - min) / (max - min))
  const priceOf = (shop: string, date: string) => rows.find((r) => (r.shop || '상점미상') === shop && r.date === date)?.price ?? null
  const fmt = (n: number) => (n >= 10000 ? `${Math.round(n / 1000).toLocaleString()}천` : n.toLocaleString())
  const grid = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-1 text-xs font-medium text-neutral-500">일자별·판매점별 가격 추이</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="가격 추이 그래프">
        {/* Y 그리드 + 라벨 */}
        {grid.map((g) => {
          const y = T + ph * g
          const v = max - (max - min) * g
          return (
            <g key={g}>
              <line x1={L} y1={y} x2={W - R} y2={y} stroke="#f1f1f1" strokeWidth={1} />
              <text x={L - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#9ca3af">{fmt(Math.round(v))}</text>
            </g>
          )
        })}
        {/* X 라벨 */}
        {dates.map((d, i) => (
          <text key={d} x={xAt(i)} y={H - B + 16} textAnchor="middle" fontSize={10} fill="#6b7280">{d.slice(5)}</text>
        ))}
        {/* 판매점별 라인 + 점 */}
        {shops.map((shop, si) => {
          const color = CHART_COLORS[si % CHART_COLORS.length]
          const pts = dates.map((d, i) => { const v = priceOf(shop, d); return v == null ? null : { x: xAt(i), y: yAt(v), v } })
          const segs: { x: number; y: number }[][] = []
          let cur: { x: number; y: number }[] = []
          for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = [] } }
          if (cur.length) segs.push(cur)
          return (
            <g key={shop}>
              {segs.map((seg, k) => seg.length > 1 && (
                <polyline key={k} points={seg.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={2} />
              ))}
              {pts.map((p, i) => p && <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />)}
            </g>
          )
        })}
      </svg>
      {/* 범례 */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {shops.map((shop, si) => (
          <span key={shop} className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[si % CHART_COLORS.length] }} />{shop}
          </span>
        ))}
      </div>
    </div>
  )
}
