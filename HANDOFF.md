# Claude Code 인계 — TarkovDex 상단 메뉴 3개 + 게임 모드 3종

이 파일을 Claude Code(로컬 CLI)에게 그대로 붙여넣거나
`claude "HANDOFF.md 읽고 이어서 해줘"` 로 시작하세요.

---

## 지금 상태

작업은 **코드상으로는 끝났고 커밋까지 완료**됐습니다. 남은 건 (1) 실제 데이터 확인,
(2) 시즌 모드 경로 확정, (3) push, (4) 배포 — 네 가지 전부 네트워크가 필요해서
클라우드 세션에서 못 한 것들입니다.

- 브랜치: `redesign/single-page-dashboard`
- 커밋: `d4d0f44 Restore topic navigation and add a third game mode`
  (그 아래 `e509971 refactor: reduce TarkovDex to a single live dashboard`)
- 원격 push: 안 됨 (클라우드 세션 권한 문제). 로컬에서 하면 됩니다.

로컬에 `d4d0f44` 이 아직 없다면 프로젝트 폴더의 번들에서 가져오세요:

```bash
git fetch ./tarkovdex-nav-restore.bundle redesign/single-page-dashboard
git checkout redesign/single-page-dashboard
git merge FETCH_HEAD
npm install
```

---

## 이번 커밋에서 바뀐 것

**상단 네비 3개** — 보스 스폰률 `/bosses` / 은신처 제작 `/hideout` / 건스미스 `/gunsmith`.
1024px 미만에서 네비만 햄버거로 접히고 모드·언어 스위처는 계속 노출.

**메인은 요약, 전용 페이지는 전체.** 같은 서버 함수 `getBoardData(locale, view)` 가
세 가지 형태를 만듭니다 — 메인은 차익 상위 6개 + 인기 맵 9개, `/hideout` 은 전 제작대,
`/bosses` 는 전 맵. 생산자가 하나라 요약과 전체가 서로 다른 숫자를 말할 수 없습니다.

**게임 모드 3종** — `GameMode = 'regular' | 'pve' | 'seasonal'`.
업스트림 경로는 `lib/tarkov.ts` 의 `MODE_PATH` 를 거치고, 시즌만
`TARKOV_SEASONAL_PATH` 환경변수(기본 `seasonal`)에서 읽습니다.
경로가 안 맞으면 해당 모드 보드는 "불러오지 못했습니다" 를 표시하고
**PvP 데이터로 대체하지 않습니다.**

**건스미스 원본 복원** — 솔버 스냅샷(`src/lib/gunsmith-builds.json`, 27개 퀘스트 × 2모드),
한글 퀘스트 용어집(`src/lib/task-ko.json`), `getTraders()`, `getGunsmithTasks()` 전부
단일 페이지 개편 이전 그대로. 페이지 껍데기만 지금 사이트 방식으로 다시 씀.
폴링 없음, ISR 6시간.

전체 설계 근거는 `CLAUDE.md` 맨 끝
"2026-08-12 nav restored: three topic pages, three game modes" 절에 있습니다.

---

## 남은 일 (순서대로)

### 1. 실제 데이터 확인 — 가장 중요

클라우드 샌드박스에서 `json.tarkov.dev` 가 프록시 403 으로 막혀 있어서
**모든 보드가 오류 상태로만 렌더됐습니다.** 레이아웃/상호작용/빌드는 검증됐지만
숫자가 실제로 그려지는 건 확인이 안 됐습니다.

```bash
npm run build && npm start   # http://127.0.0.1:3000
```

`next dev` 말고 `next start` 로 볼 것 (dev 는 이전 라우트를 DOM 에 숨겨 둬서
`getBoundingClientRect()` 가 0 을 반환함 — CLAUDE.md 에 기록된 함정).

확인할 것:
- `/ko` — 제작 차익 6개, 보스 맵 9개가 실제 숫자/이름/아이콘으로 나오는지
- `/ko/hideout` — 전 제작대가 나오고, 오래된 가격 그룹이 아래에 따로 뜨는지
- `/ko/bosses` — 전 맵이 나오고 인기 맵이 위쪽에 오는지
- `/ko/gunsmith` — **27개 퀘스트 칩, 부품 목록, 아이콘, 조건 충족 수치**
  (PvP / PvE 양쪽 다). 여기가 검증 공백이 제일 큰 곳입니다.
- 헤더에서 모드 전환 시 네트워크 요청이 새로 안 나가는지 (DevTools Network)

### 2. 시즌 모드(PvP S) 경로 확정

```bash
curl https://json.tarkov.dev/endpoints
curl -o /dev/null -w "%{http_code}\n" https://json.tarkov.dev/<후보>/maps
```

200 나오는 이름을 찾아서:
- 로컬 `.env.local` 에 `TARKOV_SEASONAL_PATH=<이름>`
- Vercel Project → Settings → Environment Variables (Production) 에도 동일하게

업스트림에 시즌 문서가 아예 없으면 그대로 두면 됩니다 — PvP S 선택 시
오류 상태가 뜨는 게 의도된 동작입니다.

건스미스는 별도로, 시즌 모드용 스냅샷이 없어서
"이 모드의 건스미스 조립 데이터가 아직 없습니다" 로 나옵니다.
필요하면 `node scripts/generate-gunsmith-builds.mjs` 를 시즌 모드로 재실행해야 합니다.

### 3. push

```bash
git push -u origin redesign/single-page-dashboard
```

### 4. 배포

이 저장소는 Vercel 에 git 연동이 안 돼 있어서 push 로는 배포가 안 됩니다. CLI 로:

```bash
npx vercel deploy --prod
```

배포 후 실제 프로덕션에서 확인:

```bash
curl -s https://tarkovdex.dev/sitemap.xml | grep -c "<loc>"        # 12 이어야 함
curl -o /dev/null -w "%{http_code} %{redirect_url}\n" https://tarkovdex.dev/ko/maps
curl -o /dev/null -w "%{http_code} %{redirect_url}\n" https://tarkovdex.dev/ko/progression/gunsmith
```

Search Console 에 사이트맵 재제출하면 새 3개 페이지 색인이 빨라집니다.

---

## 바뀐 주소 (참고)

| 이전 | 이후 |
| --- | --- |
| `/maps` | `/bosses` (308) |
| `/progression/gunsmith` | `/gunsmith` (308) |
| `/economy/crafts` | `/hideout` (308) |
| `/api/dashboard` | `/api/board?view=home\|hideout\|bosses` |

## 이미 검증된 것 (다시 안 해도 됨)

`typecheck` / `lint` / production build 통과, 18페이지, 콘텐츠 라우트 4개 모두
prerender 확인(`.next/prerender-manifest.json` 직접 확인). `next start` 대상
375px·1280px 에서 `/ko`, `/ko/bosses`, `/ko/hideout`, `/ko/gunsmith`, `/en`,
`/en/gunsmith` — 가로 넘침 0, 44px 미만 터치 타깃 0, 콘솔 에러 없음(차단된
네트워크 제외). 375px 햄버거 동작·이동 시 자동 닫힘 확인, 1024px 풀 네비 넘침 0.
모드 버튼 3개, 전환 시 상태 바 라벨 변경, `localStorage` 로 페이지 이동 후에도 유지.
메시지 키 ko/en/zh 151개 동일.
