# Pixel

> **MilkChoco** (`com.gameparadiso.milkchoco`) 전용 Frida 기반 데스크톱 치트 / 자동화 도구
>
> Electron + TypeScript + Frida (`frida-node`) + ADB + Tailwind 로 구성된 PC 클라이언트입니다.
> 안드로이드 단말(에뮬레이터 또는 USB 디바이스)에 frida-server를 푸시·실행한 뒤 MilkChoco 프로세스에 attach하여
> 메모리 패치, 함수 후킹, RPC 호출, 키 입력 감지, 오버레이 HUD 등 다양한 치트 기능을 제공합니다.

> ⚠️ **고지사항** — 이 저장소는 학습 및 게임 내부구조 연구를 위한 코드입니다.
> 실제 운영 중인 게임 서버에 사용 시 해당 게임의 이용약관 위반 / 계정 정지의 책임은 사용자에게 있습니다.

---

## 목차

- [Pixel](#pixel)
  - [목차](#목차)
  - [1. 아키텍처 개요](#1-아키텍처-개요)
  - [2. 시스템 요구사항](#2-시스템-요구사항)
  - [3. 설치 및 빌드](#3-설치-및-빌드)
    - [3.1 의존성 설치](#31-의존성-설치)
    - [3.2 개발 모드 실행](#32-개발-모드-실행)
    - [3.3 프로덕션 빌드 (Windows EXE)](#33-프로덕션-빌드-windows-exe)
    - [3.4 환경 변수 (`.env`)](#34-환경-변수-env)
  - [4. 사용 흐름](#4-사용-흐름)
    - [Step 1. 로그인](#step-1-로그인)
    - [Step 2. 단말 연결 (Initialize 탭)](#step-2-단말-연결-initialize-탭)
    - [Step 3. EPOS 잠금](#step-3-epos-잠금)
    - [Step 4. 치트 사용](#step-4-치트-사용)
  - [5. 기능 상세](#5-기능-상세)
    - [5.1 조준 보조 (Aim)](#51-조준-보조-aim)
    - [5.2 ESP / 시각 정보](#52-esp--시각-정보)
    - [5.3 무기 / 전투](#53-무기--전투)
    - [5.4 이동 / 위치](#54-이동--위치)
    - [5.5 텔레포트 (Capture-the-Milk)](#55-텔레포트-capture-the-milk)
    - [5.6 디버프 (Debuff)](#56-디버프-debuff)
    - [5.7 강퇴 (Kicker / Slot Kicker)](#57-강퇴-kicker--slot-kicker)
    - [5.8 좌표·스킬·기타 변경 (Changer)](#58-좌표스킬기타-변경-changer)
    - [5.9 리소스 해킹 / 유틸리티](#59-리소스-해킹--유틸리티)
    - [5.10 매크로 (Macro)](#510-매크로-macro)
    - [5.11 블랙홀 (Blackhole)](#511-블랙홀-blackhole)
  - [6. 단축키 시스템](#6-단축키-시스템)
  - [7. 설정 (Settings)](#7-설정-settings)
  - [8. 서버 / 모바일 컨트롤러 (Mobile Controller)](#8-서버--모바일-컨트롤러-mobile-controller)
  - [9. 플러그인 (Plugins)](#9-플러그인-plugins)
  - [10. 파인더 (Finder)](#10-파인더-finder)
  - [11. 개발자 모드 \& 콘솔](#11-개발자-모드--콘솔)
  - [12. 다국어 지원](#12-다국어-지원)
  - [13. 자동 업데이트](#13-자동-업데이트)
  - [14. 빌드 / 릴리즈 (CI)](#14-빌드--릴리즈-ci)
  - [15. 프로젝트 구조](#15-프로젝트-구조)
  - [16. 트러블슈팅](#16-트러블슈팅)
  - [17. 면책](#17-면책)

---

## 1. 아키텍처 개요

```
┌──────────────────────┐      ipc       ┌──────────────────────┐
│  Renderer (main.html)│ ◀───────────▶ │  Electron Main (Node) │
│   - HUD overlay      │                │  - ADB / frida-server │
│   - 설정 UI          │                │  - keyboard listener  │
│   - 매크로 편집기    │                │  - Express plugin srv │
└──────────────────────┘                └──────────┬───────────┘
                                                   │ frida RPC
                                                   ▼
                                      ┌────────────────────────┐
                                      │ Agent.js (in-process)  │
                                      │  - 메모리 패치          │
                                      │  - 후킹 / NativeFunction│
                                      │  - 좌표·스킬 변경       │
                                      │  - 텔레포트             │
                                      └────────────────────────┘
                                                   ▲
                                                   │ attach
                                      com.gameparadiso.milkchoco
                                            (Android process)
```

- **메인 프로세스** (`src/index.ts`): Electron, ADB 자동 연결, frida-server 배포 / 실행, 글로벌 키 후킹, IPC 라우터, 자동 업데이트.
- **렌더러** (`src/main.ts`, `public/main.html`): UI / 설정 / 오버레이 표시, 단축키 설정, 매크로 편집.
- **레이아웃 오버레이** (`src/layout.ts`): 게임 위에 띄우는 클릭-스루 윈도우(에임 원, ESP 등).
- **Frida Agent** (`src/scripts/agent.ts` → `dist/scripts/agent.js`): 게임 메모리에 직접 작용. 패치값과 심볼 오프셋은 빌드 시 `scripts/inject-offsets.cjs`가 주입합니다.

---

## 2. 시스템 요구사항

| 항목 | 권장 |
| --- | --- |
| OS | Windows 10/11 x64 (배포 EXE 빌드 기준) |
| Node.js | 20 LTS |
| 의존 도구 | `adb` (Platform Tools), 안드로이드 디바이스(루트) 또는 LDPlayer / MEmu 등 에뮬레이터 |
| Frida | `16.4.10` (자동 다운로드·푸시) |
| 게임 | MilkChoco 안드로이드 클라이언트 (`com.gameparadiso.milkchoco`) |

---

## 3. 설치 및 빌드

### 3.1 의존성 설치

```bash
git clone https://github.com/asp1-rin/pixel.git
cd pixel
npm install   # 또는 bun install
```

### 3.2 개발 모드 실행

```bash
# 별도 터미널: TypeScript + Tailwind watcher
npm run watch

# 별도 터미널: Electron 실행
npm run start
```

### 3.3 프로덕션 빌드 (Windows EXE)

```bash
npm run build      # tsc + tailwind + agent + offset 주입
npm run dist       # electron-builder → build/pixel-Setup-X.Y.Z.exe
```

`scripts/inject-offsets.cjs`가 `src/offsets.ts`의 값을 `public/scripts/agent.js`의 `JSON.parse('/*...*/')` 자리표시자에 채워 넣습니다.
**게임이 업데이트되어 심볼이 바뀌면 오프셋만 갱신**하면 됩니다 (`src/offsets.ts`).

### 3.4 환경 변수 (`.env`)

`.env.example` 참고:

```env
# 로그인 백엔드 (기본값 그대로 두면 됨)
PIXEL_WEB_URL=https://pixel-code-web.vercel.app

# 개발 편의: 로그인 화면 스킵 (배포에선 사용 금지)
# PIXEL_DEV_BYPASS_AUTH=true
```

---

## 4. 사용 흐름

### Step 1. 로그인

앱 실행 → 로그인 화면에서 발급받은 키 입력 → `PIXEL_WEB_URL` 의 `/api/pixel/login` 으로 인증.
일반 사용자는 ID 1개, 관리자(`admin`)는 풀 기능을 사용할 수 있습니다.

### Step 2. 단말 연결 (Initialize 탭)

1. **Serial** 입력 (기본 `127.0.0.1:5555` — 에뮬레이터 ADB 포트)
2. **Connect ADB** — 단말 연결 / TCP 전환
3. **Start Server** — 매칭되는 아키텍처(arm/arm64/x86/x86_64)의 frida-server 자동 푸시·실행
   - 단말에 frida-server 가 없으면 **Download Server** 또는 **Upload Server** 로 직접 배포
4. **Connect Frida** — frida 디바이스에 attach
5. **Get Cookie** (선택) — 게임 서버 통신용 쿠키 추출
6. **Start Agent** — `agent.js` 를 spawn / attach 모드로 주입

각 단계의 상태는 표시등(녹/적/회색)으로 확인 가능합니다.

### Step 3. EPOS 잠금

- **EPOS Number** 칸에 내 유저 번호(In-game user ID) 입력 → 자동으로 자신의 엔티티 포인터(`epos`)를 찾고 락온합니다.
- EPOS 가 잡혀야 좌표 변경 / 텔레포트 / 디버프 / Aimbot 등 본인 기준 기능들이 작동합니다.
- **Except Number** 에 콤마(`,`)로 분리된 적용 제외 유저 ID 입력. 옆 체크박스(`reverse`)로 화이트리스트/블랙리스트 토글.

### Step 4. 치트 사용

치트 패널에서 토글 / 단축키 설정 / 매크로 실행 / 텔레포트 버튼 클릭 등으로 사용합니다.

---

## 5. 기능 상세

> 토글 한 번으로 ON/OFF 되는 항목은 ▶ 마크, 단축키 지정이 필요한 항목은 ⌨ 마크로 표시했습니다.

### 5.1 조준 보조 (Aim)

| 기능 | 설명 |
| --- | --- |
| **Aimbot** ⌨ | 키 누름 동안 시야 내 적의 머리 / 몸으로 자동 조준. 모드(normal/smooth/instant), 속도, 각도 제한, 피치 오프셋, 가속도, 주무기 한정, 팀/마크/사망자 제외 설정 가능 |
| **Aim Assist** ▶ | 사격 중일 때만 살짝 끌어당기는 패시브 조준 보조. 속도·각도·감쇠 조절 |
| **Aim by Circle** ⌨ | 화면 중앙 원형 영역 안에 들어온 적만 조준. 반지름·색·벽 체크·HUD 표시 |

### 5.2 ESP / 시각 정보

| 기능 | 설명 |
| --- | --- |
| **ESP** ▶ | 적 위치 시각화. 트레이서(라인), 3D 박스, 닉네임/번호 태그, HP·실드 바, 본인/팀/마크/사망자 색 분리 |
| **ESP Mark** ⌨ | 십자선 안 적을 일시 표시/제외 (Except Number 와 연동) |

### 5.3 무기 / 전투

| 기능 | 종류 | 설명 |
| --- | --- | --- |
| **No Recoil** | ▶ | 반동 제거 |
| **No Spread** | ▶ | 탄퍼짐 0 (각종 idle/jump/move/zoom 패치 일괄) |
| **Infinite Ammo** | ▶ | 무한 탄약 |
| **No Reload** | ▶ | 재장전 무효 (주석으로 비활성, 필요 시 활성화) |
| **No Timer** | ▶ | 재장전·수류탄·리스폰 타이머 0 (개별 토글) |
| **No Clip** | ▶ | 벽 통과 |
| **One Kill** | ▶ | 한 방 킬 (헤드샷·몸샷 동시 패치) |
| **Skill Damage** | ▶ | 스킬 데미지 강화 |
| **Shoot Speed** | ⌨ | 키 누름 동안 연사 속도 / 사거리 증가 |
| **Anti Hook** | ▶ | 적 후크/스킬 무시 |

### 5.4 이동 / 위치

| 기능 | 설명 |
| --- | --- |
| **Fly** ⌨ | 위·아래 키로 상승/하강. 속도 조절 |
| **Move Speed** ⌨ | 키 누름 동안 이동 속도 배수 |
| **Infinite Jump** ⌨ | 공중에서도 점프 (낙하 상태 강제 0) |
| **Upskill** ⌨ | 스킬 게이지 즉시 충전 (1회 / 지속 모드) |
| **Grenade** ⌨ | 키 누름 동안 자동 / 빠른 수류탄 투척 |
| **Hide Me** ▶ | 본인 모델 / 닉네임을 적 클라이언트에서 숨김 시도 |
| **Changer** | XYZ / 스킬 코드 / 진영 반전 / NaN 좌표(언프리즈) / 광고 보상 등 즉시 입력 변경 |

### 5.5 텔레포트 (Capture-the-Milk)

**최근 추가 기능.** 우뺏(CTM) 4개 맵 각각에 대해 밀크/초코 픽업 포인트 8개의 좌표를 등록해 두고, 버튼 클릭 한 번으로 그 위치로 워프합니다.

1. 치트 패널 → **Teleport** 섹션 펼치기
2. 맵 선택 (기본 / 사막 / 성 / 산)
3. **Milk 1~4** / **Choco 1~4** 버튼 → 즉시 해당 좌표로 이동
4. 내부적으로는 기존 `pos` IPC 채널을 통해 `epos.x/y/z` 에 좌표 기록 (`teleport()` 와 동일 메커니즘)

좌표 원본 데이터는 [`For Claude/capture milk data.txt`](./For%20Claude/capture%20milk%20data.txt) 에 보관되어 있습니다.

### 5.6 디버프 (Debuff)

| 기능 | 설명 |
| --- | --- |
| **Debuff** ⌨ | 십자선 안 모든 적에게 전기/마법(Mago) 디버프 자동 반복. interval(초) 조절 |
| **Electric** ⌨ | 단발 전기 디버프 |
| **Mago** ⌨ | 단발 마법 디버프 |

### 5.7 강퇴 (Kicker / Slot Kicker)

| 기능 | 설명 |
| --- | --- |
| **Kicker** ⌨ | 십자선 안 적을 자동 강퇴 |
| **Auto Kick** ▶ | 게임 시작 시 자동 강퇴 시도 |
| **By ID Kick** | 특정 유저 ID 강퇴 (구매 패키지 토큰 0 송신을 이용) |
| **Slot Kicker** | 1~10번 슬롯 / 적팀 전원 강퇴 (`FMatchKickUserSlot`) |
| **Kick Loop** | 지정 슬롯을 일정 간격으로 반복 강퇴 (50~5000ms) |

### 5.8 좌표·스킬·기타 변경 (Changer)

- **XYZ 입력칸** : 실시간으로 본인 좌표 변경
- **Reverse** ⌨ : 진영 반전 (상대팀 진영으로 워프)
- **Skill Code** : 캐릭터 코드 변경 (캐릭터 외형 / 스킬 셋 즉시 교체)
- **Change NaN** : 좌표를 NaN 으로 만들어 무적 상태 트릭
- **Change Ads Reward** : 광고 시청 보상 자동 청구

### 5.9 리소스 해킹 / 유틸리티

| 기능 | 설명 |
| --- | --- |
| **Unlock All Item** | 입력한 캐릭터 ID 의 모든 의상 / 스킨 / 이펙트 해금 |
| **Unlock All Char** | 모든 캐릭터 해금 |
| **Get Daily Reward** | 출석 보상 반복 청구 |
| **Change Nickname** | 닉네임 즉시 변경 |
| **Purchase Pass** | VIP / 영웅 패스 / 단계별 청구 |
| **Create / Break Clan** | 클랜 즉시 생성 · 해체 |
| **Buy Clan Gold** | 클랜 골드 반복 구매 |
| **Equip Spyra / MH9** | 특정 캐릭터에 특정 무기 강제 장착 |

### 5.10 매크로 (Macro)

- `Macros` 탭에서 `id` 단위로 매크로 생성
- 각 매크로는 `xa` / `an` / `epos` 베이스에 offset 이름, 타입(`float` / `int32` / `int16` / `byte`), 대상(`self` / `enemy` / `all`), 값을 가진 이벤트 시퀀스
- 매크로 ID 별 단축키 지정 → 키 누름 시 즉시 실행
- 치트 UI에서 매크로 단축키 칸 자동 생성

### 5.11 블랙홀 (Blackhole)

⌨ 키 누름 동안 모든 적을 사용자 위치(crosshair) 또는 지정 좌표(position)로 빨아들입니다.

- **distance** : 흡수 반경
- **prevent-lagger** : 렉 유발 적 제외
- **force-drop** : 강제 낙하 모드
- 팀 / 마크 / 사망자 제외 옵션

---

## 6. 단축키 시스템

- 모든 키바인드 입력 칸은 클릭 후 키 입력 → 자동 저장 (`localStorage`)
- 메인 프로세스의 [`node-global-key-listener`](https://www.npmjs.com/package/node-global-key-listener) 가 글로벌 키 이벤트를 감지해 agent 로 전달
- 키맵 변환 테이블은 `src/main.ts` 상단 `keymap`, agent 용은 `src/keymaps.ts` 에 있습니다.
- 게임 창이 비활성 상태여도 키가 작동하도록 글로벌 후킹을 사용합니다.

---

## 7. 설정 (Settings)

| 항목 | 설명 |
| --- | --- |
| **Frame** | 오버레이 / agent loop FPS (기본 60, 1~120) |

---

## 8. 서버 / 모바일 컨트롤러 (Mobile Controller)

내장 Express 서버를 사용하면 폰의 자이로 센서를 PC 마우스처럼 쓸 수 있습니다.

1. **Plugins → Server → Mobile Controller** 체크
2. **Server → Manager → Start** (포트 기본 3000)
3. 폰 브라우저로 `http://<PC-LAN-IP>:3000/mobile` 접속
4. **Gyro Scope** ON → 폰을 기울이면 게임 시점이 따라옴
   - `Use Gamma` (좌우축 변경), `Invert`, `Sensitivity` 옵션

소켓 통신은 `socket.io` 기반이고, 컨트롤러 페이지 정적 자원은 `public/routes/mobile_controller.html` 에 있습니다.

---

## 9. 플러그인 (Plugins)

추후 확장을 위한 토글 영역.

| 플러그인 | 설명 |
| --- | --- |
| `plugin-server-mobile-controller` | 위 모바일 컨트롤러 활성화 |
| `plugin-utility-replay` | (개발 중) 리플레이 시스템 |

---

## 10. 파인더 (Finder)

- 게임에서 만났던 모든 유저의 데이터(`WPData`)를 누적 저장합니다.
  - 닉네임 변경 이력
  - 캐릭터별 경험치 · 총킬 · 총데스 · 총어시
- **Search Player** : 번호(`number`) 또는 닉네임(`nickname`) 으로 검색
- 결과를 `details` 로 확장해 캐릭터별 통계 / 닉네임 변천사 확인

---

## 11. 개발자 모드 & 콘솔

> 키 / 토큰에 `admin` 권한이 있어야 표시됩니다.

| 기능 | 설명 |
| --- | --- |
| **CMD** | agent 컨텍스트에서 `eval()` 실행 (Frida JS) |
| **Ranges** | 메모리 영역(`Process.getRangeByAddress` 등) 조회 |
| **JIT Pattern Search** | JIT 영역 내 바이트 패턴 검색 |
| **Performance** | agent 메인 루프 평균 / 최대 실행 시간 모니터링 |
| **Console** | agent → 메인 → 렌더러로 들어오는 로그 라이브 출력. 명령 입력 칸 |

내부적으로 사용되는 RPC exports (agent.ts `rpc.exports`):

```
readArrayBytes / readByte / readInt16 / readInt32 / readFloat / readDouble / readPointer
writeArrayBytes / writeByte / writeInt16 / writeInt32 / writeFloat / writeDouble / writePointer
scan / enumerateModules
```

이를 통해 `Commander` (`src/commander.ts`) 가 `search` / `hook` / `unhook` / `call` / `read` / `write` 같은 콘솔 명령을 제공합니다.

---

## 12. 다국어 지원

영어 / 한국어 / 일본어 / 중국어(간체) 4개 언어. 상단 `<select id="lang">` 로 즉시 전환.

- 사전 데이터: `src/main.ts` 의 `lan` 객체 (키 → 언어별 문자열)
- HTML 요소: `data-lang="key"`, `data-lang-ph="key"`(placeholder), `data-lang-v="key"`(value)
- 새 키 추가 시 4개 언어 모두 채우는 것이 관례입니다.

---

## 13. 자동 업데이트

[`electron-updater`](https://www.electron.build/auto-update) 를 사용해 GitHub Releases 에서 신버전 EXE 를 자동으로 받아옵니다.

- Provider : GitHub (`asp1-rin/pixel`)
- 로그인 화면에서 진행률 바로 다운로드 상태 표시
- 사용자가 별도 조작 없이 받아지고, 다음 실행 시 적용

---

## 14. 빌드 / 릴리즈 (CI)

`.github/workflows/build.yml` :

- 트리거
  - `v*` 태그 push
  - `main` 브랜치 push (커밋 메시지에 `[release]` 포함 시)
  - 수동 `workflow_dispatch`
- 동작
  1. `package.json` 의 version 으로 태그 결정 (`v$version`)
  2. 같은 태그의 기존 릴리즈 / 태그 삭제 (rebuild 모드)
  3. `npm install && npm run build && npm run dist`
  4. `softprops/action-gh-release` 로 `build/*.exe` 업로드

**버전 그대로 새 빌드 올리고 싶으면** : main 에 `[release]` 키워드를 포함한 커밋 push → 같은 버전 태그에 새 EXE 가 올라옵니다.

---

## 15. 프로젝트 구조

```
pixel/
├── For Claude/
│   ├── capture milk data.txt   # 4맵 × 밀크/초코 텔레포트 좌표 원본
│   └── offset.txt              # libMyGame.so 심볼 덤프
├── public/
│   ├── main.html               # 메인 UI
│   ├── layout.html             # 클릭-스루 오버레이 HUD
│   ├── renderer.js             # main.ts 컴파일 산출물 로더
│   ├── global.css              # Tailwind 소스
│   ├── output.css              # 빌드된 CSS
│   ├── scripts/
│   │   └── agent.js            # 빌드된 Frida agent (offset 주입 후)
│   └── routes/
│       ├── main.html           # Express 서버 루트
│       └── mobile_controller.html
├── scripts/
│   └── inject-offsets.cjs      # offsets.ts → agent.js placeholder 주입
├── src/
│   ├── core/
│   │   └── server.ts           # Express + socket.io 플러그인 서버
│   ├── data/
│   │   ├── auth.ts             # pixel-code-web 로그인
│   │   ├── frida.ts            # ADB / frida-server 자동 배포
│   │   └── utils.ts            # createWindow 등
│   ├── scripts/
│   │   ├── agent.ts            # Frida agent 본체 (TS)
│   │   └── inj.ts              # inj.js (frida CLI 디버깅용)
│   ├── ui/
│   │   ├── dom.ts              # $/$_/$i/$c 셀렉터 헬퍼
│   │   └── devtools.ts         # perf overlay 등
│   ├── commander.ts            # 콘솔 명령(call/hook/search/...) 핸들러
│   ├── index.ts                # Electron 메인 프로세스 진입점
│   ├── main.ts                 # 렌더러 진입점
│   ├── layout.ts               # 오버레이 렌더링
│   ├── login.ts                # 로그인 화면
│   ├── keymaps.ts              # 글로벌 키 ↔ agent 키 변환표
│   ├── offsets.ts              # 게임 빌드별 심볼 / 패치값 (★빈번 갱신)
│   └── preload.ts              # contextBridge 노출
├── package.json
└── tsconfig.json / tsconfig.scripts.json / tailwind.config.js
```

---

## 16. 트러블슈팅

| 증상 | 점검 사항 |
| --- | --- |
| **Connect ADB 실패** | `adb devices` 로 확인. 에뮬레이터의 ADB 디버깅 포트(5555) 사용 / USB는 디버깅 허용 |
| **Start Server 실패** | 단말 아키텍처 불일치. `Download Server` → 직접 적재 |
| **Connect Frida → Session not found** | frida-server 가 실행 중이지 않음. `adb shell ps -ef \| grep frida` |
| **Start Agent → Module 없음** | 게임이 실행 중이 아니거나 `com.gameparadiso.milkchoco` 외 패키지명. `process_name` 확인 (`src/index.ts:25`) |
| **EPOS not found** | EPOS Number(in-game user id) 오기재. 매치 진입 후 다시 시도 |
| **치트 토글이 회색** | `Start Agent` 가 끝나지 않음 또는 attach 끊김 |
| **빌드 시 `Cannot read agentSyms`** | `npm run inject-offsets` 실행 — agent.js placeholder 가 비어 있음 |

---

## 17. 면책

이 프로젝트는 게임 보안 / 메모리 분석 / Frida 학습 목적의 코드입니다.
실제 운영 서버에 대한 사용으로 발생하는 어떠한 책임도 저장소 작성자가 지지 않으며,
사용자는 본인이 사용하는 게임의 약관과 거주국의 관련 법령을 준수해야 합니다.
