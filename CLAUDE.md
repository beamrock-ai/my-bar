# my-bar 프로젝트 현황

> 취미 기록·관리 webapp. 2026-07-12 신설. **my-health webapp 레이아웃 기반 스캐폴딩**(셸만 복제, 건강 기능 제거).

## 개요

- 운영: **https://beamrock.duckdns.org/my-bar**
- 스택: Next.js 16.2.3 (App Router, standalone) · React 19 · Tailwind · (Supabase/Anthropic/Telegram 의존성은 my-health에서 승계, 현재 미사용)
- basePath: `/my-bar` (`NEXT_PUBLIC_BASE_PATH`, `deploy/vm01/env.production`)

## 배포 (VM)

- systemd 서비스 **`my-bar-next`** (`/etc/systemd/system/my-bar-next.service`, enable=부팅 자동기동)
- 포트 **3003** (`PORT`, env.production)
- nginx: `/etc/nginx/sites-available/beamrock.duckdns.org` 의 `location /my-bar` → `127.0.0.1:3003`
- 홈페이지: `/var/www/beamrock/index.html` 에 취미 카드(🎨) 등록
- 배포 절차:
  ```bash
  cd /home/beamrock/claude-code-beamrock/projects/my-bar
  bash scripts/build_standalone.sh
  sudo systemctl restart my-bar-next
  ```

## 구조 (셸)

- `src/app/layout.tsx` — 루트 레이아웃(title 취미)
- `src/app/(app)/layout.tsx` — Sidebar + main (my-health 레이아웃 동일)
- `src/components/Sidebar.tsx` — 취미 네비게이션(현재 대시보드만)
- `src/app/(app)/page.tsx` — 취미 대시보드(독서·영화·게임·여행 카드 플레이스홀더)
- `src/lib/basePath.ts`, `src/app/globals.css`, `src/proxy.ts`(pass-through)

## 위스키 기능 (첫 기능, 2026-07-12)

- 데이터: 공유 Supabase **`hobby` 스키마**(config.toml [api].schemas에 `hobby` 추가·노출). 마이그레이션 `supabase/migrations/20260712000000_hobby_whisky_schema.sql`. 클라이언트 `src/lib/supabase.ts`(schema hobby).
- **3NF 모델(8테이블 + 뷰)**: `whisky`(마스터) · `shop` · `purchase`(구매완료, 구매횟수=COUNT 파생. **`price`=실구매가·`list_price`=정가** 2컬럼, 2026-07-19 `20260719000000_purchase_list_price.sql`) · `price_observation`(시세관측→최저/최고/평균 파생) · `wishlist`+`wishlist_shop`(구매희망·구매가능상점 M:N) · `recommender`+`recommendation`(지인/전문가 추천) · 뷰 `whisky_stats`(구매횟수·min/max/avg).
- **구매 입력 정가/실구매가 분리(2026-07-19)**: 상세페이지 `구매 기록` 폼 입력이 **`정가`·`실구매가` 2개**. API `POST /api/purchase`가 `list_price`·`price` 둘 다 저장. 목록 표시 `정가 ~~90,000원~~ → 실구매 72,000원 (20%↓)`(정가 취소선+할인율 자동). 통계·시트동기화(min/max/avg·buyPrice)는 기존대로 `price`(실구매가) 사용.
- **구매형태·용량·프리셋 드롭다운(2026-07-19, `20260719010000_purchase_form_volume_options.sql`)**:
  - `purchase.form`(text, default `bottle`, CHECK `bottle|glass|vial|miniature`) + `purchase.volume_ml`(건별 용량). 폼에 **구매형태 select(🍾Bottle/🥃Glass/🧪Vial/🍶Miniature)** + **용량 입력**. 목록에 형태 뱃지+용량 표시. API가 form 화이트리스트 검증(비정상→bottle).
  - **정가·실구매가·용량 = 텍스트박스형 콤보박스**(`<input list>`+`<datalist>`, 자유입력+프리셋 선택). 프리셋은 **사용자 관리**: 테이블 `hobby.field_option(field∈price|volume, value)` + API `/api/field-options`(GET `{price:[],volume:[]}` · POST `{field,value}` upsert · DELETE `{field,value}`). 폼의 **⚙ 값 관리** 토글로 칩(✕ 삭제)+추가입력. 용량 시드: 30·50·100·200·375·500·700·750·1000ml.
  - **필수값 검증**: `구매일자`·`실구매가`(주황 테두리·`*` 표시) 미입력 시 `구매 추가` 클릭하면 **경고 alert**(비어있는 항목 나열) 후 중단.
  - **가격 프리셋 첫 항목 `free`**: 정가·실구매가 드롭다운 첫 항목 고정 `free`(DB 프리셋 아님, UI 상수). 선택 시 API `toInt`가 `free`→**0원**으로 저장. 표시도 `0`이면 `free`.
- **구매형태별 통계 재정의(2026-07-19, `20260719020000_whisky_stats_buy_tasting.sql`)**: `form='bottle'`(레거시 null 포함)=**구매+1**, 그 외(glass/vial/miniature)=**시음+1**. 뷰 `whisky_stats`에 `buy_count`(구매)·`tasting_count`(시음) 추가(`purchase_count`=총합 유지). 노트 상세·목록에 `구매 N회 · 시음 M회` 표시, 목록 카테고리 뱃지도 `구매완료`(bottle 있으면)+`시음`(그 외 있으면) 분리. **가격 min/avg/max(시세)는 bottle·price>0 구매 + 관측만 반영**(시음·free 제외 → 시세 왜곡 방지). 시트 동기화: 카테고리 우선순위 `구매완료 > 시음 > 바이알시음 > …`, 구매횟수 셀 `구매 N · 시음 M`, `CATEGORY_VALUES`에 `시음` 추가.
- 카테고리는 관계로 파생(한 위스키가 여러 카테고리 동시 가능): **구매완료=purchase(form=bottle)** / **시음=purchase(form≠bottle)** / 지인선물=recommender.kind='gift' / 구매희망=wishlist / 지인추천=recommender.kind='friend' / 전문가추천='expert' / **직접촬영**=recommender.kind='photo'. (지인선물은 추천인 모델 재사용, name=선물한 지인·reason=메모. CHECK 제약 `recommender_kind_check`에 'gift' 추가, 마이그레이션 `20260713020000_recommender_gift.sql`)
- **직접촬영(2026-07-13)**: 텔레그램에서 사진만 보내(구매/선물/희망/추천 맥락 없이) Claude가 자동 등록하는 경우의 기본 카테고리. `recommendation` 재사용, kind='photo', name 미입력 시 자동으로 '직접촬영' 고정값(recommendation API가 photo kind는 name 필수 검증 제외), reason=선택 메모(장소 등). 우선순위 최하위(구매완료>지인선물>구매희망>지인추천>전문가추천>직접촬영). CHECK 제약에 'photo' 추가, 마이그레이션 `20260713030000_recommender_photo.sql`. 구글시트 카테고리 드롭다운(`ensureCategoryDropdown`)에도 포함.
- **시세는 사용자 입력 아님 → 웹검색으로 수집**(이마트 트레이더스·코스트코·면세점 등) 후 `price_observation`에 적재 → min/max/avg 자동계산.
- UI: `/whisky`(4카테고리·통계·인라인 입력폼·사진첨부·한영 자동병기), API `/api/{whisky,purchase,wishlist,recommendation,price-observation}`.
- **주류 전반으로 확대(2026-07-13)**: 위스키뿐 아니라 보드카·리큐르·막걸리 등 전체 주류. 페이지 타이틀 `🥃 위스키`→**`🍶 주류 노트`**(홈 카드·Sidebar·상세 h1 "테이스팅 노트"로 통일). `whiskyInfo` LLM 프롬프트도 "주류(술)" 대상으로 일반화. (내부 경로/테이블명 `whisky`·`/whisky`는 유지)
- **주종(`liquor`)**: `hobby.whisky.liquor`(최상위 분류: 위스키/보드카/진/럼/데킬라/브랜디/리큐르/사케/막걸리/소주/전통주/와인/맥주/기타). 등록 시 드롭다운(미선택=AI 자동판별) 또는 수동 지정(우선). 마이그레이션 `20260713010000_whisky_liquor.sql`(기존 6종 위스키 백필).
- **위스키 구분(`style`)**: `hobby.whisky.style`(싱글몰트/블렌디드/블렌디드몰트/싱글그레인/버번/라이/기타, 위스키 세부스타일). 비위스키는 LLM이 "해당없음"→null 정규화. 등록 시 드롭다운(미선택=AI 자동판별) 또는 수동 지정. 마이그레이션 `20260713000000_whisky_style.sql`.
- **캐스크·오크품종·피트**: `hobby.whisky.cask`·`oak_species`·`peat`. whiskyInfo AI 자동생성, 상세페이지 편집(캐스크=Edit, 오크품종·피트=드롭다운), `EDITABLE`·pullAdd·fill-attributes 포함.
- **배합비율(blend_ratio, 2026-07-19)**: `hobby.whisky.blend_ratio`(text, 자유기재). 블렌디드 위스키의 몰트/그레인 배합비는 브랜드가 공식 공개 안 하는 영업비밀이라, 텔레그램 대화로 **업계 추정치 또는 "모름"**을 수동 입력(`PATCH /api/whisky/[id]`, `EDITABLE`에 포함). 마이그레이션 `20260719030000_whisky_blend_ratio.sql`. AI 자동생성 대상 아님(추정 근거 불확실성 때문에 수동 기재 원칙).
- **셰리 종류(2026-07-19, `20260719040000_sherry_type.sql`)**: `hobby.whisky.sherry_type`·`liquor_price.sherry_type`(text). 값=PX/올로로소/아몬티야도/피노/팔로코르타도/만자니아/복합/없음. **캐스크(전체 이력 문자열)와 별개의 단일 분류**. 참조 `src/lib/sherry.ts`(SHERRY_TYPES·SHERRY_INFO=종류별 당도·향, 이미지 "셰리 종류—스페인 강화와인" 기준). 노트 상세 `셰리 종류` 드롭다운 + 선택 시 `🍇 당도·향` 힌트, 시세 상세/목록에 `🍇 종류` 뱃지(툴팁 당도·향). whiskyInfo가 sherry_type 추출·fill-attributes가 빈 값만 채움·whisky POST/PATCH·prices(getPrices `셰리`열·getPricesFromDB·syncPricesToDB·getCatalog)·pullAdd 반영. 주류시세 시트에 **`셰리` 열(M)** 추가. ※AI가 셰리계열을 다소 넓게 잡을 수 있어(예: 버번캐스크인데 올로로소) 노트 드롭다운에서 수정 가능. 용어사전 `셰리` 카테고리(PX·올로로소·피노/아몬티야도)와 별개(참고용).
- **피트강도 PPM(2026-07-19, `20260719030000_peat_ppm.sql`)**: `hobby.whisky.peat_ppm`·`liquor_price.peat_ppm`(정수, 몰트 페놀 ppm 참고치 — 논피트=0·미상=null). whiskyInfo가 `peat_ppm` 추출(확실한 것만, 추측 금지→null), fill-attributes가 빈 값만 채움(예: 라프로익 40·탈리스커 20·아드벡 55·논피트 0). 상세페이지 `피트강도` Row(🔥 숫자입력·ppm), 시세 상세/목록·카탈로그 자동적용에 `🔥N ppm` 뱃지. 시세 소스 시트(주류시세)에 **`PPM` 열(L)** 추가(헤더명 조회라 위치 무관), appendPriceRow·getPrices·syncPricesToDB·getCatalog·whisky POST/PATCH 반영. ※주류메타(노트 미러)엔 캐스크·피트처럼 PPM도 미포함(일관).
  - **캐스크(cask)**: 12종 강제 taxonomy = 버진오크/버번캐스크/피노/만자니아/아몬티야도/팔로코르타도/올로로소/PX/루비포트/토니포트/마데이라/마르살라/기타. 2개↑는 "A+B"로 +연결. 포괄어 금지(프롬프트) + **후처리 정규화 `normalizeCask`**(복합→기타·쉐리캐스크→올로로소캐스크·포트캐스크→루비포트캐스크, `getPricesFromDB`·whiskyInfo 파싱에 적용, 비파괴적).
  - **용량(volume_ml, 2026-07-17)**: 노트 마스터에 용량(ml) 컬럼. 상세페이지 정보섹션 편집(도수 아래, "700"+ml). 카탈로그(시세)에서 등록 시 그 술 용량 자동 채움(getCatalog·whisky POST). `EDITABLE`·마이그레이션 `20260717010000_whisky_volume.sql`.
  - **오크품종(oak_species, 2026-07-17)**: 아메리칸오크/유러피안오크/혼합/불명. **캐스크 이력보다 나무 품종(아메리칸=바닐라·코코넛 / 유러피안=타닌·스파이시)이 풍미에 더 결정적**이라 분리. AI 추론(버번캐스크·버진오크→아메리칸오크, 쉐리는 둘 다 가능→불확실 시 불명). 마이그레이션 `20260717000000_whisky_oak_species.sql`. (char_level 토스팅/차링은 보류)
- **시세(price_observation) 확장(2026-07-16)**: `volume_ml`·`url`(링크)·`memo`(비고) 컬럼 추가. 상세페이지 `＋시세` 폼에 용량ml·링크 입력 추가. 주류시세 시트 임포트 대비.
- **노트 등록 = 시세 카탈로그에서 선택(2026-07-17)**: 등록 폼 주류명이 **시세 카탈로그 콤보박스**(`GET /api/catalog` = 주류시세 시트 한글명별 대표 속성 678종, `lib/prices.ts getCatalog`). 동작:
  - **카탈로그 선택**: 그 술의 주종·분류·캐스크·피트를 시트값으로 자동 적용, **이름(PK) 시세와 동일 유지**(AI 리네임 안 함), 시세 재등록 안 함. 초록 뱃지로 표시.
  - **새 항목(카탈로그에 없음)**: AI 자동분류 + 주종/구분 수동선택 가능 + **가격·판매점 입력 시 → 주류시세 시트에 신규행 append**(`sheets.ts appendPriceRow`, 판매점=입력값/'직접입력'·기준일자=오늘·비고='주류노트 등록'). 가격 없으면 노트에만. 응답 `addedToCatalog`.
  - 노트↔시세 PK(한글명) 동일 원칙 → 이름 클렌징이 전제(2026-07-16 1~4 완료).
- **속성 일괄 채우기**: `POST /api/whisky/fill-attributes` — 등록된 주류 중 주종/구분/캐스크/피트/**PPM**이 **비어 있는 필드만** AI(whiskyInfo)로 채움(기존 값 미덮어씀). 재실행 안전(모두 찬 항목은 LLM 호출 스킵). 가향제품(잭다니엘 테네시 애플 등)은 캐스크/피트 N/A로 남을 수 있음(상세페이지 수동 지정 가능).
- 상세페이지 정보 섹션에서 주종·구분 모두 편집(`EDITABLE`에 `liquor`,`style` 포함). 카드에 주종(indigo)·구분(gray) 뱃지.
- **이미지 업로드**: 상세페이지 `📷 이미지 추가 (여러 장 가능)` — `<input multiple>`로 **한 번에 여러 장 선택** 가능. 클라이언트가 `uploadImgs`로 **순차** POST(`/api/whisky/[id]/image`, 1장/요청) 후 1회 `reloadObjective`. 순차 처리 이유=대표사진(is_primary) 판정 레이스 방지(각 요청이 현재 대표 유무를 읽어 첫 장만 대표). 검증: 3장 업로드 → 이미지 3장·대표 1장.
- **이름 편집(2026-07-13)**: 상세페이지 정보 섹션 `이름` Row가 한글명(`name_ko`)·영문명(`name_en`) 편집 입력(기존 읽기전용→편집). PATCH `/api/whisky/[id]`가 반영+`pushMirrorSafe`로 시트 한글명 갱신. 내부 PK `name`(canonical)은 동기화 안정성 위해 미변경(목록·랭킹·시트 모두 `name_ko` 우선 표시라 화면엔 새 이름 반영). 예: 듀어스 12년산→듀어스 12년.
- **사진 분석 → 특성 키워드(2026-07-17)**: 상세 노트 "특성 키워드" 섹션. **분석할 사진을 썸네일에서 다중 선택**(체크 토글·전체선택, 기본=대표사진 1장) 후 **🔍 선택 사진 분석 (N장)** 버튼. `POST /api/whisky/[id]/analyze`(body `{image_ids:[]}`, 미지정 시 대표사진, 최대 8장)가 선택한 **여러 장**을 base64로 Claude 비전(sonnet-5, `analyzeWhiskyKeywords`)에 보내 위스키 특성 키워드 추출(지역·증류소·캐스크·향미 등, 최대 15개) + **키워드 기반 설명문(3~5문장, 라벨 근거)** → 용어사전(`hobby.term`) upsert(onConflict term, ignoreDuplicates, source='사진분석: {이름}') 없으면 추가·있으면 유지. `hobby.whisky.keywords text[]`·`analysis text`에 저장(응답 `{keywords,analysis,added,addedCount}`). 섹션에 **설명문(앰버 박스)** + 키워드 뱃지 표시, 각 뱃지 클릭 → `/glossary?q={키워드}`(용어사전 페이지가 `window.location.search`의 `q`로 초기 검색). 예: 잭다니엘 애플 → 테네시 위스키·사워 매쉬·차링·링컨 카운티 프로세스 등 추출.
- **등록번호(seq, 2026-07-17)**: `hobby.whisky.seq` 등록순 고유번호(UNIQUE). 기존은 created_at 순 백필, 신규는 시퀀스 `hobby.whisky_seq` 자동 채번(DEFAULT nextval). 카드·상세("테이스팅 노트 #N")에 `#N` 표시. 마이그레이션 `20260717040000_whisky_seq.sql`.
- **변경시각·최신순 정렬(2026-07-17)**: `hobby.whisky.updated_at`(KST 표시). **DB 트리거**로 자동 기록 — 위스키 본체 UPDATE(`set_whisky_updated_at` BEFORE UPDATE) + 연관 기록(purchase/wishlist/recommendation/price_observation/whisky_image/whisky_profile) INSERT/UPDATE/DELETE(`touch_whisky` AFTER)가 부모 위스키 updated_at 갱신. `GET /api/whisky`는 `updated_at desc` 정렬(최신 변경 위로), 카드에 "🕒 MM-DD HH:mm 변경 (KST)" 표시. 마이그레이션 `20260717030000_whisky_updated_at.sql`. (초기값=created_at)
- **목록 필터(`/whisky`)**: ① 주류명 콤보박스(`<input list>`+`<datalist>`, 검색+선택, 이름 짤림 없음) ② 주종 드롭다운 ③ 구분 드롭다운(데이터에 존재하는 style만) ④ 카테고리 드롭다운(구매완료/구매희망/지인추천/전문가추천). 클라이언트 AND 필터, "N/전체개 표시" + 초기화 버튼.
- **등록 시 카테고리 동시 선택**: 등록 폼에 카테고리 드롭다운(미지정/구매완료/지인선물/구매희망/지인추천/전문가추천) + 선택 시 세부 입력칸 노출(구매완료=일자〔미입력 시 오늘〕·상점·가격 / 지인선물=선물한 지인(필수)·메모 / 구매희망=가능상점·메모 / 추천=지인명·출처(필수)·이유). 등록 시 위스키 생성 후 해당 관계 API(`/api/{purchase,wishlist,recommendation}`, 지인선물=recommendation kind='gift') 자동 호출. 추천·선물은 이름 미입력 시 사전 검증 알림. 카드 `＋기록 추가`로도 추가 가능.
- **기록 추가·삭제(2026-07-17)**: 목록 카드의 각 기록(구매완료·구매희망·지인선물·지인추천·전문가추천·직접촬영)에 **✕ 삭제 버튼**(purchase/recommendation=id·wishlist=whisky_id로 DELETE). 카드 `＋기록 추가` 드롭다운으로 추가.
- **구매 기록 수정(2026-07-19)**: 노트 상세 구매 기록 각 행에 **✎ 수정 버튼** → 인라인 편집(일자·형태·상점·용량·정가·실구매가 입력 + 저장/취소). API `PATCH /api/purchase`(body `{id, purchase_date, shop_name, form, list_price, price, volume_ml}`, `free`→0·form 화이트리스트·shop upsert 재사용, `pushMirrorSafe`). 저장 시 필수값(일자·실구매가) 검증.
- **구매희망 ↔ 구매완료 공존 불가(백엔드 강제)**: 구매완료(purchase POST) 시 해당 위스키 wishlist 자동 삭제 / 구매희망(wishlist POST)은 이미 purchase 있으면 400 차단("이미 구매완료…"). 진입점(등록폼·카드) 무관하게 API에서 보장.
- **바이알시음(2026-07-17)**: 샘플 바이알로 맛본 기록. recommendation 재사용 kind='vial', name 미입력 시 '바이알시음' 고정(출처 지정 가능)·reason=메모, 이름 필수검증 제외(photo와 동일). CHECK 제약에 'vial' 추가(마이그레이션 `20260717020000_recommender_vial.sql`), 시트 카테고리 드롭다운·CATEGORY_VALUES 포함.
- **카테고리 우선순위(시트 단일 카테고리·뱃지, 2026-07-18 재조정)**: 구매완료 > 바이알시음 > 지인선물 > 구매희망 > 지인추천 > 전문가추천 > 직접촬영. 시트 C열 드롭다운(`ensureCategoryDropdown`)에 지인선물 포함.
- **테이스팅 노트 상세** `/whisky/[id]`: 템플릿 레이아웃(정보=종류·증류소·도수·가격·상점 / 감각=색·향(Nose)·맛(Palate)·향(Aroma)·맛(Flavour) 8축 레이더·피니시 / 종합 / 히스토리). 등록 시 **Claude(sonnet-5)가 종류·증류소·도수·향/맛/피니시·aroma/flavour 8축 프로파일(0~4)·설명·평가를 자동 생성**(`src/lib/translate.ts whiskyInfo`). 필드 편집 저장 + `🔄 프로필 재생성`(PATCH `/api/whisky/[id]` GET/PATCH). 레이더는 무의존 SVG(`components/WhiskyRadar.tsx`). 컬럼: `type,distillery,abv,nose,palate,finish,aroma,flavour,description,evaluation`(자동) + `color,rating`(개인). ※`whisky_profile.personal_note`는 히스토리로 이관(아래) 후 미사용. **`tasted_on`(시음일)은 2026-07-25 상세 헤더 입력칸 제거**(히스토리 일자로 대체, 컬럼은 잔존하나 UI 미노출).
- **목록 카드 지표(2026-07-25)**: `구매 N회 · **노트 N개** · 가격 N건 · 최저/평균/최고`. "노트 N개"=위스키별 히스토리(일자별 기록) 개수(`/api/whisky` GET가 `whisky_history` 집계해 각 위스키에 `noteCount` 부여). (기존 "시음 N회"=비-bottle 구매수 표기 대체.)
- **히스토리(일자별 일기, 2026-07-25)**: 기존 "노트(자유메모, `personal_note` 단일 텍스트)" 섹션 → **`히스토리`**(일기처럼 일자별 기록)로 대체. 테이블 `hobby.whisky_history`(id·whisky_id FK cascade·`entry_date` date·`body` text·created/updated_at 트리거, 마이그레이션 `20260725090000_whisky_history.sql`, 기존 `personal_note`는 tasted_on/생성일 기준 히스토리 항목으로 자동 이관·보존). API `/api/whisky/[id]/history`(POST{entry_date,body}·PATCH{historyId,entry_date,body}·DELETE{historyId}) — **본체 저장바와 무관하게 즉시 저장**, 상세 GET에 `history`(entry_date desc) 포함. UI: 상단 날짜(기본 오늘 KST)+본문 입력 `＋기록 추가`, 아래 타임라인(📅날짜 뱃지·본문 whitespace 보존·✎수정/✕삭제 인라인).
- **구글시트 양방향 실시간 동기화** (시트=뷰, 위스키명 PK): 스프레드시트 `HOBBY_WHISKY_SHEET_ID`(1ud13QG5…)의 **`주류메타` 탭**(구 `위스키`, 2026-07-13 리네임 → `sheets.ts TAB`), SA `bookkeeping-sheets-sa.json`(GOOGLE_SA_KEY_PATH). 동기화 모듈 `src/lib/{sheets,whisky-sync}.ts`.
  - **`주류시세` 탭**(gid 1014777612): 일자별 주류 가격 관측 소스(→ `price_observation` 적재용). 헤더 A~K(사용자 조정): `주종`(A)·`분류`(B,style)·`캐스크`(C)·`피트`(D)·`한글명`(E,주류메타 PK 매칭)·`판매점`(F)·`가격`(G,숫자서식)·`기준일자`(H)·`용량ml`(I)·`링크`(J)·`비고`(K). `sheets.ts PRICE_TAB`. 사용자가 유튜브 트레이더스 시세 영상 등에서 직접 다수 입력 중. **DB→시트 채우기 시 헤더명으로 매핑**(순서 변동 안전). 주류시세→DB 임포트(price_observation 적재)는 미구현(요청 시 추가).
  - **`액세사리메타` 탭**(gid 1182531156, ↔`hobby.accessory`): 분류·품목명·브랜드·상태·가격·구매처·설명·사진URL·비고. **`액세사리시세` 탭**(gid 1945063728, ↔`hobby.accessory_price` accessory_id FK·shop·price·observed_on·spec·url·memo): 분류·품목명·판매점·가격·기준일자·규격·링크·비고. 2026-07-16 DB→시트 1회 채움(액세서리 8종 AI 자동분류 생성 + 참고시세 5건). 마이그레이션 `20260716000000_...sql`.
  - **webapp→시트(push)**: 모든 변경 API(whisky·purchase·wishlist·recommendation·price-observation POST/DELETE) 처리 후 `pushMirrorSafe()`로 DB 전체를 시트에 즉시 미러.
  - **시트→webapp(pull)**: `GET /api/whisky`(페이지 로드)마다 `pullAdd()`로 시트에 수동추가된 위스키명(한/영)을 DB에 추가(부족 언어 자동변환).
  - **삭제 미러**: `POST /api/whisky/sync`(=fullSync: pullAdd+deleteMirror+pushMirror)가 시트에서 지운 행을 DB에서도 삭제(빈 시트 가드: 전체비움으론 삭제 안 함). `/whisky`의 `🔄 시트 동기화` 버튼 + **systemd 타이머 `my-bar-whisky-sync.timer`(10분 주기)**가 호출.
  - 시트 컬럼(A~O, 2026-07-13 맨 앞에 주종 추가): **주종(A, 드롭다운=LIQUORS 14종, ↔`whisky.liquor`)**·한글명(B)·영문명(C)·**카테고리(D, 드롭다운:구매완료/지인선물/구매희망/지인추천/전문가추천)**·구매일자·구매상점·구매금액·구매횟수·**최저가(시점·상점)**·평균가·**최고가(시점·상점)**·추천인·추천이유·사진URL·비고. 컬럼 이동 대비 `ensureMetaDropdowns`가 A~O 검증 초기화 후 주종(A)·카테고리(D) 드롭다운 재적용. pullAdd는 A열 주종을 `liquor`로 반영(양방향). 구매 일자/상점/금액은 **분리 컬럼(필터용)**·위스키당 최근 1건 표시(구매횟수로 총계). 최저/평균/최고가는 **구매가격+시세(price_observation) 합산**으로 계산(뷰 `whisky_stats`, 1건이라도 있으면 산출), 최저/최고는 해당 데이터의 시점·상점 병기. 카테고리는 단일값=우선순위 대표(구매완료>구매희망>지인추천>전문가추천), Sheets API `setDataValidation`으로 C열 드롭다운(fullSync마다 재적용, `ensureCategoryDropdown`). 최저/최고가=해당 price_observation 관측 시점·상점 병기. 파생값은 DB→시트 단방향. 위스키명 리네임 금지.

## 순위(랭킹) `/ranking` (2026-07-13)

- 평점 / 시음유형(니트=neat·온더락=rocks·하이볼=highball)별 순위. serving은 작성자별 프로필(`whisky_profile`)에 저장 → **위스키별 프로필 평균**으로 집계(5점 만점).
- **평점 = 니트/온더락/하이볼(입력된 것)의 평균으로 자동 산출**(2026-07-13). 저장된 `rating` 컬럼은 무시(더 이상 저장·편집 안 함). 상세페이지 평점은 읽기전용 표시(`servingAvg`), 랭킹 API도 serving 평균으로 rating 계산.
- API `GET /api/ranking`: whisky + whisky_profile 조인, 위스키별 neat/rocks/highball 평균(값>0만) + rating(=세 평균의 평균) + ratingCount 반환.
- UI: 지표 탭(평점/니트/온더락/하이볼) + 주종 필터(2종 이상일 때) + 내림차순 목록(1·2·3위 색상, 아이콘 평점행+수치, 위스키 노트 링크). 점수 없는 항목은 제외. **동점=같은 순위(표준 경쟁 순위: 자기보다 높은 점수 개수+1, 예 5·5·4 → 1·1·3위)**.
- **상위 섹션 탭(2026-07-19)**: `⭐ 내 평점`(위 기존) / `🏷️ 베스트셀러` / `🥃 싱글몰트`. 뒤 2개는 **공신력 있는 개별 위스키 품목(브랜드) 판매 순위**(정적 큐레이션 `src/lib/whisky-market.ts` — 사용자 실데이터 아님, 출처·기준연도 명시, 수작업 갱신). 공용 `MarketList`(순위·국기·비율바·값+단위·출처링크, `value` 없으면 순위만·`비공개`).
  - **베스트셀러**: 개별 위스키 브랜드 판매 순위, **인도 위스키 제외**. **국가 × 연도 드롭박스**(2026-07-19)로 세트 전환 — 구조 `BESTSELLERS: Record<국가, BestsellerSet[]>`(세트=year·note·source·rows), 드롭박스는 존재하는 국가/연도만 노출(새 데이터=배열에 세트 추가만).
    - `🌍 글로벌 2024`: 케이스 수치 有(Johnnie Walker 21.6·Jim Beam 17.5·Jack Daniel's 14.1·…Dewar's 3.3). 출처 DI Brands Report 2024/Forbes.
    - `🇺🇸 미국 2024`: 순위만(Circana 오프프레미스). `🇰🇷 한국 2024`: 순위만(데일리샷, 위키트리 보도). 행마다 원산지 국기.
    - 국가·연도별 자료가 제한적이라 수치 없는 세트는 `비공개`로 순위만 표시(지어내지 않음).
  - **싱글몰트**: 베스트셀러 싱글몰트 스카치. 상위 3(Glenfiddich 1.7·Glenlivet 1.4·Macallan 1.0 = 밀리어네어 몰트)만 판매량, 4위↓(Glenmorangie·Singleton·Balvenie·Laphroaig·Aberlour·Cardhu)는 순위만. 출처 scotchwhisky.com(순위)·VinePair 2024(판매량).
  - ※ 국가별 수출·유형별 집계 순위는 "개별 품목이 아니라 의미 없다"는 피드백으로 제거(2026-07-19).
  - 갱신 시 `whisky-market.ts`의 배열·`SOURCES`만 교체(기준연도 `MARKET_YEAR`).
- 홈 카드 🏆 순위 · Sidebar `🏆 순위` 등록.

## 주류시세 `/prices` (2026-07-16)

- 판매점·일자별 주류 시세 메뉴. **아키텍처 원칙(2026-07-17): webapp 조회 = DB(`hobby.liquor_price`), 구글시트[주류시세]는 DB의 소스(입력원)**. 앱은 시트를 직접 읽지 않음.
  - **조회**: `GET /api/prices` → `getPricesFromDB()`(liquor_price 읽기). `/prices` 페이지 로드·필터·정렬 모두 DB 기준.
  - **동기화(소스→DB)**: `POST /api/prices/sync` → `syncPricesToDB()`(구글시트 `readPriceSheet` 파싱 → liquor_price delete-all+insert). 트리거: `/prices` 헤더 **[🔄 시트 동기화]** 버튼 + **10분 타이머 `my-bar-whisky-sync.service`**(주류메타 sync에 이어 prices/sync도 호출).
  - **카탈로그**(`getCatalog`, 등록 선택용)도 DB 기준. 신규 주류 등록 시엔 시트 append + `liquor_price` 직접 insert(즉시 조회 반영).
  - `hobby.liquor_price`: FK 없는 name 키 테이블(위스키 마스터에 없는 카발란·쿠일라·맥캘란 등도 수용). 마이그레이션 `20260716010000_liquor_price.sql`. (구 `/api/price-sheet`는 제거됨)
- UI: 주류명 콤보박스(datalist) 검색 + 필터(주종·분류·판매점·피트) + **정렬 토글(가격/이름/일자/시세수, 같은 키 재클릭 시 오름↔내림, 기본 가격 오름차순)**. 각 행 우측에 **시세수**(그 한글명의 관측 행 수 = 일자별 가격/시세변동 개수, `cntByName`=filteredAll 기준) 숫자 표시. **목록은 한글명 기준 1건씩만**(필터 적용 후 → 한글명별 최신 기준일자·동일자면 최저가 대표 → 정렬). 카운트 "N종·전체 M건".
- **데일리샷 시세(웹앱 동기화, 2026-07-23)**: 시세 페이지 **`🥃 데일리샷 동기화`** 버튼 → `POST /api/prices/dailyshot-sync` → `syncDailyshotToDB()`가 **데일리샷메타 시트(소스) → `liquor_price`(판매점=`데일리샷`·memo=데일리샷메타)** 적재(한글명 dedup 최저가). 데일리샷은 **별도 소스**라: ① `getPrices`가 주류시세 시트의 데일리샷 행 제외 ② `syncPricesToDB`는 `.or(shop.is.null,shop.neq.데일리샷)`로 **데일리샷 행 보존**(주류시세 재동기화가 안 지움). 시세 판매점 필터에 `데일리샷` 노출. (Part A `dailyshot_sync.py`도 주류시세 시트 미기록·DB만.)
- **데일리샷 일자별 이력(대표가 변동분만 append, 2026-07-24)**: `syncDailyshotToDB`는 전량 덮어쓰기 아님 → 술별 **마지막 기록가 대비 대표가가 바뀐 것만** 오늘자로 append(같은 날 재변동은 오늘 행 update = 날짜당 1행). 미변동은 스킵. 반환 `{total,new,changed,unchanged}`. → 시세 드릴다운(주류명 클릭)에서 **날짜별 가격 이력** 확인. **일일 자동**: `scripts/dailyshot_daily.sh`(① `dailyshot_collect_whisky.py`로 데일리샷메타 오늘 시세 갱신 → ② dailyshot-sync API로 변동분 append) + systemd `my-bar-dailyshot.timer`(매일 09:30). 실측: 07-23 baseline 1,581 → 07-24 변동 173+신규 31=204 append(미변동 1,381 스킵). 끄기 `sudo systemctl disable --now my-bar-dailyshot.timer`.
- **데일리샷 시세 수집(2026-07-23)**: `scripts/dailyshot_sync.py <상품URL|ID> ...`(또는 `--map 파일`=한글명\tURL). 데일리샷 상품페이지 SSR `__NEXT_DATA__` 파싱 → `name·price·net_price(할인가)·용량(이름에서 L/ml)` 추출 → **주류시세 시트 append + `liquor_price` insert**(판매점=`데일리샷`·기준일자=오늘·비고=데일리샷·링크 포함). 할인가 있으면 실구매가로 사용. **같은 날 중복 방지**(name+shop=데일리샷+오늘 이미 있으면 스킵→멱등). 검증: 조니워커 블랙 1L 55,000원 반영. ⚠️개인용·저빈도(비공식 SSR 파싱, 사이트 개편 시 취약·ToS 재배포 금지). Azure VM 접근 가능(IP 차단 없음).
  - **위스키 품목ID 대량수집(2026-07-23)**: `scripts/dailyshot_collect_whisky.py` — 검색 SSR API `getSearchItems`(`/m/search/result?q=<kw>`)가 결과에 **`top_product_id`(품목ID)·`category`·`category_id`(위스키=22)·`subcategory`·`service_type`(판매채널)·`price`(오퍼가)** 제공. 위스키 브랜드/증류소 키워드 ~155개를 훑어 `category='위스키'`만 품목ID로 dedup → 구글시트 **`데일리샷메타` 탭**(헤더 `품목ID·상품명·서브카테고리·대표가(최저)·리뷰수·URL`)에 기록. **1차 1,582품목 수집**.
    - **면세점 제외(2026-08-01)**: 대표가(최저)는 오퍼별 `service_type`으로 채널 구분해 산정. **`EXCLUDE_SERVICE_TYPES={5}`(=면세점, 신라면세점 등)** 오퍼는 대표가 산정에서 제외(여권/출국 필요→국내 실구매 시세 아님, 최저가를 왜곡). service_type 실측 매핑: **0/1/2/7/9/10=국내 일반매장·편의점(CU·이마트24 등, cross_border=False), 5=면세점, 6=해외직구/구매대행(is_cross_border_shopping=True, 하바루·비타트라 일본 등)**. (해외직구 6은 현재 미제외 — 필요 시 EXCLUDE에 6 추가.) 적용 실측: 발렌타인30년 421,326(면세)→539,000, 시바스12년1L 48,723→54,900 등 변동 83건. 모든 오퍼가 면세인 품목은 자동 드롭. ⚠️ SSR은 검색 1페이지만(페이지네이션 param 무효) → 키워드 폭으로 커버(브랜드 미포함/희귀병입은 누락 가능, 키워드 추가로 확장). 전체 상품 사이트맵 `sitemap-items.xml`(24,797건, 카테고리 구분 없음)·검색키워드 `sitemap-search-keyword.xml`(18,991). robots.txt `Allow:/`(AI크롤러 명시 허용).
  - **품목ID가 키**: URL `/m/item/<품목ID>?item=<상품ID>`. **품목ID만으로 조회 가능**(`/m/item/<품목ID>` → 대표(최저 근처) 오퍼). 스크립트 인자·`--map` 값 모두 **품목ID 또는 URL** 허용(`to_url`). 예: 조니워커 블랙 700ml=`2460`, 1L=`4850`.
  - **일자별 자동(대표가)**: `scripts/dailyshot_map.txt`(한글명\t품목ID) + systemd `my-bar-dailyshot.timer`(매일 09:30, `--map` 실행). 끄기 `sudo systemctl disable --now my-bar-dailyshot.timer`.
  - **판매점별 수집(`--sellers`)**: 상품 상세 `getItemDetailsByTopProducts`에 **`seller`(매장명·지역·주소·도착예정)+판매가+할인율+재고+top_product_id/id**가 들어있음 → `python3 scripts/dailyshot_sync.py --sellers <품목ID|URL...>`가 구글시트 **`데일리샷` 탭**(없으면 생성, **첫 행 헤더 보장**)에 `수집일자·품목ID·상품ID·상품명·판매점·지역·판매가·정가·할인율·용량ml·재고·도착예정·URL` append. ⚠️ URL에 매장 미고정 시 데일리샷이 **조회마다 다른 표본 매장**을 반환(가격은 안정). 특정 매장 고정은 sellerId 포함 URL 필요. 전체 매장 리스트는 로그인 인증 API라 불가.
- **판매점·일자별 통계 제거(2026-07-23)**: 서로 다른 상품을 섞어 평균/최저~최고를 내는 판매점별 가격 집계는 의미가 없어 섹션 전체 삭제(관련 `stats`·`statKey/statDir`·`setStat/statBtn` 제거). 가격 비교는 주류명 드릴다운(판매점×일자 피벗)에서만.
- **드릴다운**: 목록에서 주류명 클릭 → 그 술의 **① 가격 추이 그래프**(무의존 SVG 라인차트 `PriceTrendChart`, x=기준일자·y=가격·판매점별 색상 라인+점·범례) + **② 기준일자 × 판매점 가격표**(HTML 피벗, 최저가 셀 강조) + 최저/평균/최고 + 출처링크. 상·하단에 "← 주류시세 목록" 복귀 버튼. 홈 카드 🏷️ 주류시세 · Sidebar `🏷️ 주류시세`.
  - **딥링크 `?name=`(노트↔시세 상호이동)**: `/prices?name={한글명}`으로 진입 시 시세 로드 후 **PK(띄어쓰기 제거, nkey) 일치 술이 있으면 그 드릴다운 자동 오픈**, 없으면 그 이름을 검색어로 세팅. 노트 상세 헤더의 `📈 시세` 버튼(초록)이 `?name=매칭명`으로 링크. (반대 방향=드릴다운 `📖 노트로 이동`.)
  - **노트↔시세 수동 매칭(2026-07-25)**: 자동 매칭은 이름(nkey=공백제거) 완전일치로만 되므로, 노트명과 시세 한글명이 다르면 연결이 끊김. 이를 위해 `hobby.whisky.price_name`(수동 매칭 키, 마이그레이션 `20260725100000_whisky_price_name.sql`) 추가. **노트 상세 정보 섹션 `시세매칭` 행**에 텍스트박스형 드롭박스(`<input list=price-catalog>`+`<datalist>`=`/api/catalog` 시세 한글명 2천여종) → 연결할 시세 품목명 선택/입력. `자동` 버튼으로 null 복귀. 상태문구 `✓ 시세 연결됨: {name}`(초록)/`⚠ 시세 미연결`(주황). 매칭키 우선순위=`price_name || name_ko`. `📈 시세` 버튼도 이 키로 링크(미연결 시 `⚠` 표기). 시세 페이지 `loadNotes`의 noteMap도 name_ko 다음 price_name으로 덮어써 드릴다운 `📖 노트로 이동`이 수동 매칭분까지 인식. whisky PATCH EDITABLE에 `price_name` 포함, 본체 저장바로 저장.
  - **시세 삭제/수동가격 + 데일리샷 품목ID 키(2026-08-19)**: 시세는 시트/데일리샷 동기화로 덮어써지므로 **동기화에 안전한 레이어**로 처리. (초안이던 별칭 병합/이름편집(`price_alias`)은 **삭제로 대체·제거**, 마이그레이션 `20260819110000_dailyshot_appid_hide.sql`에서 drop.)
    - **삭제(숨김)**: 목록 행 **체크박스** + 1종↑ 선택 시 **삭제 바**(`🗑 삭제`) → `POST /api/prices/delete {names}` = `hobby.price_hidden(name PK)`에 등록 + 현재 `liquor_price`·`liquor_price_manual` 행 즉시 삭제. **동기화가 숨김 이름을 재적재하지 않음**(`syncPricesToDB`·`syncDailyshotToDB`·`getPricesFromDB` 모두 hidden 제외). 복구=`DELETE /api/prices/delete`(숨김해제 → 다음 동기화 때 재적재, 수동가격은 복구 불가). 중복 품목 정리용(예: [조니워커 블랙 라벨]/[700ml] 중 하나 삭제).
    - **데일리샷 동기화 키 = 품목ID(app_id)**: `liquor_price.app_id` 컬럼 추가(기존 데일리샷 행 url `.../item/{id}`에서 백필). `syncDailyshotToDB`가 **상품명 아님 app_id 기준으로 dedup·변동비교·append**(품목ID별 시계열). (주류시세 시트/수동가격 행은 app_id 없음.)
    - **수동 판매점 시세**: `hobby.liquor_price_manual`(일자·판매점·가격, 동기화 미터치). 드릴다운 **`＋ 판매점 시세 수동 입력`** → `POST /api/prices/manual`. `getPricesFromDB`가 base+manual union, `PriceRow`에 `id·app_id·source`.
    - **드릴다운 개별 시세 행 삭제(2026-08-19)**: 상세 화면 **`개별 시세 내역`** 리스트(det, 일자·판매점·소스뱃지[시트/데일리샷/수동]·가격, 체크박스) → **선택 삭제** → `DELETE /api/prices/row {liquorIds, manualIds}`(id 기준, 소스별 liquor_price/liquor_price_manual 분리 삭제). ⚠️시트/데일리샷 원본 행은 다음 동기화 때 재생 가능(항목 자체 제거는 목록의 삭제=price_hidden 사용). 수동가격 삭제도 여기서(기존 칩 UI 대체).
  - **[🍶 노트에 추가] / [📖 노트로 이동] 버튼**(드릴다운 헤더): 선택한 술이 **노트에 이미 등록돼 있으면 `📖 노트로 이동`(초록, `/whisky/{id}`로 이동)**, 미등록이면 `🍶 노트에 추가`(주황) 노출. 등록 여부는 노트 목록(`/api/whisky`)을 로드해 **한글명 띄어쓰기 제거(nkey) → id 맵**으로 판정(PK 규칙 동일). 추가(`POST /api/whisky`, `ifNew=1` → 이미 있으면 프로필 미덮어씀·`alreadyExists`) 성공 시 맵 재로드 → 즉시 [노트로 이동]으로 전환. 카탈로그 술이므로 주종·구분·캐스크·피트 자동 적용.

## 콜키지 `/corkage` (2026-07-24)

- **목적**: 콜키지 가능 장소 등록·관리(테이스팅 노트와 유사 성격). 사이드바 `🍽️ 콜키지`·홈 카드.
- **DB**(`20260724000000_corkage.sql`): `hobby.corkage_place`(name·region·address·**corkage_type**[유료/무료, null=미지정. '가능' 폐지 2026-07-24 `20260724050000_`]·**corkage_detail**[콜키지 내역 텍스트, 2026-07-24 `20260724070000_corkage_detail.sql`에서 corkage_fee(정수)→corkage_detail(text)로 대체. 무료도 병수제한 표기 가능]·**visit_status**[방문예정/방문완료]·**rating**[0~5 0.5]·**service_note**[서비스 후기]·memo·phone·url·image_url·updated_at 트리거) + `hobby.corkage_image`(다중 사진, place_id FK cascade·is_primary). 이미지는 기존 `whisky` 스토리지 버킷 재사용(`uploadImage`).
  - **콜키지내역 프리셋**(`hobby.corkage_option`, 같은 마이그레이션): `id·kind`[무료/유료 CHECK]·`value`·unique(kind,value). 시드 무료=무제한/1병/2병/예약시, 유료=인당 10,000원/인당 5,000원/10,000원/20,000원. 위스키 field_option과 동일한 **사용자 관리형 드롭다운**(추가/삭제).
- **API**: `/api/corkage`(GET 목록+사진수·POST 등록[multipart, name 필수+선택사진, corkage_detail 수용]·DELETE) · `/api/corkage/[id]`(GET 상세·PATCH 편집[EDITABLE에 corkage_detail]) · `/api/corkage/[id]/image`(POST 추가·PATCH 대표·DELETE, 대표삭제 시 승격) · **`/api/corkage/options`**(GET `{무료:[],유료:[]}`·POST{kind,value} upsert·DELETE{kind,value} — 콜키지내역 프리셋 관리).
- **주소 자동완성(2026-07-24)**: 등록폼 장소명 입력 시 디바운스로 `GET /api/geo/search?q=` → 드롭다운(장소명·주소·업종) 선택 시 **이름·지역·주소·전화·링크 자동입력**(create POST가 address/phone/url 수용). 키 미설정 시 `no_key`로 조용히 비활성(수동 입력 가능).
  - **네이버 검색 API '지역 검색'** 사용(`openapi.naver.com/v1/search/local.json`, 헤더 `X-Naver-Client-Id/Secret`). 키=**네이버 개발자센터 Client ID/Secret**(NCP 지도/지오코딩 키와 다름! POI 키워드 검색은 검색 API임). env `NAVER_SEARCH_CLIENT_ID`·`NAVER_SEARCH_CLIENT_SECRET`(gitignore, 2026-07-24 설정됨). title `<b>`태그 제거, mapx/mapy=WGS84×1e7. ⚠️display 최대 5건·telephone 대부분 빈값.
  - **네이버 지도 링크 자동 생성**: 지역 검색의 `link`는 업체 홈페이지(대부분 빈값)라, `url`=`https://map.naver.com/p/search/{장소명 지역}`(인코딩)로 지도 검색 링크 생성 → 선택 시 콜키지 `url`(🔗)에 자동 입력.
  - ※네이버 개인 즐겨찾기 직접 연동은 공식 API 없음 → 자동완성/공유링크 파싱으로 우회. NCP Maps(지오코딩·경로·정적지도)는 향후 별도 키(`X-NCP-APIGW-*`)로 확장 가능.
- **시트 양방향 머지(2026-07-24)**: 목록 상단 **`🔄 시트 동기화`** → `POST /api/corkage/sync` = **3-way merge**(기준 스냅샷 `corkage_place.sheet_baseline jsonb` 대비 시트·DB 양쪽 변경분 병합). ① 시트에만 있는 신규 장소 등록(네이버 주소 조회). ② 기존 장소: 머지대상 컬럼(방문상태·콜키지·콜키지내역·메인요리·지역·주소·전화·메모·옵션)별로 **시트만 바뀌면 시트값 채택→DB update / DB만 바뀌면 DB값 유지 / 둘 다 바뀌면 웹앱(DB) 우선**. 변경분만 update(updated_at 보존). ③ DB→시트 미러(머지값 + 종합평점·**등록일자**(created_at KST)·**지도링크**(맨 뒤 `=HYPERLINK(url,"Link")`)). 매 동기화 후 baseline 갱신. 최초 동기화는 base=현재 DB값(시트가 마지막 미러 상태라 가정)→시트 편집분 채택. 반환 `{added,merged,total}`. 실측: 시트에서 유락 수정+웹앱에서 뜯는밤 수정 → 양쪽 반영 확인. 반환 `{added,skipped,mirrored,results}`. **메인 요리 = `corkage_place.cuisine`**(전용 컬럼, memo `메인:` 이관, EDITABLE·상세 편집·왕복). 네이버 검색은 `src/lib/geo.ts`. 실측: 신규0·스킵11·미러12.
- **목록 페이지**: 인라인 등록폼(장소명[검색]·지역·구분·**콜키지내역**[텍스트박스형 드롭박스, 구분별 `datalist`]·방문상태·사진) + 필터(검색·구분·방문) + 정렬(최신/이름/평점/**방문구분**[방문예정 먼저]) + 카드(썸네일·구분뱃지[무료=초록·유료=주황, `· 내역` 병기]·방문뱃지·평점 별·**📷사진수·💬댓글수**·최신변경 KST·삭제). 목록 API가 imageCount·commentCount 집계.
- **상세 페이지**: 편집(장소명·지역·주소·**콜키지구분 select + 콜키지내역 콤보박스**[무료/유료 공통, `list=ck-detail-opts` datalist + `⚙` 프리셋 관리(칩 ✕삭제·추가 입력, `/api/corkage/options` POST/DELETE)]·방문상태·전화·링크) + **다중 사진 업로드**(순차·대표지정★·삭제·라이트박스) + **서비스(구조화, 2026-07-24 `20260724020000_corkage_service.sql`)** + 메모 + 💾 저장.
  - **① 서비스 옵션 카드**=`corkage_place.options text[]`(전용잔/얼음잔/얼음 제공/냉장보관/디캔터/잔 무료 토글 칩) + 메모.
  - **② 부문 평점 카드(별도 섹션, 읽기전용 집계, 2026-07-24 변경)**: 부문 평점(맛·분위기·응대·쉐어링·가성비)은 **장소 자체 입력 폐지 → 댓글로만 입력**. 이 카드는 **나 포함 댓글 남긴 사람들의 부문별 평균 + 종합(부문평균들의 평균, 0.5단위) + N명 평균**을 읽기전용 표시(`aggregateComments`). 평점 없으면 안내문. `corkage_place.service_ratings`(장소 자체)는 미사용. **종합 `rating`은 댓글 변경 시 서버에서 재계산**(`/comment` POST/PATCH/DELETE의 `recomputeRating` → 목록 별점·정렬 반영). 저장 payload에서 place rating/service_ratings 제거.
  - ※상세 페이지 `Row`·`inp`는 **모듈 스코프**에 정의(컴포넌트 내부 정의 시 리렌더마다 input 언마운트→포커스 유실로 타이핑 불가 버그, 2026-07-24 수정).
- **댓글(2026-07-24, `20260724010000_corkage_comment.sql`)**: `hobby.corkage_comment`(place_id FK cascade·author[선택]·body·created/updated_at 트리거·**`service_ratings jsonb`** 2026-07-24 추가). **누구나 작성/수정/삭제**(인증 없음). API `/api/corkage/[id]/comment`(POST·PATCH{commentId}·DELETE{commentId}, `service_ratings` 수용), 상세 GET에 `comments` 포함. 상세 페이지 💬 댓글: 이름(선택)+내용+**부문 평점(선택, 장소와 동일 맛/분위기/응대/쉐어링/가성비)** 입력, 각 댓글에 작성자·종합별점·부문내역·시각(KST)·✎수정(평점 포함)·✕삭제. 헤더에 **방문자 평균**(평점 남긴 댓글들 종합 평균). 공용 컴포넌트 `Stars5`(클릭=정수·재클릭 0.5)·`DimRatings`.

- 주류 관련 물품(잔·디캔터·바도구 등) 등록·관리. 테이블 `hobby.accessory`(name·category·brand·status·price·shop·description·memo·image_url). 마이그레이션 `20260713030000_accessory.sql`(service_role/anon GRANT 포함).
- 분류(category): 글라스/디캔터/바도구/보관·제빙/기타. 상태(status): 보유/구매희망.
- **등록 시 분류·브랜드·설명 미입력이면 Claude(sonnet-5) `accessoryInfo`가 자동 보완**(`src/lib/translate.ts`). 예: "글렌캐런 위스키잔"→글라스/Glencairn, "기네스 나이트로 서지"→바도구.
- API: `GET/POST/DELETE /api/accessory`(POST multipart, 이미지 uploadImage→whisky 버킷 재사용), `PATCH /api/accessory/[id]`(JSON 텍스트필드 편집 / multipart 이미지 교체).
- UI: 등록폼(품목명+분류·상태·브랜드·가격·구매처·사진) + 필터(검색·분류·상태) + 카드(이미지 라이트박스·뱃지·인라인 수정/삭제). 홈 카드 🍷 액세서리 · Sidebar `🍷 액세서리`.

## 현황 / TODO

- [x] my-health 기반 셸 스캐폴딩 + 배포(3003) + nginx + 홈 링크 + 10.6 라우팅
- [x] 위스키 기능: hobby 스키마(3NF) + API + `/whisky` UI + 웹검색 시세 수집
- [x] 위스키 용어사전 `/glossary`: `hobby.term`(term·term_en·category·definition·source·image_url) 시딩(5분류) + 검색·분류색인 + 용어별 이미지첨부·출처, API `/api/term`·`/api/term/[id]`·`/api/term/[id]/image`. 홈·Sidebar 바로가기.
  - **텔레그램 대화 기반 일괄 등록(2026-07-18)**: cokacdir 세션에서 위스키 제조공정(맥아화~병입) Q&A로 다룬 용어 28개를 `POST /api/term` 반복 호출로 일괄 추가(아밀라아제·전분·콩제너·아메리칸/유러피안오크·버진오크·바닐린·오크락톤·매링·솔레라시스템·쉐리캐스크 세부 6종(피노/만자니아/아몬티야도/팔로코르타도/올로로소/PX)·포트캐스크 2종(루비/토니)·마데이라·마르살라캐스크·칠필터링·E150a·브리딩·스파이시·스모키·스트레이트·더블·가수). source=`대화 기반 정리 2026-07-18`. 총 용어 수 37→65개.
  - **유튜브 링크로 용어 추가** `POST /api/term/from-youtube`(`{url, transcript?}`): `src/lib/youtube.ts`가 **자막 자동수집을 다중 전략으로 시도** → Claude(sonnet-5) `extractWhiskyTerms`(`src/lib/translate.ts`)가 용어 추출 → `term` upsert(중복무시, source=`YouTube: {url}`). `/glossary` 헤더 `🔗 유튜브로 추가` 버튼 → URL 입력·[가져오기](약 5초 자동시도), 실패 시 자막 textarea 노출(붙여넣기 폴백).
    - **자동수집 파이프라인**(`fetchTranscript`): ① 워치페이지 captionTracks → ② Invidious 공개 인스턴스 목록+본문 프록시 → ③ **yt-dlp**(`YTDLP_PATH`, `--write-auto-subs` json3/vtt 파싱). 첫 성공값 사용, 전부 실패 시 `needTranscript:true`.
    - **⚠ 이 서버는 Azure 데이터센터 IP → 유튜브가 봇으로 전방위 차단**(워치페이지·InnerTube·Invidious 본문·무쿠키 yt-dlp 모두 빈응답/"Sign in to confirm you're not a bot"). 검증(2026-07-13): 무쿠키로는 3전략 전부 실패.
    - **자동수집을 실제로 성공시키려면 쿠키 필요**: 브라우저에서 내보낸 youtube.com `cookies.txt`(Netscape)를 `YT_COOKIES_PATH`(=`/home/beamrock/.config/yt-cookies.txt`)에 두면 yt-dlp가 차단 우회 → **링크만으로 자동추출**. 파일 없으면 `--cookies` 미부여(그레이스풀). 쿠키는 주기적으로 만료되므로 재-export 필요.
- [ ] 위스키 시세 수집 자동화(웹검색 → 적재) 확대 · 다른 취미(독서/영화/게임) 추가
- [ ] git repo 생성·GitHub 푸시 (현재 VM 로컬만 — VM 변경 대비 필요)
