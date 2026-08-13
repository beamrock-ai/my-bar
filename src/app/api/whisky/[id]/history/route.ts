import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// 위스키 일자별 히스토리(일기): 추가/수정/삭제
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const { entry_date, body } = (await req.json()) as { entry_date?: string; body?: string }
  const text = (body ?? '').trim()
  if (!text) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 })
  const date = (entry_date ?? '').trim() || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const { data, error } = await db.from('whisky_history').insert({ whisky_id: id, entry_date: date, body: text }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const { historyId, entry_date, body } = (await req.json()) as { historyId?: string; entry_date?: string; body?: string }
  if (!historyId) return NextResponse.json({ error: 'historyId 필요' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (entry_date != null) patch.entry_date = entry_date
  if (body != null) patch.body = body.trim()
  const { error } = await db.from('whisky_history').update(patch).eq('id', historyId).eq('whisky_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const db = createServiceClient()
  const { historyId } = (await req.json()) as { historyId?: string }
  if (!historyId) return NextResponse.json({ error: 'historyId 필요' }, { status: 400 })
  const { error } = await db.from('whisky_history').delete().eq('id', historyId).eq('whisky_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
