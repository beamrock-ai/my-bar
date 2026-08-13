'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import WhiskyRadar from '@/components/WhiskyRadar'
import { SHERRY_TYPES, sherryInfoOf } from '@/lib/sherry'

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

type Radar = Record<string, number>
type Whisky = {
  id: string; seq: number | null; name_ko: string | null; name_en: string | null; image_url: string | null
  liquor: string | null; type: string | null; style: string | null; cask: string | null; oak_species: string | null; peat: string | null; peat_ppm: number | null; sherry_type: string | null; distillery: string | null; abv: number | null; volume_ml: number | null; description: string | null; keywords: string[] | null; analysis: string | null
  price_name: string | null
}
const LIQUORS = ['위스키', '보드카', '진', '럼', '데킬라', '브랜디', '리큐르', '사케', '막걸리', '소주', '전통주', '와인', '맥주', '기타']
const STYLES = ['싱글몰트', '블렌디드', '블렌디드몰트', '싱글그레인', '버번', '라이', '기타']
const OAKS = ['아메리칸오크', '유러피안오크', '혼합', '불명']
const PEATS = ['논피트', '피트']
type Profile = {
  id: string; author: string
  nose: string | null; palate: string | null; finish: string | null
  aroma: Radar | null; flavour: Radar | null; evaluation: string | null; serving: Record<string, number> | null
  color: string | null; rating: number | null; personal_note: string | null; tasted_on: string | null
}
type Purchase = { id: string; purchase_date: string; price: number | null; list_price: number | null; form: string | null; volume_ml: number | null; shop: { name: string } | null }
type History = { id: string; entry_date: string; body: string; created_at: string; updated_at: string }
// 구매형태(영어 값) → 라벨·이모지
const FORMS: { v: string; label: string; emoji: string }[] = [
  { v: 'bottle', label: 'Bottle', emoji: '🍾' },
  { v: 'glass', label: 'Glass', emoji: '🥃' },
  { v: 'vial', label: 'Vial', emoji: '🧪' },
  { v: 'miniature', label: 'Miniature', emoji: '🍶' },
]
const formOf = (v: string | null) => FORMS.find((f) => f.v === v) ?? FORMS[0]
type Obs = { id: string; price: number; observed_on: string | null; shop: { name: string } | null }
type WImage = { id: string; url: string; is_primary: boolean }

const COLORS = ['#fbf3d9', '#f6e5a8', '#efd479', '#e7bf50', '#dda838', '#cf8f27', '#bd781c', '#a56316', '#894f11', '#6b3d0d']
const SERVINGS: [string, string, string][] = [['neat', '니트', '🥃'], ['rocks', '온더락', '🧊'], ['highball', '하이볼', '🥤']]
const SCORES = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const won = (n: number | null | undefined) => (n == null ? '-' : `${n.toLocaleString()}원`)
// 평점 = 니트/온더락/하이볼(입력된 것)의 평균. 기존 저장 rating은 무시하고 자동 산출.
function servingAvg(serving: Record<string, number> | null | undefined): number {
  const vals = SERVINGS.map(([k]) => serving?.[k]).filter((v): v is number => typeof v === 'number' && v > 0)
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0
}

export default function WhiskyDetail() {
  const { id } = useParams<{ id: string }>()
  const [w, setW] = useState<Whisky | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeId, setActiveId] = useState('')
  const [p, setP] = useState<Profile | null>(null)
  const [buys, setBuys] = useState<Purchase[]>([])
  const [obs, setObs] = useState<Obs[]>([])
  const [images, setImages] = useState<WImage[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMsg, setAnalyzeMsg] = useState('')
  const [selImgs, setSelImgs] = useState<string[]>([]) // 분석할 사진 다중 선택
  const selInitRef = useRef(false)
  const [abvStr, setAbvStr] = useState('')
  const [volStr, setVolStr] = useState('')
  const [ppmStr, setPpmStr] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [regen, setRegen] = useState(false)
  const [pForm, setPForm] = useState({ date: '', shop: '', form: 'bottle', list: '', price: '', volume: '' })
  const [editBuy, setEditBuy] = useState<{ id: string; date: string; shop: string; form: string; list: string; price: string; volume: string } | null>(null)
  const [oForm, setOForm] = useState({ shop: '', price: '', volume: '', url: '' })
  const [adding, setAdding] = useState(false)
  const [opts, setOpts] = useState<{ price: string[]; volume: string[] }>({ price: [], volume: [] })
  const [optMgr, setOptMgr] = useState(false) // 프리셋 관리 UI 토글
  const [newOpt, setNewOpt] = useState({ price: '', volume: '' })
  const todayKST = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const [catalog, setCatalog] = useState<string[]>([]) // 시세(liquor_price) 한글명 목록 — 수동 매칭용
  const [history, setHistory] = useState<History[]>([])
  const [hForm, setHForm] = useState({ date: '', body: '' })
  const [editH, setEditH] = useState<{ id: string; date: string; body: string } | null>(null)
  const [hBusy, setHBusy] = useState(false)
  const activeIdRef = useRef('')
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  const load = useCallback(async (preferAuthor?: string) => {
    const d = await (await fetch(`${BP}/api/whisky/${id}`)).json()
    setW(d.whisky); setBuys(d.purchases ?? []); setObs(d.observations ?? []); setImages(d.images ?? []); setHistory(d.history ?? [])
    setAbvStr(d.whisky?.abv != null ? String(d.whisky.abv) : '')
    setVolStr(d.whisky?.volume_ml != null ? String(d.whisky.volume_ml) : '')
    setPpmStr(d.whisky?.peat_ppm != null ? String(d.whisky.peat_ppm) : '')
    const profs: Profile[] = d.profiles ?? []
    setProfiles(profs)
    const act = (preferAuthor && profs.find((x) => x.author === preferAuthor)) || profs.find((x) => x.id === activeIdRef.current) || profs[0] || null
    setActiveId(act?.id ?? ''); setP(act ? { ...act } : null)
    setDirty(false)
  }, [id])
  useEffect(() => { void load() }, [load])

  // 가격·용량 드롭다운 프리셋(사용자 관리)
  const loadOpts = useCallback(async () => {
    try { const j = await (await fetch(`${BP}/api/field-options`, { cache: 'no-store' })).json(); setOpts({ price: j.price ?? [], volume: j.volume ?? [] }) } catch { /* ignore */ }
  }, [])
  useEffect(() => { void loadOpts() }, [loadOpts])
  // 시세 카탈로그 한글명(수동 매칭 드롭박스 옵션)
  useEffect(() => {
    void (async () => {
      try { const j = await (await fetch(`${BP}/api/catalog`, { cache: 'no-store' })).json(); setCatalog((j.catalog ?? []).map((c: { name: string }) => c.name)) } catch { /* ignore */ }
    })()
  }, [])
  const addOpt = async (field: 'price' | 'volume') => {
    const value = newOpt[field].replace(/[^0-9]/g, '')
    if (!value) return
    await fetch(`${BP}/api/field-options`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, value }) })
    setNewOpt((s) => ({ ...s, [field]: '' })); await loadOpts()
  }
  const delOpt = async (field: 'price' | 'volume', value: string) => {
    await fetch(`${BP}/api/field-options`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, value }) })
    await loadOpts()
  }

  // 구매/시세/이미지(객관) 변경 후 — 활성 프로필 편집상태는 보존
  const reloadObjective = async () => {
    const d = await (await fetch(`${BP}/api/whisky/${id}`)).json()
    setBuys(d.purchases ?? []); setObs(d.observations ?? []); setImages(d.images ?? [])
    setW((prev) => (prev ? { ...prev, image_url: d.whisky?.image_url ?? null } : prev))
  }

  // 히스토리(일자별 일기) — 즉시 저장(본문 저장바와 무관)
  const reloadHistory = async () => {
    const d = await (await fetch(`${BP}/api/whisky/${id}`)).json(); setHistory(d.history ?? [])
  }
  const addHistory = async () => {
    if (!hForm.body.trim() || hBusy) return
    setHBusy(true)
    try {
      await fetch(`${BP}/api/whisky/${id}/history`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry_date: hForm.date || todayKST(), body: hForm.body }) })
      setHForm({ date: '', body: '' }); await reloadHistory()
    } finally { setHBusy(false) }
  }
  const saveHistory = async () => {
    if (!editH || !editH.body.trim() || hBusy) return
    setHBusy(true)
    try {
      await fetch(`${BP}/api/whisky/${id}/history`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historyId: editH.id, entry_date: editH.date, body: editH.body }) })
      setEditH(null); await reloadHistory()
    } finally { setHBusy(false) }
  }
  const delHistory = async (hid: string) => {
    await fetch(`${BP}/api/whisky/${id}/history`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historyId: hid }) })
    await reloadHistory()
  }

  const updateW = (f: Partial<Whisky>) => { setW((prev) => (prev ? { ...prev, ...f } : prev)); setDirty(true) }
  const updateP = (f: Partial<Profile>) => { setP((prev) => (prev ? { ...prev, ...f } : prev)); setDirty(true) }
  const setServing = (key: string, val: number) => updateP({ serving: { ...(p?.serving ?? {}), [key]: val } })

  const commit = async () => {
    if (!w) return
    setSaving(true)
    try {
      await fetch(`${BP}/api/whisky/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name_ko: w.name_ko, name_en: w.name_en, liquor: w.liquor, type: w.type, style: w.style, cask: w.cask, oak_species: w.oak_species, peat: w.peat, sherry_type: w.sherry_type, distillery: w.distillery,
        peat_ppm: ppmStr.trim() ? parseInt(ppmStr.replace(/[^0-9]/g, '')) : null,
        abv: abvStr.trim() ? Number(abvStr.replace(/[^0-9.]/g, '')) : null,
        volume_ml: volStr.trim() ? parseInt(volStr.replace(/[^0-9]/g, '')) : null, description: w.description,
        price_name: w.price_name,
      }) })
      if (p) {
        await fetch(`${BP}/api/whisky/${id}/profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          profileId: p.id, nose: p.nose, palate: p.palate, finish: p.finish, aroma: p.aroma, flavour: p.flavour,
          evaluation: p.evaluation, serving: p.serving, color: p.color, personal_note: p.personal_note, tasted_on: p.tasted_on,
        }) })
        setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)))
      }
      setDirty(false)
    } finally { setSaving(false) }
  }

  const switchTab = (prof: Profile) => {
    if (dirty && !confirm('저장하지 않은 변경사항이 있습니다. 저장 없이 이동할까요?')) return
    setActiveId(prof.id); setP({ ...prof }); setDirty(false)
  }
  const addAuthor = async () => {
    const name = prompt('작성자 이름')
    if (!name?.trim()) return
    const res = await fetch(`${BP}/api/whisky/${id}/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: name.trim() }) })
    const d = await res.json()
    if (!res.ok) { alert(d.error ?? '추가 실패'); return }
    await load(name.trim())
  }
  const delAuthor = async () => {
    if (!p || !confirm(`작성자 '${p.author}' 프로필을 삭제할까요?`)) return
    const res = await fetch(`${BP}/api/whisky/${id}/profile`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: p.id }) })
    const d = await res.json()
    if (!res.ok) { alert(d.error); return }
    activeIdRef.current = ''; await load()
  }
  const regenerate = async () => {
    if (!p || !confirm('AI로 이 작성자의 향·맛·피니시·레이더·평가 + 위스키 정보를 다시 생성할까요?')) return
    setRegen(true)
    try {
      await fetch(`${BP}/api/whisky/${id}/profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: p.id, regenerate: true }) })
      await load(p.author)
    } finally { setRegen(false) }
  }

  const addPurchase = async () => {
    // 필수값(구매일자·실구매가) 검증 → 경고 팝업
    const missing: string[] = []
    if (!pForm.date) missing.push('구매일자')
    if (!pForm.price.trim()) missing.push('실구매가')
    if (missing.length) { alert(`필수 입력값이 비어 있습니다:\n· ${missing.join('\n· ')}`); return }
    setAdding(true)
    try { await fetch(`${BP}/api/purchase`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whisky_id: id, purchase_date: pForm.date, shop_name: pForm.shop, form: pForm.form, list_price: pForm.list, price: pForm.price, volume_ml: pForm.volume }) }); setPForm({ date: '', shop: '', form: 'bottle', list: '', price: '', volume: '' }); await reloadObjective() } finally { setAdding(false) }
  }
  const delPurchase = async (pid: string) => { await fetch(`${BP}/api/purchase`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pid }) }); await reloadObjective() }
  // 구매 기록 수정
  const startEditBuy = (pu: Purchase) => setEditBuy({ id: pu.id, date: pu.purchase_date, shop: pu.shop?.name ?? '', form: pu.form ?? 'bottle', list: pu.list_price != null ? String(pu.list_price) : '', price: pu.price === 0 ? 'free' : pu.price != null ? String(pu.price) : '', volume: pu.volume_ml != null ? String(pu.volume_ml) : '' })
  const saveEditBuy = async () => {
    if (!editBuy) return
    if (!editBuy.date) { alert('구매일자를 입력하세요'); return }
    if (!editBuy.price.trim()) { alert('실구매가를 입력하세요'); return }
    setAdding(true)
    try {
      await fetch(`${BP}/api/purchase`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editBuy.id, purchase_date: editBuy.date, shop_name: editBuy.shop, form: editBuy.form, list_price: editBuy.list, price: editBuy.price, volume_ml: editBuy.volume }) })
      setEditBuy(null); await reloadObjective()
    } finally { setAdding(false) }
  }
  const addObs = async () => {
    if (!oForm.price) { alert('가격을 입력하세요'); return }
    setAdding(true)
    try { await fetch(`${BP}/api/price-observation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whisky_id: id, shop_name: oForm.shop, price: oForm.price, volume_ml: oForm.volume, url: oForm.url }) }); setOForm({ shop: '', price: '', volume: '', url: '' }); await reloadObjective() } finally { setAdding(false) }
  }
  const delObs = async (oid: string) => { await fetch(`${BP}/api/price-observation`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: oid }) }); await reloadObjective() }
  // 여러 장 순차 업로드(대표사진 판정 레이스 방지) 후 1회 갱신
  const uploadImgs = async (files: File[]) => {
    if (!files.length) return
    setAdding(true)
    try {
      for (const file of files) {
        const fd = new FormData(); fd.append('image', file)
        await fetch(`${BP}/api/whisky/${id}/image`, { method: 'POST', body: fd })
      }
      await reloadObjective()
    } finally { setAdding(false) }
  }
  // 사진 분석 → 특성 키워드 + 용어사전 연동
  const analyze = async () => {
    setAnalyzing(true); setAnalyzeMsg('')
    try {
      const targets = selImgs.length ? selImgs : [images.find((i) => i.is_primary)?.id ?? images[0]?.id].filter(Boolean)
      const res = await fetch(`${BP}/api/whisky/${id}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_ids: targets }) })
      const j = await res.json()
      if (!res.ok || j.error) { setAnalyzeMsg(j.error ?? '분석 실패'); return }
      setAnalyzeMsg(j.addedCount ? `키워드 ${j.keywords.length}개 · 용어사전 신규 ${j.addedCount}개 추가됨` : `키워드 ${j.keywords.length}개`)
      setW((prev) => (prev ? { ...prev, keywords: j.keywords, analysis: j.analysis ?? prev.analysis } : prev))
    } catch { setAnalyzeMsg('분석 실패: 네트워크 오류') } finally { setAnalyzing(false) }
  }
  // 사진 로드되면 대표사진 1장 기본 선택(1회)
  useEffect(() => { if (!selInitRef.current && images.length) { selInitRef.current = true; setSelImgs([images.find((i) => i.is_primary)?.id ?? images[0].id]) } }, [images])
  const toggleImg = (imgId: string) => setSelImgs((s) => s.includes(imgId) ? s.filter((x) => x !== imgId) : [...s, imgId])
  const setPrimaryImg = async (imageId: string) => { await fetch(`${BP}/api/whisky/${id}/image`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId }) }); await reloadObjective() }
  const delImg = async (imageId: string) => { await fetch(`${BP}/api/whisky/${id}/image`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId }) }); await reloadObjective() }

  if (!w) return <div className="text-sm text-neutral-400">불러오는 중...</div>

  const priceRecs: { price: number; when: string | null; shop: string | null }[] = [
    ...obs.map((o) => ({ price: o.price, when: o.observed_on, shop: o.shop?.name ?? null })),
    ...buys.filter((b) => b.price != null).map((b) => ({ price: b.price as number, when: b.purchase_date, shop: b.shop?.name ?? null })),
  ]
  const minRec = priceRecs.length ? priceRecs.reduce((a, b) => (b.price < a.price ? b : a)) : null
  const maxRec = priceRecs.length ? priceRecs.reduce((a, b) => (b.price > a.price ? b : a)) : null
  const avg = priceRecs.length ? Math.round(priceRecs.reduce((s, r) => s + r.price, 0) / priceRecs.length) : null
  const latest = buys[0]
  // 노트↔시세 매칭: price_name(수동) 우선, 없으면 name_ko. 카탈로그(시세)에 동일 nkey 있으면 연결됨.
  const nkey = (s: string) => (s ?? '').replace(/\s+/g, '')
  const matchName = (w.price_name || w.name_ko || w.name_en || '').trim()
  const matchedName = matchName ? (catalog.find((c) => nkey(c) === nkey(matchName)) ?? null) : null
  const pctx = (r: { when: string | null; shop: string | null } | null) => (r ? [r.when, r.shop].filter(Boolean).join(', ') : '')
  const primaryImg = images.find((i) => i.is_primary) ?? images[0] ?? null
  const lbl = 'text-[11px] font-medium text-amber-700/70 shrink-0'
  const box = 'rounded-lg border border-amber-100 bg-white'

  return (
    <div className="mx-auto max-w-3xl pb-24">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b-2 border-amber-800/20 pb-3">
        <div className="flex items-center gap-3">
          <span className="rounded bg-neutral-800 px-2.5 py-1 text-sm font-bold text-white">🥃</span>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900" style={{ fontFamily: 'ui-serif, serif' }}>테이스팅 노트{w.seq != null ? ` #${w.seq}` : ''}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {matchName && <Link href={`/prices?name=${encodeURIComponent(matchedName ?? matchName)}`} title={matchedName ? `시세 연결됨: ${matchedName}` : '이 술의 시세 화면으로 이동'} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100">📈 시세{matchedName ? '' : ' ⚠'}</Link>}
          <button onClick={regenerate} disabled={regen} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50">{regen ? '생성 중…' : '🔄 프로필 재생성'}</button>
          <Link href="/whisky" className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50">← 목록</Link>
        </div>
      </div>

      {/* 작성자 탭 */}
      <div className="mt-3 flex flex-wrap items-center gap-1 border-b border-amber-100">
        {profiles.map((prof) => (
          <button key={prof.id} onClick={() => switchTab(prof)}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm ${prof.id === activeId ? 'border-amber-600 font-semibold text-amber-700' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
            {prof.author}
          </button>
        ))}
        <button onClick={addAuthor} className="px-2 py-1.5 text-xs text-amber-600 hover:underline">＋ 작성자 추가</button>
        {profiles.length > 1 && <button onClick={delAuthor} className="ml-auto px-2 py-1.5 text-[11px] text-neutral-300 hover:text-red-500">이 작성자 삭제</button>}
      </div>

      {/* 작성자 개인 헤더: 평점 */}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5"><span className={lbl}>평점</span>
          <IconRating score={servingAvg(p?.serving)} icon="🛢️" />
          <span className="text-[11px] text-neutral-400">시음유형 평균</span>
        </div>
        <span className="text-[11px] text-neutral-400">by {p?.author}</span>
      </div>

      {/* 정보 (공유) */}
      <Section title="정보 (공통)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            {primaryImg ? (
              <button onClick={() => setLightbox(primaryImg.url)} className="block w-full" title="클릭하면 전체화면">
                <img src={primaryImg.url} alt="" className="max-h-56 w-full rounded-lg border border-amber-100 bg-neutral-50 object-contain" />
              </button>
            ) : <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-amber-200 text-3xl text-amber-200">🥃</div>}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((im) => (
                  <div key={im.id} className="flex flex-col items-center">
                    <button onClick={() => setLightbox(im.url)}><img src={im.url} alt="" className={`h-12 w-12 rounded object-cover ${im.is_primary ? 'ring-2 ring-amber-500' : 'ring-1 ring-neutral-200'}`} /></button>
                    <div className="mt-0.5 flex gap-1 text-[9px]">
                      {im.is_primary ? <span className="text-amber-600">대표</span> : <button onClick={() => setPrimaryImg(im.id)} className="text-amber-600 hover:underline">대표설정</button>}
                      <button onClick={() => delImg(im.id)} className="text-neutral-300 hover:text-red-500">삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <label className="block cursor-pointer rounded-md border border-dashed border-amber-200 px-2 py-1.5 text-center text-[11px] text-amber-600 hover:bg-amber-50">
              {adding ? '업로드 중…' : '📷 이미지 추가 (여러 장 가능)'}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void uploadImgs(fs); e.target.value = '' }} />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
            <Row label="주종">
              <select value={w.liquor ?? ''} onChange={(e) => updateW({ liquor: e.target.value || null })}
                className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400">
                <option value="">(미지정)</option>
                {LIQUORS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Row>
            <Row label="종류"><Edit value={w.type} onChange={(v) => updateW({ type: v })} ph="싱글몰트 스카치" /></Row>
            <Row label="구분">
              <select value={w.style ?? ''} onChange={(e) => updateW({ style: e.target.value || null })}
                className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400">
                <option value="">(미지정)</option>
                {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Row>
            <Row label="캐스크"><Edit value={w.cask} onChange={(v) => updateW({ cask: v })} ph="버번캐스크+올로로소캐스크 등" /></Row>
            <Row label="오크품종">
              <select value={w.oak_species ?? ''} onChange={(e) => updateW({ oak_species: e.target.value || null })}
                className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400">
                <option value="">(미지정)</option>
                {OAKS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Row>
            <Row label="피트">
              <select value={w.peat ?? ''} onChange={(e) => updateW({ peat: e.target.value || null })}
                className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400">
                <option value="">(미지정)</option>
                {PEATS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Row>
            <Row label="피트강도"><span className="inline-flex items-baseline gap-0.5">🔥<input value={ppmStr} onChange={(e) => { setPpmStr(e.target.value); setDirty(true) }} placeholder="0" type="number" title="몰트 페놀 ppm(참고치). 논피트=0" className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />{ppmStr && <span className="text-sm text-neutral-500">ppm</span>}</span></Row>
            <Row label="셰리 종류">
              <div>
                <select value={w.sherry_type ?? ''} onChange={(e) => updateW({ sherry_type: e.target.value || null })}
                  className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400">
                  <option value="">(미지정)</option>
                  {SHERRY_TYPES.map((t) => <option key={t} value={t}>{t === '없음' ? '없음(논셰리)' : t}</option>)}
                </select>
                {sherryInfoOf(w.sherry_type) && <p className="mt-0.5 text-[11px] text-amber-700">🍇 당도 {sherryInfoOf(w.sherry_type)!.sweet} · 향 {sherryInfoOf(w.sherry_type)!.aroma}</p>}
              </div>
            </Row>
            <Row label="증류소"><Edit value={w.distillery} onChange={(v) => updateW({ distillery: v })} ph="증류소·지역" /></Row>
            <Row label="이름">
              <div className="flex flex-col gap-1">
                <Edit value={w.name_ko} onChange={(v) => updateW({ name_ko: v })} ph="한글명 (예: 듀어스 12년)" />
                <Edit value={w.name_en} onChange={(v) => updateW({ name_en: v })} ph="영문명 (예: Dewar's 12)" />
              </div>
            </Row>
            <Row label="도수"><span className="inline-flex items-baseline gap-0.5"><input value={abvStr} onChange={(e) => { setAbvStr(e.target.value); setDirty(true) }} placeholder="43" className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />{abvStr && <span className="text-sm text-neutral-500">%</span>}</span></Row>
            <Row label="용량"><span className="inline-flex items-baseline gap-0.5"><input value={volStr} onChange={(e) => { setVolStr(e.target.value); setDirty(true) }} placeholder="700" type="number" className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />{volStr && <span className="text-sm text-neutral-500">ml</span>}</span></Row>
            <Row label="가격">{latest ? <span className="text-sm text-neutral-800">{won(latest.price)}</span> : <span className="text-sm text-neutral-400">{avg != null ? `시세 평균 ${won(avg)}` : '-'}</span>}</Row>
            <Row label="상점"><span className="text-sm text-neutral-800">{latest?.shop?.name ?? '-'}</span></Row>
            <Row label="시세매칭">
              <div>
                <div className="flex items-center gap-1.5">
                  <input list="price-catalog" value={w.price_name ?? ''} onChange={(e) => updateW({ price_name: e.target.value || null })} placeholder={`자동(${w.name_ko || '한글명'})`} className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  {w.price_name && <button onClick={() => updateW({ price_name: null })} title="자동 매칭으로 되돌리기" className="shrink-0 rounded border border-neutral-200 px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-neutral-50">자동</button>}
                </div>
                <datalist id="price-catalog">{catalog.map((n) => <option key={n} value={n} />)}</datalist>
                <p className={`mt-0.5 text-[11px] ${matchedName ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {matchedName ? `✓ 시세 연결됨: ${matchedName}` : matchName ? `⚠ 시세 미연결 — 위 칸에서 시세 품목명을 선택/입력해 매칭` : '한글명을 입력하면 시세와 자동 매칭'}
                </p>
              </div>
            </Row>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className={`${box} p-2`}><div className="text-amber-700/60">최저가</div><div className="mt-0.5 font-semibold text-neutral-800">{won(minRec?.price)}</div>{minRec && <div className="text-[10px] text-neutral-400">{pctx(minRec)}</div>}</div>
          <div className={`${box} p-2`}><div className="text-amber-700/60">평균가</div><div className="mt-0.5 font-semibold text-neutral-800">{won(avg)}</div></div>
          <div className={`${box} p-2`}><div className="text-amber-700/60">최고가</div><div className="mt-0.5 font-semibold text-neutral-800">{won(maxRec?.price)}</div>{maxRec && <div className="text-[10px] text-neutral-400">{pctx(maxRec)}</div>}</div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] font-medium text-amber-700/70">＋ 시세</span>
          <input value={oForm.shop} onChange={(e) => setOForm({ ...oForm, shop: e.target.value })} placeholder="상점" className="w-24 rounded border border-neutral-200 px-2 py-1" />
          <input value={oForm.price} onChange={(e) => setOForm({ ...oForm, price: e.target.value })} placeholder="가격" type="number" className="w-24 rounded border border-neutral-200 px-2 py-1" />
          <input value={oForm.volume} onChange={(e) => setOForm({ ...oForm, volume: e.target.value })} placeholder="용량ml" type="number" className="w-20 rounded border border-neutral-200 px-2 py-1" />
          <input value={oForm.url} onChange={(e) => setOForm({ ...oForm, url: e.target.value })} placeholder="링크(선택)" className="w-28 rounded border border-neutral-200 px-2 py-1" />
          <button onClick={addObs} disabled={adding} className="rounded bg-neutral-700 px-2.5 py-1 text-white hover:bg-neutral-800 disabled:opacity-50">추가</button>
        </div>
        {obs.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {obs.map((o) => <span key={o.id} className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">{o.shop?.name ?? ''} {won(o.price)}{o.observed_on ? ` (${o.observed_on})` : ''}<button onClick={() => delObs(o.id)} className="text-neutral-300 hover:text-red-500">✕</button></span>)}
          </div>
        )}
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-2"><span className="text-xs font-semibold text-amber-800">구매 기록</span><span className="text-[11px] text-neutral-400">구매 {buys.filter((b) => (b.form ?? 'bottle') === 'bottle').length}회 · 시음 {buys.filter((b) => (b.form ?? 'bottle') !== 'bottle').length}회</span></div>
          <datalist id="price-opts"><option value="free" />{opts.price.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="volume-opts">{opts.volume.map((v) => <option key={v} value={v} />)}</datalist>
          {buys.length > 0 && <ul className="mb-1 space-y-0.5 text-xs text-neutral-600">{buys.map((pu) => {
            if (editBuy && editBuy.id === pu.id) {
              return <li key={pu.id} className="flex flex-wrap items-center gap-1 rounded-md bg-amber-50/60 p-1.5">
                <input type="date" value={editBuy.date} onChange={(e) => setEditBuy({ ...editBuy, date: e.target.value })} className="rounded border border-neutral-200 px-2 py-1" />
                <select value={editBuy.form} onChange={(e) => setEditBuy({ ...editBuy, form: e.target.value })} className="rounded border border-neutral-200 px-2 py-1" title="구매형태">
                  {FORMS.map((f) => <option key={f.v} value={f.v}>{f.emoji} {f.label}</option>)}
                </select>
                <input value={editBuy.shop} onChange={(e) => setEditBuy({ ...editBuy, shop: e.target.value })} placeholder="상점" className="w-20 rounded border border-neutral-200 px-2 py-1" />
                <input list="volume-opts" value={editBuy.volume} onChange={(e) => setEditBuy({ ...editBuy, volume: e.target.value })} placeholder="용량ml" inputMode="numeric" className="w-16 rounded border border-neutral-200 px-2 py-1" />
                <input list="price-opts" value={editBuy.list} onChange={(e) => setEditBuy({ ...editBuy, list: e.target.value })} placeholder="정가" inputMode="numeric" className="w-16 rounded border border-neutral-200 px-2 py-1" />
                <input list="price-opts" value={editBuy.price} onChange={(e) => setEditBuy({ ...editBuy, price: e.target.value })} placeholder="실구매가*" inputMode="numeric" className="w-20 rounded border border-amber-200 px-2 py-1" />
                <button onClick={saveEditBuy} disabled={adding} className="rounded bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-700 disabled:opacity-50">저장</button>
                <button onClick={() => setEditBuy(null)} className="rounded border border-neutral-200 px-2 py-1 text-neutral-500 hover:bg-neutral-100">취소</button>
              </li>
            }
            const disc = pu.list_price && pu.price ? Math.round((1 - pu.price / pu.list_price) * 100) : null
            const f = formOf(pu.form)
            const priceStr = pu.price === 0 ? 'free' : won(pu.price)
            return <li key={pu.id} className="flex items-center gap-1.5"><span>· {pu.purchase_date} · <span className="rounded bg-neutral-100 px-1 py-0.5 text-[10px] font-medium text-neutral-600">{f.emoji} {f.label}</span>{pu.volume_ml ? <span className="text-neutral-400"> {pu.volume_ml}ml</span> : null} · {pu.shop?.name ?? '상점미상'} · {pu.list_price ? <span className="text-neutral-400">정가 <span className="line-through">{won(pu.list_price)}</span> → </span> : null}실구매 <b className="text-neutral-800">{priceStr}</b>{disc != null && disc > 0 ? <span className="text-emerald-600"> ({disc}%↓)</span> : null}</span><button onClick={() => startEditBuy(pu)} className="text-neutral-300 hover:text-amber-600" title="수정">✎</button><button onClick={() => delPurchase(pu.id)} className="text-neutral-300 hover:text-red-500" title="삭제">✕</button></li>
          })}</ul>}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <input type="date" value={pForm.date} onChange={(e) => setPForm({ ...pForm, date: e.target.value })} className="rounded border border-neutral-200 px-2 py-1" />
            <select value={pForm.form} onChange={(e) => setPForm({ ...pForm, form: e.target.value })} className="rounded border border-neutral-200 px-2 py-1" title="구매형태">
              {FORMS.map((f) => <option key={f.v} value={f.v}>{f.emoji} {f.label}</option>)}
            </select>
            <input value={pForm.shop} onChange={(e) => setPForm({ ...pForm, shop: e.target.value })} placeholder="상점" className="w-24 rounded border border-neutral-200 px-2 py-1" />
            <input list="volume-opts" value={pForm.volume} onChange={(e) => setPForm({ ...pForm, volume: e.target.value })} placeholder="용량ml" inputMode="numeric" className="w-20 rounded border border-neutral-200 px-2 py-1" />
            <input list="price-opts" value={pForm.list} onChange={(e) => setPForm({ ...pForm, list: e.target.value })} placeholder="정가" inputMode="numeric" className="w-20 rounded border border-neutral-200 px-2 py-1" />
            <input list="price-opts" value={pForm.price} onChange={(e) => setPForm({ ...pForm, price: e.target.value })} placeholder="실구매가*" inputMode="numeric" className="w-24 rounded border border-amber-200 px-2 py-1" />
            <button onClick={addPurchase} disabled={adding} className="rounded bg-amber-600 px-2.5 py-1 text-white hover:bg-amber-700 disabled:opacity-50">구매 추가</button>
            <button type="button" onClick={() => setOptMgr((v) => !v)} className="rounded border border-neutral-200 px-2 py-1 text-neutral-500 hover:bg-neutral-50" title="드롭다운 값 관리">⚙ 값 관리</button>
          </div>
          {optMgr && (
            <div className="mt-1.5 space-y-1.5 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-2 text-[11px]">
              {(['volume', 'price'] as const).map((field) => (
                <div key={field} className="flex flex-wrap items-center gap-1">
                  <span className="w-9 shrink-0 font-medium text-neutral-500">{field === 'volume' ? '용량' : '가격'}</span>
                  {opts[field].map((v) => (
                    <span key={v} className="inline-flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-neutral-600 ring-1 ring-neutral-200">
                      {Number(v).toLocaleString()}<button onClick={() => void delOpt(field, v)} className="text-neutral-300 hover:text-red-500">✕</button>
                    </span>
                  ))}
                  {opts[field].length === 0 && <span className="text-neutral-300">값 없음</span>}
                  <input value={newOpt[field]} onChange={(e) => setNewOpt((s) => ({ ...s, [field]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') void addOpt(field) }}
                    placeholder="추가" inputMode="numeric" className="w-16 rounded border border-neutral-200 px-1.5 py-0.5" />
                  <button onClick={() => void addOpt(field)} className="rounded bg-neutral-700 px-1.5 py-0.5 text-white hover:bg-neutral-800">＋</button>
                </div>
              ))}
              <p className="text-neutral-400">* 여기서 추가/삭제한 값이 정가·실구매가·용량 입력의 드롭다운 목록이 됩니다.</p>
            </div>
          )}
        </div>
      </Section>

      {/* 특성 키워드 (사진 분석 → 용어사전 연동) */}
      <Section title="특성 키워드">
        <div className={`${box} p-3`}>
          {images.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 flex items-center gap-2 text-[11px] text-neutral-500">
                <span>분석할 사진 선택 (여러 장 가능){images.length > 1 ? ` · ${images.length}장 중 ${selImgs.length}장` : ''}</span>
                {images.length > 1 && <button onClick={() => setSelImgs(selImgs.length === images.length ? [] : images.map((i) => i.id))} className="text-amber-600 hover:underline">{selImgs.length === images.length ? '전체 해제' : '전체 선택'}</button>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {images.map((im) => (
                  <button key={im.id} onClick={() => toggleImg(im.id)} title="분석에 포함/제외"
                    className={`relative h-14 w-14 overflow-hidden rounded-md border-2 ${selImgs.includes(im.id) ? 'border-amber-500 ring-2 ring-amber-200' : 'border-neutral-200 opacity-60 hover:opacity-100'}`}>
                    <img src={im.url} alt="" className="h-full w-full object-cover" />
                    {selImgs.includes(im.id) && <span className="absolute right-0.5 top-0.5 rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={analyze} disabled={analyzing || images.length === 0 || selImgs.length === 0} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{analyzing ? '분석 중…' : `🔍 선택 사진 분석${selImgs.length ? ` (${selImgs.length}장)` : ''}`}</button>
            {images.length === 0 && <span className="text-[11px] text-neutral-400">먼저 위 정보에서 사진을 추가하세요</span>}
            {analyzeMsg && <span className="text-[11px] text-emerald-600">{analyzeMsg}</span>}
          </div>
          {w.analysis && <p className="mt-2 whitespace-pre-line rounded-lg bg-amber-50/60 p-2.5 text-sm leading-relaxed text-neutral-700">{w.analysis}</p>}
          {w.keywords && w.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {w.keywords.map((kw) => <Link key={kw} href={`/glossary?q=${encodeURIComponent(kw)}`} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100" title="용어사전에서 보기">{kw}</Link>)}
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-neutral-400">선택한 사진들(라벨/병 등, 최대 8장)에서 위스키 특성 키워드를 추출해 용어사전에 연동합니다(없으면 추가 · 키워드 클릭 시 용어사전).</p>
        </div>
      </Section>

      {/* 감각 (작성자별) */}
      <Section title={`감각 (${p?.author ?? ''})`}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={lbl}>색</span>
            <div className="flex gap-1">{COLORS.map((c) => <button key={c} onClick={() => updateP({ color: p?.color === c ? null : c })} className={`h-6 w-6 rounded ${p?.color === c ? 'ring-2 ring-neutral-800 ring-offset-1' : 'ring-1 ring-neutral-200'}`} style={{ background: c }} />)}</div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={`${box} p-3`}><div className={`${lbl} mb-1`}>향 (Nose)</div><Edit value={p?.nose ?? null} onChange={(v) => updateP({ nose: v })} ph="향 노트" area /></div>
            <div className={`${box} p-3`}><div className={`${lbl} mb-1`}>맛 (Palate)</div><Edit value={p?.palate ?? null} onChange={(v) => updateP({ palate: v })} ph="맛 노트" area /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={`${box} p-2`}><WhiskyRadar values={p?.aroma} title="향 (Aroma)" color="#ea580c" /><RadarSliders values={p?.aroma ?? null} onChange={(v) => updateP({ aroma: v })} color="#ea580c" /></div>
            <div className={`${box} p-2`}><WhiskyRadar values={p?.flavour} title="맛 (Flavour)" color="#b45309" /><RadarSliders values={p?.flavour ?? null} onChange={(v) => updateP({ flavour: v })} color="#b45309" /></div>
          </div>
          <div className={`${box} p-3`}><div className={`${lbl} mb-1`}>피니시 (Finish)</div><Edit value={p?.finish ?? null} onChange={(v) => updateP({ finish: v })} ph="여운" area /></div>
        </div>
      </Section>

      {/* 시음유형 (작성자별) */}
      <Section title="시음유형">
        <div className={`${box} space-y-2 p-3`}>
          {SERVINGS.map(([key, label, icon]) => {
            const sc = p?.serving?.[key] ?? 0
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs font-medium text-neutral-700">{label}</span>
                <IconRating score={sc} icon={icon} />
                <select value={sc} onChange={(e) => setServing(key, Number(e.target.value))} className="ml-auto rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 focus:outline-none focus:ring-1 focus:ring-amber-500">
                  {SCORES.map((s) => <option key={s} value={s}>{s.toFixed(1)}점</option>)}
                </select>
              </div>
            )
          })}
        </div>
      </Section>

      {/* 종합 (작성자별) */}
      <Section title="종합">
        <div className={`${box} p-3`}>
          <Edit value={p?.evaluation ?? null} onChange={(v) => updateP({ evaluation: v })} ph="대체적 평가·총평" area rows={6} />
          {w.description && <p className="mt-2 border-t border-amber-50 pt-2 text-xs text-neutral-400">참고: {w.description}</p>}
        </div>
      </Section>

      {/* 히스토리 (일자별 일기) */}
      <Section title="히스토리">
        {/* 새 기록 추가 */}
        <div className={`${box} p-3`}>
          <div className="mb-2 flex items-center gap-2">
            <input type="date" value={hForm.date || todayKST()} onChange={(e) => setHForm((s) => ({ ...s, date: e.target.value }))} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-700 focus:border-amber-400 focus:outline-none" />
            <span className="text-[11px] text-neutral-400">일자별로 시음·구매·상황을 일기처럼 기록</span>
          </div>
          <textarea value={hForm.body} onChange={(e) => setHForm((s) => ({ ...s, body: e.target.value }))} placeholder="오늘의 기록 (분위기·함께한 사람·맛의 변화·상황 등)" rows={3} className="w-full resize-y rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <div className="mt-1.5 flex justify-end">
            <button onClick={addHistory} disabled={!hForm.body.trim() || hBusy} className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40">＋ 기록 추가</button>
          </div>
        </div>

        {/* 타임라인 */}
        {history.length === 0 ? (
          <p className="mt-2 px-1 text-xs text-neutral-400">아직 기록이 없습니다. 첫 기록을 남겨보세요.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {history.map((h) => (
              <li key={h.id} className={`${box} p-3`}>
                {editH?.id === h.id ? (
                  <div>
                    <input type="date" value={editH.date} onChange={(e) => setEditH((s) => (s ? { ...s, date: e.target.value } : s))} className="mb-2 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-700 focus:border-amber-400 focus:outline-none" />
                    <textarea value={editH.body} onChange={(e) => setEditH((s) => (s ? { ...s, body: e.target.value } : s))} rows={3} className="w-full resize-y rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                    <div className="mt-1.5 flex justify-end gap-2 text-xs">
                      <button onClick={() => setEditH(null)} className="rounded px-2 py-1 text-neutral-400 hover:text-neutral-600">취소</button>
                      <button onClick={saveHistory} disabled={!editH.body.trim() || hBusy} className="rounded bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-40">저장</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">📅 {h.entry_date}</span>
                      <div className="ml-auto flex gap-1.5 text-[11px]">
                        <button onClick={() => setEditH({ id: h.id, date: h.entry_date, body: h.body })} className="text-neutral-400 hover:text-amber-600">✎ 수정</button>
                        <button onClick={() => delHistory(h.id)} className="text-neutral-300 hover:text-red-500">✕ 삭제</button>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-neutral-800">{h.body}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* 이미지 전체화면 */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full object-contain" />
          <button onClick={() => setLightbox(null)} className="fixed right-4 top-4 text-3xl leading-none text-white">✕</button>
        </div>
      )}

      {/* 저장 바 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200 bg-white/95 px-4 py-2.5 backdrop-blur md:left-52">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="mr-auto text-[11px] text-neutral-400">✏️ 각 항목을 눌러 바로 수정 → 저장</span>
          {dirty && <span className="text-xs font-medium text-amber-600">저장되지 않은 변경사항</span>}
          <button onClick={commit} disabled={saving || !dirty} className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40">{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

const RAXES: [string, string][] = [['cereal', '곡물'], ['fruity', '과일'], ['floral', '꽃향'], ['peaty', '피트'], ['feinty', '페인티'], ['sulphur', '유황'], ['woody', '우디'], ['winey', '와인']]
function RadarSliders({ values, onChange, color }: { values: Radar | null; onChange: (v: Radar) => void; color: string }) {
  const v = values ?? {}
  const setAxis = (k: string, n: number) => onChange({ ...(RAXES.reduce((a, [key]) => ({ ...a, [key]: v[key] ?? 0 }), {} as Radar)), [k]: n })
  return (
    <div className="mt-1 space-y-0.5 px-1">
      {RAXES.map(([k, lab]) => (
        <label key={k} className="flex items-center gap-2 text-[11px]">
          <span className="w-8 shrink-0 text-neutral-500">{lab}</span>
          <input type="range" min={0} max={4} step={1} value={v[k] ?? 0} onChange={(e) => setAxis(k, Number(e.target.value))} className="h-1 flex-1 cursor-pointer" style={{ accentColor: color }} />
          <span className="w-3 text-right text-neutral-400">{v[k] ?? 0}</span>
        </label>
      ))}
    </div>
  )
}
function IconRating({ score, icon }: { score: number; icon: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = score >= i ? 'full' : score >= i - 0.5 ? 'half' : 'empty'
        return <span key={i} className="text-base leading-none" style={{ opacity: fill === 'full' ? 1 : fill === 'half' ? 0.45 : 0.15, filter: fill === 'empty' ? 'grayscale(1)' : 'none' }}>{icon}</span>
      })}
      <span className="ml-1.5 text-xs font-medium text-amber-700">{(score ?? 0).toFixed(1)}</span>
    </span>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<section className="mt-5"><h2 className="mb-2 text-sm font-bold text-amber-800">〉 {title}</h2>{children}</section>)
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="flex items-baseline gap-2 border-b border-amber-50 pb-1.5"><span className="w-12 shrink-0 text-[11px] font-medium text-amber-700/70">{label}</span><div className="min-w-0 flex-1">{children}</div></div>)
}
function Edit({ value, onChange, ph, area, rows = 2 }: { value: string | null; onChange: (v: string) => void; ph?: string; area?: boolean; rows?: number }) {
  if (area) return <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={ph} rows={rows} className="w-full resize-y rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={ph} className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />
}
