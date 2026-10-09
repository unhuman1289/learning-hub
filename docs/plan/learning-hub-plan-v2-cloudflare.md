# Learning Hub — Kế hoạch v2: hạ tầng Cloudflare độc lập trước

Trạng thái: **ĐÃ DUYỆT D1–D7 (07/10/2026); chọn email + mật khẩu (08/10/2026); ưu tiên MVP staging production-ready (09/10/2026)** · base commit `ba8a369`
Thay thế `archive/learning-hub-plan-2026-10.md` (đã chuyển vào archive ngày 07/10/2026).

## 0. Tóm tắt quyết định

1. **Hạ tầng độc lập là ưu tiên số 1.** Không đầu tư thêm vào backend/UI/adaptive learning trên Sites. Không cố publish bản phase 0 cũ lên Sites nữa (`get_site` đang trả `NOT_FOUND`).
2. **D1 do mình sở hữu là nguồn dữ liệu duy nhất.** Drive/Docs, email và Sites không nằm trong data flow.
3. **Không phải "kéo Phase 3 lên đầu" nguyên khối.** Hạ tầng (Worker, D1, Access, CI/CD, backup) dựng ở **staging** trong Phase 0. **Chuyển `learn.unhuman.cc` (cutover) là bước cuối của Phase 1**, sau khi Automation API chạy end-to-end. Lý do: nếu chuyển DNS ngay cuối Phase 0, Hub mới không có đường nào sinh bài mới (Plus không ghi được, contract chưa có), và trong lúc đó Sites không còn được dùng → khoảng trống bài học + rủi ro hai nơi cùng ghi. Đã chốt: cutover cuối Phase 1 (D3).
4. **AI runner là client thay thế được.** Contract `/api/automation/v1/*` không biết gì về ChatGPT, Claude hay Sites. Runner đầu tiên là **script test không dùng AI**.
5. **Hai lớp xác thực tách biệt:** browser = tài khoản Learning Hub email + mật khẩu, session do app xác minh; automation = Access service token ở edge **và** bearer key có scope do Worker kiểm tra (hash trong Worker secret). Không dùng Google IdP hay Access OTP cho người học.
6. **Server quyết định mọi thứ quan trọng:** ai là learner, mảng nào được thay, bài nào là hiện tại. Runner chỉ gửi đề xuất gắn với `targetId` do server cấp.
7. **Đã chốt:** backup tự động vào R2; cutover cuối Phase 1; learner ẩn danh trong context; không publish thêm lên Sites; `vinext` chỉ giữ nếu đạt tiêu chí ổn định ở P0.3. Ngày 08/10/2026, chủ dự án chọn tài khoản email + mật khẩu do Learning Hub quản lý thay cho Google/Access login. Chi tiết ở mục 13.
8. **Quyết định ưu tiên 09/10/2026:** triển khai staging MVP ngay khi auth/API được kiểm tra an toàn; bỏ chờ 48 giờ và bỏ CPU p95 ≤ 8 ms khỏi điều kiện mở staging. Theo dõi CPU, lỗi runtime và Workers Free quota sau deploy; nếu số liệu thực tế gây lỗi thì xử lý theo số liệu. Quyết định này chỉ áp dụng staging, không cho phép DNS/prod cutover.

## 0.1 Trạng thái MVP staging — 09/10/2026

Đã triển khai `https://learning-hub-staging.tranvu-812.workers.dev` với app auth email/mật khẩu, D1, worker API guards và `STAGING_SPIKE_LOCKDOWN=false` sau khi kiểm tra trên Worker local. Production, DNS và Sites không thay đổi.

- **Đạt:** migration `0003_auth_users.sql`; import snapshot Sites vào D1 staging rỗng; đọc lại và so từng ô (5 lessons, 5 slots, 1 workspace, 2 runs); health/D1; login pages; anonymous/forged-header API trả 401; endpoint cũ trả 410; test local email/password, signup allowlist, logout/login và progress round-trip trong D1.
- **Đạt local:** `npm run test` (24 test), `npm run typecheck`, `npm run lint`, `npm run build`; CI kiểm tra đủ bốn lệnh; workflow deploy staging thủ công đã thêm.
- **Đã cấu hình:** `APP_ORIGIN`, `EMAIL_FROM`, bốn secret staging theo tên; bucket riêng `learning-hub-backups-staging`; cron backup `0 1,2 * * *`, code chỉ chạy khi giờ Berlin là 03:00; endpoint admin tạo/tải bản R2.
- **Đạt qua thao tác owner:** staging login thành công; câu trả lời còn nguyên sau khi đăng xuất rồi đăng nhập lại. Owner đã tải backup R2 và `db:restore:drill` xác nhận đủ 7 bảng trong database SQLite mới; truy cập object R2 cũng đã được xác nhận.
- **Còn trước Cổng 0:** đặt lại mật khẩu chưa thử; GitHub Actions chưa chạy trên remote với mã nguồn hiện tại. CPU p95 và 48 giờ không còn là gate. Không được suy ra đã sẵn sàng cutover production.
- **Phase 1 còn nguyên:** per-user progress, Access service auth và Automation API v1 chưa triển khai; staging hiện dùng workspace chung và chưa sinh bài mới theo lịch.

---

## 1. Audit hiện trạng

### 1.1 Repo đang có gì (sau `9e279ba`, `ba8a369`)

| Thành phần | Trạng thái | Ghi chú |
| --- | --- | --- |
| Runtime | React 19 + `vinext 1.0.0-beta.5` + `@cloudflare/vite-plugin`, D1 binding `DB` | Build ra `dist/server/wrangler.json` chuẩn Wrangler (main `index.js`, assets `../client`) → về kỹ thuật deploy được lên account riêng |
| Schema | `learning_workspace`, `learning_lessons`, `learning_slots`, `learning_runs` (0000–0001) + `runs`, `run_items`, `backup_events` (0002) | 0002 **chưa từng áp dụng lên D1 live của Sites** |
| Run journal | `lib/run-journal.ts`: runId, started/finished/failed, replay cùng payload, 409 khi khác payload, hết hạn 2 giờ | Tái sử dụng được ý tưởng; cần thiết kế lại contract (xem 1.3) |
| Backup | `/api/export` format 2 (7 bảng, 1 batch nhất quán), `buildRestoreSql`, restore local, kiểm tra từng ô | Tái sử dụng làm nền cho migration Sites → D1 mới |
| CI | `.github/workflows/ci.yml`: Node 24, `npm ci`, test, typecheck | Chưa có build, lint, deploy |
| Test | 8 test (policy DST/cutoff, writer SQL, journal, replay, restore) trên `node:sqlite` qua `tests/d1-adapter.mjs` | Chưa có test route/auth/Worker |
| Live | Sites vẫn chạy **bản v5 cũ**; lịch 03:00 nằm trong ChatGPT; bản phase 0 mới **chưa publish** | Snapshot dữ liệu gần nhất: `private-data/sites-export.json` (07/10, format 1, 4 bảng) |
| UI | Toàn bộ là client component gọi `/api/*` | Đổi backend/auth gần như không phải viết lại UI |

### 1.2 Những chỗ phụ thuộc ChatGPT Sites (kể cả ngầm)

| # | Vị trí | Phụ thuộc | Hậu quả khi rời Sites | Xử lý |
| --- | --- | --- | --- | --- |
| S1 | `app/api/learning-run/route.ts` | **Không có xác thực trong app**; comment ghi rõ dựa vào "Sites dispatch boundary". POST chỉ kiểm tra `Origin` nếu có | Trên Worker độc lập = **ai cũng đọc toàn bộ câu trả lời và ghi bài** | P0.6 tắt route; P1 thay bằng Automation API |
| S2 | `app/chatgpt-auth.ts`, dùng trong `api/daily`, `api/state`, `api/export` | Tin header `oai-authenticated-user-*` | Header giả mạo được → ai cũng là "người dùng đã đăng nhập" | P0.4 thay bằng app session email/mật khẩu đã xác minh |
| S3 | `LEARNING-UPDATES.md`, `docs/AUTOMATION.md` | Runner phải gọi `get_site` và gửi `OAI-Sites-Authorization` (credential dịch vụ Sites) | Chỉ ChatGPT có tool Sites mới làm runner được → **runner không thay thế được** | P1.2–P1.6 contract trung lập |
| S4 | `app/page.tsx` | Link `/signin-with-chatgpt`; đăng nhập do Sites cung cấp | Link chết | P0.4 → auth email/password của Hub |
| S5 | `vite.config.ts` | Import `.openai/hosting.json`, plugin `sites()`, `connectorPreview()`, execution profile; D1 ID placeholder `0000…` | Build vẫn chạy nhưng cấu hình D1 thật không có chỗ khai báo | P0.2, P0.10 |
| S6 | `build/sites-vite-plugin.ts` | Mock auth local, chặn header `oai-*`, `closeBundle` ghi `dist/.openai` cho Sites | Local dev mất cơ chế đăng nhập giả | P0.4 dev auth riêng; P0.10 xoá |
| S7 | `build/sites-worker.ts`, `lib/connector*.{ts,mts}`, `build/connector-preview-*`, `scripts/connector-preview/*` | Binding `CONNECTORS` từ `ctx.props` của Sites | Code chết (app không gọi `connectorsForRequest`) | P0.10 xoá |
| S8 | `scripts/sites-env.*`, `execution-profile.mjs`, `install-*.{sh,mjs}`, `npm-install.mjs`, `pnpm-install.mjs`, `build-verified.sh`, `run-framework.mjs` | Môi trường build managed của Sites/Codex | Rối, không cần cho CI GitHub | P0.10 xoá/đơn giản hoá |
| S9 | `lib/backup-store.ts` | Hard-code `projectId: appgprj_…` | Backup mang danh tính Sites | P0.8 → biến môi trường `DEPLOYMENT_ID` |
| S10 | Lịch 03:00 | Nằm trong ChatGPT, không có trong repo | Không version, không kiểm soát | P1: runner nằm ngoài, contract trong repo |
| S11 | Dữ liệu live | D1 do Sites quản lý; không có quyền `wrangler`; export chỉ qua route của app | **Lấy dữ liệu ra phụ thuộc quyền truy cập Sites** (hiện đang lỗi `NOT_FOUND`) | P0.1 lấy snapshot mới sớm; phương án dự phòng thủ công |
| S12 | `UPDATE_INSTRUCTIONS` trong response | Trộn luật contract + mục tiêu học + hướng dẫn riêng cho Sites/ChatGPT | Contract bị gắn với một provider và một prompt | P1.6 tách |

### 1.3 Vấn đề của contract hiện tại (không riêng Sites)

- **GET tạo run** (`learningContext` gọi `startRun`). GET có side effect → proxy/retry có thể tạo lượt thừa. `origin=manual` do client tự khai.
- **Không ghi danh tính runner.** Không biết lượt nào do ai/công cụ nào chạy.
- **`commitRun` ghép SQL bằng cắt chuỗi** (`indexOf(' WHERE ')`, `' ON CONFLICT'`) để chèn điều kiện run claim. Đúng ở hiện tại nhưng dễ vỡ khi sửa câu SQL.
- **`user_id` là hằng `__shared_family_workspace__`.** Chưa có khái niệm learner.
- **Context quá lớn:** trả toàn bộ bài đang học, tối đa 100 bài cũ đầy đủ nội dung, cả workspace (ghi chú, nhật ký) cho model.
- **Lesson là một khối JSON**; câu hỏi, đáp án, câu trả lời (`response` dạng text) và tiến độ trộn trong một dòng.
- **ID bài tất định theo chuỗi** `daily-<ngày>-<mảng>`; khi có nhiều learner sẽ đụng nhau.

### 1.4 Tái sử dụng được

`lib/daily-policy.ts` (cutoff/DST + test), điều kiện thay bài trong `lib/daily-sql.ts`, ý tưởng run journal + replay, `lib/backup-contract.mjs` + restore + kiểm tra từng ô, `tests/d1-adapter.mjs`, schema zod của lesson, toàn bộ UI hiện tại (chỉ đổi link đăng nhập và chỗ đọc run status).

---

## 2. Kiến trúc target

```text
                    Browser (Vũ, Ly)                     AI runners (thay thế được)
                          │                         test script · Claude/Cowork · ChatGPT* · khác
                          │                                        │
                          │                         Cloudflare Access App B
                          │                         Service Auth cho automation
                          │                                        │ service JWT
                          ▼                                        ▼
                 ┌──────────────────────────────────────────────────────────┐
                 │ Cloudflare Worker "learning-hub"                          │
                 │  auth: app email/password session + verified automation   │
                 │        service JWT (Access App B)                         │
                 │  ├── Web UI (static + SSR)                                │
                 │  ├── User API      /api/me, /api/daily, /api/state …      │
                 │  ├── Admin API     /api/admin/*   (role=admin trong D1)   │
                 │  └── Automation API /api/automation/v1/*                  │
                 │        (service JWT + Bearer key có scope, hash trong secret)│
                 │  Cron: backup hằng ngày, dọn run hết hạn                   │
                 └────────┬──────────────────────────────────────────────────┘
                          ▼
                     D1 (source of truth)
     users · lessons · (quests · answers · assessments · skills/mastery · review_items — Phase 2)
     notes/logs · automation_runs · run_targets · run_items · run_events · backup_events
```

\* ChatGPT Plus chỉ dùng được nếu có đường HTTP có xác thực được hỗ trợ. Không hack.

### Môi trường

| Môi trường | Hostname | D1 | Access | Deploy |
| --- | --- | --- | --- | --- |
| local | `localhost:5173` | D1 local (Miniflare) | Không; dev auth giả chỉ khi `ENVIRONMENT=local` và host là loopback | `npm run dev` |
| staging | `learn-staging.unhuman.cc` (hoặc `*.workers.dev` nếu chưa có zone) | `learning-hub-staging` | Không cho người học; App B riêng cho automation | Tự động khi merge `main` |
| production | `learn.unhuman.cc` | `learning-hub-prod` | Không cho người học; App B riêng cho automation | Thủ công, có duyệt (GitHub Environment) |

Workers Free đủ cho D1/Cron/Access (Access miễn phí tới 50 user). Rủi ro chính: **giới hạn CPU 10 ms/request của gói Free** với SSR vinext — theo dõi sau khi mở staging, không còn là điều kiện chặn MVP (xem D2).

---

## 3. Audit plan cũ → quyết định

Nhãn: **GIỮ** · **ĐÃ XONG** · **CHUYỂN** (đổi thứ tự/nơi) · **BỎ** · **HOÃN** · **MỚI** (ở mục 4).

| Plan cũ | Quyết định | Đi đâu trong v2 | Lý do |
| --- | --- | --- | --- |
| 0.1 Kiểm tra lượt 08/10 trên Sites | GIỮ (chỉ quan sát) | P0.1 | Biết baseline; không còn là cổng |
| 0.2 CI test + typecheck | ĐÃ XONG → mở rộng | P0.9 | Thêm build, lint, deploy |
| 0.3 Run journal `runs`/`run_items` | ĐÃ XONG ở code → thiết kế lại | P1.3–P1.4 | Thêm runner identity, targets, events; bỏ ghép SQL |
| 0.4 GET ghi `started` | BỎ | P1.3 | Thay bằng `POST /runs`; GET không có side effect |
| 0.5 Banner cảnh báo lượt chạy | ĐÃ XONG → giữ | P1.9 | Đổi nguồn dữ liệu sang bảng mới |
| 0.6 5xx vs 400 | ĐÃ XONG → giữ | P1.3 | Mở rộng thành bảng mã lỗi contract |
| 0.7 Nút backup + nhắc | CHUYỂN, mở rộng | P0.8 | Thêm backup tự động + restore drill |
| 0.8 Prompt Sites + email | BỎ (phần Sites); HOÃN (email ngoài auth) | — | Prompt Sites không còn ý nghĩa; email thông báo chưa cần cho data flow |
| Cổng "3 đêm liên tiếp trên Sites" | BỎ | — | Không đầu tư thêm vào Sites |
| 1.1 Migration users/user_tracks/notes/logs/audit | CHUYỂN, tách | P0.4 (`users`), P1.1 (`user_id` cho lessons/slots), P2.8 (notes/logs) | `users` cần ngay cho app auth; phần còn lại theo nhu cầu contract |
| 1.2 `requireUser`/`requireAdmin` | CHUYỂN lên | P0.4 | Là nền của auth mới |
| 1.3 Lọc theo user cho routes | CHUYỂN | P1.1 (lessons), P2.8 (notes/logs) | |
| 1.4 learning-run nhiều người, tối đa 10 bài | CHUYỂN | P1.3 (`policy.maxAssignmentsPerRun`) | Thành một phần contract |
| 1.5 `content.ts` → D1 | HOÃN | Sau Phase 2 | Không cần cho migration |
| 1.6 Dashboard người học | HOÃN | — | |
| 1.7 Trang admin | THU NHỎ | P1.9 Admin API tối thiểu; UI hoãn | Chỉ cần đủ để xem run log và export |
| 1.8 Autosave, phân trang lịch sử | HOÃN | — | |
| 1.9 Tách `page.tsx`, a11y | HOÃN | — | Chỉ sửa lỗi chặn |
| 1.10 Test phân quyền/migration | GIỮ | P0.4, P0.7, P1.1 | |
| 2.1 `skills`/`assessments`/`review_items` | GIỮ, thiết kế lại | P2.1 | Thêm `quests`, `answers` tách khỏi lesson JSON |
| 2.2 Bảng `curriculum` | CHUYỂN một phần | P1.6 (chuyển mục tiêu ra khỏi code), P2 (curriculum đầy đủ) | |
| 2.3 Assessments trong payload | GIỮ | P2.3 | |
| 2.4 Context gọn | CHUYỂN lên | P1.5 | Nguyên tắc contract từ đầu |
| 2.5 UI phản hồi/ôn tập | THU NHỎ | P2.7 (tối thiểu, chức năng) | |
| 2.6 Nhắc mảng kẹt, email | HOÃN | — | |
| 2.7 Markdown/Mermaid | HOÃN | — | |
| 2.8 Kiểm tra DOI/PMID | HOÃN (giữ kiểm tra `https`) | — | |
| 3.1 Thử runner mới | CHUYỂN | P1.12, sau acceptance test | Chứng minh bằng script trước |
| 3.2 D1 production | CHUYỂN lên | P0.2 | |
| 3.3 Xác thực người học + Access service JWT | CHUYỂN lên | P0.4 (app session), P0.5 (service JWT) | Hai đường xác thực riêng |
| 3.4 Service token cho runner | CHUYỂN | P1.2 | |
| 3.5 Xoá code Sites | CHUYỂN lên | P0.10 (build/runtime), P1.10 (dọn cuối) | |
| 3.6 Chuyển dữ liệu | CHUYỂN, tách | P0.7 (công cụ + diễn tập), P1.10 (thực hiện) | |
| 3.7 Staging, DNS, tắt lịch Sites | CHUYỂN, tách | P0.3/P0.11 (staging), P1.10 (DNS) | |
| 3.8 Backup tự động | CHUYỂN lên | P0.8 | |

---

## 4. Roadmap mới

```text
P0 Foundation (staging)            P1 Automation contract + cutover          P2 Learning data model
──────────────────────────        ──────────────────────────────────        ─────────────────────
P0.0 quyết định & tài khoản        P1.1 learner scoping (user_id)            P2.1 quests/answers/assessments
P0.1 snapshot Sites mới            P1.2 automation credentials               P2.2 chấm tự động (deterministic)
P0.2 wrangler envs + D1            P1.3 endpoints v1 + state machine         P2.3 open-ended → AI grading
P0.3 deploy spike + đo CPU  ─D2─►  P1.4 replacement engine (refactor)        P2.4 mastery từ evidence
P0.4 auth email/password + users   P1.5 compact context builder              P2.5 review queue
P0.5 cấu hình Access               P1.6 tách instructions/goals khỏi code    P2.6 context v2
P0.6 tắt /api/learning-run         P1.7 test runner (không AI)               P2.7 UI tối thiểu
P0.7 công cụ import + verify       P1.8 gỡ endpoint cũ                       P2.8 notes/logs theo user
P0.8 backup tự động + restore      P1.9 admin API tối thiểu
P0.9 CI/CD                         P1.11 acceptance E2E (10 bước) trên staging
P0.10 gỡ code Sites (build)        P1.10 CUTOVER learn.unhuman.cc
P0.11 smoke staging   ──Cổng 0──►  P1.11 lặp lại trên production ──Cổng 1──► P1.12 thử AI runner thật
```

Ước lượng thô (một người + AI hỗ trợ): P0 5–7 ngày, P1 6–8 ngày, P2 8–12 ngày. Chưa tính thời gian chờ cấu hình DNS/Access.

### Cổng

- **Cổng 0:** staging chạy trên account riêng; đăng nhập bằng tài khoản Hub; header giả bị từ chối; dữ liệu snapshot đã import và khớp từng ô; backup tự động + restore drill thành công; CI chặn deploy khi test đỏ; build không còn import code Sites.
- **Cổng 1:** 10 bước acceptance chạy xanh trên staging, rồi trên production sau cutover; Sites đã đóng băng; run log giải thích đúng từng target.
- **Cổng 2:** mọi câu trả lời đóng (deterministic) được Hub tự chấm; câu mở đi qua AI grading; mastery chỉ thay đổi khi có assessment; context v2 dưới ngân sách kích thước.

---

## 5. Chi tiết task

Mỗi task: **Mục tiêu · Thay đổi · Migration · Test · Chấp nhận khi · Phụ thuộc · Rủi ro**.

### Phase 0 — Infrastructure Foundation (staging)

#### P0.0 Quyết định & tài khoản — MỚI
- **Mục tiêu:** có đủ quyền và quyết định để không tắc giữa chừng.
- **Thay đổi:** không code. Ghi kết quả vào `docs/ops/CLOUDFLARE.md`.
- **Việc của bạn:** account Cloudflare riêng; domain `unhuman.cc` (đã sở hữu) — xác nhận zone đang dùng nameserver Cloudflare; tên team Zero Trust (đã có); không tạo Google IdP cho người học; bật R2 (cần phương thức thanh toán dù dùng free tier); API token scope `Workers Scripts:Edit`, `D1:Edit`, `Workers Routes:Edit`, `Workers R2 Storage:Edit` cho GitHub. Chọn sender email giao dịch để xác minh email và đặt lại mật khẩu trước khi mở đăng ký.
- **Chấp nhận khi:** checklist đủ; token lưu trong GitHub secret `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- **Phụ thuộc:** không. **Rủi ro:** nếu zone `unhuman.cc` chưa dùng nameserver Cloudflare → chuyển nameserver (vài giờ–1 ngày); kiểm tra trước để `learn.unhuman.cc` hiện trên Sites không bị gián đoạn khi chuyển (sao chép đủ bản ghi DNS hiện có).

#### P0.1 Đóng băng Sites + snapshot mới — MỚI
- **Mục tiêu:** có bản dữ liệu mới nhất trước khi xây gì thêm; dừng đầu tư vào Sites.
- **Thay đổi:** không sửa Sites. Lấy export mới qua đường còn dùng được (tool Sites trong ChatGPT, hoặc GET `/api/learning-run` qua phiên Sites đã xác thực như lần export 07/10). Nếu Sites không truy cập được: chụp lại câu trả lời từ UI, ghi nhận giới hạn.
- **Migration:** không. **Test:** `buildRestoreSql` chấp nhận snapshot; restore local khớp từng ô.
- **Chấp nhận khi:** `private-data/sites-export-<ngày>.json` tồn tại, ngoài Git, restore local OK. Quan sát lượt 08/10 (không phải cổng).
- **Phụ thuộc:** không. **Rủi ro:** **cao** — mất quyền vào Sites thì dữ liệu sau 07/10 chỉ cứu được thủ công. Làm việc này đầu tiên.

#### P0.2 Cấu hình Wrangler nhiều môi trường + D1 thật — CHUYỂN (3.2)
- **Mục tiêu:** một file cấu hình duy nhất khai báo staging/production với D1 ID thật.
- **Thay đổi:** thêm `wrangler.jsonc` (`env.staging`, `env.production`: `name`, `d1_databases` với `database_id` thật, `vars.ENVIRONMENT`, `vars.ACCESS_TEAM_DOMAIN`, `vars.AUTOMATION_ACCESS_AUD`, `triggers.crons`, `routes`/custom domain); `vite.config.ts` đọc file này qua `cloudflare({ configPath })` thay vì cấu hình inline + `.openai/hosting.json`; gộp `wrangler.local.json` vào.
- **Migration:** `wrangler d1 create learning-hub-staging`, `learning-hub-prod`; áp 0000–0002 lên DB rỗng.
- **Test:** `wrangler d1 migrations list --env staging --remote` sạch; `npm run build` ra config đúng env.
- **Chấp nhận khi:** build không đọc `.openai/hosting.json`; D1 ID placeholder không còn trong build output staging/prod.
- **Phụ thuộc:** P0.0. **Rủi ro:** vinext/plugin xử lý `configPath` + env khác kỳ vọng → xử lý trong P0.3.

#### P0.3 Deploy spike + đo CPU — MỚI (quyết định D2)
- **Mục tiêu:** chứng minh app build hiện tại deploy được lên account riêng và chạy trong giới hạn.
- **Thay đổi:** `build/worker.ts` (entry thuần, thay `sites-worker.ts`, không `CONNECTORS`); route `GET /api/health` (trả version, env, trạng thái D1, không dữ liệu học); `wrangler deploy --env staging`.
- **Migration:** không. **Test:** gọi `/api/health` và trang chủ trên workers.dev/staging; xem CPU time trong Workers Observability cho 20 request trang chủ + API.
- **Chấp nhận khi:** trang chủ render, API đọc D1 staging; CPU p95 ghi vào `docs/ops/CLOUDFLARE.md`.
- **Phụ thuộc:** P0.2. **Rủi ro:** vinext beta không deploy được, lỗi runtime, hoặc vượt 10 ms CPU trên Free.
- **Quy tắc quyết định (D2, cập nhật 09/10/2026):** MVP staging cho 1–2 người có thể triển khai sau khi build, auth, API boundary và D1 smoke đạt; không chờ 48 giờ và không yêu cầu CPU p95 ≤ 8 ms. Ghi nhận CPU/error/quota như quan sát sau deploy; đổi stack hoặc gói chỉ khi số liệu thực tế cho thấy app không hoạt động ổn định. Giữ phiên bản `vinext` đã ghim và kiểm tra nâng cấp qua CI + staging.

#### P0.4 Auth: tài khoản Learning Hub email + mật khẩu — CHUYỂN (3.3, 1.2)
- **Mục tiêu:** server xác thực mọi request browser bằng session tài khoản Hub; không tin header client gửi.
- **Thay đổi:** tích hợp thư viện auth có hỗ trợ Workers + D1 (Better Auth là ứng viên; chứng minh build/runtime tại P0.3); đăng ký email + mật khẩu, xác minh email, đăng nhập/đăng xuất, session, đổi/đặt lại mật khẩu; cookie `Secure`, `HttpOnly`, `SameSite=Lax`; giới hạn tốc độ, chống dò email và kiểm tra `Origin` cho thao tác ghi. Mật khẩu chỉ lưu hash có salt bằng thuật toán chậm của thư viện; không tự viết crypto. Chỉ email được mời mới đăng ký; không có public open signup. Seed tài khoản admin đầu tiên bằng quy trình one-time, không hard-code email/mật khẩu. Thay `getChatGPTUser` trong `api/daily`, `api/state`, `api/export`; `/api/export` chỉ admin; bỏ `/signin-with-chatgpt` và thêm trang tài khoản.
- **Email:** xác minh và password reset cần sender đã xác thực. Đánh giá Cloudflare Email Service hoặc provider giao dịch khác; credentials chỉ nằm trong Worker secrets. Không bật đăng ký production trước khi luồng email được test.
- **Migration:** `0003_auth_users.sql` — user/account/session/verification theo thư viện, role `learner`/`admin`, trạng thái `pending`/`active`/`disabled`; tài khoản admin đầu tiên tạo qua seed one-time. Email không nằm trong Git.
- **Test:** email chưa xác minh, email ngoài invite list, mật khẩu sai, rate limit, token hết hạn/đã dùng, session rotation/logout, reset password thu hồi session, CSRF, header `oai-authenticated-user-*` giả → bị từ chối; `requireAdmin` chặn learner; dev auth chỉ loopback/local; Worker + D1 integration.
- **Chấp nhận khi:** không còn import `chatgpt-auth`/Sites header; người được mời xác minh email và tự đăng nhập; mọi API suy ra user từ session hợp lệ; test auth xanh trong CI.
- **Phụ thuộc:** P0.2–P0.3 và sender email đã chọn. **Rủi ro:** auth library/hash không chạy ổn định trên Worker Free → chứng minh ở staging trước cutover; email lỗi thì fail-closed, không bỏ xác minh.

#### P0.5 Cấu hình Cloudflare Access cho automation — CHUYỂN (3.3)
- **Mục tiêu:** edge chỉ nhận runner được ủy quyền trên route automation; người học dùng tài khoản Hub.
- **Thay đổi:** không code; ghi lại trong `docs/ops/ACCESS.md`. Không tạo App A/Google IdP cho learner. Tạo App B `learn-staging.unhuman.cc/api/automation/*` với policy **Service Auth** (chỉ service token), dùng ở P1. Cookie đăng nhập app độc lập với Access. App auth phải bảo vệ cả `workers.dev`.
- **Test:** route automation thiếu/sai service token → bị Access chặn; session app sai/hết hạn → 401; API ghi yêu cầu Origin hợp lệ; `workers.dev` không vượt qua app auth.
- **Chấp nhận khi:** browser dùng tài khoản Hub; route automation chỉ nhận client được ủy quyền.
- **Phụ thuộc:** P0.3. **Rủi ro:** nhầm service policy với user login; kiểm thử hai đường riêng.

#### P0.6 Khoá endpoint automation cũ — MỚI (bảo mật)
- **Mục tiêu:** không bao giờ deploy `/api/learning-run` không xác thực lên hạ tầng mới.
- **Thay đổi:** trong build mới, route trả `410 Gone` (hoặc bị xoá) khi `ENVIRONMENT≠sites`; thêm test chặn hồi quy.
- **Test:** request GET/POST tới `/api/learning-run` trên staging → 410, không tạo run.
- **Chấp nhận khi:** test xanh; staging không có run nào sinh từ route cũ.
- **Phụ thuộc:** P0.3. **Rủi ro:** thấp.

#### P0.7 Công cụ import + verify dữ liệu — CHUYỂN (3.6)
- **Mục tiêu:** đưa snapshot Sites vào D1 mới một cách lặp lại được, có bằng chứng khớp.
- **Thay đổi:** `scripts/d1-import.mjs --env staging|production --file <snapshot> --confirm <db-name>`: từ chối nếu DB đích có dữ liệu học; áp migration; import qua `buildRestoreSql`; `scripts/d1-verify.mjs`: đọc lại từ remote (`wrangler d1 execute --remote --json`), so **từng ô** với snapshot, in bảng đếm. Không có chế độ merge/ghi đè.
- **Migration:** dùng 0000–0003. Snapshot format 1 thiếu bảng 0002 → import 4 bảng gốc.
- **Test:** import vào local và staging; verify xanh; chạy lần hai → bị từ chối (DB không rỗng).
- **Chấp nhận khi:** staging chứa đúng 5 bài, 5 slot, workspace, câu trả lời như snapshot.
- **Phụ thuộc:** P0.1, P0.2. **Rủi ro:** ký tự đặc biệt/escape trong câu trả lời → đã có kiểm tra literal; thêm test với dữ liệu tiếng Việt, xuống dòng, dấu nháy.

#### P0.8 Backup tự động + restore drill — CHUYỂN (0.7, 3.8)
- **Mục tiêu:** mất D1 không mất học tập; chứng minh restore được.
- **Thay đổi:** Cron Trigger hằng ngày gọi `createBackup` → ghi JSON vào **R2 bucket riêng** `learning-hub-backups-<env>` (D4; không public, không custom domain); giữ 30 bản bằng lifecycle rule; `projectId` → `DEPLOYMENT_ID`; `/api/export` chỉ admin; `scripts/restore-drill.mjs` lấy bản mới nhất → D1 local trống → verify từng ô; tài liệu D1 Time Travel (khôi phục theo thời điểm) trong `docs/ops/BACKUP.md`.
- **Migration:** không (dùng `backup_events`).
- **Test:** chạy cron thủ công trên staging; restore drill xanh; thử Time Travel trên staging (restore về mốc trước một thay đổi giả).
- **Chấp nhận khi:** có ≥1 backup tự động + 1 restore drill thành công trên staging, ghi bằng chứng vào `docs/VALIDATION.md`; restore chỉ vào D1 mới/trống.
- **Phụ thuộc:** P0.7, P0.0 (R2 đã bật). **Rủi ro:** backup và D1 cùng nằm trong một account Cloudflare → thêm bản sao ngoài account: admin tải `/api/export` hằng tháng, lưu nơi riêng.

#### P0.9 CI/CD — GIỮ (0.2) + MỚI
- **Mục tiêu:** không deploy code chưa qua test; production có bước duyệt.
- **Thay đổi:** `ci.yml` thêm `lint`, `build`; `deploy.yml`: push `main` → staging (backup → `wrangler d1 migrations apply --env staging --remote` → `wrangler deploy --env staging` → smoke `/api/health`); `workflow_dispatch` production qua GitHub Environment `production` (required reviewer = bạn): backup → migrate → deploy → smoke. Ghi `version`/commit vào `/api/health`.
- **Test:** PR có test đỏ không deploy được; deploy staging tự động sau merge.
- **Chấp nhận khi:** một vòng PR → staging → production thủ công chạy xanh.
- **Phụ thuộc:** P0.2, P0.3, P0.8. **Rủi ro:** migration chạy trước deploy; code cũ phải tương thích schema mới (quy tắc expand–contract, mục 6).

#### P0.10 Gỡ code Sites khỏi build/runtime — CHUYỂN (3.5)
- **Mục tiêu:** build và chạy không cần bất kỳ thứ gì của Sites.
- **Thay đổi:** xoá `build/sites-vite-plugin.ts` (+ LICENSE), `build/connector-preview-*.mjs`, `build/sites-worker.ts`, `lib/connector*.{ts,mts}`, `lib/connector-preview.d.ts`, `scripts/connector-preview/`, `scripts/sites-env.*`, `scripts/execution-profile.mjs`, `scripts/install-*`, `scripts/npm-install.mjs`, `scripts/pnpm-install.mjs`, `scripts/build-verified.sh`; đơn giản `scripts/run-framework.mjs` hoặc gọi thẳng `vinext`; `package.json` bỏ `json-rpc-2.0`, `raw-body` nếu chỉ phục vụ connector preview; `.openai/hosting.json` giữ nguyên **đến cutover** (để còn đường lấy dữ liệu Sites), sau đó chuyển vào `docs/archive/`.
- **Test:** `npm ci && npm run build && npm test` trên clone sạch; `grep` không còn `oai-`, `CONNECTORS`, `sites(`.
- **Chấp nhận khi:** CI xanh trên clone sạch.
- **Phụ thuộc:** P0.3, P0.4. **Rủi ro:** vinext ngầm cần plugin nào đó → phát hiện ngay ở P0.3.

#### P0.11 Smoke test staging với dữ liệu thật — MỚI
- **Mục tiêu:** người dùng thật dùng được bản staging.
- **Test:** người được mời đăng ký, xác minh email, đăng nhập/đăng xuất/đặt lại mật khẩu; xem bài; lưu câu trả lời; refresh thấy dữ liệu; admin tải backup; email ngoài invite list bị chặn; header giả bị 401; automation thiếu service credential bị chặn. CPU p95 và 48 giờ quan sát là theo dõi sau triển khai, không gate.
- **Chấp nhận khi:** đạt Cổng 0.
- **Phụ thuộc:** P0.4–P0.10.

### Phase 1 — Stable Automation Contract + cutover

#### P1.1 Learner scoping — CHUYỂN (1.1, 1.3)
- **Mục tiêu:** mọi dữ liệu học thuộc một learner; server luôn suy ra learner từ session hoặc từ run target.
- **Thay đổi:** `lib/daily-store.ts`, `lib/daily-sql.ts`, `api/daily` lọc theo `user.id`.
- **Migration:** `0004_learner_scope.sql` (rebuild bảng vì SQLite không đổi PK): `learning_lessons` + `user_id NOT NULL`, `UNIQUE(user_id, track, assigned_date)`; `learning_slots` PK `(user_id, track)`; backfill toàn bộ dữ liệu cũ cho Vũ. **Giữ nguyên ID bài cũ**; ID mới do server sinh (`les_<ulid>`), không còn ghép chuỗi ngày–mảng.
- **Test:** migration trên snapshot thật (local, private) — mọi bài/câu trả lời giữ nguyên, chỉ thêm `user_id`; learner A không đọc/sửa được bài của B (404); writer thay bài độc lập giữa hai learner.
- **Chấp nhận khi:** test xanh; staging sau migration verify từng ô.
- **Phụ thuộc:** Cổng 0. **Rủi ro:** rebuild bảng lỗi giữa chừng → chạy trong một migration file (D1 áp migration theo giao dịch), backup trước.

#### P1.2 Automation credentials — CHUYỂN (3.4)
- **Mục tiêu:** runner có danh tính, quyền theo scope, xoay khoá được, tách hẳn khỏi browser auth.
- **Thay đổi:** Worker secret `AUTOMATION_CLIENTS` (JSON): `[{ "id":"test-runner", "keySha256":"…", "scopes":["runs:create","context:read","result:write"], "accessClientId":"…" }]`. Runner gửi: `CF-Access-Client-Id`/`CF-Access-Client-Secret` (Access App B) **và** `Authorization: Bearer lhk_<clientId>_<secret>`. Server: verify Access JWT `type` service, `common_name` = `accessClientId` của client; so hash key bằng so sánh thời gian hằng; kiểm tra scope theo endpoint. Route browser từ chối credential automation; route automation từ chối app session. `lib/auth/automation.ts`.
- **Migration:** `automation_runs.client_id` (ở P1.3).
- **Test:** thiếu một trong hai lớp → 401; scope `context:read` gọi result → 403; key cũ sau xoay → 401; user session gọi `/api/automation/*` → 403; key automation gọi `/api/daily` → 401.
- **Chấp nhận khi:** test xanh; quy trình xoay khoá (2 khoá chồng thời gian) ghi trong `docs/ops/AUTOMATION-CREDENTIALS.md`.
- **Phụ thuộc:** P0.4, P0.5. **Rủi ro:** một số runner không gửi được header tuỳ ý → khi đó runner đó không dùng được; không nới lỏng auth.

#### P1.3 Automation API v1: endpoints + state machine — MỚI (thay 0.3/0.4)
- **Mục tiêu:** contract ổn định, không phụ thuộc provider (chi tiết mục 8).
- **Thay đổi:** `app/api/automation/v1/runs/route.ts`, `…/[runId]/route.ts`, `…/[runId]/context/route.ts`, `…/[runId]/result/route.ts`, `…/[runId]/fail/route.ts`, `…/schema/route.ts`; `lib/automation/{schema,state,context,result}.ts`.
- **Migration:** `0005_automation.sql` — `automation_runs`, `run_targets`, `run_items`(v2), `run_events` (append-only). Bảng 0002 (`runs`, `run_items` cũ) chưa từng có dữ liệu production → giữ để đọc lịch sử staging, ngừng ghi; xoá ở bước contract sau.
- **Test:** state machine (created → context_served → finished/failed/expired); idempotency start (cùng `Idempotency-Key` → cùng run); replay result cùng hash → cùng response; khác hash → 409; result cho run hết hạn → 409; event ghi đủ.
- **Chấp nhận khi:** JSON Schema xuất từ zod khớp tài liệu; mọi chuyển trạng thái có event.
- **Phụ thuộc:** P1.1, P1.2. **Rủi ro:** thiết kế quá rộng → giới hạn v1 đúng các trường ở mục 8.

#### P1.4 Replacement engine tất định — MỚI (refactor `commitRun`)
- **Mục tiêu:** quy tắc "được thay bài" là một module thuần + câu SQL tường minh, không ghép chuỗi.
- **Thay đổi:** `lib/automation/replacement.ts` (hàm thuần: input = snapshot target + trạng thái hiện tại → quyết định + lý do); `lib/automation/sql.ts` (statement builders có điều kiện `expectedCurrentLessonId`, cutoff, một bài/learner/mảng/ngày, run còn mở — tất cả trong một `db.batch`). Giữ `daily-policy.ts`.
- **Test:** bảng quyết định đầy đủ (chưa xong / xong sau cutoff / đã nhận hôm nay / expected lệch / target không thuộc run / run hết hạn); property test ngẫu nhiên: không bao giờ thay bài chưa xong, không bao giờ xoá câu trả lời; giữ 8 test cũ chuyển sang API mới.
- **Chấp nhận khi:** không còn `indexOf(' WHERE ')`; test xanh.
- **Phụ thuộc:** P1.1. **Rủi ro:** lệch hành vi so với writer cũ → chạy song song test cũ và mới trong giai đoạn chuyển.

#### P1.5 Compact context builder — CHUYỂN lên (2.4)
- **Mục tiêu:** model chỉ thấy phần cần thiết.
- **Thay đổi:** `lib/automation/context.ts`: mỗi target gồm learner ref ẩn danh, mảng, eligibility + lý do, bài hiện tại (meta + câu hỏi), câu trả lời **mới hoàn thành chưa xử lý** (cắt 4.000 ký tự/câu), mục tiêu mảng, 3 tiêu đề bài gần nhất. Không gửi ghi chú, nhật ký, email, lịch sử đầy đủ.
- **Test:** ngân sách kích thước (≤ 64 KB/run với 2 learner × 5 mảng); không chứa email/tên thật nếu `privacy.pseudonymous=true`; snapshot target lưu khi phục vụ context lần đầu, lần GET sau trả cùng `contextHash`.
- **Phụ thuộc:** P1.3. **Rủi ro:** thiếu ngữ cảnh làm bài kém → mở rộng có kiểm soát ở Phase 2, không quay lại gửi cả database.

#### P1.6 Tách instructions/goals khỏi code — CHUYỂN một phần (2.2)
- **Mục tiêu:** contract là dữ liệu; prompt thuộc runner; mục tiêu học thuộc D1.
- **Thay đổi:** xoá `UPDATE_INSTRUCTIONS` khỏi response; `context.policy` chỉ chứa luật máy đọc được (giới hạn, schema version, luật nguồn); `docs/automation/RUNNER-GUIDE.md` (trung lập provider) + `docs/automation/prompts/` (mỗi runner một file); bảng `track_goals(user_id, track, level, goal, notes, updated_at)` seed từ text hiện tại.
- **Migration:** `0006_track_goals.sql` + seed script.
- **Test:** context chứa goals từ D1; sửa goal trong D1 phản ánh ở context kế tiếp không cần deploy.
- **Phụ thuộc:** P1.5. **Rủi ro:** thấp.

#### P1.7 Test runner tham chiếu (không AI) — MỚI
- **Mục tiêu:** chứng minh kiến trúc mà không phụ thuộc ChatGPT/Claude.
- **Thay đổi:** `scripts/runner/test-runner.mjs`: start → context → sinh lesson package giả (`title: "[TEST] …"`, nguồn https cố định) cho target eligible → result → đọc lại run → in tóm tắt; mã thoát ≠ 0 khi sai. Chế độ lỗi: `--replay`, `--conflict`, `--stale-expected`, `--abandon` (bỏ dở sau start), `--bad-schema`, `--wrong-scope`.
- **Test:** chạy trong CI với `wrangler dev` local (integration); chạy tay với staging.
- **Chấp nhận khi:** mọi chế độ cho đúng kết quả mong đợi, state học không đổi khi lỗi.
- **Phụ thuộc:** P1.3–P1.5.

#### P1.8 Gỡ endpoint cũ — MỚI
- **Mục tiêu:** chỉ còn một đường automation.
- **Thay đổi:** xoá `app/api/learning-run`, `lib/run-schema.ts` (thay bằng schema v1), phần journal cũ không dùng; `LEARNING-UPDATES.md`, `docs/AUTOMATION.md` viết lại theo contract mới.
- **Phụ thuộc:** P1.7.

#### P1.9 Admin API tối thiểu — THU NHỎ (1.7)
- **Mục tiêu:** đủ để vận hành, không làm dashboard.
- **Thay đổi:** `GET /api/admin/runs` (+ chi tiết target/items/events), `GET /api/admin/export`, `GET /api/admin/users`; `app/run-status.tsx` đọc bảng mới. Ghi `admin_audit` cho thao tác ghi (nếu có).
- **Test:** learner gọi → 403.
- **Phụ thuộc:** P1.3.

#### P1.10 Cutover `learn.unhuman.cc` — CHUYỂN (3.6, 3.7)
- **Mục tiêu:** production chạy hoàn toàn trên account riêng; Sites ngừng nhận ghi.
- **Các bước:** (1) Acceptance P1.11 xanh trên staging. (2) Báo khung giờ đóng băng; tắt lịch 03:00 của Sites. (3) Export cuối từ Sites (đường như P0.1). (4) `d1-import --env production` + `d1-verify`. (5) Deploy production; cấu hình Access App B cho automation `learn.unhuman.cc` và kiểm chứng auth tài khoản Hub. (6) Chuyển custom domain/DNS từ Sites sang Worker. (7) Smoke + acceptance trên production. (8) Giữ Sites nguyên vẹn, không ghi, 7 ngày làm đường rollback. (9) Dọn `.openai/hosting.json`, docs Sites.
- **Test:** acceptance 10 bước trên production; so sánh từng ô sau import.
- **Chấp nhận khi:** Cổng 1.
- **Phụ thuộc:** P1.1–P1.9, P1.11 (staging). **Rủi ro:** không lấy được export cuối từ Sites → dùng snapshot gần nhất + nhập tay phần chênh (đã được báo trước nhờ P0.1).

#### P1.11 Acceptance E2E — MỚI
- **Mục tiêu:** chứng minh đúng 10 bước bạn yêu cầu.
- **Thay đổi:** `scripts/acceptance/e2e.mjs` + `docs/VALIDATION.md` (bằng chứng: runId, thời gian, target, outcome, ảnh trước/sau không chứa câu trả lời riêng).
- **Phụ thuộc:** P1.7, P1.9.

#### P1.12 Thử AI runner thật — CHUYỂN (3.1)
- **Mục tiêu:** chọn runner sản xuất sau khi contract đã đứng.
- **Ứng viên:** Claude Cowork scheduled task (cần kiểm tra gửi được header tuỳ ý tới domain), Claude Code/headless script chạy theo lịch ở nơi khác, ChatGPT (chỉ khi có đường HTTP có xác thực được hỗ trợ). Mỗi runner một `clientId`.
- **Chấp nhận khi:** một runner chạy 3 đêm, run log sạch, không sửa server cho riêng runner đó.
- **Phụ thuộc:** Cổng 1.

### Phase 2 — Learning Data Model (sau Cổng 1)

| Task | Mục tiêu | Thay đổi / Migration | Test | Chấp nhận khi | Phụ thuộc | Rủi ro |
| --- | --- | --- | --- | --- | --- | --- |
| P2.1 Bảng học tập | Tách lesson → quests → answers → assessments | `0007_learning_model.sql`: `quests(id, lesson_id, idx, kind CHECK IN ('deterministic','open'), prompt, answer_key, rubric, skill_keys)`, `answers(id, quest_id, user_id, body, version, submitted_at)`, `assessments(id, answer_id, assessor, score, feedback, evidence, run_id, created_at)`, `skills`, `mastery(user_id, skill_key, value, evidence_count, last_assessment_id)`, `review_items(user_id, skill_key/quest_id, due_at, interval_days, ease)`. Chuyển `questions` trong lesson JSON → `quests(kind='open')`; `response` cũ → một `answers` legacy | Migration trên snapshot thật, không mất câu trả lời | Mọi câu trả lời cũ truy được qua `answers` | Cổng 1 | Dữ liệu cũ không tách được theo câu → giữ dạng legacy một answer/bài |
| P2.2 Chấm tự động | Hub tự chấm quest đóng (chọn đáp án, điền từ, đúng/sai) | `lib/grading/deterministic.ts`; chấm khi nộp, ghi `assessments(assessor='hub')` | Bảng đáp án | Không quest đóng nào đi qua AI | P2.1 | Đáp án nhiều cách viết → chuẩn hoá có test |
| P2.3 Open-ended → AI grading | Câu mở vào hàng chờ, runner chấm qua contract | Context thêm `unassessedAnswers`; result thêm `assessments[]` gắn `answerId` + `answerVersion`; server kiểm tra answer thuộc target của run và chưa bị chấm/đổi | Runner chấm answer của learner khác → bị từ chối; answer sửa sau khi context phát ra → 409 item | Không ghi assessment sai learner/sai version | P2.1, P1.3 | Model chấm sai → lưu `assessor`, cho phép admin ghi đè (assessment mới, không xoá cũ) |
| P2.4 Mastery từ evidence | Mastery chỉ đổi khi có assessment | `lib/mastery.ts` hàm tất định (vd. trung bình trượt có trọng số); runner **không** ghi mastery | Cùng chuỗi assessment → cùng mastery; không assessment → không đổi | Tái tính toàn bộ từ assessments cho kết quả giống hệt | P2.2, P2.3 | Công thức chưa tối ưu → đổi công thức = tái tính, không migration dữ liệu |
| P2.5 Review queue | Lịch ôn từ câu sai/chưa chắc | `lib/review.ts` (SM-2 rút gọn) phía server | Ngày đến hạn đúng khoảng | | P2.4 | |
| P2.6 Context v2 | Đúng danh sách bạn nêu | goals/curriculum cần thiết, bài hiện tại, answers mới chưa chấm, mastery gọn, assessments gần đây, review đến hạn, lỗi/điểm yếu; `contractVersion=2`, v1 còn nhận 30 ngày | Ngân sách ≤ 64 KB/run | Runner v1 vẫn chạy trong thời gian chuyển | P2.4, P2.5 | |
| P2.7 UI tối thiểu | Trả lời từng quest, xem phản hồi | Sửa `daily-learning.tsx` ở mức chức năng | Smoke trên staging | | P2.1 | Không làm redesign |
| P2.8 Notes/logs theo user | Bỏ khối JSON workspace chung | `0008_notes_logs.sql`, chuyển dữ liệu workspace → hàng có `user_id` | Không mất ghi chú | | P1.1 | |

### Hoãn (không làm trong đợt này)

Redesign UI, dashboard đẹp, Mermaid/Markdown, a11y ngoài lỗi chặn, refactor component vì style, adaptive curriculum nâng cao, tối ưu prompt, email thông báo (xác minh tài khoản và đặt lại mật khẩu vẫn cần), Google Drive/Docs, notification, audio, kiểm tra DOI/PMID, `content.ts` → D1, nhắc mảng kẹt.

---

## 6. Database & migration strategy

1. **Forward-only, expand → migrate → contract.** Thêm cột/bảng trước; code mới đọc cả hai dạng; chuyển dữ liệu; bỏ dạng cũ ở migration sau. Không sửa file migration đã áp lên staging/production.
2. **Mỗi lần migrate production:** backup tự động → áp migration → verify (đếm dòng + kiểm tra ràng buộc) → deploy code. D1 áp từng file migration trong giao dịch; thay PK bằng rebuild bảng trong cùng file.
3. **Thử trên dữ liệu thật trước:** mọi migration chạy trên bản restore local của snapshot mới nhất (private, không vào CI) trước khi lên staging.
4. **Thứ tự file dự kiến:** `0003_auth_users` · `0004_learner_scope` · `0005_automation` · `0006_track_goals` · `0007_learning_model` · `0008_notes_logs`. `0002` giữ (chưa có dữ liệu production), ngừng ghi từ `0005`, xoá ở một migration "contract" sau Cổng 1.
5. **Chuyển dữ liệu Sites → D1 mới:** nguồn là snapshot (format 1/2) → `d1-import` vào DB rỗng → `d1-verify` từng ô. Diễn tập trên staging ở P0.7; thực hiện production ở P1.10 với export cuối. Không merge, không ghi đè.
6. **ID:** giữ nguyên mọi ID cũ; ID mới do server sinh (ULID có tiền tố: `usr_`, `les_`, `run_`, `tgt_`, `qst_`, `ans_`, `asm_`).
7. **Ràng buộc trong DB, không chỉ trong code:** `UNIQUE(user_id, track, assigned_date)`, `CHECK` cho enum, FK cho run/target/item.

## 7. Auth strategy

| Đường | Lớp edge | Lớp app | Danh tính |
| --- | --- | --- | --- |
| `/` + UI | Không có user Access App | thư viện auth xác minh tài khoản + cookie session | app `user.id`, trạng thái `active` |
| `/api/*` (user) | Không có user Access App | session đã xác minh + `Origin` khớp cho request ghi | `users.id`; mọi truy vấn lọc theo id này |
| `/api/admin/*` | Không có user Access App | session đã xác minh + `role='admin'` | admin |
| `/api/automation/v1/*` | Access App B (Service Auth) | verify service JWT (`aud`=B, `common_name` khớp client) **và** Bearer key (hash trong `AUTOMATION_CLIENTS`) + scope | `clientId`; learner chỉ đến từ `run_targets` |
| local dev | không | `lib/auth/dev.ts` khi `ENVIRONMENT=local` + loopback | user giả cố định |

Quy tắc: không đọc `oai-authenticated-user-*` hoặc header user tự khai; không nhận `user_id`/email từ body/query; session phải được thư viện auth xác minh và user phải active; chỉ email có invite mới đăng ký. Automation route verify service JWT (JWKS theo `kid`) và bearer key có scope. Secrets chỉ trong Worker/GitHub secrets: `BETTER_AUTH_SECRET`, mail provider, `AUTOMATION_CLIENTS`, `CLOUDFLARE_API_TOKEN`.

## 8. Automation API contract v1 (đề xuất)

Lý do không dùng đúng `GET /context` + `POST /result`: bắt đầu một lượt là thao tác ghi (tạo run, chụp target), nên phải là POST; GET không được có side effect. Hai endpoint bạn gợi ý vẫn có, chỉ nằm dưới một run cụ thể.

| Method | Path | Scope | Mục đích |
| --- | --- | --- | --- |
| POST | `/api/automation/v1/runs` | `runs:create` | Tạo run. Header `Idempotency-Key` (tuỳ chọn): cùng key + cùng client trong 24h → trả lại run cũ |
| GET | `/api/automation/v1/runs/{runId}/context` | `context:read` | Lần đầu: chụp targets + eligibility vào `run_targets`, chuyển `context_served`. Lần sau: trả đúng snapshot cũ (`contextHash` không đổi) |
| POST | `/api/automation/v1/runs/{runId}/result` | `result:write` | Gửi đề xuất. Một kết quả được chấp nhận cho mỗi run; replay cùng nội dung → cùng response |
| POST | `/api/automation/v1/runs/{runId}/fail` | `result:write` | Runner tự báo lỗi (nguồn không đọc được, hết quota…) |
| GET | `/api/automation/v1/runs/{runId}` | `context:read` | Trạng thái + outcome từng target (dùng để kiểm tra sau khi gửi hoặc trước khi retry) |
| GET | `/api/automation/v1/schema` | `context:read` | JSON Schema của context/result/lesson package (sinh từ zod) |

**Trạng thái run:** `created → context_served → finished | failed | expired`. Quá 2 giờ chưa có result → `expired` (tính lúc đọc + cron dọn). Mọi chuyển trạng thái ghi một dòng `run_events(run_id, at, type, detail)` append-only.

**Start**
```json
POST /api/automation/v1/runs
{ "contractVersion": "1",
  "trigger": "scheduled",
  "runner": { "name": "test-runner", "version": "0.1.0", "model": "none" } }
→ 201 { "runId": "run_01J…", "status": "created", "expiresAt": "2026-10-09T03:00:00Z",
        "links": { "context": "/api/automation/v1/runs/run_01J…/context",
                   "result":  "/api/automation/v1/runs/run_01J…/result" } }
```
`runner.model` chỉ để ghi log, server không dùng để quyết định.

**Context**
```json
{ "contractVersion": "1", "runId": "run_01J…", "contextHash": "sha256:…",
  "learningDay": "2026-10-09", "timezone": "Europe/Berlin", "cutoff": "2026-10-09T01:00:00Z",
  "policy": { "maxAssignmentsPerRun": 10, "lessonPackage": "lesson-package/1",
              "sources": { "httpsOnly": true, "min": 1, "max": 8 } },
  "targets": [
    { "targetId": "tgt_01J…", "learner": { "ref": "lrn_7f3a" }, "track": "Deutsch",
      "eligible": true, "eligibility": "completed_before_cutoff",
      "goal": { "level": "A2", "goal": "B2 trong 12 tháng", "notes": "…" },
      "currentLesson": { "id": "les_…", "title": "…", "level": "A2", "assignedDate": "2026-10-08",
                         "completedAt": "2026-10-08T19:40:00Z", "nextTopic": "…",
                         "questions": [ { "idx": 0, "question": "…" } ] },
      "newAnswers": [ { "lessonId": "les_…", "text": "…", "submittedAt": "…" } ],
      "recentLessonTitles": [ "…", "…", "…" ] },
    { "targetId": "tgt_01K…", "learner": { "ref": "lrn_7f3a" }, "track": "Cardio",
      "eligible": false, "eligibility": "not_completed" } ] }
```

**Result**
```json
POST /api/automation/v1/runs/run_01J…/result
{ "contractVersion": "1", "contextHash": "sha256:…", "summary": "…",
  "items": [
    { "targetId": "tgt_01J…", "action": "assign",
      "expectedCurrentLessonId": "les_…",
      "lesson": { "title": "…", "objective": "…", "minutes": 60, "level": "A2",
                  "sections": [ … ], "diagram": "…", "exercise": "…",
                  "questions": [ { "question": "…", "answer": "…" } ],
                  "deliverable": "…", "sources": [ { "title": "…", "url": "https://…",
                  "readScope": "…", "retrievedAt": "…", "publishedAt": null } ],
                  "nextTopic": "…" } },
    { "targetId": "tgt_01K…", "action": "issue", "reason": "Nguồn chính không truy cập được" } ] }
→ 200 { "runId": "run_01J…", "status": "finished", "replayed": false,
        "items": [ { "targetId": "tgt_01J…", "outcome": "assigned", "lessonId": "les_…", "reason": "…" },
                   { "targetId": "tgt_01K…", "outcome": "issue", "reason": "…" } ] }
```

Luật server:
- `targetId` phải thuộc run này; learner, track và bài hiện tại lấy từ `run_targets`, không lấy từ client. Target không được nhắc → `no_action`.
- `contextHash` phải khớp snapshot đã phát.
- `assign` chỉ thành công khi: target `eligible` tại thời điểm commit, `expectedCurrentLessonId` = bài hiện tại, chưa có bài cho learner×track×ngày, run còn mở. Không thoả → outcome `kept` + lý do, **không làm hỏng target khác** (mỗi target là một quyết định độc lập trong cùng một batch).
- Ghi lesson mới, đổi slot, ghi `run_items`, chốt run trong **một `db.batch`**; lỗi bất kỳ → không ghi gì, run vẫn `context_served`, retry an toàn.
- Lesson cũ và câu trả lời không bao giờ bị xoá/sửa bởi automation.

**Mã lỗi**

| HTTP | `code` | Runner nên làm |
| --- | --- | --- |
| 400 | `invalid_payload` | Sửa payload; không retry nguyên văn |
| 401 | `unauthenticated` | Kiểm tra credential |
| 403 | `insufficient_scope` | Dừng |
| 404 | `run_not_found` | Bắt đầu run mới |
| 409 | `run_closed` / `result_conflict` / `context_mismatch` | GET run, không gửi lại mù |
| 410 | `run_expired` | Bắt đầu run mới |
| 413 | `payload_too_large` | Giảm nội dung |
| 429 | `rate_limited` | Chờ theo `Retry-After` |
| 503 | `unavailable` | Retry có backoff (an toàn nhờ idempotency) |

**Versioning:** `contractVersion` bắt buộc; server hỗ trợ phiên bản hiện tại và trước đó; thay đổi phá vỡ → tăng phiên bản. Lesson package có version riêng (`lesson-package/1` = schema hiện tại; Phase 2 → `/2` có quests).

## 9. Test strategy

| Tầng | Công cụ | Nội dung | Chạy ở |
| --- | --- | --- | --- |
| Unit | `node --test` | policy/cutoff/DST, replacement engine (bảng quyết định + property), schema zod, JWT verify (khoá test tự sinh) | CI mỗi PR |
| SQL integration | `node:sqlite` adapter hiện có | migration 0000→mới nhất trên DB rỗng; writer; ràng buộc UNIQUE/CHECK | CI |
| Worker integration | `wrangler dev` local hoặc `@cloudflare/vitest-pool-workers` | route + auth thật trong runtime Workers; D1 local | CI |
| Contract | JSON Schema từ `/schema` + test runner | runner đọc schema và gửi payload hợp lệ/không hợp lệ | CI (local) + staging |
| Chaos | test runner `--replay/--conflict/--stale-expected/--abandon/--bad-schema/--wrong-scope` | state học không đổi khi lỗi | CI + staging |
| Migration trên dữ liệu thật | restore snapshot private → migrate → verify từng ô | không mất dữ liệu | Local (không vào CI) |
| Auth edge | `curl` không cookie, header giả, service token sai | Access + app đều chặn | staging, production |
| E2E acceptance | `scripts/acceptance/e2e.mjs` + bước browser thủ công | 10 bước | staging, production |
| Restore drill | `scripts/restore-drill.mjs` | backup mới nhất restore được | hằng tháng + trước mỗi migration production |

## 10. Rollback strategy

| Sự cố | Rollback |
| --- | --- |
| Code lỗi sau deploy | `wrangler rollback` về version trước (Workers giữ lịch sử version); migration tương thích ngược nhờ expand–contract |
| Migration lỗi | Migration chạy trong giao dịch → lỗi thì không áp; nếu đã áp mà dữ liệu sai: D1 Time Travel về mốc trước migration, hoặc restore backup tự động gần nhất vào DB mới rồi trỏ binding |
| Runner gửi nội dung xấu | Thu hồi key (xoá khỏi `AUTOMATION_CLIENTS`), các run sau bị 401; bài đã gán là bài mới — bài cũ và câu trả lời còn nguyên; admin gán lại bài trước nếu cần |
| Cấu hình auth sai | Fail-closed: app từ chối session không hợp lệ; sửa secret/config, không chấp nhận header thay thế |
| Cutover thất bại (trong 7 ngày) | Trỏ domain về Sites (Sites không bị sửa, dữ liệu dừng tại lúc đóng băng); export phần ghi mới từ D1 production để nhập lại khi cutover lần hai. Sau 7 ngày, không còn rollback về Sites |
| Mất D1 production | Restore từ backup tự động (≤ 24h dữ liệu) hoặc Time Travel |

## 11. Thứ tự implementation (mỗi bước ≈ một PR)

1. P0.0 checklist + `docs/ops/CLOUDFLARE.md` (không code) — **bạn làm phần tài khoản**.
2. P0.1 snapshot Sites mới + restore local (không code).
3. PR: `wrangler.jsonc` envs + `build/worker.ts` + `/api/health` + bỏ `CONNECTORS` (P0.2, P0.3 phần code).
4. Deploy spike staging, đo CPU → **quyết định D2** (giữ vinext / Paid / SPA + Hono).
5. P0.4 auth email/password trên D1 + thay `getChatGPTUser` + xác minh/reset email + test auth. Chủ dự án đã yêu cầu bắt đầu code ngày 08/10; code local hiện là bản triển khai ban đầu. Vì thứ tự plan đặt P0.4 sau P0.2–P0.3, chưa deploy hoặc bật staging signup cho tới khi Worker/D1 spike và sender verification hoàn tất.
6. Cấu hình Access App B cho automation trên staging (P0.5) — bạn + tôi theo `docs/ops/ACCESS.md`; không tạo user App A.
7. PR: tắt `/api/learning-run` trên hạ tầng mới (P0.6).
8. PR: `d1-import`/`d1-verify` + import staging (P0.7).
9. PR: backup cron + restore drill + `DEPLOYMENT_ID` (P0.8).
10. PR: CI lint/build + `deploy.yml` staging/production (P0.9).
11. PR: xoá code Sites build/runtime (P0.10).
12. Smoke staging → **Cổng 0** (P0.11).
13. PR: `0004_learner_scope` + lọc theo user (P1.1).
14. PR: automation credentials (P1.2).
15. PR: `0005_automation` + endpoints v1 + state machine (P1.3) cùng replacement engine (P1.4).
16. PR: context builder + `0006_track_goals` + tách instructions (P1.5, P1.6).
17. PR: test runner + integration CI (P1.7).
18. PR: admin API tối thiểu + run status UI đọc bảng mới (P1.9); gỡ endpoint cũ (P1.8).
19. Acceptance E2E trên staging (P1.11).
20. Cutover production (P1.10) → acceptance trên production → **Cổng 1**.
21. Thử AI runner thật (P1.12).
22. Phase 2 theo thứ tự P2.1 → P2.2 → P2.3 → P2.4 → P2.5 → P2.6 → P2.7/P2.8.

## 12. Acceptance test (cuối Phase 0–1)

| Bước | Kiểm chứng |
| --- | --- |
| 1. Mở `learn.unhuman.cc` | Trình duyệt sạch thấy form đăng nhập Learning Hub |
| 2. App xác thực | Đăng ký được mời, xác minh email, đăng nhập; email ngoài invite list bị chặn |
| 3. App đọc/ghi D1 production | `/api/health` báo `env=production`, D1 ID production; lưu một câu trả lời, refresh thấy lại |
| 4. Runner có service credential | Test runner dùng `clientId=test-runner`; thiếu Access token hoặc key → 401 |
| 5. GET context | `POST /runs` → `runId`; `GET …/context` trả target của learner; không chứa email, ghi chú |
| 6. Tạo lesson package | Runner tạo bài `[TEST]` cho target eligible (cho bài hiện tại "đã xong trước cutoff" trên một learner test) |
| 7. POST result | 200, outcome `assigned` cho target đó, `kept` cho target khác |
| 8. Validate + transaction | Gửi lại cùng payload → `replayed:true`; payload khác → 409; state không đổi |
| 9. Browser refresh | Bài `[TEST]` hiện ở mảng đó; bài cũ và câu trả lời nằm trong lịch sử |
| 10. Run log | Admin xem run: client, trigger, thời điểm created/context_served/finished, từng target với outcome + lý do + `contextHash` |

Bài `[TEST]` trên production dùng một learner test riêng (`status=active`, chỉ admin thấy) để không làm bẩn dữ liệu học thật.

## 13. Quyết định (đã duyệt 07/10/2026)

| # | Câu hỏi | Kết quả |
| --- | --- | --- |
| D1 | Domain cho production | `unhuman.cc` thuộc sở hữu của bạn. Còn phải xác nhận zone dùng nameserver Cloudflare (P0.0) |
| D2 | Giữ `vinext` beta trên Workers Free? | Tiêu chí là **ổn định**. Giữ chỉ khi đạt 3 điều kiện ở P0.3; trượt → SPA (Vite) + Hono |
| D3 | Thời điểm cutover | **Cuối Phase 1** (P1.10) |
| D4 | Nơi lưu backup tự động | **R2 bucket riêng**, giữ 30 bản; thêm bản tải tay hằng tháng ngoài Cloudflare |
| D5 | Human login | **Tài khoản Learning Hub email + mật khẩu**, xác minh email và đăng ký theo invite/allowlist; không Google IdP/Access OTP (08/10/2026) |
| D6 | Learner ref trong context | **Ẩn danh** (`lrn_…`), không gửi tên/email cho model |
| D7 | Bản phase 0 cũ trên Sites | **Không publish**; Sites giữ v5 đến cutover |
| D8 | Sender xác minh/reset email | **Provider bên ngoài**, giữ Workers Free; Resend được dùng làm adapter ban đầu. Tài khoản provider, domain DNS và Worker secrets chưa cấu hình |

Bước tiếp theo theo thứ tự vẫn là hoàn thành checklist Cloudflare/R2 và snapshot Sites (P0.0–P0.1), rồi P0.2–P0.3. Code auth local đã bắt đầu theo yêu cầu rõ ràng; chỉ kiểm thử/deploy staging sau khi các phụ thuộc đó và sender xác thực xong.
