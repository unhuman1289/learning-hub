# Kế hoạch: Learning Hub gọn lại, bàn học thư thái, luyện nghe — dev tách production, dùng tốt trên điện thoại ở Việt Nam

- **Người thực hiện:** Codex (mã), Claude (mockup giao diện), chủ dự án (duyệt, thao tác trên Mac và Cloudflare).
- **Ngày lập:** 13/11/2026, bản 3 (sau audit phiên Codex tối 13/11). **Tiến độ:** xem `docs/plan/HUB-NEXT-STATUS.md`. Chi tiết tiến độ nằm trong `docs/plan/status/<bước>.md` trên nhánh của từng bước.
- **Cách giao việc cho Codex:** mục 10. Đọc mục này trước khi bắt đầu một bước.
- **Mã đã đọc:** `main` tại `38aa632` (đã có Adaptive Roadmap #139–#142 và Knowledge K1–K5).
- **Đã kiểm ngày 13/11 trên bản `main` mới nhất:**
  - `npm ci`, `npm run db:migrate:local` (đủ 0000–0025) và `npm run build` đều đạt;
  - `npm run dev` chạy ở `http://localhost:5173`, `/api/health` trả `environment: local`;
  - staging đã áp đủ migration.

## 0. Mục tiêu, phân vai, quyết định

**Mục tiêu sản phẩm:** một app tự học.
- Phía trước tối giản, trực quan, thư thái như ngồi vào bàn học.
- Phía sau mạnh: cá nhân hoá theo bằng chứng thật, lộ trình tự nâng cao, kho tài liệu có kiểm chứng.
- **Mọi chức năng dùng được đầy đủ trên điện thoại ở Việt Nam.**

**Phân vai (cố định):**

| Vai | Việc | Không làm |
|---|---|---|
| **Hub** (mã, có test) | Quyết bài nào, khi nào luyện, khi nào thử bước khó hơn; giữ dữ liệu; chấm câu có đáp án | Soạn nội dung |
| **Qwen** (runner trên Mac) | Soạn bài, chấm câu mở, gia sư "Hỏi", tạo giọng đọc cho bài nghe | Quyết lộ trình ngoài luật Hub |
| **ChatGPT** (lịch định kỳ) | **Chỉ** tìm và cập nhật tài liệu trong Knowledge Base | Soạn bài, chấm bài, đọc câu trả lời của người học |

**Quyết định của chủ dự án (13/11/2026):**
1. **Giao diện:**
   - Giữ cửa sổ Lübeck và cảm giác ngồi vào bàn học thư thái. Được thiết kế lại.
   - Phải có mockup để duyệt **trước** khi code giao diện (cổng M).
2. **Bỏ hẳn đường ChatGPT tự soạn và chấm bài.** ChatGPT chỉ chạy định kỳ cập nhật tài liệu.
3. **Dạng tương tác mới đầu tiên là Nghe.**
4. **Tách production khỏi dev.**
   - Mọi thay đổi được dựng và chạy trên local trước, rồi staging, rồi mới production.
   - Production chạy từ một bản riêng, không ai sửa code trong đó.
5. **Điện thoại ở Việt Nam là thiết bị chính cần đạt.** Mỗi giai đoạn có tiêu chí riêng cho điện thoại và mạng từ Việt Nam.

**Ranh giới (giữ `AGENTS.md`):**
- Không thêm model API hay key trả phí. Giọng đọc tạo trên Mac bằng giọng hệ thống.
- Không thay bài chưa xong, không tự hoàn thành bài.
- Câu trả lời, ghi chú, nội dung web là dữ liệu không đáng tin.
- Không đưa dữ liệu cá nhân hay bệnh nhân vào Knowledge.
- Không commit `.env*`, `.dev.vars`, `private-data/`, `work/`, `.wrangler/`, log, bản xuất DB.
- Sao lưu D1 trước mỗi migration. Diễn tập trên bản sao trước khi áp thật.
- Xoá dữ liệu, deploy, merge và migration production cần chủ dự án đồng ý từng lần.
- Không force-push.

## 1. Hiện trạng (đo ngày 13/11/2026)

### 1.1. Dùng thật và quy mô mã

- **Dùng thật:** 4 tài khoản, 5 sổ, 20 bài (v1: 4, v2: 14, v3: 2), 106 câu trả lời, 13 yêu cầu (toàn bộ `extra_practice`), 6 nguồn Knowledge.
- **Mã:** khoảng 23 nghìn dòng (`app` 9,6k, `lib` 9,5k, `scripts` 2,4k, `integrations` 1,2k), 50 API route, 58 bảng D1.
- **Dạng câu đã giao:**
  - đã dùng: `short` 53, `choice` 45, `cloze` 8, `long` 6, `code` 2;
  - chưa từng dùng: `match`, `order`, `label`, `table`.

### 1.2. Phần chạy song song hoặc không còn dùng

| Phần | Production | Mã chính |
|---|---|---|
| Automation v1 | `automation_runs` 0, `run_items` 0, `runs` 0 | `app/api/automation/v1/**`, `lib/automation/{state,context,replacement,schema,sensitivity,http}.ts`, `lib/run-journal.ts`, `lib/run-schema.ts` |
| Daily v1, Sites | `learning_slots` 4, `learning_runs` 2, `learning_workspace` 3 | `app/api/daily`, `app/api/learning-run`, `lib/daily-{store,view,sql,types}.ts`, `app/hub/use-daily.ts`, `app/run-status.tsx`, `scripts/prepare-sites-bridge-secrets.py` |
| Bài v1, sổ legacy | 4 bài v1; sổ legacy đang hoạt động: 0 | `app/hub/notebook-view.tsx`, `lesson-page.tsx`, `legacy-route.ts` |
| ChatGPT soạn/chấm qua MCP | 8 công cụ `hub2_*`, scope `hub:plan`, `hub:assess`, MCP Events | `lib/mcp/{service,http,events,events-register}.ts`, `build/direct-mcp-worker.ts` (`EventDispatcher`, cron `*/5`), bảng `mcp_event_*`, prompt `deutsch-unhuman.md`, `deutsch-project-v7.md` |
| Hai gói bài | v2 và v3 (v3 bật tay qua `limits.package=3`) | `lib/contracts/lesson-package-v{2,3}.ts`, `app/api/subjects/route.ts:41` |
| Bốn loại yêu cầu | Chỉ dùng `extra_practice` | `lib/requests/service.ts`, `app/hub/requests-panel.tsx`, `new-lesson-request.tsx` |
| Quản trị rải rác | 7 panel riêng | `app/hub/{admin-disputes,dispute-resolver,quality-table,ai-jobs-panel,family-admin,runner-status}.tsx` |

### 1.3. Môi trường đang lẫn dev và production

- **Runner production** (launchd `cc.unhuman.learning-hub-runner.production`) chạy từ `~/Code/Learning Hub/work/simpler-notebook-form`. Đây là một worktree dev nằm trong thư mục dev chính, đang ở commit `38aa632` tách rời.
- **Deploy production** đã từng chạy từ worktree tạm của agent.
- **Có 8 worktree** trên Mac:
  - thư mục chính `~/Code/Learning Hub` ở nhánh cũ `codex/phase-1-automation-cutover`, có nhiều thay đổi chưa commit từ tháng 10;
  - các worktree trong `~/.codex/worktrees/…`, `~/Documents/Codex/…`, `.claude/worktrees/…` và thư mục tạm.
- **Cấu hình runner:**
  - `~/.config/learning-hub/home-runner.env` trỏ tới **staging** (tên dễ nhầm);
  - `home-runner.production.env` trỏ tới production;
  - chưa có cấu hình cho local.
- **Local thiếu sẵn cho người mới:**
  - không có `.dev.vars.example` trong Git;
  - `.dev.vars` hiện tại chỉ có 4 biến, không có `AUTOMATION_CLIENTS`, nên runner local chưa nhận được job.
  - Lối tắt xác thực cho local đã có sẵn (`lib/auth/automation.ts:155`: `APP_ENV=local`, `ENVIRONMENT=local`, host `localhost`).
- **Lệnh `deploy:production`** chạy được từ bất kỳ worktree nào, không có chốt chặn.
- **CI:**
  - `.github/workflows/ci.yml` chạy test, contracts, typecheck, lint, build;
  - `deploy-staging.yml` chạy tay.

### 1.4. Điện thoại và mạng từ Việt Nam

- Worker production đặt `placement.region = azure:westeurope` (gần D1), nên mỗi lời gọi API từ Việt Nam đi một vòng sang châu Âu, khoảng 250–350 ms mỗi vòng (ước tính). Tài nguyên tĩnh được phục vụ ở edge gần người dùng.
- **JS phía trình duyệt** (bản build 13/11): khoảng 272 KB gzip, trong đó `home-client` 108 KB, `framework` 58 KB, `index` 54 KB.
- **Font** nạp bằng `@import` Google Fonts trong `app/globals.css:1`. Cách này chặn hiển thị và thêm một chuỗi yêu cầu.
- **Chưa có** `manifest`, icon cho màn hình chính, `theme-color`. Đã có `viewport`.
- Ô trả lời chưa tắt tự sửa và tự viết hoa. Chưa có chốt cho bàn phím Telex/VNI khi trả lời tiếng Đức hoặc tiếng Trung.
- Đã có: giờ theo thiết bị, chạm lần đầu để rút sổ, ô ảnh `accept=image/*`.
- Ếch dùng Hub từ Việt Nam. Đây là người kiểm thử thật cho tiêu chí điện thoại.

## 2. Đích đến

### 2.1. Ba màn hình cho người học

1. **Bàn học (Hôm nay)**
   - Cửa sổ Lübeck là trung tâm cảm xúc.
   - Dưới cửa sổ là mặt bàn với **một tờ "Bài tiếp theo" cho mỗi sổ đang học**, theo thứ tự Hub chọn. Mỗi tờ có tên bài, thời lượng và một dòng lý do.
   - Một vòng phút học hôm nay. Giá sổ gọn ở cạnh bàn.
2. **Bài học**
   - Một câu mỗi lần. Trả lời → nhận xét ngay dưới câu → "Tiếp".
   - Nút **Hỏi** mở gia sư ngay trong câu.
   - Cuối bài là tờ tổng kết với hai nút **Bài tiếp theo** và **Về bàn**.
3. **Sổ**
   - Lộ trình dạng đường dọc: đã qua, đang ở, sắp tới.
   - "Đã làm được", "Bài tới khó hơn vì…", nguồn.
   - Lịch sử gập theo ngày. Cài đặt trong tấm phủ.

**Nguyên tắc:**
- Mỗi màn hình chỉ có một việc chính. Chi tiết chỉ hiện khi bấm.
- Hệ thống luôn nói "vì sao".
- Không có chữ kỹ thuật.
- Chuyển động chỉ dùng để báo đổi trạng thái.
- Giấy luôn màu kem, kể cả chế độ tối.
- Dùng token trong `DESIGN.md` và `app/globals.css`.
- **Thiết kế cho điện thoại trước**, rồi mở rộng lên máy tính.

**Quản trị** là khu riêng, có một hàng **Cần xem** cùng các thẻ Gia đình, Knowledge, Hệ thống.

### 2.2. Phía sau

1. **Bản đồ chương trình:** chuẩn học → `roadmap_steps` → kỹ năng (đã có).
2. **Mô hình người học:** kỹ năng × mức tư duy × **cách tiếp nhận** (đọc hoặc nghe, mới ở L).
3. **Câu hỏi** có ba phần độc lập:
   - dạng câu (9 dạng);
   - đầu vào (chữ, hình, **âm thanh**);
   - cách chấm (khớp, tương đương, số, chính tả theo từ, rubric + Qwen).
4. **Điều phối:** chỉ một đường, là job của runner (`/api/automation/v2`).
5. **Knowledge:** dùng chung theo chủ đề, ChatGPT cập nhật định kỳ (đã có).

## 3. Ba môi trường và quy trình phát hành (giai đoạn E, làm đầu tiên)

### 3.1. Sơ đồ

| | **Local (dev)** | **Staging** | **Production** |
|---|---|---|---|
| Mã | Mọi worktree dev (`~/Code/Learning Hub`, worktree của Codex/Claude), nhánh tính năng | Đúng commit sắp phát hành | **Bản riêng** `~/Code/learning-hub-prod`, chỉ ở trạng thái một tag `prod-*` |
| Hub | `npm run dev` → `http://localhost:5173`; D1 local trong `.wrangler/state` của worktree | `learning-hub-staging…workers.dev` | `https://learn.unhuman.cc` |
| Dữ liệu | Dữ liệu mẫu (`seed:hub2`). Tuỳ chọn: bản sao production trong `.wrangler/state-prodcopy` (riêng tư) | Dữ liệu thử của staging | Dữ liệu thật |
| Runner | Chạy tay: `npm run runner:local` (Qwen) hoặc `npm run runner:fake` (không cần LM Studio) | Chạy tay khi kiểm: `home-runner.staging.env` | launchd, chạy từ `~/Code/learning-hub-prod` |
| Ai được dùng | Agent và chủ dự án | Agent qua `deploy-staging.yml`, chủ dự án | Chỉ qua `scripts/release.mjs`, chủ dự án đồng ý |
| Thử trên điện thoại | Cùng Wi-Fi (`http://<ip-Mac>:5173`) hoặc đường hầm tạm (mục 3.4) | Ếch và chủ dự án dùng thật | Người dùng |

### 3.2. Local chạy được ngay từ bản sạch (PR E1)

1. **`.dev.vars.example`** (chỉ tên biến và giá trị giả):
   - `BETTER_AUTH_SECRET`, `APP_ORIGIN=http://localhost:5173`;
   - `HOUSEHOLD_GATE`, `PROFILE_COOKIE_SECRET`, `HOUSEHOLD_PASSPHRASE_SHA256`, `HOUSEHOLD_LEGACY_PROFILE_IDS`;
   - `AUTOMATION_CLIENTS`, `ADAPTIVE_PILOT_SUBJECT_ID`;
   - `RESEND_API_KEY` để trống: email local in ra console.

   Lấy danh sách từ `cloudflare-env.d.ts`. Commit tệp này.
2. **`scripts/dev-setup.mjs`** (`npm run dev:setup`):
   - Tạo `.dev.vars` nếu chưa có, với bí mật ngẫu nhiên local và một client automation local (`id: local-runner`, khoá ngẫu nhiên, lưu `keySha256`, scope `jobs:plan`, `jobs:assess`, capability đủ).
   - Ghi `~/.config/learning-hub/home-runner.local.env` (quyền 600) với `HUB_BASE_URL=http://localhost:5173`, khoá tương ứng, `QWEN_BASE_URL=http://127.0.0.1:1234/v1`.
   - Không ghi đè tệp đã có trừ khi có `--force`. Không in bí mật ra màn hình.
3. **`npm run dev:fresh`:** xoá `.wrangler/state` của worktree này → `db:migrate:local` → `seed:hub2`. Seed tạo 3 người dùng mẫu và vài sổ mẫu: Deutsch, Rust, Toán 7, Tiếng Trung.
4. **`npm run runner:local`:** chạy `integrations/home-runner/runner.mjs --config ~/.config/learning-hub/home-runner.local.env`.
   - Mặc định `--once`, `--watch` để chạy liên tục.
   - Chặn nếu `HUB_BASE_URL` không phải `localhost`.
5. **`npm run runner:fake`:** `scripts/fake-runner.mjs` nhận job từ local và trả kết quả mẫu cố định trong `tests/fixtures/runner/`. Dùng cho e2e và cho người không bật LM Studio. Chặn nếu host không phải `localhost`.
6. **`npm run dev:phone`:** chạy dev nghe ở mọi địa chỉ trong mạng nhà (`--host 0.0.0.0`) và in `http://<ip-Mac>:5173`. Thêm IP đó vào danh sách origin local.
7. **Tài liệu `docs/DEVELOPMENT.md`** (mới):
   - Từ máy sạch đến bài học đầu tiên trên local trong 10 phút.
   - Gỡ lỗi thường gặp: cổng bận, Vite chọn cổng khác, LM Studio chưa chạy.
8. **Nhiều worktree cùng lúc:**
   - Mỗi worktree có state D1 riêng (`scripts/local-db.mjs` đã ép state nằm trong checkout).
   - Vite tự nhảy cổng nếu 5173 bận. `dev-setup` ghi `APP_ORIGIN` theo cổng thật khi chạy `dev`.

**Xong khi:** trên một clone mới, chạy `npm ci && npm run dev:setup && npm run dev:fresh && npm run dev`, rồi `npm run runner:fake` ở cửa sổ khác. Đăng nhập người dùng mẫu → mở sổ → xin bài → làm bài → tổng kết, tất cả trên local.

### 3.3. Production tách riêng (PR E2 và thao tác trên Mac)

1. **Bản production:** `git clone https://github.com/unhuman1289/learning-hub.git ~/Code/learning-hub-prod`.
   - Là một clone riêng, không phải worktree của thư mục dev, để thao tác Git ở dev không ảnh hưởng.
   - Tạo tệp đánh dấu `.release-checkout` và thêm tên này vào `.gitignore`.
2. **`scripts/release.mjs`:**
   - **`check`:** từ chối nếu:
     - không có `.release-checkout`;
     - cây làm việc bẩn;
     - `HEAD` không đúng một tag `prod-YYYYMMDD-N`;
     - tag không nằm trên `origin/main`.
   - **`staging <commit|tag>`:** xác minh commit có trên nhánh hoặc tag hiện tại của `origin` → checkout commit → `npm ci` → test, typecheck, lint, contracts, build → `migrations list` staging → nếu có `--apply-migrations`, áp migration, deploy và xác nhận `/api/health` trả đúng commit.
   - **`production <tag>`:** như staging, cộng thêm:
     - sao lưu D1 production qua `/api/admin/backup` và chờ xác nhận ghi R2;
     - in danh sách migration chờ và **dừng nếu chưa có** `--apply-migrations`;
     - deploy;
     - kiểm `/api/health` đúng tag và commit;
     - khởi động lại runner: `launchctl kickstart -k gui/$UID/cc.unhuman.learning-hub-runner.production`;
     - đợi runner báo `runner_presence` mới với đúng tag;
     - ghi một dòng vào `~/Library/Logs/learning-hub-releases.log`.
   - **`rollback <tag-cũ>`:** checkout tag cũ, build, deploy, khởi động lại runner. Migration chỉ đi tới. Muốn lùi dữ liệu phải khôi phục từ sao lưu, và cần chủ dự án quyết riêng.
3. **Chốt chặn:**
   - `npm run deploy:production` chỉ chạy khi có biến `LEARNING_HUB_RELEASE=1` (do `release.mjs` đặt) và có `.release-checkout`.
   - Chạy thẳng từ worktree dev thì báo lỗi kèm hướng dẫn.
4. **Runner production:**
   - Sửa `~/Library/LaunchAgents/cc.unhuman.learning-hub-runner.production.plist`: `ProgramArguments` và `WorkingDirectory` trỏ tới `~/Code/learning-hub-prod`.
   - Nạp lại: `launchctl bootout gui/$UID/cc.unhuman.learning-hub-runner.production` rồi `launchctl bootstrap gui/$UID <plist>`.
   - Runner gửi `version` = tag.
   - Sau khi chạy ổn, gỡ worktree `work/simpler-notebook-form`.
5. **Cấu hình runner:**
   - Đổi tên `home-runner.env` → `home-runner.staging.env`. Runner từ chối chạy nếu tên tệp và `HUB_BASE_URL` không khớp (local/staging/production).
   - **LM Studio dùng chung:**
     - Runner production ưu tiên.
     - Runner local và staging mặc định `--once`. Chúng tự dừng khi `runner_presence` production có lease đang chạy (đọc qua endpoint trạng thái của chính Hub production bằng khoá production chỉ đọc).
     - Nếu không làm được phần tự dừng: ghi rõ trong tài liệu là không chạy runner local khi người nhà đang học.
6. **Thư mục dev chính** `~/Code/Learning Hub` đang ở nhánh cũ có thay đổi chưa commit. **Không đụng.** Chủ dự án quyết riêng giữ hay dọn (mục 9).

### 3.4. Thử bản dev trên điện thoại ở xa (tuỳ chọn)

- `npm run dev:tunnel` dùng `cloudflared tunnel --url http://localhost:5173` (đường hầm tạm, có `https`). Ếch ở Việt Nam mở được bản dev mà không cần deploy.
- **Chỉ dùng với dữ liệu mẫu.**
  - Script từ chối nếu state đang là bản sao production.
  - Lối tắt xác thực automation không áp dụng qua đường hầm, vì host không phải `localhost`.
- Tắt đường hầm khi xong. Không để chạy qua đêm.

### 3.5. Quy trình phát hành mỗi thay đổi

1. **Nhánh tính năng** từ `main`, dựng và thử trên **local**: test, typecheck, lint, build, e2e điện thoại (mục 4.6), chạy tay với runner fake hoặc Qwen.
2. **PR:** CI đạt. Mô tả có ảnh chụp điện thoại khi đổi giao diện.
3. **Merge** khi chủ dự án đồng ý.
4. **Staging:** chỉ deploy từ một commit đã push: `release.mjs staging <commit|tag>` hoặc `deploy-staging.yml`. **Không deploy staging từ cây làm việc chưa commit.** `/api/health` trả SHA đầy đủ trong `commit` ở cả staging và production. Trường `version` ghi SHA ngắn ở staging và tag ở production. Chủ dự án hoặc Ếch thử trên điện thoại thật theo danh sách mục 4.7.
5. **Tag** `prod-YYYYMMDD-N` trên đúng commit đã thử ở staging.
6. **Production:** `release.mjs production <tag>` sau khi chủ dự án đồng ý. Có migration thì đồng ý riêng cho migration.
7. **Sau phát hành:** health, một lượt học thật trên điện thoại, kiểm job `succeeded` và id đã lưu.

## 4. Chuẩn điện thoại ở Việt Nam (áp cho mọi giai đoạn)

### 4.1. Thiết bị và trình duyệt cần đạt

| Nhóm | Tối thiểu |
|---|---|
| iPhone | iOS 16.4+ Safari; thêm vào màn hình chính |
| Android | Chrome 110+ trên máy tầm trung (RAM 3–4 GB); Samsung Internet |
| Trình duyệt trong app | Mở link từ **Zalo** và **Messenger** (WebView) |
| Màn hình | Rộng 360–430 px; xoay ngang không vỡ bố cục |

Mở trong Zalo hoặc Messenger mà đăng nhập hay phát âm thanh lỗi thì hiện một dải: "Mở bằng Safari/Chrome để dùng đầy đủ", kèm nút sao chép link. Nhận diện bằng user agent, chỉ để hiện gợi ý.

### 4.2. Ngân sách tốc độ (đo từ Việt Nam, mạng 4G)

| Chỉ số | Mục tiêu (p75) |
|---|---|
| Mở bàn học đến lúc thấy tờ "Bài tiếp theo" | < 3 giây khi đã có cache, < 5 giây lần đầu |
| Từ lúc bấm bài đến câu đầu tiên | < 2 giây |
| Bấm "Kiểm tra" câu có đáp án đến lúc thấy kết quả | < 1,2 giây |
| Bấm phát câu nghe đến lúc có tiếng | < 1 giây |
| JS gzip cho màn bàn học | ≤ 180 KB |
| Số lời gọi API khi mở một màn hình | ≤ 2 |

**Cách đạt:**
- Mỗi màn hình có **một API gom** (`/api/today`, `/api/lessons/[id]`, `/api/subjects/[id]`), trả đủ dữ liệu trong một vòng.
- Không gọi nối tiếp nhiều lần.
- Lời gọi sau đó chỉ khi người học thao tác.

### 4.3. Nhập liệu

- **Mọi ô trả lời:** `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`, `autocomplete="off"`, cỡ chữ ≥ 16 px (iOS không tự phóng to). Dùng `inputmode` phù hợp: số → `decimal`.
- **Chốt bàn phím Telex/VNI:**
  - Với sổ tiếng Đức, Anh hoặc Trung, nếu câu trả lời có chữ chỉ tiếng Việt mới có (ă â đ ê ô ơ ư và các nguyên âm mang dấu thanh tiếng Việt như ấ, ầ, ẩ, ẫ, ậ, ạ, ả, ỏ, ợ…), hiện nhắc ngay dưới ô: "Có vẻ bàn phím đang gõ tiếng Việt (ấ). Đổi sang bàn phím Đức hoặc tắt gõ dấu."
  - Không chặn nộp.
  - Danh sách ký tự nằm trong `lib/lesson-v2/keyboard.ts`, có test.
- **Thanh ký tự đặc biệt** phía trên bàn phím, chèn đúng vị trí con trỏ:
  - tiếng Đức `ä ö ü ß Ä Ö Ü`;
  - pinyin `ā á ǎ à ē é ě è ī í ǐ ì ō ó ǒ ò ū ú ǔ ù ǖ ǘ ǚ ǜ ü`;
  - chỉ hiện khi sổ là ngôn ngữ tương ứng.
- **Tiếng Trung:**
  - Nhận chữ Hán (bàn phím Trung của máy), pinyin có dấu, hoặc pinyin số (`ni3 hao3`).
  - Không dùng font CJK tải về. Dùng font hệ thống `"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif` cho phần có `lang="zh"`.
- **Ô viết dài và code:** cao tự giãn. Nút "Kiểm tra" dính phía trên bàn phím, dùng `visualViewport` để không bị bàn phím che.
- **Câu kéo thả** (`order`, `match`): có cách chạm hai lần (chọn → đặt) thay cho kéo. Ô chạm ≥ 44 px.

### 4.4. Âm thanh trên điện thoại

- Dùng thẻ `<audio>` (không dùng Web Audio), nên vẫn nghe được khi iPhone bật gạt im lặng. **Phải kiểm trên máy thật.**
- Chỉ phát khi người học bấm. `preload="none"` cho câu chưa tới. Khi một câu hiện ra, tải trước âm thanh của câu đó và câu kế tiếp.
- Định dạng AAC trong m4a, 64 kbps mono, khoảng 0,5 MB mỗi phút. Một bài có 4 câu nghe dài 10 giây khoảng 300 KB.
- Server hỗ trợ `Range` (Safari yêu cầu). `Cache-Control: private, max-age=31536000, immutable`.
- Bỏ qua lỗi tai nghe Bluetooth ngắt giữa chừng: hiện nút phát lại, không tính thêm lượt nghe.
- Cài đặt hồ sơ có "Thay âm thanh bằng chữ" cho lúc không tiện nghe. Câu khi đó tính là đọc, không vào chiều nghe.

### 4.5. Mạng chập chờn (cáp quốc tế, 4G yếu)

- Mọi lần nộp dùng `client_submission_id` (đã có), nên thử lại không tạo bản trùng.
- **Câu trả lời đang gõ:**
  - lưu ngay vào `localStorage` theo `lessonId/itemId` (bọc `try/catch`);
  - đồng bộ lên server như nháp hiện có;
  - có mạng lại thì tự gửi phần còn chờ.
- **Thông báo thật:**
  - "Mạng chậm, đang thử lại…" sau 4 giây;
  - "Chưa gửi được. Câu trả lời vẫn lưu trên máy này." khi hết thời gian;
  - không bao giờ báo "Đã lưu" khi server chưa xác nhận.
- `navigator.onLine` và lỗi `fetch` hiện dải "Đang mất mạng". Hết mất mạng thì tự ẩn.
- Thời hạn: đọc 10 giây, ghi 15 giây, thử lại 2 lần có giãn cách.

### 4.6. Thiết kế và hiệu năng trên máy yếu

- `100dvh`, `env(safe-area-inset-*)`, không có cuộn ngang ở 360 px.
- **Cửa sổ Lübeck:**
  - ngừng vẽ lại khi tab ẩn (`visibilitychange`);
  - với `prefers-reduced-motion` hoặc `navigator.deviceMemory ≤ 2`, vẽ một lần, không có chuyển động;
  - đo thời gian vẽ trên CPU chậm 4×; mục tiêu < 50 ms mỗi lần.
- **Font:**
  - bỏ `@import` Google Fonts;
  - tự lưu woff2 tập con `latin`, `latin-ext`, `vietnamese` của Be Vietnam Pro, Newsreader, Patrick Hand trong `public/fonts/`;
  - `font-display: swap`, chỉ `preload` font chữ chính.
- **Tách mã theo màn hình:** trang Quản trị, trình nhập code và biểu đồ chỉ tải khi mở.
- **PWA tối thiểu, chưa có service worker:**
  - `public/manifest.webmanifest`: tên "Bàn học", `display: standalone`, nền và `theme_color` màu kem;
  - icon 192/512 và maskable, `apple-touch-icon` 180 px;
  - `<meta name="theme-color">` cho sáng và tối;
  - trang Cài đặt có hướng dẫn "Thêm vào màn hình chính" cho iPhone và Android.
- **Phiên đăng nhập trên điện thoại:**
  - kiểm thời hạn phiên better-auth và cookie hồ sơ, để người học không phải đăng nhập lại mỗi ngày (mục tiêu 30 ngày, trượt theo lần dùng);
  - cookie `Secure`, `SameSite=Lax`.

### 4.7. Kiểm thử điện thoại

1. **Tự động (`tests/e2e/`, Playwright, chạy trên local với `runner:fake`):**
   - Dự án: `iphone-13` (WebKit) và `pixel-7` (Chromium), mạng giả lập độ trễ 300 ms, tải xuống 1,6 Mbps, tải lên 0,75 Mbps.
     - Chromium giả lập qua CDP `Network.emulateNetworkConditions`.
     - WebKit thêm trễ bằng `page.route`.
   - **Kịch bản:**
     - đăng nhập → bàn học → bài → trả lời, gồm gõ `ä ß` bằng thanh ký tự và gõ nhầm Telex để thấy nhắc;
     - câu nghe: phát, đếm lượt, "Chậm hơn";
     - mất mạng giữa chừng rồi có lại;
     - tổng kết → bài tiếp theo;
     - mở sổ mới.
   - **Kiểm thêm:** ngân sách mục 4.2 (đo bằng `performance` API), không cuộn ngang, ô chạm ≥ 44 px, không có chữ kỹ thuật.
   - Thêm `@playwright/test` vào `devDependencies`. Thêm job `e2e` trong `ci.yml`, chạy trên Linux với WebKit và Chromium.
2. **Đo thật từ người dùng (`/api/rum`):**
   - Trình duyệt gửi `navigator.sendBeacon` với: tên màn hình, mốc thời gian (ms), loại kết nối (`navigator.connection.effectiveType` nếu có), lớp thiết bị (điện thoại/máy tính).
   - Server thêm quốc gia và colo từ `request.cf`.
   - Không gửi nội dung, câu trả lời hay id bài. Lưu gộp theo ngày vào bảng `perf_daily(day, screen, country, device, n, p50, p75, p95)` (cập nhật theo lô). Quản trị → Hệ thống hiện bảng p75 theo quốc gia.
3. **Người thật:** mỗi giai đoạn có thay đổi giao diện, Ếch thử trên điện thoại của mình ở Việt Nam qua staging, theo danh sách 10 bước in trong `docs/ops/PHONE-CHECK.md`. Chủ dự án thử iPhone ở Đức.

## 5. Giai đoạn và PR

**Thứ tự:** **E → S → C → V → P → M (cổng duyệt) → U → L → G → T**. Đây là thứ tự ưu tiên, không phải chuỗi chờ nhau:
- C và V làm song song được, vì chỉ chung `lib/backup-contract.mjs`. Làm C trước rồi rebase V.
- P (nền điện thoại) làm song song với C/V.
- M làm song song với C, V, P.
- **U bắt đầu ngay khi M được duyệt.** U không chờ C, V, P lên production. Phần U cần từ P (API `/api/today` gom, thuộc tính ô nhập) làm cùng U nếu P chưa xong.
- L, G, T, K: thứ tự và phần chạy song song ở [`LGTK.md`](LGTK.md) mục 1.
- **Một bước bị chặn** (ví dụ chờ Qwen, chờ chủ dự án) thì ghi vào STATUS rồi chuyển sang bước khác không phụ thuộc. Không thử lại vô hạn.

**Mỗi PR:**
- chạy `npm run test`, `typecheck`, `lint`, `contracts:check`, `build`, và từ P trở đi `npm run e2e`;
- dựng và thử trên local trước khi mở PR;
- cập nhật `DESIGN.md` và tài liệu khi đổi hành vi;
- mô tả PR có mục **"Đã chạy trên local"** và **"Điện thoại"** (ảnh chụp 390 px khi có giao diện).

### E · Môi trường (mục 3)

- **E1** (PR): `.dev.vars.example`, `dev-setup`, `dev:fresh`, `runner:local`, `runner:fake` cùng fixture, `dev:phone`, `dev:tunnel`, `docs/DEVELOPMENT.md`.
- **E2** (PR): `scripts/release.mjs`, chốt chặn `deploy:production`, runner kiểm khớp tên cấu hình và host, `APP_VERSION` từ tag (production) hoặc mã commit ngắn (staging). `release.mjs staging` từ chối nếu commit chưa có trên `origin`.
- **E3** (thao tác, chủ dự án đồng ý):
  - clone `~/Code/learning-hub-prod`;
  - tag đầu tiên `prod-20261113-1` trên commit đang chạy production (`38aa632`);
  - chuyển launchd runner;
  - đổi tên cấu hình staging;
  - gỡ `work/simpler-notebook-form` khi runner mới chạy ổn 24 giờ.

**Test:**
- `tests/release.test.mjs`: `check` từ chối từng trường hợp, chốt chặn deploy.
- `tests/home-runner.test.mjs`: tên cấu hình và host không khớp thì dừng; `runner:local` từ chối host không phải localhost.
- `tests/fake-runner.test.mjs`.

**Xong khi:**
- clone mới đi trọn kịch bản mục 3.2;
- `npm run deploy:production` từ worktree dev bị chặn;
- runner production chạy từ bản riêng và báo đúng tag;
- `/api/health` production hiện tag.

### S · Chuẩn bị dữ liệu

1. Sao lưu đầy đủ D1 production, diễn tập khôi phục bằng `scripts/restore-drill.mjs` vào state local riêng.
2. **Xuất lưu trữ v1:** `scripts/export-legacy.mjs`.
   - Ghi JSON và Markdown cho 4 bài v1 cùng `learning_workspace`, `learning_slots`, `learning_runs`, tài liệu đã lưu.
   - Lưu ở R2 backups `archive/v1/<ngày>/` và một bản tải về cho chủ dự án. Không in nội dung ra log.
3. **Bản nháp `AGENTS.md` mới** cho chủ dự án duyệt:
   - Bỏ quy tắc Sites, `/api/learning-run`, lượt 03:00 v1.
   - Ghi phân vai mục 0, quy trình ba môi trường mục 3, chuẩn điện thoại mục 4, và các bất biến còn giữ.

**Xong khi:** có bản sao lưu đã diễn tập khôi phục, có tệp lưu trữ v1, chủ dự án duyệt `AGENTS.md`.

### C · Bỏ đường ChatGPT soạn và chấm

**C1. Mã:**
- `lib/mcp/service.ts`: xoá nhóm soạn và chấm (`toolSchemas`, `toolDescriptions`, `plannerPrincipal`, `callPlannerTool`). Chỉ giữ `hub2_kb_*`.
- `lib/mcp/http.ts`: danh sách công cụ chỉ còn Knowledge. Gọi tên cũ trả "Công cụ này đã ngừng; ChatGPT chỉ cập nhật tài liệu."
- OAuth (`lib/auth/create.ts`, discovery, `lib/mcp/policy.ts`): chỉ công bố `hub:knowledge`.
- Xoá MCP Events: `lib/mcp/events.ts`, `events-register.ts`, `EventDispatcher` và cron `*/5` của worker MCP, lời gọi `deliverEvents` trong `build/worker.ts`.
- `lib/ai-jobs/lease.ts`: chỉ client runner được lease `plan` và `assess`.
- Chuyển `deutsch-unhuman.md`, `deutsch-project-v7.md` vào `integrations/runner-prompts/archive/`. Sửa `docs/hub2/AI-API.md`.

**C2. Runner chỉ dùng Qwen:**
- `engines.mjs` mặc định chỉ Qwen. Codex/Claude nằm sau cờ `FALLBACK_ENGINE` (mặc định tắt).
- Qwen lỗi thì trả job về hàng đợi kèm lý do. Ghi `engine` thật vào `ai_jobs.runner`.

**C3. Dữ liệu (`0026_drop_mcp_planning.sql`):**
- Xoá `mcp_event_subscriptions`, `mcp_event_deliveries`.
- Xoá token có `hub:plan`/`hub:assess`, bỏ hai scope này khỏi `oauthConsent.scopes`.
- Cập nhật `lib/backup-contract.mjs`.

**Chạy local:**
- Kết nối MCP local bằng MCP Inspector tới `http://localhost:5173/mcp` (lưu ý worker MCP chạy qua `wrangler.mcp.jsonc`).
- Thấy chỉ có công cụ Knowledge.
- Runner local vẫn nhận và lưu job.

**Test:**
- `tests/direct-mcp.test.mjs`, `tests/mcp-routing.test.mjs`: chỉ Knowledge; công cụ và scope cũ bị từ chối.
- `tests/runners.test.mjs`: client không phải runner không lease được.
- Xoá `tests/mcp-events.test.mjs`.

**Production:** chủ dự án gỡ các kết nối hoặc tác vụ ChatGPT cũ dùng `hub:plan`/`hub:assess`. Codex liệt kê từ `oauthConsent`, không in token.

### V · Gỡ hệ v1 và gom

**V1. Automation v1 và Sites:**
- Xoá các route và thư viện trong bảng 1.2, cùng `tests/sites-bridge.test.mjs`, `run-journal.test.mjs`, `daily.test.mjs`.
- Chuyển phần còn dùng:
  - `lib/automation/sql.ts` → `lib/subjects/sql.ts`;
  - `lib/automation/privacy.ts` → `lib/privacy.ts`;
  - `lib/daily-policy.ts` → `lib/berlin-day.ts` (giữ `berlinDay`, `cutoffFor`).
- `build/worker-boundary.ts` bỏ các route đã xoá.

**V2. Bài v1** (sau khi S2 xuất lưu trữ và chủ dự án đồng ý xoá):
- Xoá `notebook-view.tsx`, `lesson-page.tsx`, `legacy-route.ts` và phần v1 trong `app/hub/model.ts`.
- **`0027_drop_v1.sql`:**
  - xoá bảng `learning_slots`, `learning_runs`, `runs`, `legacy_run_items`, `automation_runs`, `run_targets`, `run_items`, `run_events`, `learning_workspace`;
  - xoá 4 bài `package_version='1'` cùng dòng phụ;
  - xoá trigger `learning_lessons_v1_subject` và index `learning_lessons_v1_track_day_unique`;
  - kiểm toàn vẹn theo mẫu `0022`.

**V3. Một định dạng lưu, giữ nguyên cách Qwen soạn (`0028_one_package.sql`):**

*Sửa sau audit 13/11:* bản trước bắt mọi sổ soạn theo v3 đầy đủ. Qwen soạn Deutsch theo v3 bị Hub từ chối liên tục (đáp án sai định dạng, thiếu hai dạng câu), làm Codex sửa schema và chạy lại Qwen 48 lần. Gộp **định dạng lưu** là đủ. **Bộ dạng câu Qwen được dùng là cấu hình riêng của từng sổ**, không gắn với phiên bản gói.

- **Dữ liệu:** bài v2 thành v3 bằng `json_set(payload,'$.contract','lesson-package/3','$.knowledge',json('[]'))` và `package_version='3'`. Production có 15 bài v2 (đếm ngày 13/11). Script diễn tập parse lại mọi payload bằng `lessonPackageV3`. Staging đã áp `0028`.
- **Bộ dạng câu theo sổ:** thay `limits.package` bằng `limits.itemKinds`, mặc định theo chuẩn học:

  | Sổ | `itemKinds` mặc định | Ràng buộc thêm |
  |---|---|---|
  | Ngôn ngữ (`de-cefr`, `en-cefr`, `zh-hsk`) | `choice`, `short`, `long`, `cloze` | Không bắt buộc ≥ 2 dạng câu. Không có khối `knowledge` dạng code |
  | Lập trình (`rust-core`, `python-core`) | `choice`, `short`, `cloze`, `order`, `code` | Như sổ Rust thử nghiệm hiện tại |
  | Khoa học, Toán | `choice`, `short`, `long`, `cloze`, `table`, `label` | ≥ 2 dạng câu |
  | Khác | `choice`, `short`, `long` | — |

  Thêm dạng mới cho một loại sổ chỉ sau khi qua cổng Q (dưới đây). Admin chỉnh được `itemKinds` trong Cài đặt sổ.
- **`job.mjs`** dựng schema cho Qwen chỉ từ `itemKinds` của sổ. `validate.ts` chỉ áp ràng buộc của bộ đó.
- **Cổng Q (Qwen soạn đúng)** phải đạt trên local, trước khi áp `0028` và mã V3 lên production:
  1. Lưu các output Qwen đã bị từ chối làm fixture trong `tests/fixtures/qwen/`, sau khi xoá dữ liệu cá nhân. Thêm `npm run qwen:replay` chạy validator và bước sửa tự động trên fixture, **không gọi model**. Sửa schema hoặc validator đến khi fixture cũ được xử lý đúng: lưu được, hoặc bị từ chối với lý do rõ.
  2. Rồi mới gọi Qwen thật: 5 lượt cho mỗi sổ Deutsch, Rust, Toán 7 trên `dev:fresh`. Đạt khi ≥ 5/5 Deutsch, ≥ 4/5 mỗi sổ còn lại được Hub lưu ngay hoặc sau một lần sửa tự động.
  3. Mỗi lần thay đổi chỉ chạy tối đa **2 lượt Qwen** rồi xem kết quả. Chưa đạt thì quay lại bước 1 với output mới làm fixture. Sau 3 vòng vẫn chưa đạt thì dừng, ghi STATUS và báo chủ dự án.
- **Mã:** bỏ nhánh v2 trong `apply/*`, `job.mjs`, prompt. `lesson-package-v2.ts` đổi thành `lesson-items.ts`.

**V4. Hai nút yêu cầu:**
- Người học còn **Bài tiếp theo** (`extra_practice`) và **Hỏi**.
- Xoá đường `school_topic` và `note`, giữ giá trị trong CHECK.
- `explore` giữ đến khi T xong.

**V5. Quản trị gom một chỗ:**
- `GET /api/admin/inbox` gom: tranh chấp `needs_human`, job `failed` 7 ngày, `alert_events` mở, Knowledge `failed`, người dùng chờ duyệt.
- Mỗi dòng có hành động.
- Panel cũ gom vào `app/hub/admin/` với 4 thẻ.

**Chạy local:**
- `npm run dev:fresh` trên `main` cũ, tạo vài bài v2.
- Chuyển sang nhánh V, chạy `db:migrate:local`, thấy bài cũ vẫn mở và làm được.
- Chạy `restore-drill` với bản sao production trong `.wrangler/state-prodcopy`, kiểm số dòng trước và sau.

**Xong khi:**
- không còn route, bảng hay test v1;
- mọi bài là v3;
- ghi số dòng `app` + `lib`, số route, số bảng trước và sau vào PR.

### P · Nền cho điện thoại (mục 4)

- **P1:** font tự lưu, manifest và icon, `theme-color`, thuộc tính ô nhập, `keyboard.ts` (nhắc Telex), thanh ký tự đặc biệt, `visualViewport` cho nút dính, dải Zalo/Messenger.
- **P2:** `localStorage` cho câu trả lời chờ, thông báo mạng, thời hạn và thử lại (`app/hub/api.ts`).
- **P3:**
  - `/api/rum` cùng bảng `perf_daily` (migration `0030_perf.sql`, kèm backup contract);
  - bảng p75 trong Quản trị;
  - một API gom cho bàn học: `/api/today` trả đủ bài tiếp theo, vòng phút và giá sổ, để bỏ các lời gọi riêng.
- **P4:** Playwright e2e mục 4.7 và job CI `e2e`.
- **P5:** cửa sổ Lübeck tiết kiệm (ngừng khi ẩn, chế độ tĩnh cho máy yếu); tách mã trang Quản trị.

**Test:**
- `tests/keyboard.test.mjs`: nhận ra Telex trong câu tiếng Đức (`Hấu`, `đas`), không báo nhầm với `ä ö ü ß é`.
- `tests/rum.test.mjs`: không nhận trường nội dung, gộp đúng p75.
- e2e mục 4.7.

**Xong khi:**
- e2e đạt trên `iphone-13` và `pixel-7` với mạng giả lập;
- JS bàn học ≤ 180 KB gzip;
- Ếch hoàn thành danh sách `PHONE-CHECK.md` trên staging;
- p75 thật từ Việt Nam được ghi một tuần.

### M · Mockup để duyệt (cổng)

**Tình hình 13/11:** Codex đã có bản đầu trong `docs/mockups/` sau 4 vòng góp ý. Góp ý đã chốt:
- giữ cửa sổ, kệ sách, bàn học, giấy nhớ và sổ;
- cửa sổ trên điện thoại hiện đầy đủ, cho cuộn;
- gáy sổ xếp dọc;
- sổ là cuốn mở hai trang, lật có chuyển động và mép cong;
- giấy ngả vàng cả ở chế độ tối.

**Cách duyệt:** chủ dự án mở trang mockup trên điện thoại và máy tính, rồi trả lời một trong hai:
- "Duyệt M1–M4" (có thể kèm "chỉnh X trong U");
- danh sách chỗ cần sửa.

Câu như "tạm được", "gần rồi" **chưa tính là duyệt**. Codex phải hỏi lại đúng câu: "Bạn duyệt M1–M4 chưa, hay cần sửa gì?" Mỗi vòng sửa mockup giới hạn trong một luồng Codex riêng.

**Sản phẩm:**
- Trang HTML tĩnh trong `docs/mockups/`, dùng đúng token, font và **cửa sổ Lübeck thật** (SVG xuất từ `app/hub/lubeck/scene.ts`).
- **Vẽ cho điện thoại 390 px trước**, rồi máy tính 1280 px. Có sáng và tối.
- Công bố thành trang xem riêng tư để chủ dự án mở trên chính điện thoại.

| Mockup | Trạng thái cần vẽ |
|---|---|
| M1 Bàn học | Sáng sớm, chiều, tối. Có 1, 2 và 4 sổ. Bàn trống. Đang soạn bài. Máy chấm tắt. Mất mạng |
| M2 Bài học | Câu chọn, điền, viết. Câu tiếng Đức có thanh `ä ö ü ß` và nhắc Telex. **Câu nghe** (chưa nghe, đang phát, hết lượt, xem lời thoại). Đúng ngay. Sai lần một. Đang chấm. Gia sư mở. Bàn phím đang mở (nút dính). Tổng kết |
| M3 Sổ | Lộ trình đường dọc (đã qua, đang luyện, sắp tới, thiếu nguồn). "Đã làm được". "Bài tới khó hơn vì…". Lịch sử gập. Tấm Cài đặt |
| M4 Quản trị | Hàng Cần xem. Knowledge. Hệ thống với p75 theo quốc gia |

**Cảm giác cần đạt:**
- Bàn gỗ cạnh cửa sổ, ánh sáng theo giờ, giấy kem, ít chữ, nhiều khoảng thở.
- Không có huy hiệu ồn, streak đỏ, pop-up.

**Câu hỏi duyệt:**
1. Trên điện thoại: cửa sổ thu thành dải trên cùng, hay chiếm nửa màn hình đầu?
2. Giá sổ: gáy sổ dọc hay chồng sổ?
3. Câu hỏi trên giấy kẻ hay giấy trơn?
4. Mức trang trí theo mùa.

**Xong khi:** chủ dự án ghi "duyệt" cho từng mockup.

### U · Triển khai giao diện đã duyệt

Bắt đầu ngay khi M được duyệt, không chờ C, V, P lên production (mục 5). Ghi trong STATUS bản mockup nào đã được duyệt (đường dẫn và commit).

- **U1. Bàn học:** `desk.tsx`, `today-board.tsx`, `desk-progress.tsx`, `components/notebook/*` theo M1, dùng `/api/today` gom của P3.
- **U2. Bài học:**
  - `reader.tsx` tách thành `lesson/flow.tsx` (một câu một lần, vuốt hoặc nút "Tiếp", điều hướng bàn phím), `lesson/item.tsx`, `lesson/summary.tsx`.
  - Giữ logic chấm và sửa tại chỗ, D21, `DisputeControl`.
  - `reader.tsx` dưới 200 dòng.
- **U3. Sổ:** gộp `contents`, `progress`, `roadmap-progress`, `learned-lessons`, `history-panel` thành `notebook/path.tsx` và `notebook/history.tsx`. `settings.tsx` thành tấm phủ (trên điện thoại là tấm trượt từ dưới lên).
- **U4. Quản trị** theo M4.

**Chạy local:** `dev:fresh` và `runner:fake`, đi trọn kịch bản trên `dev:phone` bằng iPhone thật cùng Wi-Fi.

**Test:** e2e cập nhật theo màn hình mới. So ảnh chụp với mockup ở 390 px và 1280 px.

**Xong khi:**
- người học đi trọn bàn → bài → tổng kết → bài tiếp theo mà không cần đọc hướng dẫn;
- đạt ngân sách mục 4.2;
- Ếch hoàn thành `PHONE-CHECK.md` trên staging.

### L, G, T, K

Kế hoạch chi tiết nằm trong [`LGTK.md`](LGTK.md) (14/11/2026), thay cho nội dung cũ của bốn mục này. Theo quyết định của chủ dự án ngày 14/11, cả bốn bước chỉ lên staging.

- **L · Luyện nghe:** câu hỏi kèm đoạn hội thoại do Mac đọc bằng giọng hệ thống, lưu R2. Gồm chấm chính tả theo từ, bằng chứng nghe riêng, Hub quyết số câu nghe. Migration `0031`.
- **G · Chấm tin cậy hơn:** chuẩn hoá đáp án, bằng chứng trích nguyên văn, hiệu chuẩn hằng tuần bằng bộ câu chuẩn (`0032`), "Chấm sai?" chuyển người khi bất đồng.
- **T · Gia sư "Hỏi":** Durable Object `TutorRelay`, runner trả lời từng đoạn qua WebSocket, trình duyệt nhận qua SSE. Chỉ gợi ý, 20 lượt mỗi bài (`0033`).
- **K · ChatGPT chỉ cập nhật tài liệu:** lịch chủ nhật 02:00 Europe/Berlin với kết nối `hub:knowledge` trên staging.

## 6. Phát hành từng giai đoạn

| # | Giai đoạn | Local | Staging | Production (cần đồng ý) |
|---|---|---|---|---|
| 1 | E | Kịch bản 3.2 trên clone mới | — | Tag `prod-20261113-1`, chuyển runner, chốt chặn |
| 2 | S | Diễn tập khôi phục | — | Sao lưu, xuất lưu trữ v1 |
| 3 | C | MCP Inspector, runner local | Deploy, kiểm kết nối Knowledge | `0026`, deploy, gỡ kết nối cũ |
| 4 | V | Migration trên bản sao; **cổng Q** (Qwen soạn đúng) | `0027`, `0028`, thử bài cũ | Như staging, sau khi đồng ý xoá v1 |
| 5 | P | e2e điện thoại | Ếch kiểm `PHONE-CHECK.md` | `0030`, deploy, đo p75 một tuần |
| 6 | M | — | — | (chỉ duyệt) |
| 7 | U | `dev:phone` iPhone thật | Ếch và chủ dự án kiểm | Deploy |
| 8 | L | Qwen + giọng thật | `0030`, `0031`; gạt im lặng, Bluetooth, Zalo | Chưa làm: giữ staging (quyết định 14/11) |
| 9 | G, T, K | Như trên | `0032`, `0033`; lịch Knowledge staging | Chưa làm: giữ staging (quyết định 14/11) |

Mỗi lần lên production đi qua `release.mjs production <tag>`. Sau đó: health đúng tag, một lượt học thật trên điện thoại, job `succeeded` và id đã lưu.

## 7. Đo thành công

| Chỉ số | Cách đo | Mục tiêu đầu |
|---|---|---|
| Thời gian đến câu đầu tiên (Việt Nam, điện thoại) | `/api/rum` p75 | < 5 giây lần đầu, < 3 giây khi có cache |
| Kiểm tra câu có đáp án (Việt Nam) | `/api/rum` p75 | < 1,2 giây |
| Bấm nghe đến có tiếng (Việt Nam) | `/api/rum` p75 | < 1 giây |
| Đúng lần đầu, không gợi ý | Theo kỹ năng, band, đọc và nghe tách riêng | Tăng dần theo tuần |
| Nhớ khi ôn | Đúng ở bài ôn đến hạn | ≥ 70% |
| Ngày học mỗi tuần | `study_time` | ≥ 4 |
| Độ khớp chấm | Bộ câu chuẩn | ≥ 90% |
| An toàn phát hành | Số lần deploy production không qua `release.mjs` | 0 |
| Mã gọn | Dòng `app` + `lib`, số route, số bảng | Giảm sau V |

## 8. Rủi ro

- **Xoá nhầm dữ liệu:** sao lưu, diễn tập khôi phục, xuất lưu trữ trước. Migration xoá có kiểm toàn vẹn. Xoá chỉ sau khi chủ dự án đồng ý.
- **Runner local tranh LM Studio với production:** production ưu tiên. Runner local mặc định `--once` và tự dừng khi production đang chạy job.
- **Đường hầm dev lộ dữ liệu:** chỉ chạy với dữ liệu mẫu, script tự chặn bản sao production, tắt khi xong.
- **Mạng quốc tế từ Việt Nam chậm hoặc đứt cáp:** một API gom mỗi màn hình, lưu câu trả lời trên máy, thử lại không trùng, thông báo thật. Đo p75 thật để biết khi nào cần đổi.
- **Giọng hệ thống nghe "máy":** chọn giọng chất lượng cao trên Mac. Nếu chưa đủ, thử TTS mở chạy local (ví dụ Piper) cùng giao diện tải lên theo hash.
- **iPhone hoặc Zalo không phát:** `<audio>`, AAC, `Range`, phát sau thao tác, dải gợi ý mở bằng trình duyệt. Kiểm máy thật trước khi bật.
- **Đổi giao diện làm mất thói quen:** mockup duyệt trước, giữ cửa sổ, giấy và cách sửa tại chỗ.

## 9. Chủ dự án cần quyết khi tới bước

1. **E3:** đã xong ngày 13/11. `~/Code/learning-hub-prod` ở tag `prod-20261113-1` (`0625f56`, đúng bản production lúc đó), runner launchd chạy từ đó.
2. Thư mục dev chính `~/Code/Learning Hub` đang ở nhánh `codex/phase-1-automation-cutover` có thay đổi chưa commit từ tháng 10: giữ nguyên, hay xem lại rồi dọn.
3. **V2:** đồng ý xoá 4 bài v1 và các bảng v1 sau khi nhận tệp lưu trữ.
4. **L, G, T, K:** các quyết định nằm trong [`LGTK.md`](LGTK.md) mục 8, gồm chọn giọng đọc cho mỗi ngôn ngữ.
5. **M:** duyệt mockup M1–M4 bằng câu "Duyệt M1–M4" hoặc danh sách cần sửa (mục M).
6. Thứ tự sau Nghe: chạy code có test (Rust, Python) hay toán từng bước (Toán 7).

## 10. Cách giao việc cho Codex (sau audit 13/11)

**Audit phiên Codex 13/11, 13:41–22:39:**
- 147 triệu token đầu vào, 450 lệnh cho 29 tin nhắn.
- Nguyên nhân:
  1. **Một luồng duy nhất chạy từ 07/10**, nên mỗi lệnh đọc lại khoảng 290 nghìn token (cao nhất 450 nghìn).
  2. **103 lệnh chỉ để chờ Qwen**, kiểm mỗi 1 giây, khoảng 30 triệu token.
  3. **157 lệnh cần quyền cao**, mỗi lệnh qua model duyệt tự động, thêm khoảng 26 triệu token.
  4. **Lệnh "làm tất cả… tự duyệt" không có điểm dừng**, gặp vòng lặp Qwen ở V3: 210 lệnh, khoảng 48 triệu token.
  5. **Làm thẳng trên `main` không commit**, staging chạy code chưa commit.

**Quy tắc từ nay:**
1. **Mỗi bước (hoặc mỗi PR) một luồng Codex mới.** Không tiếp tục luồng cũ. Luồng mới chỉ đọc:
   - `AGENTS.md`;
   - mục của bước đó trong plan này;
   - `docs/plan/HUB-NEXT-STATUS.md` và `docs/plan/status/<bước>.md` nếu có.
   Luồng sắp dài (khoảng 120 lệnh) thì cập nhật tệp của bước rồi để luồng mới làm tiếp.
2. **Mỗi bước ghi tiến độ trong `docs/plan/status/<bước>.md` trên nhánh của bước đó.** Ghi nhánh, PR, phần đã kiểm và việc còn lại. Chỉ cập nhật bảng tổng `docs/plan/HUB-NEXT-STATUS.md` trên `codex/hub-next-wip` khi gộp PR. Ghi commit đang chạy và migration đã áp nếu đã xác minh.
3. **Làm trên nhánh, commit theo từng bước nhỏ, mở PR.**
   - Không sửa trực tiếp trên `main` ở thư mục dev chính.
   - Staging chỉ deploy từ commit đã push, và health hiện đúng commit đó.
4. **Lệnh chạy lâu** (Qwen, build, e2e):
   - chạy nền, ghi log ra tệp;
   - kiểm lại sau ít nhất 60 giây, hoặc chờ một lần đến khi xong;
   - không đọc output mỗi giây.
5. **Giới hạn thử lại:**
   - Qwen tối đa 2 lượt mỗi lần thay đổi; sửa bằng fixture trước (cổng Q ở V3).
   - Một lỗi sửa 3 vòng chưa xong thì dừng và báo, kèm 2–3 hướng xử lý.
6. **Quyền chạy lệnh:** trong cấu hình Codex, cho phép sẵn các lệnh chỉ đọc (`rg`, `sed`, `cat`, `git status/diff/log`) và chạy kiểm tra local (`npm test`, `typecheck`, `lint`, `build`, `e2e`). Chỉ deploy, migration, lệnh ghi lên Cloudflare và lệnh mạng ra ngoài mới cần duyệt.
7. **Điểm dừng bắt buộc (chờ chủ dự án):**
   - duyệt mockup;
   - merge;
   - deploy production;
   - migration production;
   - xoá dữ liệu production;
   - đổi quyền hoặc kết nối ChatGPT.
   Codex hỏi một câu ngắn, có lựa chọn, rồi dừng.

**Mẫu tin nhắn giao một bước:**

```text
Bước <tên> trong docs/plan/HUB-NEXT.md (bản trên nhánh docs/hub-next-plan hoặc main).
Đọc AGENTS.md, mục <tên> của plan và docs/plan/HUB-NEXT-STATUS.md. Không đọc lại lịch sử khác.
Làm trên nhánh codex/<tên-bước>, commit từng phần, mở PR.
Dừng khi: <tiêu chí "Xong khi" của bước>, hoặc cần tôi quyết định, hoặc một lỗi đã thử 3 vòng.
Cuối lượt: cập nhật docs/plan/status/<bước>.md, báo phần đã xong, PR và quyết định đang chờ.
```

