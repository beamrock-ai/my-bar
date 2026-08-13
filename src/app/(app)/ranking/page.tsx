'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BESTSELLERS, SINGLE_MALT, SOURCES, MARKET_YEAR, flagOf } from '@/lib/whisky-market'

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

type Row = {
  id: string; name: string; name_ko: string | null; name_en: string | null; image_url: string | null
  liquor: string | null; style: string | null
  rating: number | null; neat: number | null; rocks: number | null; highball: number | null; ratingCount: number
}
type Metric = 'rating' | 'neat' | 'rocks' | 'highball'
const METRICS: [Metric, string, string][] = [
  ['rating', '평점', '🛢️'], ['neat', '니트', '🥃'], ['rocks', '온더락', '🧊'], ['highball', '하이볼', '🥤'],
]
const rankColor = ['text-amber-500', 'text-neutral-400', 'text-orange-400'] // 1·2·3위

// 상위 섹션(탭): 내 평점 + 공신력 있는 개별 위스키 판매 순위(인도 제외)
type Section = 'mine' | 'brand' | 'malt'
const SECTIONS: [Section, string][] = [
  ['mine', '⭐ 내 평점'], ['brand', '🏷️ 베스트셀러'], ['malt', '🥃 싱글몰트'],
]

// 0~5 값(0.5 단위) → 아이콘 5개(꽉/반/빈)
function IconRow({ value, icon }: { value: number; icon: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const on = value >= i
        const half = !on && value >= i - 0.5
        return <span key={i} className={`text-sm leading-none ${on ? 'opacity-100' : half ? 'opacity-100' : 'opacity-20 grayscale'}`} style={half ? { clipPath: 'inset(0 50% 0 0)' } : undefined}>{icon}</span>
      })}
      <span className="ml-1 text-sm font-semibold tabular-nums text-neutral-700">{value.toFixed(1)}</span>
    </span>
  )
}

// 공신력 순위: 이름·부가라벨·값(단위)·비율바. value 없으면 순위만(판매량 비공개)
function MarketList({ rows, unit, source, year = MARKET_YEAR }: { rows: { label: string; sub?: string; value?: number; flag?: string }[]; unit: string; source: { label: string; url: string }; year?: number }) {
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1)
  return (
    <div className="mt-4">
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const rank = i + 1
          return (
            <div key={r.label} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
              <span className={`w-7 shrink-0 text-center text-lg font-bold tabular-nums ${rankColor[rank - 1] ?? 'text-neutral-300'}`}>{rank}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {r.flag && <span className="text-base leading-none">{r.flag}</span>}
                  <span className="truncate text-sm font-semibold text-neutral-900">{r.label}</span>
                  {r.sub && <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500">{r.sub}</span>}
                </div>
                {r.value != null && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
                  </div>
                )}
              </div>
              {r.value != null
                ? <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-800">{r.value.toLocaleString()}<span className="ml-0.5 text-[11px] font-normal text-neutral-400">{unit}</span></span>
                : <span className="shrink-0 text-[11px] text-neutral-300">비공개</span>}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-neutral-400">
        기준 {year}년 · 출처: <a href={source.url} target="_blank" rel="noreferrer" className="text-amber-600 hover:underline">{source.label}</a>
      </p>
    </div>
  )
}

export default function RankingPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [section, setSection] = useState<Section>('mine')
  const [metric, setMetric] = useState<Metric>('rating')
  const [fLiquor, setFLiquor] = useState('')
  // 베스트셀러: 국가 × 연도 선택
  const [country, setCountry] = useState(Object.keys(BESTSELLERS)[0])
  const [year, setYear] = useState<number>(Math.max(...BESTSELLERS[Object.keys(BESTSELLERS)[0]].map((s) => s.year)))

  useEffect(() => {
    void (async () => {
      const res = await fetch(`${BP}/api/ranking`)
      setRows((await res.json()).rankings ?? [])
    })()
  }, [])

  const liquorList = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.liquor).filter(Boolean))) as string[], [rows])

  const ranked = useMemo(() => {
    if (!rows) return []
    return rows
      .filter((r) => (fLiquor ? r.liquor === fLiquor : true))
      .filter((r) => typeof r[metric] === 'number' && (r[metric] as number) > 0)
      .sort((a, b) => (b[metric] as number) - (a[metric] as number))
  }, [rows, metric, fLiquor])

  const icon = METRICS.find((m) => m[0] === metric)![2]

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-neutral-900">🏆 순위</h1>
      <p className="mt-1 text-sm text-neutral-500">내 평점(작성자 프로필 평균) + 공신력 있는 세계 판매량 통계</p>

      {/* 상위 섹션 탭 */}
      <div className="mt-4 flex flex-wrap gap-1.5 border-b border-neutral-200 pb-2">
        {SECTIONS.map(([k, label]) => (
          <button key={k} onClick={() => setSection(k)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${section === k ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
          >{label}</button>
        ))}
      </div>

      {/* ── 내 평점 ── */}
      {section === 'mine' && (!rows ? <div className="mt-4 text-sm text-neutral-400">불러오는 중...</div> : (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {METRICS.map(([k, label, ic]) => (
              <button key={k} onClick={() => setMetric(k)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${metric === k ? 'bg-amber-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
              >{ic} {label}</button>
            ))}
            {liquorList.length > 1 && (
              <select value={fLiquor} onChange={(e) => setFLiquor(e.target.value)}
                className="ml-auto rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500">
                <option value="">주종: 전체</option>
                {liquorList.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
          </div>
          <div className="mt-4 space-y-1.5">
            {ranked.length === 0 && <p className="text-sm text-neutral-400">아직 {METRICS.find((m) => m[0] === metric)![1]} 점수가 없습니다. {metric === 'rating' ? '(노트에서 니트/온더락/하이볼 점수를 매기면 평균으로 자동 산출됩니다)' : '(노트에서 시음유형 점수를 매겨주세요)'}</p>}
            {ranked.map((r, i, arr) => {
              const rank = arr.filter((x) => (x[metric] as number) > (r[metric] as number)).length + 1
              return (
                <Link key={r.id} href={`/whisky/${r.id}`}
                  className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 hover:border-amber-300 hover:bg-amber-50/40">
                  <span className={`w-7 shrink-0 text-center text-lg font-bold tabular-nums ${rankColor[rank - 1] ?? 'text-neutral-300'}`}>{rank}</span>
                  {r.image_url
                    ? <img src={r.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md border border-neutral-200 object-cover" />
                    : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-lg">🍶</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-neutral-900">{r.name_ko || r.name}</span>
                      {r.liquor && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600">{r.liquor}</span>}
                      {r.style && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">{r.style}</span>}
                    </div>
                  </div>
                  <IconRow value={r[metric] as number} icon={icon} />
                </Link>
              )
            })}
          </div>
        </>
      ))}

      {/* ── 베스트셀러 (국가 × 연도, 인도 제외) ── */}
      {section === 'brand' && (() => {
        const sets = BESTSELLERS[country] ?? []
        const years = sets.map((s) => s.year).sort((a, b) => b - a)
        const set = sets.find((s) => s.year === year) ?? sets[0]
        const selCls = 'rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500'
        return (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <select value={country} onChange={(e) => { const c = e.target.value; setCountry(c); setYear(Math.max(...(BESTSELLERS[c] ?? []).map((s) => s.year))) }} className={selCls}>
                {Object.keys(BESTSELLERS).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={set?.year} onChange={(e) => setYear(Number(e.target.value))} className={selCls}>
                {years.map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
              <span className="text-[11px] text-neutral-400">인도 위스키 제외</span>
            </div>
            {set?.note && <p className="mt-2 text-xs text-neutral-500">{set.note}</p>}
            {set && <MarketList unit="M 케이스" year={set.year} source={set.source}
              rows={set.rows.map((b) => ({ label: b.brand, sub: b.sub, value: b.cases, flag: b.country ? flagOf(b.country) : undefined }))} />}
          </>
        )
      })()}

      {/* ── 싱글몰트 스카치 ── */}
      {section === 'malt' && (
        <>
          <p className="mt-3 text-xs text-neutral-500">세계 판매량 상위 싱글몰트 스카치. 상위 3종만 연 100만 케이스+(<b>밀리어네어 몰트</b>), 4위↓는 순위만.</p>
          <MarketList unit="M 케이스" source={SOURCES.malt}
            rows={SINGLE_MALT.map((m) => ({ label: m.brand, sub: m.region, value: m.cases, flag: '🏴' }))} />
        </>
      )}
    </div>
  )
}
