import { google } from 'googleapis'
import path from 'path'

const SHEET_ID = process.env.HOBBY_WHISKY_SHEET_ID!
const TAB = '주류메타' // (구 '위스키' 탭 → 2026-07-13 리네임). 주류 마스터 미러(뷰)
export const PRICE_TAB = '주류시세' // 일자별 주류 가격 관측 소스

function getAuth() {
  const keyPath = process.env.GOOGLE_SA_KEY_PATH!
  const resolved = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath)
  return new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function client() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

export async function readWhiskySheet(): Promise<string[][]> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1:O2000`,
  })
  return (res.data.values ?? []) as string[][]
}

// 주류시세 탭 원본 읽기(주류시세 메뉴용 뷰)
export async function readPriceSheet(): Promise<string[][]> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${PRICE_TAB}!A1:M3000`,
  })
  return (res.data.values ?? []) as string[][]
}

// 데일리샷메타 탭(위스키 품목ID + 대표가) 원본 읽기
export async function readDailyshotMeta(): Promise<string[][]> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `데일리샷메타!A1:F5000`,
  })
  return (res.data.values ?? []) as string[][]
}

// 콜키지 탭 원본 읽기
export async function readCorkageSheet(): Promise<string[][]> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `콜키지!A1:N1000`,
  })
  return (res.data.values ?? []) as string[][]
}

// 콜키지 탭 전체 미러 쓰기(DB → 시트)
export async function writeCorkageSheet(rows: string[][]): Promise<void> {
  const s = client()
  await s.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `콜키지!A1:N10000` })
  if (rows.length) {
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `콜키지!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: rows },
    })
  }
}

// 주류시세 탭에 1행 추가(헤더명 기준 위치). fields 키 = 헤더명(주종/분류/캐스크/피트/한글명/판매점/가격/기준일자/용량ml/링크/비고)
export async function appendPriceRow(fields: Record<string, string | number>): Promise<void> {
  const s = client()
  const header = ((await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${PRICE_TAB}!A1:M1` })).data.values?.[0] ?? []) as string[]
  const row = header.map((h) => { const v = fields[(h ?? '').trim()]; return v == null ? '' : v })
  await s.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${PRICE_TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  })
}

export async function writeWhiskySheet(rows: string[][]): Promise<void> {
  const s = client()
  await s.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${TAB}!A1:O100000` })
  if (rows.length) {
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    })
  }
}

// 주류메타 여러 컬럼에 드롭다운(데이터검증) 설정. 컬럼 이동에 대비해 A~O 전체 검증을 먼저 초기화 후 재적용.
export async function ensureMetaDropdowns(cols: { colIndex: number; values: string[] }[]): Promise<void> {
  const s = client()
  const meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' })
  const sheetId = meta.data.sheets?.find((sh) => sh.properties?.title === TAB)?.properties?.sheetId
  if (sheetId == null) return
  await s.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        // A~O(0~14), 1~1000행 기존 검증 초기화(rule 생략=clear)
        { setDataValidation: { range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 15 } } },
        ...cols.map((c) => ({
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: c.colIndex, endColumnIndex: c.colIndex + 1 },
            rule: {
              condition: { type: 'ONE_OF_LIST', values: c.values.map((v) => ({ userEnteredValue: v })) },
              showCustomUi: true,
              strict: false,
            },
          },
        })),
      ],
    },
  })
}
