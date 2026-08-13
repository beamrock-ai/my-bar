'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react'

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

type Term = { id: string; term: string; term_en: string | null; category: string | null; definition: string; source: string | null; image_url: string | null }

export default function GlossaryPage() {
  const [terms, setTerms] = useState<Term[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('전체')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editF, setEditF] = useState<Partial<Term>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [addF, setAddF] = useState({ term: '', term_en: '', category: '', definition: '', source: '' })
  const [busy, setBusy] = useState(false)
  const [showYt, setShowYt] = useState(false)
  const [ytUrl, setYtUrl] = useState('')
  const [ytTranscript, setYtTranscript] = useState('')
  const [ytNeed, setYtNeed] = useState(false)
  const [ytBusy, setYtBusy] = useState(false)

  const load = useCallback(async () => {
    const d = await (await fetch(`${BP}/api/term`)).json()
    setTerms(d.terms ?? [])
  }, [])
  useEffect(() => { void load() }, [load])
  // ?q= 파라미터로 초기 검색어 세팅(노트 특성 키워드 → 용어사전 링크)
  useEffect(() => { const p = new URLSearchParams(window.location.search).get('q'); if (p) setQ(p) }, [])

  const categories = useMemo(() => Array.from(new Set(terms.map((t) => t.category).filter(Boolean))) as string[], [terms])
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return terms.filter((t) => (cat === '전체' || t.category === cat) && (!qq || t.term.toLowerCase().includes(qq) || (t.term_en ?? '').toLowerCase().includes(qq) || t.definition.toLowerCase().includes(qq)))
  }, [terms, q, cat])
  const grouped = useMemo(() => {
    const g: Record<string, Term[]> = {}
    for (const t of filtered) { const c = t.category ?? '기타'; (g[c] ||= []).push(t) }
    return g
  }, [filtered])

  const addTerm = async () => {
    if (!addF.term.trim() || !addF.definition.trim()) { alert('용어와 설명은 필수입니다'); return }
    setBusy(true)
    try {
      const res = await fetch(`${BP}/api/term`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addF) })
      const d = await res.json()
      if (!res.ok) { alert(d.error ?? '추가 실패'); return }
      setAddF({ term: '', term_en: '', category: '', definition: '', source: '' }); setShowAdd(false); await load()
    } finally { setBusy(false) }
  }
  const saveEdit = async (id: string) => {
    await fetch(`${BP}/api/term/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editF) })
    setEditId(null); await load()
  }
  const delTerm = async (id: string) => {
    if (!confirm('이 용어를 삭제할까요?')) return
    await fetch(`${BP}/api/term/${id}`, { method: 'DELETE' }); await load()
  }
  const uploadImg = async (id: string, file: File) => {
    const fd = new FormData(); fd.append('image', file)
    setBusy(true)
    try { await fetch(`${BP}/api/term/${id}/image`, { method: 'POST', body: fd }); await load() } finally { setBusy(false) }
  }
  const delImg = async (id: string) => { await fetch(`${BP}/api/term/${id}/image`, { method: 'DELETE' }); await load() }
  const ytImport = async () => {
    if (!ytUrl.trim() && !ytTranscript.trim()) { alert('유튜브 링크를 입력하세요'); return }
    setYtBusy(true)
    try {
      const res = await fetch(`${BP}/api/term/from-youtube`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: ytUrl, transcript: ytTranscript }) })
      const d = await res.json()
      if (d.needTranscript) { setYtNeed(true); alert(d.error); return }
      if (!res.ok || d.error) { alert(d.error ?? '실패'); return }
      alert(`용어 ${d.added}개 추가 (추출 ${d.extracted}개)`)
      setYtUrl(''); setYtTranscript(''); setYtNeed(false); setShowYt(false); await load()
    } finally { setYtBusy(false) }
  }

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900">📖 위스키 용어사전</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowYt((v) => !v)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100">🔗 유튜브로 추가</button>
          <button onClick={() => setShowAdd((v) => !v)} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">＋ 용어 추가</button>
        </div>
      </div>
      <p className="mt-1 text-sm text-neutral-500">전체 {terms.length}개 · 검색과 분류 색인으로 찾아보세요.</p>

      {/* 검색 */}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 용어·영문·설명 검색"
        className="mt-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />

      {/* 분류 색인 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {['전체', ...categories].map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`rounded-full px-3 py-1 text-xs ${cat === c ? 'bg-amber-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{c}</button>
        ))}
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
          <div className="flex flex-wrap gap-2">
            <input value={addF.term} onChange={(e) => setAddF({ ...addF, term: e.target.value })} placeholder="용어" className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            <input value={addF.term_en} onChange={(e) => setAddF({ ...addF, term_en: e.target.value })} placeholder="영문" className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            <input list="cats" value={addF.category} onChange={(e) => setAddF({ ...addF, category: e.target.value })} placeholder="분류" className="w-28 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <textarea value={addF.definition} onChange={(e) => setAddF({ ...addF, definition: e.target.value })} placeholder="설명" rows={2} className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <input value={addF.source} onChange={(e) => setAddF({ ...addF, source: e.target.value })} placeholder="출처" className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            <button onClick={addTerm} disabled={busy} className="rounded bg-amber-600 px-4 py-1.5 text-sm text-white disabled:opacity-50">추가</button>
          </div>
        </div>
      )}

      {/* 유튜브로 추가 */}
      {showYt && (
        <div className="mt-3 space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-3">
          <div className="flex gap-2">
            <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="유튜브 링크 (예: https://youtu.be/GWmv6_Bc67g)" className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            <button onClick={ytImport} disabled={ytBusy} className="rounded bg-red-500 px-4 py-1.5 text-sm text-white disabled:opacity-50">{ytBusy ? '분석 중…' : '가져오기'}</button>
          </div>
          {ytNeed && (
            <div className="space-y-1">
              <p className="text-[11px] text-red-500">자막 자동수집 실패 — 유튜브 자막/스크립트를 복사해 아래에 붙여넣고 다시 [가져오기]</p>
              <textarea value={ytTranscript} onChange={(e) => setYtTranscript(e.target.value)} rows={5} placeholder="영상 자막/내용 붙여넣기" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            </div>
          )}
          <p className="text-[10px] text-neutral-400">링크에서 자막을 가져와 위스키 용어를 자동 추출·추가합니다(출처=영상). 자동수집이 막히면 자막을 붙여넣어 주세요.</p>
        </div>
      )}

      {/* 용어 목록 (분류별) */}
      <div className="mt-5 space-y-5">
        {filtered.length === 0 && <p className="text-sm text-neutral-400">검색 결과가 없습니다.</p>}
        {Object.entries(grouped).map(([c, list]) => (
          <div key={c}>
            <h2 className="mb-1.5 text-sm font-bold text-amber-800">{c} <span className="text-xs font-normal text-neutral-400">{list.length}</span></h2>
            <div className="space-y-2">
              {list.map((t) => (
                <div key={t.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                  {editId === t.id ? (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        <input value={editF.term ?? ''} onChange={(e) => setEditF({ ...editF, term: e.target.value })} className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" placeholder="용어" />
                        <input value={editF.term_en ?? ''} onChange={(e) => setEditF({ ...editF, term_en: e.target.value })} className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" placeholder="영문" />
                        <input value={editF.category ?? ''} onChange={(e) => setEditF({ ...editF, category: e.target.value })} className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm" placeholder="분류" />
                      </div>
                      <textarea value={editF.definition ?? ''} onChange={(e) => setEditF({ ...editF, definition: e.target.value })} rows={2} className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />
                      <input value={editF.source ?? ''} onChange={(e) => setEditF({ ...editF, source: e.target.value })} className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" placeholder="출처" />
                      <div className="flex gap-2 text-xs">
                        <button onClick={() => saveEdit(t.id)} className="rounded bg-neutral-800 px-3 py-1 text-white">저장</button>
                        <button onClick={() => setEditId(null)} className="text-neutral-400">취소</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      {t.image_url && <button onClick={() => setLightbox(t.image_url)}><img src={t.image_url} alt="" className="h-14 w-14 shrink-0 rounded object-cover ring-1 ring-neutral-200" /></button>}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-sm font-semibold text-neutral-900">{t.term}</span>
                          {t.term_en && <span className="text-xs text-neutral-400">{t.term_en}</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-neutral-700">{t.definition}</p>
                        {t.source && <p className="mt-1 text-[10px] text-neutral-400">출처: {t.source}</p>}
                        <div className="mt-1 flex gap-2 text-[11px]">
                          <label className="cursor-pointer text-amber-600 hover:underline">📷 이미지
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImg(t.id, f); e.target.value = '' }} />
                          </label>
                          {t.image_url && <button onClick={() => delImg(t.id)} className="text-neutral-400 hover:underline">이미지삭제</button>}
                          <button onClick={() => { setEditId(t.id); setEditF(t) }} className="text-neutral-500 hover:underline">편집</button>
                          <button onClick={() => delTerm(t.id)} className="text-neutral-300 hover:text-red-500">삭제</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  )
}
