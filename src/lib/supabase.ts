import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 취미 데이터는 공유 Supabase의 `hobby` 스키마에 격리.
export function createServiceClient() {
  return createClient(url, serviceKey, { db: { schema: 'hobby' } })
}

export function createAnonClient() {
  return createClient(url, anonKey, { db: { schema: 'hobby' } })
}

type HobbyClient = ReturnType<typeof createServiceClient>

// 이미지 파일 → whisky 공개 버킷 업로드 → 공개 URL 반환
export async function uploadImage(db: HobbyClient, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error } = await db.storage.from('whisky').upload(key, buf, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) throw new Error(error.message)
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/whisky/${key}`
}

// 이름으로 상점 조회/생성 (구매상점·구매가능상점·시세관측처 공용)
export async function getOrCreateShop(db: HobbyClient, name?: string | null): Promise<string | null> {
  const n = (name ?? '').trim()
  if (!n) return null
  const { data } = await db.from('shop').upsert({ name: n }, { onConflict: 'name' }).select('id').single()
  return (data?.id as string) ?? null
}

// 이름+종류로 추천인 조회/생성 (지인/전문가/직접촬영)
export async function getOrCreateRecommender(
  db: HobbyClient,
  name: string,
  kind: 'friend' | 'expert' | 'gift' | 'photo' | 'vial',
): Promise<string | null> {
  const n = (name ?? '').trim()
  if (!n) return null
  const { data } = await db
    .from('recommender')
    .upsert({ name: n, kind }, { onConflict: 'name,kind' })
    .select('id')
    .single()
  return (data?.id as string) ?? null
}
