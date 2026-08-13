'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
// 주종(최상위 분류) / 위스키 구분(세부 스타일) / 카테고리. 서버 LIQUORS·WHISKY_STYLES와 동일(SDK 번들 방지 위해 로컬 정의)
const LIQUORS = ['위스키', '보드카', '진', '럼', '데킬라', '브랜디', '리큐르', '사케', '막걸리', '소주', '전통주', '와인', '맥주', '기타']
const STYLES = ['싱글몰트', '블렌디드', '블렌디드몰트', '싱글그레인', '버번', '라이', '기타']
const CATEGORIES = ['구매완료', '시음', '바이알시음', '지인선물', '구매희망', '지인추천', '전문가추천', '직접촬영']
// 구매형태: bottle=구매(완료), 그 외=시음. 레거시(null)는 구매로 간주.
const isBottle = (form?: string | null) => (form ?? 'bottle') === 'bottle'

type Whisky = { id: string; name: string; seq?: number | null; name_ko?: string | null; name_en?: string | null; image_url?: string | null; liquor?: string | null; style?: string | null; type?: string | null; updated_at?: string | null; noteCount?: number }
type Stat = { whisky_id: string; purchase_count: number; price_min: number | null; price_max: number | null; price_avg: number | null; price_count: number }
type Purchase = { id: string; whisky_id: string; purchase_date: string; price: number | null; form?: string | null; volume_ml?: number | null; shop: { name: string } | null }
type Wishlist = { id: string; whisky_id: string; memo: string | null }
type WishlistShop = { wishlist_id: string; shop: { name: string } | null }
type Reco = { id: string; whisky_id: string; reason: string | null; recommender: { name: string; kind: 'friend' | 'expert' | 'gift' | 'photo' | 'vial' } | null }

type Data = {
  whiskies: Whisky[]; stats: Stat[]; purchases: Purchase[]
  wishlists: Wishlist[]; wishlistShops: WishlistShop[]; recommendations: Reco[]
}

const won = (n: number | null | undefined) => (n == null ? '-' : `${n.toLocaleString()}원`)
// 변경시각 KST 표시 (MM-DD HH:mm)
const kst = (iso?: string | null) => {
  if (!iso) return ''
  const p = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`
}

export default function WhiskyPage() {
  const [data, setData] = useState<Data | null>(null)
  const [name, setName] = useState('')
  const [liquor, setLiquor] = useState('') // 등록 시 주종 지정('' = AI 자동)
  const [style, setStyle] = useState('') // 등록 시 구분 지정('' = AI 자동)
  const [cat, setCat] = useState('') // 등록 시 카테고리('' = 미지정 / buy / wish / friend / expert)
  const [catForm, setCatForm] = useState<Record<string, string>>({}) // 카테고리 세부입력
  const [catalog, setCatalog] = useState<{ name: string; liquor: string; style: string; cask: string; peat: string; peat_ppm: number | null; priceMin: number | null }[]>([])
  const [price, setPrice] = useState('') // 신규 술: 시세 등록가(선택)
  const [shop, setShop] = useState('')   // 신규 술: 판매점(선택)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [openForm, setOpenForm] = useState<{ id: string; mode: string } | null>(null)
  // 정렬: 최신변경순(기본) · 등록순 · 이름순
  const [sort, setSort] = useState<'recent' | 'seq' | 'name'>('recent')
  // 필터: 이름(콤보박스 검색) · 주종 · 구분 · 카테고리
  const [qName, setQName] = useState('')
  const [fLiquor, setFLiquor] = useState('')
  const [fStyle, setFStyle] = useState('')
  const [fCat, setFCat] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`${BP}/api/whisky`)
    setData(await res.json())
  }, [])
  useEffect(() => { void load() }, [load])
  // 시세 카탈로그(등록 시 선택용)
  useEffect(() => { void (async () => { const r = await fetch(`${BP}/api/catalog`); setCatalog((await r.json()).catalog ?? []) })() }, [])

  // 공통 JSON 액션 (구매/희망/추천/시세/삭제)
  const post = async (path: string, body: unknown, method = 'POST') => {
    setBusy(true)
    try {
      const res = await fetch(`${BP}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) alert((await res.json()).error ?? '오류')
      else { setOpenForm(null); await load() }
    } finally { setBusy(false) }
  }

  // 위스키 등록 (사진 선택 → multipart) + 선택 시 카테고리도 함께 생성
  const createWhisky = async () => {
    if (!name.trim()) return
    // 카테고리 필수값 사전 검증(추천·선물은 이름/출처 필수)
    if ((cat === 'friend' || cat === 'expert' || cat === 'gift') && !(catForm.name ?? '').trim()) {
      alert(cat === 'expert' ? '추천 출처를 입력하세요' : cat === 'gift' ? '선물한 지인명을 입력하세요' : '지인명을 입력하세요'); return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name.trim())
      if (liquor) fd.append('liquor', liquor)
      if (style) fd.append('style', style)
      if (price.trim()) fd.append('price', price.trim())
      if (shop.trim()) fd.append('shop', shop.trim())
      if (file) fd.append('image', file)
      const res = await fetch(`${BP}/api/whisky`, { method: 'POST', body: fd })
      if (!res.ok) { alert((await res.json()).error ?? '오류'); return }
      const created = await res.json() as { id?: string; addedToCatalog?: boolean }
      if (created?.addedToCatalog) alert('새 술이라 시세(주류시세)에도 등록했어요.')
      // 선택한 카테고리 관계 생성
      if (cat && created?.id) {
        const wid = created.id
        const today = new Date().toISOString().slice(0, 10)
        let cres: Response | null = null
        if (cat === 'buy') cres = await fetch(`${BP}/api/purchase`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whisky_id: wid, purchase_date: catForm.date || today, shop_name: catForm.shop, price: catForm.price }) })
        else if (cat === 'wish') cres = await fetch(`${BP}/api/wishlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whisky_id: wid, memo: catForm.memo, shop_names: (catForm.shops ?? '').split(',').map(s => s.trim()).filter(Boolean) }) })
        else cres = await fetch(`${BP}/api/recommendation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ whisky_id: wid, kind: cat, name: catForm.name, reason: catForm.reason }) })
        if (cres && !cres.ok) alert('위스키는 등록됐지만 카테고리 저장 실패: ' + ((await cres.json()).error ?? ''))
      }
      setName(''); setLiquor(''); setStyle(''); setPrice(''); setShop(''); setCat(''); setCatForm({}); setFile(null); await load()
    } finally { setBusy(false) }
  }
  const setCf = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setCatForm(p => ({ ...p, [k]: e.target.value }))

  // [위스키] 구글시트 ↔ DB 동기화
  const syncSheet = async () => {
    setSyncing(true)
    try {
      const res = await fetch(`${BP}/api/whisky/sync`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) alert(d.error ?? '동기화 실패')
      else { alert(`시트 동기화 완료 — 시트→DB ${d.imported}건 추가 · DB→시트 ${d.exported}건 반영`); await load() }
    } finally { setSyncing(false) }
  }

  if (!data) return <div className="text-sm text-neutral-400">불러오는 중...</div>

  const statOf = (id: string) => data.stats.find(s => s.whisky_id === id)
  const purchasesOf = (id: string) => data.purchases.filter(p => p.whisky_id === id)
  const wishOf = (id: string) => data.wishlists.find(w => w.whisky_id === id)
  const wishShopsOf = (wid: string) => data.wishlistShops.filter(ws => ws.wishlist_id === wid).map(ws => ws.shop?.name).filter(Boolean)
  const recosOf = (id: string, kind: 'friend' | 'expert' | 'gift' | 'photo' | 'vial') => data.recommendations.filter(r => r.whisky_id === id && r.recommender?.kind === kind)
  const dispName = (w: Whisky) => w.name_ko || w.name
  const catsOf = (id: string) => {
    const c: string[] = []
    const ps = purchasesOf(id)
    if (ps.some((p) => isBottle(p.form))) c.push('구매완료')
    if (ps.some((p) => !isBottle(p.form))) c.push('시음')
    if (recosOf(id, 'vial').length) c.push('바이알시음')
    if (recosOf(id, 'gift').length) c.push('지인선물')
    if (wishOf(id)) c.push('구매희망')
    if (recosOf(id, 'friend').length) c.push('지인추천')
    if (recosOf(id, 'expert').length) c.push('전문가추천')
    if (recosOf(id, 'photo').length) c.push('직접촬영')
    return c
  }

  // 필터 적용 목록
  const liquorList = LIQUORS.filter(l => data.whiskies.some(w => w.liquor === l))
  const styleList = STYLES.filter(s => data.whiskies.some(w => w.style === s))
  const filtered = data.whiskies.filter(w => {
    if (qName.trim() && !`${dispName(w)} ${w.name_en ?? ''}`.toLowerCase().includes(qName.trim().toLowerCase())) return false
    if (fLiquor && w.liquor !== fLiquor) return false
    if (fStyle && w.style !== fStyle) return false
    if (fCat && !catsOf(w.id).includes(fCat)) return false
    return true
  }).sort((a, b) => {
    if (sort === 'name') return dispName(a).localeCompare(dispName(b), 'ko')
    if (sort === 'seq') return (a.seq ?? 0) - (b.seq ?? 0) // 등록순(오름차순)
    return (b.updated_at || '').localeCompare(a.updated_at || '') // 최신변경순
  })
  const filterOn = !!(qName.trim() || fLiquor || fStyle || fCat)

  // 등록: 시세 카탈로그 매칭
  const nm = name.trim()
  const catHit = nm ? catalog.find(c => c.name === nm) : undefined
  const isNew = !!nm && !catHit

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">🍶 노트</h1>
          <p className="mt-1 text-sm text-neutral-500">위스키 · 보드카 · 리큐르 · 막걸리 등 · 구매완료/구매희망/지인·전문가추천 (시세 자동 수집·계산)</p>
        </div>
        <button
          onClick={syncSheet}
          disabled={syncing}
          title="구글시트 [위스키] 탭과 동기화"
          className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >{syncing ? '동기화 중…' : '🔄 시트 동기화'}</button>
      </div>

      {/* 위스키 등록 (사진 선택) */}
      <div className="mt-5 space-y-2">
        <div className="flex gap-2">
          <input
            list="catalog-names"
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void createWhisky() }}
            placeholder="주류명 — 시세에서 선택하거나 새로 입력"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <datalist id="catalog-names">
            {catalog.map(c => <option key={c.name} value={c.name} />)}
          </datalist>
          <button
            onClick={createWhisky}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >등록</button>
        </div>
        {/* 카탈로그 매칭 상태 */}
        {catHit && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">
            <span className="font-medium">✓ 시세 카탈로그</span>
            <span className="text-emerald-600">— 주종·구분·캐스크·피트 자동 적용:</span>
            {[catHit.liquor, catHit.style, catHit.cask, catHit.peat, catHit.peat_ppm ? `🔥${catHit.peat_ppm}ppm` : ''].filter(Boolean).map((v, i) => <span key={i} className="rounded bg-white px-1.5 py-0.5">{v}</span>)}
            {catHit.priceMin != null && <span className="text-emerald-500">· 최저 {won(catHit.priceMin)}</span>}
          </div>
        )}
        {isNew && (
          <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">🆕 새 항목 — 아래 가격을 입력하면 시세(주류시세)에도 함께 등록됩니다(선택).</div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {/* 카탈로그에 없을 때만 주종·구분 수동/AI + 시세가격 입력 */}
          {!catHit && <>
          <select
            value={liquor} onChange={e => setLiquor(e.target.value)}
            title="주종(미선택 시 AI 자동 판별)"
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">주종: AI 자동</option>
            {LIQUORS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={style} onChange={e => setStyle(e.target.value)}
            title="위스키 구분(미선택 시 AI 자동 판별, 위스키에 해당)"
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">구분: AI 자동</option>
            {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder="가격(선택)"
            className="w-24 rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
          <input value={shop} onChange={e => setShop(e.target.value)} placeholder="판매점(선택)"
            className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
          </>}
          <select
            value={cat} onChange={e => { setCat(e.target.value); setCatForm({}) }}
            title="카테고리(선택 시 함께 등록)"
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">카테고리: 미지정</option>
            <option value="buy">구매완료</option>
            <option value="gift">지인선물</option>
            <option value="wish">구매희망</option>
            <option value="friend">지인추천</option>
            <option value="expert">전문가추천</option>
            <option value="vial">바이알시음</option>
            <option value="photo">직접촬영</option>
          </select>
          <label className="cursor-pointer rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50">
            📷 사진 추가 (선택)
            <input type="file" accept="image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && (
            <span className="flex items-center gap-1.5 text-xs text-neutral-500">
              <img src={URL.createObjectURL(file)} alt="미리보기" className="h-8 w-8 rounded object-cover border border-neutral-200" />
              {file.name}
              <button onClick={() => setFile(null)} className="text-neutral-300 hover:text-red-500">✕</button>
            </span>
          )}
        </div>
        {/* 카테고리 선택 시 세부 입력(모두 선택 항목, 나중에 카드에서 추가/수정 가능) */}
        {cat && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50/60 p-2">
            {cat === 'buy' && <>
              <input type="date" value={catForm.date ?? ''} onChange={setCf('date')} title="구매일자(미입력 시 오늘)" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
              <input value={catForm.shop ?? ''} onChange={setCf('shop')} placeholder="구매상점" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
              <input type="number" value={catForm.price ?? ''} onChange={setCf('price')} placeholder="구매가격" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
            </>}
            {cat === 'wish' && <>
              <input value={catForm.shops ?? ''} onChange={setCf('shops')} placeholder="구매가능상점(쉼표구분)" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
              <input value={catForm.memo ?? ''} onChange={setCf('memo')} placeholder="메모" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
            </>}
            {cat === 'gift' && <>
              <input value={catForm.name ?? ''} onChange={setCf('name')} placeholder="선물한 지인(필수)" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
              <input value={catForm.reason ?? ''} onChange={setCf('reason')} placeholder="메모(계기 등)" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
            </>}
            {cat === 'friend' && <>
              <input value={catForm.name ?? ''} onChange={setCf('name')} placeholder="지인명(필수)" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
              <input value={catForm.reason ?? ''} onChange={setCf('reason')} placeholder="추천이유" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
            </>}
            {cat === 'expert' && <>
              <input value={catForm.name ?? ''} onChange={setCf('name')} placeholder="출처(필수)" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
              <input value={catForm.reason ?? ''} onChange={setCf('reason')} placeholder="추천이유" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
            </>}
            {cat === 'vial' && <>
              <input value={catForm.name ?? ''} onChange={setCf('name')} placeholder="출처(데일리샷·지인 등, 선택)" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
              <input value={catForm.reason ?? ''} onChange={setCf('reason')} placeholder="메모(선택)" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
            </>}
            {cat === 'photo' && <>
              <input value={catForm.reason ?? ''} onChange={setCf('reason')} placeholder="메모(장소 등, 선택)" className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs" />
            </>}
          </div>
        )}
      </div>

      {/* 필터 */}
      {data.whiskies.length > 0 && (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* 위스키명 콤보박스(검색+선택). 이름 짤림 방지 위해 넓게. */}
            <div className="flex-1 min-w-0">
              <input
                list="whisky-name-list"
                value={qName} onChange={e => setQName(e.target.value)}
                placeholder="🔍 주류명 선택/검색 (전체)"
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <datalist id="whisky-name-list">
                {data.whiskies.map(w => <option key={w.id} value={dispName(w)} />)}
              </datalist>
            </div>
            <select value={fLiquor} onChange={e => setFLiquor(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="">주종: 전체</option>
              {liquorList.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={fStyle} onChange={e => setFStyle(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="">구분: 전체</option>
              {styleList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={fCat} onChange={e => setFCat(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="">카테고리: 전체</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {filterOn && (
              <button onClick={() => { setQName(''); setFLiquor(''); setFStyle(''); setFCat('') }}
                className="rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-xs text-neutral-500 hover:bg-neutral-100">초기화</button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[11px] text-neutral-500">정렬:</span>
            {([['recent', '최신변경순'], ['seq', '등록순'], ['name', '이름순']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setSort(k)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${sort === k ? 'bg-amber-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{label}</button>
            ))}
            <span className="ml-auto text-[11px] text-neutral-500">{filtered.length} / {data.whiskies.length}개</span>
          </div>
        </div>
      )}

      {/* 위스키 목록 */}
      <div className="mt-4 space-y-4">
        {data.whiskies.length === 0 && <p className="text-sm text-neutral-400">아직 등록된 주류가 없습니다.</p>}
        {data.whiskies.length > 0 && filtered.length === 0 && <p className="text-sm text-neutral-400">조건에 맞는 주류가 없습니다.</p>}
        {filtered.map(w => {
          const st = statOf(w.id)
          const wl = wishOf(w.id)
          const buys = purchasesOf(w.id)
          const gifts = recosOf(w.id, 'gift')
          const friends = recosOf(w.id, 'friend')
          const experts = recosOf(w.id, 'expert')
          const vials = recosOf(w.id, 'vial')
          const photos = recosOf(w.id, 'photo')
          const buyCnt = buys.filter((p) => isBottle(p.form)).length
          const tasteCnt = buys.length - buyCnt
          const badges: string[] = []
          if (buyCnt) badges.push('구매완료')
          if (tasteCnt) badges.push('시음')
          if (vials.length) badges.push('바이알시음')
          if (gifts.length) badges.push('지인선물')
          if (wl) badges.push('구매희망')
          if (friends.length) badges.push('지인추천')
          if (experts.length) badges.push('전문가추천')
          if (photos.length) badges.push('직접촬영')
          return (
            <div key={w.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex gap-3">
                  {w.image_url && (
                    <img src={w.image_url} alt={w.name} className="h-16 w-16 shrink-0 rounded-md border border-neutral-200 object-cover" />
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {w.seq != null && <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white" title="등록번호">#{w.seq}</span>}
                      <Link href={`/whisky/${w.id}`} className="text-base font-semibold text-neutral-900 hover:text-amber-700 hover:underline">{w.name_ko || w.name}</Link>
                      {w.name_en && <span className="text-xs text-neutral-400">{w.name_en}</span>}
                      {w.liquor && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600">{w.liquor}</span>}
                      {w.style && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">{w.style}</span>}
                      <Link href={`/whisky/${w.id}`} className="text-[11px] text-amber-600 hover:underline">📝 노트</Link>
                      {badges.map(b => <span key={b} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">{b}</span>)}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      구매 {buyCnt}회 · 노트 {w.noteCount ?? 0}개 · 가격 {st?.price_count ?? 0}건 · 최저 {won(st?.price_min)} / 평균 {won(st?.price_avg)} / 최고 {won(st?.price_max)}
                    </div>
                    {w.updated_at && <div className="mt-0.5 text-[11px] text-neutral-400">🕒 {kst(w.updated_at)} 변경 (KST)</div>}
                  </div>
                </div>
                <button onClick={() => confirm(`'${w.name}' 삭제?`) && post('/api/whisky', { id: w.id }, 'DELETE')} className="text-xs text-neutral-300 hover:text-red-500">삭제</button>
              </div>

              {/* 상세 (각 기록 ✕ 삭제) */}
              {buys.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-neutral-600">
                  {buys.map(p => <li key={p.id} className="group flex items-center gap-1">· {isBottle(p.form) ? '구매' : '시음'} {p.purchase_date} · {p.shop?.name ?? '상점미상'}{p.volume_ml ? ` · ${p.volume_ml}ml` : ''} · {p.price === 0 ? 'free' : won(p.price)}<button onClick={() => post('/api/purchase', { id: p.id }, 'DELETE')} className="text-neutral-300 hover:text-red-500" title="삭제">✕</button></li>)}
                </ul>
              )}
              {gifts.map(r => <div key={r.id} className="mt-1 flex items-center gap-1 text-xs text-neutral-600">· 지인선물 [{r.recommender?.name}] {r.reason ?? ''}<button onClick={() => post('/api/recommendation', { id: r.id }, 'DELETE')} className="text-neutral-300 hover:text-red-500" title="삭제">✕</button></div>)}
              {wl && <div className="mt-2 flex items-center gap-1 text-xs text-neutral-600">· 구매희망 {wishShopsOf(wl.id).length ? `(가능상점: ${wishShopsOf(wl.id).join(', ')})` : ''} {wl.memo ? `— ${wl.memo}` : ''}<button onClick={() => post('/api/wishlist', { whisky_id: w.id }, 'DELETE')} className="text-neutral-300 hover:text-red-500" title="삭제">✕</button></div>}
              {friends.map(r => <div key={r.id} className="mt-1 flex items-center gap-1 text-xs text-neutral-600">· 지인추천 [{r.recommender?.name}] {r.reason ?? ''}<button onClick={() => post('/api/recommendation', { id: r.id }, 'DELETE')} className="text-neutral-300 hover:text-red-500" title="삭제">✕</button></div>)}
              {experts.map(r => <div key={r.id} className="mt-1 flex items-center gap-1 text-xs text-neutral-600">· 전문가추천 [{r.recommender?.name}] {r.reason ?? ''}<button onClick={() => post('/api/recommendation', { id: r.id }, 'DELETE')} className="text-neutral-300 hover:text-red-500" title="삭제">✕</button></div>)}
              {vials.map(r => <div key={r.id} className="mt-1 flex items-center gap-1 text-xs text-neutral-600">· 바이알시음{r.recommender?.name && r.recommender.name !== '바이알시음' ? ` [${r.recommender.name}]` : ''}{r.reason ? ` — ${r.reason}` : ''}<button onClick={() => post('/api/recommendation', { id: r.id }, 'DELETE')} className="text-neutral-300 hover:text-red-500" title="삭제">✕</button></div>)}
              {photos.map(r => <div key={r.id} className="mt-1 flex items-center gap-1 text-xs text-neutral-600">· 직접촬영{r.reason ? ` — ${r.reason}` : ''}<button onClick={() => post('/api/recommendation', { id: r.id }, 'DELETE')} className="text-neutral-300 hover:text-red-500" title="삭제">✕</button></div>)}

              {/* 액션 (드롭다운) */}
              <div className="mt-3">
                <select
                  value={openForm?.id === w.id ? openForm.mode : ''}
                  onChange={(e) => setOpenForm(e.target.value ? { id: w.id, mode: e.target.value } : null)}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">＋ 기록 추가…</option>
                  <option value="buy">구매완료</option>
                  <option value="gift">지인선물</option>
                  <option value="wish">구매희망</option>
                  <option value="friend">지인추천</option>
                  <option value="expert">전문가추천</option>
                  <option value="vial">바이알시음</option>
                  <option value="photo">직접촬영</option>
                </select>
              </div>

              {openForm?.id === w.id && <InlineForm mode={openForm.mode} whiskyId={w.id} busy={busy} post={post} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InlineForm({ mode, whiskyId, busy, post }: { mode: string; whiskyId: string; busy: boolean; post: (p: string, b: unknown, m?: string) => Promise<void> }) {
  const [f, setF] = useState<Record<string, string>>({})
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }))
  const input = (k: string, ph: string, type = 'text') => (
    <input type={type} value={f[k] ?? ''} onChange={set(k)} placeholder={ph}
      className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500" />
  )
  const submit = () => {
    if (mode === 'buy') post('/api/purchase', { whisky_id: whiskyId, shop_name: f.shop, purchase_date: f.date, price: f.price })
    else if (mode === 'wish') post('/api/wishlist', { whisky_id: whiskyId, memo: f.memo, shop_names: (f.shops ?? '').split(',').map(s => s.trim()).filter(Boolean) })
    else post('/api/recommendation', { whisky_id: whiskyId, kind: mode, name: f.name, reason: f.reason })
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-neutral-50 p-2">
      {mode === 'buy' && <>{input('date', '구매일자', 'date')}{input('shop', '구매상점')}{input('price', '구매가격', 'number')}</>}
      {mode === 'gift' && <>{input('name', '선물한 지인')}{input('reason', '메모(계기 등)')}</>}
      {mode === 'wish' && <>{input('shops', '구매가능상점(쉼표구분)')}{input('memo', '메모')}</>}
      {mode === 'friend' && <>{input('name', '지인명')}{input('reason', '추천이유')}</>}
      {mode === 'expert' && <>{input('name', '출처')}{input('reason', '추천이유')}</>}
      {mode === 'vial' && <>{input('name', '출처(선택)')}{input('reason', '메모(선택)')}</>}
      {mode === 'photo' && <>{input('reason', '메모(장소 등, 선택)')}</>}
      <button onClick={submit} disabled={busy} className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs text-white hover:bg-neutral-900 disabled:opacity-50">저장</button>
    </div>
  )
}
