// 셰리 종류 정의 + 당도·향 참조(이미지 "셰리 종류 — 스페인 강화와인" 기준).
// 노트/시세 셰리 종류 필드의 드롭다운 값 + 힌트 표시에 공용 사용.

export const SHERRY_TYPES = ['PX', '올로로소', '아몬티야도', '피노', '팔로코르타도', '만자니아', '복합', '없음'] as const
export type SherryType = (typeof SHERRY_TYPES)[number]

// 종류 → 당도·향(이미지 값 기준, 표준 셰리 특성 보완)
export const SHERRY_INFO: Record<string, { sweet: string; aroma: string }> = {
  'PX': { sweet: '매우 달다', aroma: '건포도·무화과·당밀' },
  '올로로소': { sweet: '드라이~미디엄', aroma: '견과·다크프루트 (가장 흔함)' },
  '아몬티야도': { sweet: '드라이', aroma: '견과·짭짤 (피노 산화)' },
  '피노': { sweet: '드라이', aroma: '가볍고 짭짤' },
  '팔로코르타도': { sweet: '드라이', aroma: '견과·아몬티야도~올로로소 중간' },
  '만자니아': { sweet: '드라이', aroma: '짭짤·해풍' },
  '복합': { sweet: '혼합', aroma: '여러 셰리 캐스크 혼합' },
}
// 유효 셰리값(없음/미상 아닌 실제 셰리)이면 정보 반환
export const sherryInfoOf = (t: string | null | undefined) => (t && t !== '없음' ? SHERRY_INFO[t] ?? null : null)
export const isSherry = (t: string | null | undefined): t is string => !!t && t !== '없음'
