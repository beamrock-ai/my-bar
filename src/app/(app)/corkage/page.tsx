'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

type Geo = { name: string; address: string; region: string; category: string; phone: string; url: string }

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const TYPES = ['유료', '무료']
const VISITS = ['방문예정', '방문완료']
const kst = (iso?: string | null) => {
  if (!iso) return ''
  const p = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`
}
// 콜키지구분 뱃지 스타일(내역 포함)
const typeBadge = (t: string | null, detail: string | null) => {
  if (t === '무료') return { cls: 'bg-emerald-50 text-emerald-700', label: detail ? `무료 · ${detail}` : '무료' }
  if (t === '유료') return { cls: 'bg-amber-50 text-amber-700', label: detail ? `유료 · ${detail}` : '유료' }
  return { cls: 'bg-neutral-100 text-neutral-400', label: '미지정' }
}

type Place = {
  id: string; name: string; region: string | null; corkage_type: string | null; corkage_detail: string | null
  visit_status: string | null; rating: number | null; image_url: string | null; updated_at: string | null; imageCount: number; commentCount: number
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const on = value >= i, half = !on && value >= i - 0.5
        return <span key={i} className={`text-xs leading-none ${on || half ? 'text-amber-500' : 'text-neutral-300'}`} style={half ? { clipPath: 'inset(0 50% 0 0)' } : undefined}>★</span>
      })}
      <span className="ml-0.5 text-[11px] font-semibold tabular-nums text-neutral-600">{value.toFixed(1)}</span>
    </span>
  )
}

export default function CorkagePage() {
  const [data, setData] = useState<Place[] | null>(null)
  const [name, setName] = useState('')
  const [region, setRegion] = useState('')
  const [type, setType] = useState('')
  const [detail, setDetail] = useState('')
  const [copts, setCopts] = useState<{ 무료: string[]; 유료: string[] }>({ 무료: [], 유료: [] })
  const [visit, setVisit] = useState('방문예정')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [fType, setFType] = useState('')
  const [fVisit, setFVisit] = useState('')
  const [sort, setSort] = useState<'recent' | 'name' | 'rating' | 'visit'>('recent')
  // 주소 자동완성(카카오 로컬 검색)
  const [geo, setGeo] = useState<Geo[]>([])
  const [geoErr, setGeoErr] = useState('')
  const [picked, setPicked] = useState<{ address: string; phone: string; url: string } | null>(null)
  const justPicked = useRef(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`${BP}/api/corkage`, { cache: 'no-store' })
    setData((await res.json()).places ?? [])
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void (async () => { try { const j = await (await fetch(`${BP}/api/corkage/options`, { cache: 'no-store' })).json(); setCopts({ 무료: j.무료 ?? [], 유료: j.유료 ?? [] }) } catch { /* ignore */ } })() }, [])

  // 장소명 입력 시 디바운스 검색
  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return }
    const query = name.trim()
    if (query.length < 2) { setGeo([]); setGeoErr(''); return }
    const t = setTimeout(async () => {
      try {
        const r = await (await fetch(`${BP}/api/geo/search?q=${encodeURIComponent(query)}`)).json()
        setGeo(r.results ?? []); setGeoErr(r.error ?? '')
      } catch { setGeo([]) }
    }, 300)
    return () => clearTimeout(t)
  }, [name])

  const pickGeo = (g: Geo) => {
    justPicked.current = true
    setName(g.name); setRegion(g.region); setPicked({ address: g.address, phone: g.phone, url: g.url })
    setGeo([])
  }

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim()); fd.append('region', region.trim())
      if (picked) { fd.append('address', picked.address); fd.append('phone', picked.phone); fd.append('url', picked.url) }
      fd.append('corkage_type', type); if (detail.trim()) fd.append('corkage_detail', detail.trim())
      fd.append('visit_status', visit); if (file) fd.append('image', file)
      const res = await fetch(`${BP}/api/corkage`, { method: 'POST', body: fd })
      if (!res.ok) { alert((await res.json()).error ?? '등록 실패'); return }
      setName(''); setRegion(''); setType(''); setDetail(''); setVisit('방문예정'); setFile(null); setPicked(null); setGeo([])
      await load()
    } finally { setBusy(false) }
  }
  const syncSheet = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const j = await (await fetch(`${BP}/api/corkage/sync`, { method: 'POST' })).json()
      if (j.error || j.ok === false) { setSyncMsg(`동기화 실패: ${j.error ?? '오류'}`); return }
      await load()
      setSyncMsg(`시트 머지 완료: 신규 ${j.added ?? 0}곳 · 변경반영 ${j.merged ?? 0}곳 · 총 ${j.total ?? 0}곳(양방향)`)
    } catch { setSyncMsg('동기화 실패: 네트워크 오류') } finally { setSyncing(false) }
  }
  const del = async (id: string, nm: string) => {
    if (!confirm(`'${nm}' 삭제할까요?`)) return
    await fetch(`${BP}/api/corkage`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  const filtered = useMemo(() => {
    if (!data) return []
    return data
      .filter((p) => (q.trim() ? `${p.name} ${p.region ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()) : true))
      .filter((p) => (fType ? p.corkage_type === fType : true))
      .filter((p) => (fVisit ? p.visit_status === fVisit : true))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name, 'ko')
        if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
        if (sort === 'visit') { // 방문예정 먼저 → 방문완료, 동일하면 최신순
          const ord = (s: string | null) => (s === '방문예정' ? 0 : 1)
          return ord(a.visit_status) - ord(b.visit_status) || (b.updated_at || '').localeCompare(a.updated_at || '')
        }
        return (b.updated_at || '').localeCompare(a.updated_at || '')
      })
  }, [data, q, fType, fVisit, sort])

  const sel = 'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500'
  const filterOn = !!(q || fType || fVisit)
  const sortBtn = (k: 'recent' | 'name' | 'rating' | 'visit', label: string) =>
    <button onClick={() => setSort(k)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${sort === k ? 'bg-amber-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{label}</button>

  if (!data) return <div className="text-sm text-neutral-400">불러오는 중...</div>

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">🍽️ 콜키지</h1>
          <p className="mt-1 text-sm text-neutral-500">콜키지 가능 장소 등록 · 유료/무료 · 방문예정/완료 · 사진·서비스·평점 기록.</p>
        </div>
        <button onClick={() => void syncSheet()} disabled={syncing}
          title="구글시트[콜키지]의 장소를 등록합니다(신규만, 네이버 주소 자동조회)"
          className="mt-1 shrink-0 inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-amber-300 hover:bg-amber-50 disabled:opacity-50">
          {syncing ? '⏳ 동기화 중…' : '🔄 시트 동기화'}
        </button>
      </div>
      {syncMsg && <p className={`mt-2 text-xs ${syncMsg.includes('실패') ? 'text-red-600' : 'text-emerald-600'}`}>{syncMsg}</p>}

      {/* 등록 폼 */}
      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <div className="relative">
            <input value={name} onChange={(e) => { setName(e.target.value); setPicked(null) }} placeholder="장소명* (검색)" className="w-48 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
            {geo.length > 0 && (
              <ul className="absolute left-0 top-full z-20 mt-0.5 max-h-64 w-80 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
                {geo.map((g, i) => (
                  <li key={i}><button type="button" onClick={() => pickGeo(g)} className="block w-full px-2.5 py-1.5 text-left hover:bg-amber-50">
                    <span className="text-sm font-medium text-neutral-800">{g.name}</span>
                    <span className="ml-1 block text-[11px] text-neutral-500">{g.address}{g.category ? ` · ${g.category.split('>').pop()?.trim()}` : ''}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </div>
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="지역(예: 서울 강남)" className="w-36 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
          <select value={type} onChange={(e) => setType(e.target.value)} className={sel}><option value="">구분(미지정)</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          {(type === '유료' || type === '무료') && <>
            <input list="corkage-detail-opts" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={type === '무료' ? '내역(무제한/1병…)' : '내역(인당 1만원…)'} className="w-36 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
            <datalist id="corkage-detail-opts">{(copts[type as '무료' | '유료'] ?? []).map((v) => <option key={v} value={v} />)}</datalist>
          </>}
          <select value={visit} onChange={(e) => setVisit(e.target.value)} className={sel}>{VISITS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          <label className="cursor-pointer rounded-md border border-dashed border-amber-200 px-2 py-1.5 text-xs text-amber-600 hover:bg-amber-50">
            {file ? '📷 1장' : '📷 사진'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button onClick={create} disabled={busy || !name.trim()} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{busy ? '등록 중…' : '등록'}</button>
        </div>
        {picked && <p className="mt-1.5 text-[11px] text-emerald-600">📍 {picked.address} 자동입력됨{picked.phone ? ` · ☎ ${picked.phone}` : ''}{picked.url ? ' · 🔗 네이버지도 링크' : ''}</p>}
        {geoErr === 'no_key' && <p className="mt-1.5 text-[11px] text-amber-600">⚠️ 주소 검색 비활성(카카오 API 키 미설정) — 수동 입력 가능</p>}
      </div>

      {/* 필터 */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 장소·지역 검색" className="w-48 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm" />
        <select value={fType} onChange={(e) => setFType(e.target.value)} className={sel}><option value="">구분: 전체</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select value={fVisit} onChange={(e) => setFVisit(e.target.value)} className={sel}><option value="">방문: 전체</option>{VISITS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        {filterOn && <button onClick={() => { setQ(''); setFType(''); setFVisit('') }} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100">초기화</button>}
        <span className="ml-1 text-[11px] text-neutral-500">정렬:</span>{sortBtn('recent', '최신')}{sortBtn('name', '이름')}{sortBtn('rating', '평점')}{sortBtn('visit', '방문구분')}
        <span className="ml-auto text-[11px] text-neutral-400">{filtered.length}/{data.length}곳</span>
      </div>

      {/* 목록 */}
      <div className="mt-4 space-y-2">
        {data.length === 0 && <p className="text-sm text-neutral-400">아직 등록된 콜키지 장소가 없습니다.</p>}
        {data.length > 0 && filtered.length === 0 && <p className="text-sm text-neutral-400">조건에 맞는 장소가 없습니다.</p>}
        {filtered.map((p) => {
          const tb = typeBadge(p.corkage_type, p.corkage_detail)
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3">
              {p.image_url
                ? <img src={p.image_url} alt="" className="h-14 w-14 shrink-0 rounded-md border border-neutral-200 object-cover" />
                : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xl">🍽️</span>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/corkage/${p.id}`} className="text-base font-semibold text-neutral-900 hover:text-amber-700 hover:underline">{p.name}</Link>
                  {p.region && <span className="text-xs text-neutral-500">{p.region}</span>}
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tb.cls}`}>{tb.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${p.visit_status === '방문완료' ? 'bg-blue-50 text-blue-700' : 'bg-neutral-100 text-neutral-500'}`}>{p.visit_status}</span>
                  {p.imageCount > 0 && <span className="text-[11px] text-neutral-400">📷{p.imageCount}</span>}
                  {p.commentCount > 0 && <span className="text-[11px] text-neutral-400">💬{p.commentCount}</span>}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {p.rating != null && p.rating > 0 ? <Stars value={p.rating} /> : <span className="text-[11px] text-neutral-300">평점 없음</span>}
                  {p.updated_at && <span className="text-[11px] text-neutral-400">🕒 {kst(p.updated_at)}</span>}
                </div>
              </div>
              <button onClick={() => del(p.id, p.name)} className="shrink-0 text-xs text-neutral-300 hover:text-red-500">삭제</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
