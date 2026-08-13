'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const TYPES = ['유료', '무료']
const VISITS = ['방문예정', '방문완료']
const OPTIONS = ['전용잔', '얼음잔', '얼음 제공', '냉장보관', '디캔터', '잔 무료']       // 서비스 옵션 체크
const RATING_DIMS = ['맛', '분위기', '응대', '쉐어링', '가성비']                        // 부문 평점
const won = (n: number | null | undefined) => (n == null ? '' : `${n.toLocaleString()}원`)
// 종합 평점 = 부문 평점(입력된 것) 평균, 0.5 단위
const ratingAvg = (sr: Record<string, number> | null | undefined) => {
  const vals = RATING_DIMS.map((d) => sr?.[d]).filter((v): v is number => typeof v === 'number' && v > 0)
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 2) / 2 : 0
}

type Place = {
  id: string; name: string; region: string | null; address: string | null; corkage_type: string | null; corkage_detail: string | null
  visit_status: string | null; rating: number | null; service_note: string | null; memo: string | null; phone: string | null; url: string | null; image_url: string | null
  options: string[] | null; service_ratings: Record<string, number> | null; cuisine: string | null
}
type Img = { id: string; url: string; is_primary: boolean }
type Comment = { id: string; author: string | null; body: string; created_at: string; updated_at: string; service_ratings: Record<string, number> | null }

const kst = (iso?: string | null) => {
  if (!iso) return ''
  const p = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`
}
// 별점 5개(읽기전용 or 클릭입력: 별 클릭=정수, 재클릭=0.5)
function Stars5({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const on = value >= i, half = !on && value >= i - 0.5
        const cls = `text-sm leading-none ${on || half ? 'text-amber-500' : 'text-neutral-300'} ${onChange ? 'hover:text-amber-400' : ''}`
        const style = half ? { clipPath: 'inset(0 50% 0 0)' as const } : undefined
        return onChange
          ? <button key={i} type="button" onClick={() => onChange(value === i ? i - 0.5 : i)} className={cls} style={style}>★</button>
          : <span key={i} className={cls} style={style}>★</span>
      })}
    </span>
  )
}
// 정보 편집 행(모듈 스코프 — 컴포넌트 내부 정의 시 입력 포커스 유실)
const inp = 'w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400'
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-neutral-100 py-2">
      <span className="w-20 shrink-0 pt-1 text-xs font-medium text-neutral-500">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
// 댓글들의 부문 평점 집계(부문별 평균 + 종합 + 평점 남긴 사람 수)
function aggregateComments(comments: { service_ratings: Record<string, number> | null }[]) {
  const sum: Record<string, number> = {}, cnt: Record<string, number> = {}
  for (const c of comments) {
    const sr = c.service_ratings; if (!sr) continue
    for (const d of RATING_DIMS) { const v = sr[d]; if (typeof v === 'number' && v > 0) { sum[d] = (sum[d] ?? 0) + v; cnt[d] = (cnt[d] ?? 0) + 1 } }
  }
  const perDim: Record<string, number> = {}
  for (const d of RATING_DIMS) if (cnt[d]) perDim[d] = sum[d] / cnt[d]
  const vals = Object.values(perDim)
  const overall = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 2) / 2 : 0
  const raterCount = comments.filter((c) => c.service_ratings && RATING_DIMS.some((d) => (c.service_ratings![d] ?? 0) > 0)).length
  return { perDim, overall, raterCount }
}
// 댓글/장소 공용: 부문 평점 입력 그리드
function DimRatings({ ratings, onChange }: { ratings: Record<string, number> | null; onChange: (r: Record<string, number>) => void }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {RATING_DIMS.map((d) => (
        <span key={d} className="inline-flex items-center gap-1">
          <span className="text-[11px] text-neutral-500">{d}</span>
          <Stars5 value={ratings?.[d] ?? 0} onChange={(v) => onChange({ ...(ratings ?? {}), [d]: v })} />
        </span>
      ))}
    </div>
  )
}

export default function CorkageDetail() {
  const { id } = useParams<{ id: string }>()
  const [p, setP] = useState<Place | null>(null)
  const [imgs, setImgs] = useState<Img[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [copts, setCopts] = useState<{ 무료: string[]; 유료: string[] }>({ 무료: [], 유료: [] })
  const [optMgr, setOptMgr] = useState(false)
  const [newOpt, setNewOpt] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [cAuthor, setCAuthor] = useState('')
  const [cBody, setCBody] = useState('')
  const [cRatings, setCRatings] = useState<Record<string, number>>({})
  const [cBusy, setCBusy] = useState(false)
  const [editC, setEditC] = useState<{ id: string; author: string; body: string; ratings: Record<string, number> } | null>(null)

  const load = useCallback(async () => {
    const d = await (await fetch(`${BP}/api/corkage/${id}`)).json()
    setP(d.place); setImgs(d.images ?? []); setComments(d.comments ?? [])
    setDirty(false)
  }, [id])
  const loadOpts = useCallback(async () => {
    try { const j = await (await fetch(`${BP}/api/corkage/options`, { cache: 'no-store' })).json(); setCopts({ 무료: j.무료 ?? [], 유료: j.유료 ?? [] }) } catch { /* ignore */ }
  }, [])
  useEffect(() => { void loadOpts() }, [loadOpts])
  const addOpt = async (kind: string) => {
    const v = newOpt.trim(); if (!v) return
    await fetch(`${BP}/api/corkage/options`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, value: v }) })
    setNewOpt(''); await loadOpts()
  }
  const delOpt = async (kind: string, value: string) => {
    await fetch(`${BP}/api/corkage/options`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, value }) })
    await loadOpts()
  }
  const reloadComments = useCallback(async () => {
    const d = await (await fetch(`${BP}/api/corkage/${id}`)).json(); setComments(d.comments ?? [])
  }, [id])
  const addComment = async () => {
    if (!cBody.trim()) return
    setCBusy(true)
    try {
      await fetch(`${BP}/api/corkage/${id}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: cAuthor, body: cBody, service_ratings: cRatings }) })
      setCBody(''); setCRatings({}); await reloadComments()
    } finally { setCBusy(false) }
  }
  const saveComment = async () => {
    if (!editC || !editC.body.trim()) return
    await fetch(`${BP}/api/corkage/${id}/comment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commentId: editC.id, author: editC.author, body: editC.body, service_ratings: editC.ratings }) })
    setEditC(null); await reloadComments()
  }
  const delComment = async (commentId: string) => {
    if (!confirm('댓글을 삭제할까요?')) return
    await fetch(`${BP}/api/corkage/${id}/comment`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commentId }) })
    await reloadComments()
  }
  useEffect(() => { void load() }, [load])

  const upd = (patch: Partial<Place>) => { setP((prev) => (prev ? { ...prev, ...patch } : prev)); setDirty(true) }

  const save = async () => {
    if (!p) return
    setSaving(true)
    try {
      await fetch(`${BP}/api/corkage/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name: p.name, region: p.region, address: p.address, corkage_type: p.corkage_type, corkage_detail: p.corkage_detail,
        visit_status: p.visit_status, options: p.options ?? [], memo: p.memo, phone: p.phone, url: p.url, cuisine: p.cuisine,
      }) })
      setDirty(false)
    } finally { setSaving(false) }
  }

  // 여러 장 순차 업로드
  const uploadImgs = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    try {
      for (const f of files) { const fd = new FormData(); fd.append('image', f); await fetch(`${BP}/api/corkage/${id}/image`, { method: 'POST', body: fd }) }
      const d = await (await fetch(`${BP}/api/corkage/${id}`)).json(); setImgs(d.images ?? [])
    } finally { setUploading(false) }
  }
  const setPrimary = async (imageId: string) => { await fetch(`${BP}/api/corkage/${id}/image`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId }) }); const d = await (await fetch(`${BP}/api/corkage/${id}`)).json(); setImgs(d.images ?? []) }
  const delImg = async (imageId: string) => { await fetch(`${BP}/api/corkage/${id}/image`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageId }) }); const d = await (await fetch(`${BP}/api/corkage/${id}`)).json(); setImgs(d.images ?? []) }

  if (!p) return <div className="text-sm text-neutral-400">불러오는 중...</div>

  const agg = aggregateComments(comments) // 나 포함 댓글 남긴 사람들 부문 평점 평균

  return (
    <div className="mx-auto max-w-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b-2 border-amber-800/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-neutral-800 px-2.5 py-1 text-sm font-bold text-white">🍽️</span>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900" style={{ fontFamily: 'ui-serif, serif' }}>콜키지 장소</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={save} disabled={!dirty || saving} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-40">{saving ? '저장 중…' : dirty ? '💾 저장' : '저장됨'}</button>
          <Link href="/corkage" className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50">← 목록</Link>
        </div>
      </div>

      {/* 사진 */}
      <div className="mt-3">
        {imgs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {imgs.map((im) => (
              <div key={im.id} className="relative">
                <img src={im.url} alt="" onClick={() => setLightbox(im.url)} className={`h-24 w-24 cursor-pointer rounded-lg border object-cover ${im.is_primary ? 'border-amber-400 ring-2 ring-amber-200' : 'border-neutral-200'}`} />
                <div className="absolute inset-x-0 bottom-0 flex justify-between rounded-b-lg bg-black/40 px-1 py-0.5 text-[10px] text-white">
                  <button onClick={() => setPrimary(im.id)} title="대표로">{im.is_primary ? '★대표' : '☆'}</button>
                  <button onClick={() => delImg(im.id)} title="삭제">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <label className="inline-block cursor-pointer rounded-md border border-dashed border-amber-200 px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50">
          {uploading ? '업로드 중…' : '📷 사진 추가 (여러 장 가능)'}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void uploadImgs(fs); e.target.value = '' }} />
        </label>
      </div>

      {/* 정보 편집 */}
      <div className="mt-3 rounded-xl border border-neutral-200 bg-white px-3">
        <Row label="장소명"><input value={p.name} onChange={(e) => upd({ name: e.target.value })} className={inp} /></Row>
        <Row label="지역"><input value={p.region ?? ''} onChange={(e) => upd({ region: e.target.value })} placeholder="예: 서울 강남" className={inp} /></Row>
        <Row label="주소"><input value={p.address ?? ''} onChange={(e) => upd({ address: e.target.value })} className={inp} /></Row>
        <Row label="메인 요리"><input value={p.cuisine ?? ''} onChange={(e) => upd({ cuisine: e.target.value })} placeholder="예: 육류, 고기요리" className={inp} /></Row>
        <Row label="콜키지">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={p.corkage_type ?? ''} onChange={(e) => upd({ corkage_type: e.target.value || null })} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm"><option value="">(미지정)</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              {(p.corkage_type === '무료' || p.corkage_type === '유료') && <>
                <input list="ck-detail-opts" value={p.corkage_detail ?? ''} onChange={(e) => upd({ corkage_detail: e.target.value || null })} placeholder={p.corkage_type === '무료' ? '무제한/1병/예약시…' : '인당 1만원/2만원…'} className="w-44 rounded-md border border-neutral-200 px-2 py-1 text-sm" />
                <datalist id="ck-detail-opts">{(copts[p.corkage_type as '무료' | '유료'] ?? []).map((v) => <option key={v} value={v} />)}</datalist>
                <button type="button" onClick={() => setOptMgr((v) => !v)} className="rounded border border-neutral-200 px-1.5 py-1 text-[11px] text-neutral-500 hover:bg-neutral-50" title="드롭다운 값 관리">⚙</button>
              </>}
            </div>
            {optMgr && (p.corkage_type === '무료' || p.corkage_type === '유료') && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-2 text-[11px]">
                <span className="font-medium text-neutral-500">{p.corkage_type} 프리셋</span>
                {(copts[p.corkage_type as '무료' | '유료'] ?? []).map((v) => (
                  <span key={v} className="inline-flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-neutral-600 ring-1 ring-neutral-200">
                    {v}<button onClick={() => void delOpt(p.corkage_type as string, v)} className="text-neutral-300 hover:text-red-500">✕</button>
                  </span>
                ))}
                <input value={newOpt} onChange={(e) => setNewOpt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addOpt(p.corkage_type as string) }} placeholder="추가" className="w-24 rounded border border-neutral-200 px-1.5 py-0.5" />
                <button onClick={() => void addOpt(p.corkage_type as string)} className="rounded bg-neutral-700 px-1.5 py-0.5 text-white hover:bg-neutral-800">＋</button>
              </div>
            )}
          </div>
        </Row>
        <Row label="방문상태">
          <select value={p.visit_status ?? '방문예정'} onChange={(e) => upd({ visit_status: e.target.value })} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm">{VISITS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        </Row>
        <Row label="전화"><input value={p.phone ?? ''} onChange={(e) => upd({ phone: e.target.value })} className={inp} /></Row>
        <Row label="링크"><input value={p.url ?? ''} onChange={(e) => upd({ url: e.target.value })} placeholder="지도·예약 링크" className={inp} />{p.url && <a href={p.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[11px] text-amber-600 hover:underline">🔗 열기</a>}</Row>
      </div>

      {/* 서비스 옵션 */}
      <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
        <p className="mb-1.5 text-xs font-semibold text-amber-800">서비스 옵션</p>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONS.map((o) => {
            const on = (p.options ?? []).includes(o)
            return (
              <button key={o} onClick={() => { const set = new Set(p.options ?? []); on ? set.delete(o) : set.add(o); upd({ options: Array.from(set) }) }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${on ? 'bg-amber-600 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                {on ? '✓ ' : ''}{o}
              </button>
            )
          })}
        </div>
        <p className="mb-1 mt-3 text-xs font-semibold text-neutral-600">메모</p>
        <textarea value={p.memo ?? ''} onChange={(e) => upd({ memo: e.target.value })} rows={2} placeholder="가져갈 술·예약 팁·주차·기타 후기 등" className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />
      </div>

      {/* 부문 평점 (댓글 남긴 사람들 평균 집계, 읽기전용) */}
      <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <p className="text-xs font-semibold text-amber-800">부문 평점</p>
          <span className="text-[11px] text-neutral-400">종합 {agg.overall.toFixed(1)}</span>
          <Stars5 value={agg.overall} />
          <span className="text-[11px] text-neutral-400">({agg.raterCount}명 평균)</span>
        </div>
        {agg.raterCount === 0 ? (
          <p className="text-[11px] text-neutral-400">아직 평점이 없습니다 — 아래 댓글에서 평점을 남겨보세요.</p>
        ) : (
          <div className="space-y-1">
            {RATING_DIMS.map((d) => {
              const v = agg.perDim[d] ?? 0
              return (
                <div key={d} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-neutral-600">{d}</span>
                  <Stars5 value={v} />
                  <span className="w-8 text-[11px] tabular-nums text-neutral-400">{v ? v.toFixed(1) : '-'}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 댓글 (누구나 작성/수정/삭제 + 부문 평점 → 위 종합에 반영) */}
      <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-amber-800">💬 댓글</span><span className="text-[11px] text-neutral-400">{comments.length}</span>
        </div>
        {comments.length > 0 && (
          <ul className="mb-2 space-y-2">
            {comments.map((c) => {
              const cr = ratingAvg(c.service_ratings)
              return (
              <li key={c.id} className="rounded-lg bg-neutral-50 p-2">
                {editC?.id === c.id ? (
                  <div className="space-y-1.5">
                    <input value={editC.author} onChange={(e) => setEditC({ ...editC, author: e.target.value })} placeholder="이름" className="w-28 rounded border border-neutral-200 px-2 py-1 text-xs" />
                    <textarea value={editC.body} onChange={(e) => setEditC({ ...editC, body: e.target.value })} rows={2} className="w-full rounded border border-neutral-200 px-2 py-1 text-sm" />
                    <DimRatings ratings={editC.ratings} onChange={(r) => setEditC({ ...editC, ratings: r })} />
                    <div className="flex gap-1.5">
                      <button onClick={saveComment} className="rounded bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-700">저장</button>
                      <button onClick={() => setEditC(null)} className="rounded border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500">취소</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5"><span className="text-xs font-medium text-neutral-700">{c.author || '익명'}</span>{cr > 0 && <span className="flex items-center gap-0.5"><Stars5 value={cr} /><span className="text-[11px] text-neutral-400">{cr.toFixed(1)}</span></span>}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                        <span>{kst(c.created_at)}{c.updated_at !== c.created_at ? ' (수정)' : ''}</span>
                        <button onClick={() => setEditC({ id: c.id, author: c.author ?? '', body: c.body, ratings: c.service_ratings ?? {} })} className="hover:text-amber-600">✎</button>
                        <button onClick={() => delComment(c.id)} className="hover:text-red-500">✕</button>
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800">{c.body}</p>
                    {cr > 0 && <p className="mt-1 text-[11px] text-neutral-400">{RATING_DIMS.filter((d) => c.service_ratings?.[d]).map((d) => `${d} ${c.service_ratings![d]}`).join(' · ')}</p>}
                  </>
                )}
              </li>
              )
            })}
          </ul>
        )}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-start gap-1.5">
            <input value={cAuthor} onChange={(e) => setCAuthor(e.target.value)} placeholder="이름(선택)" className="w-28 rounded-md border border-neutral-200 px-2 py-1.5 text-sm" />
            <textarea value={cBody} onChange={(e) => setCBody(e.target.value)} rows={1} placeholder="댓글을 남겨보세요" className="min-w-40 flex-1 rounded-md border border-neutral-200 px-2 py-1.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400" />
            <button onClick={addComment} disabled={cBusy || !cBody.trim()} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{cBusy ? '…' : '등록'}</button>
          </div>
          <div className="flex items-center gap-1.5"><span className="text-[11px] text-neutral-400">평점(선택):</span><DimRatings ratings={cRatings} onChange={setCRatings} /></div>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
