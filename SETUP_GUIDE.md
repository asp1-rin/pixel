# Pixel — Setup & Run Guide / 설치 및 실행 가이드

> Bilingual guide. **English first, [한국어](#한국어-가이드) below.**
> Covers everything from a clean install → BlueStacks emulator → ADB → frida-server → agent attach.
>
> ⚠️ For educational / game internals research only. Using this against live game servers is at your own risk (ToS / ban).

---

## English Guide

### 0. Prerequisites

| Item | Requirement |
| --- | --- |
| OS | Windows 10/11 x64 |
| Node.js | 20 LTS |
| Android platform-tools | `adb` available on `PATH` |
| Emulator | **BlueStacks 5** (Android 9/11 instance) with **Root** + **ADB** enabled |
| Frida | `16.4.10` (auto-downloaded & pushed by the app) |
| Game | MilkChoco (`com.gameparadiso.milkchoco`) installed inside the emulator |

---

### 1. Install the project

```bash
git clone https://github.com/asp1-rin/pixel.git
cd pixel
npm install            # or: bun install
```

Create `.env` from the template (defaults are fine for normal use):

```bash
cp .env.example .env
```

```env
PIXEL_WEB_URL=https://pixel-code-web.vercel.app
# PIXEL_DEV_BYPASS_AUTH=true   # dev only — skip login screen
```

---

### 2. Build / run

**Development (two terminals):**

```bash
npm run watch     # terminal 1: tsc + tailwind + agent watchers
npm run start     # terminal 2: launch Electron
```

**Production EXE:**

```bash
npm run build     # tsc + tailwind + agent + offset injection
npm run dist      # electron-builder → build/pixel-Setup-X.Y.Z.exe
```

> If a later build fails with `Cannot read agentSyms`, run `npm run inject-offsets` (the `agent.js` placeholder was empty).

---

### 3. Prepare BlueStacks

1. Open **BlueStacks 5 → Settings (gear) → Advanced**.
2. Turn **ON** *Android Debug Bridge (ADB)*. Note the address it shows, e.g. `127.0.0.1:5555` (newer builds use a dynamic port like `127.0.0.1:5565`).
3. In the same **Advanced** tab turn **ON** *Root access* (frida-server needs `su`). Restart the instance if prompted.
4. (Recommended) **Settings → Performance** → ABI set to **x86 / x86_64** if you have a 64-bit instance — the app auto-detects the ABI, but a consistent instance avoids confusion.
5. Install and launch **MilkChoco** at least once inside BlueStacks so the package `com.gameparadiso.milkchoco` exists.

Verify ADB sees the emulator from your PC:

```bash
adb connect 127.0.0.1:5555
adb devices                 # should list 127.0.0.1:5555  device
adb -s 127.0.0.1:5555 shell su -c id   # should print uid=0(root)
```

If `su` does not return root, ADB/Frida steps will fail — re-check the Root toggle.

---

### 4. Connect & attach (in the app)

After login, open the **Initialize** tab and follow the steps top to bottom. Status lights: gray = idle, green = ok, red = error.

1. **Serial** — enter the BlueStacks ADB address (default `127.0.0.1:5555`; use the port from step 3.2 if different).
2. **Connect ADB** — connects and switches to TCP/IP mode. Light turns green.
3. **Start Server** — auto-detects ABI (`arm/arm64/x86/x86_64`), downloads matching `frida-server 16.4.10`, pushes to `/data/local/tmp`, `chmod 777`, and runs it via `su -c`.
   - If push/run fails (architecture mismatch, etc.), use **Download Server** then **Upload Server** to place it manually.
4. **Connect Frida** — attaches to the Frida device for that serial.
5. **Get Cookie** *(optional)* — extracts the game session cookie.
6. **Start Agent** — spawns/attaches `com.gameparadiso.milkchoco` and injects `agent.js`. When green, the game launches/resumes and cheat toggles become active.

Then set **EPOS Number** (your in-game user ID) on the cheat panel so self-based features (teleport, aim, debuff…) lock onto your entity.

---

### 5. Troubleshooting

| Symptom | Check |
| --- | --- |
| Connect ADB fails | `adb devices`; correct BlueStacks ADB port; ADB toggle ON |
| Start Server fails | ABI mismatch → use Download/Upload Server; Root access ON |
| Connect Frida → *Session not found* | frida-server not running: `adb shell ps -ef \| grep frida` |
| Start Agent → *Module not found* | Game not running, or wrong package. Confirm `com.gameparadiso.milkchoco` |
| `su` not root | BlueStacks → Advanced → Root access ON, restart instance |
| EPOS not found | Wrong in-game user ID; enter a match then retry |
| Cheat toggles stay gray | Start Agent didn't finish / attach dropped — redo from step 4 |
| Build: `Cannot read agentSyms` | Run `npm run inject-offsets` |

---
---

## 한국어 가이드

### 0. 사전 준비물

| 항목 | 요구사항 |
| --- | --- |
| OS | Windows 10/11 x64 |
| Node.js | 20 LTS |
| 안드로이드 platform-tools | `adb` 가 `PATH` 에 등록 |
| 에뮬레이터 | **BlueStacks 5** (Android 9/11 인스턴스), **루트**+**ADB** 활성화 |
| Frida | `16.4.10` (앱이 자동 다운로드·푸시) |
| 게임 | 에뮬레이터 안에 MilkChoco(`com.gameparadiso.milkchoco`) 설치 |

---

### 1. 프로젝트 설치

```bash
git clone https://github.com/asp1-rin/pixel.git
cd pixel
npm install            # 또는: bun install
```

템플릿에서 `.env` 생성 (일반 사용은 기본값 그대로):

```bash
cp .env.example .env
```

```env
PIXEL_WEB_URL=https://pixel-code-web.vercel.app
# PIXEL_DEV_BYPASS_AUTH=true   # 개발용 — 로그인 화면 스킵
```

---

### 2. 빌드 / 실행

**개발 모드 (터미널 2개):**

```bash
npm run watch     # 터미널 1: tsc + tailwind + agent 워처
npm run start     # 터미널 2: Electron 실행
```

**프로덕션 EXE:**

```bash
npm run build     # tsc + tailwind + agent + 오프셋 주입
npm run dist      # electron-builder → build/pixel-Setup-X.Y.Z.exe
```

> 빌드 중 `Cannot read agentSyms` 오류 시 `npm run inject-offsets` 실행 (`agent.js` placeholder 가 비어 있음).

---

### 3. BlueStacks 준비

1. **BlueStacks 5 → 설정(톱니바퀴) → 고급(Advanced)** 진입.
2. *Android Debug Bridge (ADB)* 를 **ON**. 표시되는 주소 확인 — 예: `127.0.0.1:5555` (최신 버전은 `127.0.0.1:5565` 같은 동적 포트 사용).
3. 같은 **고급** 탭에서 *Root access(루트 접근)* 를 **ON** (frida-server 가 `su` 필요). 안내가 뜨면 인스턴스 재시작.
4. (권장) **설정 → 성능** → 64비트 인스턴스면 ABI 를 **x86 / x86_64** 로 통일. 앱이 ABI 를 자동 감지하지만 일관된 인스턴스가 혼선을 줄임.
5. BlueStacks 안에서 **MilkChoco** 를 설치하고 한 번 실행해 `com.gameparadiso.milkchoco` 패키지가 존재하도록 함.

PC 에서 ADB 가 에뮬레이터를 인식하는지 확인:

```bash
adb connect 127.0.0.1:5555
adb devices                 # 127.0.0.1:5555  device 로 표시
adb -s 127.0.0.1:5555 shell su -c id   # uid=0(root) 출력되어야 함
```

`su` 가 root 를 반환하지 않으면 ADB/Frida 단계가 실패함 — Root 토글 재확인.

---

### 4. 연결 및 주입 (앱 내부)

로그인 후 **Initialize** 탭에서 위에서 아래로 순서대로 진행. 표시등: 회색=대기, 녹색=정상, 적색=오류.

1. **Serial** — BlueStacks ADB 주소 입력 (기본 `127.0.0.1:5555`; 3.2 에서 포트가 다르면 그 값 사용).
2. **Connect ADB** — 연결 후 TCP/IP 모드 전환. 표시등 녹색.
3. **Start Server** — ABI(`arm/arm64/x86/x86_64`) 자동 감지 → 맞는 `frida-server 16.4.10` 다운로드 → `/data/local/tmp` 푸시 → `chmod 777` → `su -c` 로 실행.
   - 푸시/실행 실패(아키텍처 불일치 등) 시 **Download Server** 후 **Upload Server** 로 수동 적재.
4. **Connect Frida** — 해당 serial 의 Frida 디바이스에 attach.
5. **Get Cookie** *(선택)* — 게임 세션 쿠키 추출.
6. **Start Agent** — `com.gameparadiso.milkchoco` spawn/attach 후 `agent.js` 주입. 녹색이 되면 게임이 실행/재개되고 치트 토글이 활성화됨.

이후 치트 패널에서 **EPOS Number**(인게임 유저 ID) 를 입력해야 본인 기준 기능(텔레포트, 에임, 디버프 등)이 자신의 엔티티에 락온됨.

---

### 5. 트러블슈팅

| 증상 | 점검 |
| --- | --- |
| Connect ADB 실패 | `adb devices`; BlueStacks ADB 포트 정확히; ADB 토글 ON |
| Start Server 실패 | ABI 불일치 → Download/Upload Server; Root access ON |
| Connect Frida → *Session not found* | frida-server 미실행: `adb shell ps -ef \| grep frida` |
| Start Agent → *Module not found* | 게임 미실행 또는 패키지명 오류. `com.gameparadiso.milkchoco` 확인 |
| `su` 가 root 아님 | BlueStacks → 고급 → Root access ON, 인스턴스 재시작 |
| EPOS not found | 인게임 유저 ID 오기재; 매치 진입 후 재시도 |
| 치트 토글이 계속 회색 | Start Agent 미완료 / attach 끊김 — 4번부터 재시도 |
| 빌드 `Cannot read agentSyms` | `npm run inject-offsets` 실행 |
