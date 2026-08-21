import Anthropic from '@anthropic-ai/sdk'

export type Radar = { cereal: number; fruity: number; floral: number; peaty: number; woody: number; winey: number }
// 주종(최상위 분류) / 위스키 구분(세부 스타일). UI/LLM 공통.
export const LIQUORS = ['위스키', '보드카', '진', '럼', '데킬라', '브랜디', '리큐르', '사케', '막걸리', '소주', '전통주', '와인', '맥주', '기타'] as const
export const WHISKY_STYLES = ['싱글몰트', '블렌디드', '블렌디드몰트', '싱글그레인', '버번', '라이', '기타'] as const
export type WhiskyStyle = (typeof WHISKY_STYLES)[number]

export type WhiskyInfo = {
  name_ko: string | null
  name_en: string | null
  liquor: string | null
  type: string | null
  style: string | null
  cask: string | null
  oak_species: string | null
  peat: string | null
  peat_ppm: number | null
  sherry_type: string | null
  distillery: string | null
  abv: number | null
  description: string | null
  nose: string | null
  palate: string | null
  finish: string | null
  aroma: Radar | null
  flavour: Radar | null
  evaluation: string | null
}

const EMPTY: WhiskyInfo = {
  name_ko: null, name_en: null, liquor: null, type: null, style: null, cask: null, peat: null, distillery: null, abv: null,
  oak_species: null, peat_ppm: null, sherry_type: null,
  description: null, nose: null, palate: null, finish: null, aroma: null, flavour: null, evaluation: null,
}

function toRadar(o: unknown): Radar | null {
  if (!o || typeof o !== 'object') return null
  const rec = o as Record<string, unknown>
  const g = (k: string) => {
    const v = rec[k]
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    return Number.isFinite(n) ? Math.max(0, Math.min(4, Math.round(n))) : 0
  }
  return { cereal: g('cereal'), fruity: g('fruity'), floral: g('floral'), peaty: g('peaty'), woody: g('woody'), winey: g('winey') }
}

// AI가 그래도 포괄어를 내면 세부 종류로 후처리 치환(사용자 선택 2). 조합("A+B")은 항목별 치환+중복제거.
const CASK_NORMALIZE: Record<string, string> = {
  '쉐리캐스크': '올로로소캐스크', '셰리캐스크': '올로로소캐스크', '쉐리': '올로로소캐스크', '셰리': '올로로소캐스크',
  '포트캐스크': '루비포트캐스크', '포트': '루비포트캐스크',
  '복합': '기타',
}
export function normalizeCask(v: string | null): string | null {
  if (!v) return v
  const parts = v.split('+').map((p) => p.trim().replace(/\s+/g, '')).filter(Boolean).map((t) => CASK_NORMALIZE[t] ?? t)
  const uniq = Array.from(new Set(parts))
  return uniq.join('+') || null
}

// 캐스크 12종 정의(참고용): 버번캐스크=바닐라·카라멜·코코넛·바나나 / 버진오크=새 오크 / 피노=드라이·미네랄·허브 /
//  만자니아=캐모마일·짠맛/바다맛 / 아몬티야도=말린과일·견과 / 팔로코르타도=아몬티야도향+올로로소맛(희귀) /
//  올로로소=진하고 묵직·견과·블랙베리·스파이시 / PX=매우 달콤·건포도 농축 / 루비포트=라즈베리·체리·딸기 /
//  토니포트=블랙베리·견과·오크 / 마데이라=꿀단맛·망고·강한 산미 / 마르살라=쉐리+포트+마데이라 혼합적. 복합은 "A+B"로 연결.
// 주류명(한/영) → 표준명 + 주종·종류·증류소·도수 + 설명 + 향/맛/피니시 + 향/맛 레이더 + 평가 (1회 LLM 호출)
export async function whiskyInfo(input: string): Promise<WhiskyInfo> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return EMPTY
  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1300,
      messages: [
        {
          role: 'user',
          content:
            `주류(술) "${input}"의 테이스팅 노트 정보를 JSON 하나로만 출력(설명·코드펜스 금지, 한국어).\n` +
            `{\n` +
            `"name_ko": 표준 한글명, "name_en": 표준 영문명,\n` +
            `"liquor": 주종(반드시 다음 중 하나: 위스키/보드카/진/럼/데킬라/브랜디/리큐르/사케/막걸리/소주/전통주/와인/맥주/기타),\n` +
            `"type": 세부 종류(예: 싱글몰트 스카치, 아일라 진, 아마로),\n` +
            `"style": 위스키 세부구분(위스키일 때만 다음 중 하나: 싱글몰트/블렌디드/블렌디드몰트/싱글그레인/버번/라이/기타, 위스키가 아니면 "해당없음"),\n` +
            `"cask": 캐스크 이력. 값은 반드시 이 12종에서만 고름: 버진오크/버번캐스크/피노캐스크/만자니아캐스크/아몬티야도캐스크/팔로코르타도캐스크/올로로소캐스크/PX캐스크/루비포트캐스크/토니포트캐스크/마데이라캐스크/마르살라캐스크(모르면 기타, 위스키 아니면 "해당없음"). 2개 이상 섞였으면 "버번캐스크+올로로소캐스크"처럼 세부명을 +로 연결. 단어 '복합'·'쉐리캐스크'·'포트캐스크'는 절대 쓰지 말 것(세부 종류로 치환). 예: 발베니 더블우드=버번캐스크+올로로소캐스크, 글렌드로낙 12년=올로로소캐스크+PX캐스크,\n` +
            `"oak_species": 오크 품종(반드시 다음 중 하나: 아메리칸오크/유러피안오크/혼합/불명, 위스키가 아니면 "해당없음". 라벨·설명에 명시 안 됐으면 일반 원칙으로 추정 — 버번캐스크·버진오크는 사실상 아메리칸오크, 쉐리캐스크는 아메리칸·유러피안 둘 다 가능하므로 불확실하면 "불명"),\n` +
            `"peat": 피트 여부(위스키면 "피트" 또는 "논피트", 위스키가 아니면 "해당없음"),\n` +
            `"peat_ppm": 피트 강도(몰트 페놀 ppm 참고치, 숫자만). 논피트는 0, 피트인데 공식 ppm을 확실히 모르면 null(추측 금지). 예: 라프로익 40, 아드벡 55, 하이랜드파크 20, 옥토모어 100 이상,\n` +
            `"sherry_type": 셰리 캐스크 숙성이면 대표 셰리 종류 하나(반드시: PX/올로로소/아몬티야도/피노/팔로코르타도/만자니아, 여러 셰리 섞이면 "복합"), 셰리와 무관하면 "없음". 위스키 아니면 "없음". 예: 맥캘란 쉐리오크=올로로소, 글렌드로낙=복합, 글렌피딕 12년=없음,\n` +
            `"distillery": 증류소/양조장·지역(예: 아드벡, 아일라, 스코틀랜드), "abv": 도수 숫자만(%),\n` +
            `"description": 기본 설명 2~3문장,\n` +
            `"nose": 향, "palate": 맛(입안), "finish": 피니시(여운),\n` +
            `"aroma": {"cereal":0~4,"fruity":0~4,"floral":0~4,"peaty":0~4,"woody":0~4,"winey":0~4} (향 프로파일 강도),\n` +
            `"flavour": {동일한 6개 키, 맛 프로파일 강도},\n` +
            `"evaluation": 대체적 평가 1~2문장\n` +
            `}\n잘 모르는 제품이면 명칭 기준으로 추정하되 불확실하면 evaluation에 짧게 명시.`,
        },
      ],
    })
    const block = msg.content.find((b) => b.type === 'text')
    const text = block && block.type === 'text' ? block.text : ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return EMPTY
    const p = JSON.parse(m[0]) as Record<string, unknown>
    const s = (v: unknown) => {
      const t = (v == null ? '' : String(v)).trim()
      return t || null
    }
    const num = (v: unknown) => {
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    return {
      name_ko: s(p.name_ko), name_en: s(p.name_en), liquor: s(p.liquor),
      type: s(p.type), style: s(p.style) === '해당없음' ? null : s(p.style),
      cask: normalizeCask(s(p.cask) === '해당없음' ? null : s(p.cask)),
      oak_species: s(p.oak_species) === '해당없음' ? null : s(p.oak_species),
      peat: s(p.peat) === '해당없음' ? null : s(p.peat),
      peat_ppm: p.peat_ppm == null ? null : num(p.peat_ppm),
      sherry_type: s(p.sherry_type) === '해당없음' ? '없음' : s(p.sherry_type),
      distillery: s(p.distillery), abv: num(p.abv),
      description: s(p.description), nose: s(p.nose), palate: s(p.palate), finish: s(p.finish),
      aroma: toRadar(p.aroma), flavour: toRadar(p.flavour),
      evaluation: s(p.evaluation),
    }
  } catch {
    return EMPTY
  }
}

export type WhiskyKeyword = { term: string; term_en: string | null; category: string | null; definition: string | null }

// 위스키 사진(라벨/병) 비전 분석 → 특성 키워드 + 키워드 기반 설명문
export async function analyzeWhiskyKeywords(
  images: { media_type: string; data: string }[],
  name: string,
): Promise<{ keywords: WhiskyKeyword[]; summary: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !images.length) return { keywords: [], summary: '' }
  try {
    const client = new Anthropic({ apiKey })
    const imgBlocks = images.slice(0, 8).map((im) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: im.media_type as 'image/jpeg', data: im.data },
    }))
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2500,
      messages: [
        {
          role: 'user',
          content: [
            ...imgBlocks,
            {
              type: 'text',
              text:
                `위 사진은 위스키 "${name}"의 병/라벨이다. 라벨 정보를 근거로 JSON 객체 하나만 출력(코드펜스 금지, 한국어).\n` +
                `{\n` +
                `"keywords": [{"term":"한글 용어","term_en":"영문/원어","category":"지역|증류소|캐스크|피트|향미|숙성|병입·표기|스타일 중 하나","definition":"한국어 1문장 정의"}] (라벨의 지역·증류소·숙성연수·캐스크·도수 + 대표 향미를 위스키 용어로, 중복제거, 최대 15개),\n` +
                `"summary": "위 키워드들을 근거로 이 위스키를 설명하는 3~5문장(어떤 스타일·캐스크·향미인지, 라벨에서 읽은 특징 중심으로 자연스럽게 서술)"\n` +
                `}`,
            },
          ],
        },
      ],
    })
    const b = msg.content.find((x) => x.type === 'text')
    const t = b && b.type === 'text' ? b.text : ''
    const m = t.match(/\{[\s\S]*\}/)
    if (!m) return { keywords: [], summary: '' }
    const obj = JSON.parse(m[0]) as { keywords?: Record<string, unknown>[]; summary?: unknown }
    const s = (v: unknown) => { const x = (v == null ? '' : String(v)).trim(); return x || null }
    const keywords = (obj.keywords ?? [])
      .filter((x) => x && String(x.term ?? '').trim())
      .map((x) => ({ term: String(x.term).trim(), term_en: s(x.term_en), category: s(x.category), definition: s(x.definition) }))
    return { keywords, summary: (s(obj.summary) ?? '') }
  } catch {
    return { keywords: [], summary: '' }
  }
}

// 주류 액세서리 분류(등록·필터 공통)
export const ACCESSORY_CATEGORIES = ['글라스', '디캔터', '바도구', '보관·제빙', '기타'] as const
export type AccessoryInfo = { category: string | null; brand: string | null; description: string | null }

// 액세서리명 → 분류·브랜드·설명 자동 추정(best-effort)
export async function accessoryInfo(input: string): Promise<AccessoryInfo> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { category: null, brand: null, description: null }
  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content:
            `주류 액세서리 "${input}"에 대한 정보를 JSON 하나로만 출력(설명·코드펜스 금지, 한국어).\n` +
            `{"category": 분류(반드시 다음 중 하나: 글라스/디캔터/바도구/보관·제빙/기타), "brand": 브랜드(모르면 null), "description": 용도·특징 1~2문장}\n` +
            `위스키잔·와인잔·소주잔·글렌캐런 등은 글라스. 지거·바스푼·머들러·스트레이너 등은 바도구. 아이스볼몰드·와인셀러 등은 보관·제빙. 기네스 나이트로 서지 같은 기기는 바도구.`,
        },
      ],
    })
    const b = msg.content.find((x) => x.type === 'text')
    const t = b && b.type === 'text' ? b.text : ''
    const m = t.match(/\{[\s\S]*\}/)
    if (!m) return { category: null, brand: null, description: null }
    const p = JSON.parse(m[0]) as Record<string, unknown>
    const s = (v: unknown) => { const x = (v == null ? '' : String(v)).trim(); return x || null }
    return { category: s(p.category), brand: s(p.brand), description: s(p.description) }
  } catch {
    return { category: null, brand: null, description: null }
  }
}

export type ExtractedTerm = { term: string; term_en: string | null; category: string | null; definition: string | null }

// 자막/텍스트에서 위스키 용어 추출
export async function extractWhiskyTerms(text: string): Promise<ExtractedTerm[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []
  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3500,
      messages: [
        {
          role: 'user',
          content:
            `다음은 위스키 관련 영상의 자막/내용이다. 여기서 다루는 위스키 용어를 추출해 JSON 배열로만 출력(설명·코드펜스 금지).\n` +
            `각 항목: {"term":"한글 용어","term_en":"영문/원어","category":"분류|생산·증류|숙성·캐스크|병입·표기|테이스팅 중 하나","definition":"한국어 간단 설명 1문장"}\n` +
            `내용에 실제 등장하거나 직접 관련된 위스키 용어만. 중복 제거. 최대 40개.\n\n자막/내용:\n${text.slice(0, 14000)}`,
        },
      ],
    })
    const block = msg.content.find((b) => b.type === 'text')
    const t = block && block.type === 'text' ? block.text : ''
    const m = t.match(/\[[\s\S]*\]/)
    if (!m) return []
    const arr = JSON.parse(m[0]) as Record<string, unknown>[]
    const s = (v: unknown) => { const x = (v == null ? '' : String(v)).trim(); return x || null }
    return arr
      .filter((x) => x && String(x.term ?? '').trim())
      .map((x) => ({ term: String(x.term).trim(), term_en: s(x.term_en), category: s(x.category), definition: s(x.definition) }))
  } catch {
    return []
  }
}
