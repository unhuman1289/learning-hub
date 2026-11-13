# Kế hoạch: Learning Hub gọn lại, bàn học thư thái và luyện nghe

Người thực hiện: Codex (mã), Claude (mockup giao diện). Ngày lập: 13/11/2026. Trạng thái: chưa code. Mã đã đọc: `main` tại `38aa632` (đã có Adaptive Roadmap #139–#142 và Knowledge K1–K5).

## 0. Mục tiêu và quyết định đã chốt

**Mục tiêu sản phẩm:** một app tự học.
- Phía trước tối giản, trực quan, thư thái như ngồi vào bàn học.
- Phía sau mạnh: cá nhân hoá theo bằng chứng thật, lộ trình tự nâng cao, kho tài liệu có kiểm chứng.

**Phân vai (cố định):**

| Vai | Việc | Không làm |
|---|---|---|
| **Hub** (mã, có test) | Quyết bài nào, khi nào luyện, khi nào thử bước khó hơn; giữ dữ liệu; chấm câu có đáp án | Soạn nội dung |
| **Qwen** (runner trên Mac) | Soạn bài, chấm câu mở, gia sư "Hỏi", tạo giọng đọc cho bài nghe | Quyết lộ trình ngoài luật Hub |
| **ChatGPT** (lịch định kỳ) | **Chỉ** tìm và cập nhật tài liệu trong Knowledge Base | Soạn bài, chấm bài, đọc câu trả lời của người học |

**Quyết định của chủ dự án (13/11/2026):**
1. **Giao diện:**
   - Giữ cửa sổ Lübeck và cảm giác ngồi vào bàn học thư thái. Được thiết kế lại.
   - Phải có mockup để chủ dự án duyệt **trước** khi code giao diện (cổng M).
2. **Bỏ hẳn đường ChatGPT tự soạn và chấm bài.** Đó là việc của Qwen. ChatGPT chỉ chạy định kỳ cập nhật tài liệu.
3. **Dạng tương tác mới đầu tiên là Nghe.** Code chạy test, toán từng bước, nói và viết chữ Hán để sau.

**Ranh giới (giữ `AGENTS.md`):**
- Không thêm model API hay key trả phí. Giọng đọc tạo trên Mac bằng giọng hệ thống, không dùng dịch vụ TTS ngoài.
- Không thay bài chưa xong, không tự hoàn thành bài.
- Mọi câu trả lời, ghi chú, nội dung web là dữ liệu không đáng tin.
- Không đưa dữ liệu cá nhân hay bệnh nhân vào Knowledge.
- Sao lưu D1 trước mỗi migration. Diễn tập trên bản sao production trước khi áp thật.
- Xoá dữ liệu, deploy, merge và migration production cần chủ dự án đồng ý từng lần.
- Không force-push.

## 1. Hiện trạng (đo ngày 13/11/2026)

**Quy mô dùng thật:** 4 tài khoản, 5 sổ, 20 bài (v1: 4, v2: 14, v3: 2), 106 câu trả lời, 13 yêu cầu (toàn bộ là `extra_practice`), 6 nguồn Knowledge.

**Quy mô mã:** khoảng 23 nghìn dòng (`app` 9,6k, `lib` 9,5k, `scripts` 2,4k, `integrations` 1,2k), 50 API route, 58 bảng D1.

**Những thứ chạy song song hoặc không còn dùng:**

| Phần | Hiện trạng production | Mã chính |
|---|---|---|
| Automation v1 (ChatGPT scheduled cũ) | `automation_runs` 0 dòng, `run_items` 0, `runs` 0 | `app/api/automation/v1/**`, `lib/automation/{state,context,replacement,schema,sensitivity,http}.ts`, `lib/run-journal.ts`, `lib/run-schema.ts` |
| Daily v1, Sites | `learning_slots` 4, `learning_runs` 2, `learning_workspace` 3 | `app/api/daily`, `app/api/learning-run`, `lib/daily-{store,view,sql,types}.ts`, `app/hub/use-daily.ts`, `app/run-status.tsx`, `scripts/prepare-sites-bridge-secrets.py`, `tests/sites-bridge.test.mjs` |
| Bài v1 và sổ legacy | 4 bài v1 (1 đã xong), sổ legacy đang hoạt động: 0 | `app/hub/notebook-view.tsx`, `app/hub/lesson-page.tsx`, `app/hub/legacy-route.ts` |
| ChatGPT soạn/chấm qua MCP | Công cụ `hub2_lease_plan`, `hub2_lease_assess`, `hub2_context`, `hub2_check_result`, `hub2_submit_result`, `hub2_job`, `hub2_fail`, `hub2_schema`; scope `hub:plan`, `hub:assess` | `lib/mcp/service.ts`, `lib/mcp/http.ts`, `lib/mcp/events*.ts`, `build/direct-mcp-worker.ts` (`EventDispatcher`, cron `*/5`), bảng `mcp_event_subscriptions`, `mcp_event_deliveries`, prompt `integrations/runner-prompts/deutsch-unhuman.md`, `deutsch-project-v7.md` |
| Hai gói bài | v2 và v3. v3 chỉ bật tay qua `limits.package=3` | `lib/contracts/lesson-package-v2.ts`, `-v3.ts`, `app/api/subjects/route.ts:41` |
| Bốn loại yêu cầu | Chỉ dùng `extra_practice` | `lib/requests/service.ts`, `app/hub/requests-panel.tsx`, `app/hub/new-lesson-request.tsx` |
| Quản trị rải rác | Tranh chấp, chất lượng, cảnh báo, job, gia đình, Knowledge, sao lưu ở các panel riêng | `app/hub/{admin-disputes,dispute-resolver,quality-table,ai-jobs-panel,family-admin,runner-status}.tsx` |

**Dạng câu hỏi đã giao:**
- Đã dùng: `short` 53, `choice` 45, `cloze` 8, `long` 6, `code` 2.
- Chưa từng dùng: `match`, `order`, `label`, `table`.

**Giao diện người học:**
- Bàn học: lời chào, cửa sổ, lịch tờ, "Trên bàn hôm nay", tủ sách gáy 3D, hai cửa tủ.
- Cuốn sổ mở: mục lục, hôm nay, tiến độ, lộ trình, cài đặt.
- Trang bài v2.
- Trang sổ v1.

Các tệp lớn nhất: `lesson-v2/reader.tsx` 445 dòng, `lubeck/scene.ts` 405, `components/profile-controls.tsx` 363, `lesson-page.tsx` 320.

## 2. Đích đến

### 2.1. Ba màn hình cho người học

1. **Bàn học (Hôm nay)**
   - Cửa sổ Lübeck là trung tâm cảm xúc: thời tiết, giờ trong ngày và mùa theo đúng thiết kế hiện tại.
   - Dưới cửa sổ là mặt bàn với **một tờ "Bài tiếp theo" cho mỗi sổ đang học**, theo thứ tự Hub chọn. Mỗi tờ có tên bài, thời lượng và một dòng lý do. Bấm vào là vào bài.
   - Một vòng phút học hôm nay.
   - Giá sổ gọn ở cạnh bàn: chọn sổ và mở sổ mới.
2. **Bài học**
   - Một câu mỗi lần, chữ to, nhiều khoảng trống.
   - Trả lời → nhận xét ngay dưới câu → "Tiếp".
   - Nút **Hỏi** mở gia sư ngay trong câu.
   - Cuối bài là tờ tổng kết với hai nút **Bài tiếp theo** và **Về bàn**.
3. **Sổ**
   - Lộ trình dạng đường dọc: đã qua, đang ở, sắp tới.
   - "Đã làm được", "Bài tới khó hơn vì…", nguồn đã dùng.
   - Lịch sử bài gập lại theo ngày.
   - Cài đặt mở trong tấm phủ.

**Nguyên tắc:**
- Mỗi màn hình chỉ có một việc chính.
- Chi tiết chỉ hiện khi bấm.
- Hệ thống luôn nói "vì sao".
- Không có chữ kỹ thuật (job, runner, 00:00 Berlin, mã câu).
- Chuyển động chỉ dùng để báo đổi trạng thái.
- Giấy luôn màu kem, kể cả chế độ tối.
- Dùng token màu trong `DESIGN.md` và `app/globals.css`.

**Quản trị** là khu riêng, không nằm trên thanh của người học. Có một hàng **Cần xem** gom: tranh chấp chờ người, job lỗi, cảnh báo, Knowledge kích hoạt trượt. Kèm các trang Gia đình, Knowledge và Sao lưu.

### 2.2. Phía sau

1. **Bản đồ chương trình:** chuẩn học → bước (`roadmap_steps`) → kỹ năng. Đã có từ Adaptive Roadmap, giữ nguyên.
2. **Mô hình người học:** kỹ năng × mức tư duy × **cách tiếp nhận**. Mức tư duy dùng các chiều đã có trong `skill_states`. Cách tiếp nhận là đọc hoặc nghe, phần mới ở giai đoạn L.
3. **Câu hỏi** có ba phần độc lập:
   - **dạng câu** (9 dạng hiện có);
   - **đầu vào** (chữ, hình, **âm thanh**);
   - **cách chấm** (khớp, tương đương, số, chính tả theo từ, rubric + Qwen).
4. **Điều phối:** chỉ còn một đường là job của runner (`/api/automation/v2`). ChatGPT dùng MCP với scope `hub:knowledge`.
5. **Knowledge:** dùng chung theo chủ đề, ChatGPT cập nhật định kỳ. Đã có từ K1–K5 và Adaptive Roadmap R4.

## 3. Giai đoạn và PR

Thứ tự: **S → C → V → M (cổng duyệt) → U → L → G → T**.
- C và V làm song song được, vì không đụng cùng tệp trừ `lib/backup-contract.mjs`. Làm C trước rồi rebase V.
- M (mockup) làm song song với C và V.
- U chỉ bắt đầu sau khi chủ dự án duyệt M.
- L phần backend (L1–L3) làm song song với U. Phần giao diện nghe (L4) đi theo thiết kế đã duyệt.

Mỗi PR chạy `npm run test`, `npm run typecheck`, `npm run lint`, `npm run contracts:check`, `npm run build`. Cập nhật `DESIGN.md` và tài liệu khi đổi hành vi.

### S · Chuẩn bị (một PR tài liệu và script)

1. **Sao lưu đầy đủ D1 production** bằng `/api/admin/backup`, ghi vào R2 backups. Kiểm bằng `scripts/restore-drill.mjs` trên bản sao.
2. **Xuất lưu trữ v1:** `scripts/export-legacy.mjs` ghi JSON và Markdown cho:
   - 4 bài v1;
   - `learning_workspace`, `learning_slots`, `learning_runs`;
   - các tài liệu đã lưu.

   Lưu vào R2 backups (`archive/v1/<ngày>/`) và một bản tải về cho chủ dự án. Không in nội dung ra log.
3. **Bản nháp `AGENTS.md` mới** cho chủ dự án duyệt:
   - Bỏ quy tắc Sites, `/api/learning-run`, lượt 03:00 v1 và "runId v1".
   - Ghi phân vai ở mục 0, đường AI duy nhất, và các bất biến còn giữ: không thay bài dở, không tự hoàn thành, bằng chứng thật, nguồn có URL và phạm vi đọc.
   - Giữ `.openai/hosting.json` như dấu vết nguồn gốc (không xoá).

**Xong khi:** có bản sao lưu đã diễn tập khôi phục, có tệp lưu trữ v1, chủ dự án duyệt `AGENTS.md`.

### C · Bỏ đường ChatGPT soạn và chấm

**C1. Mã:**
- `lib/mcp/service.ts`: xoá `toolSchemas`, `toolDescriptions`, `plannerPrincipal`, `callPlannerTool` của nhóm soạn và chấm. Chỉ giữ công cụ `hub2_kb_*` (`lib/knowledge/tools.ts`).
- `lib/mcp/http.ts`: danh sách công cụ chỉ còn Knowledge. Lời gọi tên cũ trả lỗi rõ là "Công cụ này đã ngừng; ChatGPT chỉ cập nhật tài liệu."
- Cấu hình OAuth (`lib/auth/create.ts`, discovery): chỉ công bố scope `hub:knowledge`. Bỏ `hub:plan`, `hub:assess` khỏi `allowedRegistration` và màn hình đồng ý.
- **MCP Events:**
  - Xoá `lib/mcp/events.ts`, `events-register.ts` và `EventDispatcher` trong `build/direct-mcp-worker.ts`.
  - Xoá cron `*/5` của worker MCP (`wrangler.jsonc`) và lời gọi `deliverEvents` trong `build/worker.ts`.
  - Lượt Knowledge chạy theo lịch nên không cần sự kiện.
- `lib/ai-jobs/lease.ts`: chỉ client runner (`AUTOMATION_CLIENTS` có `local-grading` hoặc `adaptive-plan`) được lease `plan` và `assess`.
- Prompt: chuyển `deutsch-unhuman.md`, `deutsch-project-v7.md` vào `integrations/runner-prompts/archive/`. Gỡ tham chiếu trong `docs/hub2/AI-API.md`.

**C2. Runner chỉ dùng Qwen:**
- `integrations/home-runner/engines.mjs`: mặc định chỉ Qwen. Codex/Claude nằm sau cờ `FALLBACK_ENGINE` (mặc định tắt).
- Nếu Qwen lỗi thì job trả về hàng đợi với lý do, không tự chuyển máy khác.
- Ghi `engine` thật vào `ai_jobs.runner`.
- Sửa `integrations/home-runner/README.md`.

**C3. Dữ liệu (migration `0026_drop_mcp_planning.sql`, sau sao lưu):**
- Xoá `mcp_event_subscriptions`, `mcp_event_deliveries`.
- Thu hồi token có `hub:plan` hoặc `hub:assess`: xoá `oauthAccessToken` và `oauthRefreshToken` có scope đó, và cập nhật `oauthConsent.scopes` bỏ hai scope này.
- Kết nối ChatGPT chỉ có Knowledge vẫn chạy.
- Cập nhật `lib/backup-contract.mjs`.

**Test:**
- `tests/direct-mcp.test.mjs`, `tests/mcp-routing.test.mjs`: chỉ còn công cụ Knowledge, công cụ cũ bị từ chối, scope cũ không đăng ký được.
- `tests/runners.test.mjs`: client không phải runner không lease được.
- Xoá `tests/mcp-events.test.mjs`.

**Production:** chủ dự án gỡ các kết nối hoặc tác vụ ChatGPT cũ còn dùng `hub:plan`/`hub:assess` (Codex liệt kê từ `oauthConsent`, không in token).

### V · Gỡ hệ v1 và gom phần chạy song song

**V1. Automation v1 và Sites:**
- Xoá:
  - `app/api/automation/v1/**`, `app/api/learning-run`, `app/api/daily`;
  - `lib/automation/{state,context,replacement,schema,sensitivity,http}.ts`, `lib/run-journal.ts`, `lib/run-schema.ts`;
  - `lib/daily-{store,view,sql,types}.ts`, `app/hub/use-daily.ts`, `app/run-status.tsx`;
  - `scripts/prepare-sites-bridge-secrets.py`, `tests/sites-bridge.test.mjs`, `tests/run-journal.test.mjs`, `tests/daily.test.mjs`.
- `lib/automation/sql.ts` chỉ còn phần `lib/subjects/*` dùng. Chuyển vào `lib/subjects/sql.ts`.
- `lib/automation/privacy.ts` đang được dùng rộng, nên đổi tên thành `lib/privacy.ts` (giữ nội dung).
- `lib/daily-policy.ts` giữ các hàm giờ Berlin (`berlinDay`, `cutoffFor`) và đổi tên thành `lib/berlin-day.ts`.
- `build/worker-boundary.ts`: bỏ các route đã xoá.

**V2. Bài v1 và sổ legacy (chỉ sau khi S2 xuất lưu trữ và chủ dự án đồng ý xoá):**
- Xoá `app/hub/notebook-view.tsx`, `lesson-page.tsx`, `legacy-route.ts` và phần v1 trong `app/hub/model.ts`.
- **Migration `0027_drop_v1.sql`:**
  - Xoá bảng `learning_slots`, `learning_runs`, `runs`, `legacy_run_items`, `automation_runs`, `run_targets`, `run_items`, `run_events`, `learning_workspace`.
  - Xoá 4 dòng `learning_lessons` có `package_version='1'` và các dòng phụ.
  - Xoá trigger `learning_lessons_v1_subject` và index `learning_lessons_v1_track_day_unique`.
- `subjects.legacy_track` giữ cột (đổi bảng tốn), nhưng mã không đọc nữa.
- Kiểm toàn vẫn theo mẫu `_v3_integrity_guard` của `0022`.

**V3. Một gói bài:**
- Bài v2 hợp lệ với v3 khi thêm `knowledge: []`.
- **Migration `0028_one_package.sql`:** cập nhật 14 bài v2 thành `json_set(payload,'$.contract','lesson-package/3','$.knowledge',json('[]'))` và `package_version='3'`. Có kiểm: số bài, mọi payload qua `lessonPackageV3` trong script diễn tập.
- Mã:
  - Bỏ `limits.package`. Mọi sổ dùng v3.
  - Xoá nhánh v2 trong `apply/plan.ts`, `apply/explorations.ts`, `job.mjs`, `plan-request.md`.
  - `lesson-package-v2.ts` chỉ còn định nghĩa phần tử dùng chung (đổi tên thành `lesson-items.ts`).
- **Test:** `tests/lesson-package-v2.test.mjs` gộp vào `tests/lesson-v3.test.mjs`. Thêm test migration.

**V4. Hai nút yêu cầu:**
- Người học chỉ còn **Bài tiếp theo** (`extra_practice`) và **Hỏi** (gia sư, giai đoạn T).
- Xoá đường `school_topic` và `note` trong `lib/requests/service.ts` và giao diện. Giữ giá trị trong CHECK của DB.
- `explore` ("Hỏi thêm" chờ soạn) giữ đến khi T xong, rồi thay bằng gia sư trực tiếp.

**V5. Quản trị gom một chỗ:**
- `GET /api/admin/inbox` trả hàng **Cần xem**:
  - tranh chấp `needs_human`;
  - job `failed` 7 ngày;
  - `alert_events` mở;
  - phiên bản Knowledge `failed`;
  - người dùng chờ duyệt.
- Mỗi dòng có hành động có sẵn: giải quyết, chạy lại, bỏ qua.
- Gom `admin-disputes`, `dispute-resolver`, `quality-table`, `ai-jobs-panel`, `runner-status` vào `app/hub/admin/` với 4 thẻ: Cần xem, Gia đình, Knowledge, Hệ thống (runner, sao lưu, chất lượng chấm).

**Xong khi:**
- Không còn route, bảng hay test v1.
- Mọi bài là v3.
- Số dòng `app` + `lib` giảm. Ghi số đo trước và sau vào PR.
- Bản sao production qua `restore-drill`.

### M · Mockup để duyệt (cổng, Claude làm)

**Sản phẩm:** trang HTML tĩnh trong `docs/mockups/`, dùng đúng token màu, font và **cửa sổ Lübeck thật** (nhúng SVG xuất từ `app/hub/lubeck/scene.ts`). Có khổ điện thoại 390 px và máy tính 1280 px, sáng và tối. Công bố thành một trang xem riêng tư cho chủ dự án.

| Mockup | Trạng thái cần vẽ |
|---|---|
| M1 Bàn học | Sáng sớm, chiều, tối. Có 1, 2 và 4 sổ. Bàn trống ("Chọn một sổ để bắt đầu"). Đang soạn bài. Máy chấm đang tắt |
| M2 Bài học | Câu chọn, câu điền, câu viết. **Câu nghe** (chưa nghe, đang phát, đã trả lời, xem lời thoại). Đúng ngay. Sai lần một (chỉ chỗ sai, sửa tại chỗ). Đang chấm câu mở. Gia sư "Hỏi" mở. Tổng kết cuối bài |
| M3 Sổ | Lộ trình đường dọc (đã qua, đang luyện, sắp tới, thiếu nguồn). "Đã làm được". "Bài tới khó hơn vì…". Lịch sử gập. Tấm Cài đặt (chuẩn học, yêu cầu riêng, bỏ qua và học lại bước) |
| M4 Quản trị | Hàng Cần xem có 3 loại dòng. Thẻ Knowledge |

**Cảm giác cần đạt:**
- Như ngồi vào bàn gỗ cạnh cửa sổ: ánh sáng theo giờ, giấy kem, ít chữ, nhiều khoảng thở.
- Không có huy hiệu ồn, đếm streak đỏ, hay pop-up.

**Câu hỏi duyệt** (chủ dự án trả lời trên mockup):
1. Bố cục bàn: cửa sổ trên, bàn dưới? Hay cửa sổ bên trái, bàn bên phải?
2. Giá sổ: gáy sổ dọc như hiện tại, hay chồng sổ trên bàn?
3. Câu hỏi hiện trên tờ giấy kẻ hay trên giấy trơn?
4. Mức trang trí theo mùa trên bàn.

**Xong khi:** chủ dự án ghi "duyệt" cho từng mockup. Chỉnh sửa lặp lại trên cùng trang xem.

### U · Triển khai giao diện đã duyệt

**U1. Bàn học:**
- `app/hub/desk.tsx`, `today-board.tsx`, `desk-progress.tsx`, `components/notebook/{house,spine-shelf,paper}.tsx` theo M1.
- API `GET /api/today` trả **một danh sách bài tiếp theo** đã sắp xếp: bài dở trước, rồi bài mới đã soạn, rồi sổ có thể xin bài. Mỗi dòng có `reasonCode` (từ `lib/roadmap/reasons.ts`).
- Bỏ các khối không có trong mockup.

**U2. Bài học:**
- `app/hub/lesson-v2/reader.tsx` tách thành `lesson/flow.tsx` (một câu một lần, điều hướng bàn phím), `lesson/item.tsx`, `lesson/summary.tsx`.
- Giữ `item-card.tsx` logic chấm và sửa tại chỗ, D21 ẩn lời giải và `DisputeControl`.
- Mục tiêu: `reader.tsx` dưới 200 dòng.

**U3. Sổ:**
- `app/hub/notebook/*` theo M3.
- Gộp `contents.tsx`, `progress.tsx`, `roadmap-progress.tsx`, `learned-lessons.tsx`, `history-panel.tsx` thành `notebook/path.tsx` (đường lộ trình) và `notebook/history.tsx` (gập).
- `settings.tsx` thành tấm phủ.

**U4. Quản trị** theo M4, dùng `/api/admin/inbox` của V5.

**Kiểm:**
- Trình duyệt ở 390 px và 1280 px, sáng và tối, bàn phím, `prefers-reduced-motion`.
- Không có chữ kỹ thuật trên luồng học. So với ảnh mockup.

**Xong khi:**
- Người học đi trọn: mở app → bài tiếp theo → làm → tổng kết → bài tiếp theo, không cần đọc hướng dẫn.
- Câu đầu tiên hiện trong dưới 10 giây kể từ khi mở app (đo trên production).

### L · Luyện nghe

**L1. Hợp đồng bài (`lib/contracts/lesson-package-v3.ts`):**
- Thêm trường tuỳ chọn `audio` cho **mọi dạng câu**:
  ```ts
  audio: {
    lang: 'de-DE' | 'zh-CN' | 'en-US' | 'vi-VN',
    lines: { speaker: 'a' | 'b', text: string }[],        // 1–12 lượt, tổng ≤ 600 ký tự; 2 người khi là hội thoại
    rate: 0.8 | 0.9 | 1.0,                                // theo band: band 1 → 0.8, band 2–3 → 0.9, band ≥ 4 → 1.0
    maxPlays: 1 | 2 | 3,                                   // mặc định 3 khi luyện, 2 ở bài thử
    transcript: 'after_answer' | 'never',                 // mặc định after_answer
  }
  ```
  Kèm `audioRef` do Hub điền sau khi có tệp (L2). Qwen không tự đặt.
- **Dạng nghe** dùng lại dạng câu có sẵn:

  | Bài nghe | Dạng câu | Chấm |
  |---|---|---|
  | Nghe và chọn ý đúng | `choice` | tự động |
  | Nghe và điền từ còn thiếu | `cloze` | tự động |
  | Nghe và chép lại (chính tả) | `short` với khoá mới `dictation` | tự động theo từ |
  | Nghe và sắp xếp ý theo thứ tự nghe | `order` | tự động |
  | Nghe rồi trả lời hoặc tóm tắt | `long` | Qwen + rubric |

- **Khoá `dictation`:** `{type:'dictation', text, ignore:['case','punctuation'], variants?: string[][]}`. Chấm trong `lib/lesson-v2/answer.ts`:
  - So từng từ sau chuẩn hoá: chữ hoa và thường, dấu câu, khoảng trắng.
  - Tiếng Đức chấp nhận `ss` cho `ß` nếu có trong `variants`. Không tự chấp nhận `ae` cho `ä`.
  - Điểm = 1 − tỉ lệ lỗi từ (WER).
  - `correct` khi WER = 0, `partial` khi ≤ 0,25, còn lại `incorrect`.
  - Nhận xét tự động chỉ ra từ thiếu, thừa hoặc sai bằng đánh dấu trên lời thoại (chỉ hiện sau khi trả lời).
  - Tiếng Trung: chấp nhận chữ Hán hoặc pinyin có dấu, hoặc pinyin số (`ni3 hao3`). Chuẩn hoá pinyin số sang dấu trước khi so.
- **`validate.ts`:**
  - `audio.lines` theo độ dài và giới hạn câu theo band: band 1 ≤ 8 từ/câu và ≤ 15 giây ước tính; band 3 ≤ 15 từ/câu.
  - Câu `dictation` ≤ 2 câu.
  - Mỗi bài có câu nghe phải có ít nhất một câu nghe chấm tự động.

**L2. Tạo giọng đọc trên Mac, lưu ở R2:**
- **Runner** (`integrations/home-runner/tts.mjs`, mới):
  - Với mỗi câu có `audio` trong kết quả soạn, tạo tệp bằng giọng hệ thống macOS: `say -v <giọng> -r <tốc độ> -o x.aiff "<câu>"` cho từng lượt thoại.
  - Ghép bằng `afconvert` (hoặc `sox` nếu có) với 0,4 giây nghỉ giữa các lượt, rồi `afconvert -f m4af -d aac -b 64000`.
  - Đã thử ngày 13/11: 6 giây tiếng Đức ra 54 KB.
- **Giọng:** cấu hình `TTS_VOICES` trong env runner.
  - Ví dụ `de-DE:a=Anna,b=Flo (German (Germany));zh-CN:a=Tingting,b=Eddy (Chinese (China mainland))`.
  - Runner kiểm bằng `say -v '?'` khi khởi động và báo `tts` trong `capabilities` chỉ khi đủ giọng cho ngôn ngữ đó.
  - Ghi trong README cách tải giọng chất lượng cao (Cài đặt hệ thống → Trợ năng → Nội dung được đọc).
- **Mã băm:** `audioHash = sha256(lang|voices|rate|lines)`.
- **Tải lên trước khi nộp kết quả**, trong cùng lease:
  - `PUT /api/automation/v2/jobs/{jobId}/audio/{audioHash}` với lease token, `Content-Type: audio/mp4`, tối đa 1 MB, đúng `audioHash` khai báo.
  - Hub lưu ở R2 `UPLOADS` khoá `audio/<hash>.m4a`.
  - Ghi bảng `audio_assets` (migration `0029_audio.sql`): `hash PK, lang, rate, voices, duration_ms, bytes, r2_key, created_job_id, created_at`.
  - Tải lại cùng hash thì bỏ qua (dùng lại).
- **Khi lưu bài** (`apply/plan.ts`, `apply/explorations.ts`):
  - Mỗi câu có `audio` phải có `audio_assets` khớp hash. Hub điền `audioRef`.
  - Thiếu tệp → câu đó bị loại, và bài bị từ chối nếu còn dưới số câu tối thiểu.
  - Hub chỉ giao câu nghe khi runner đang lease có `tts`.
- **Phát cho người học:** `GET /api/audio/<hash>`.
  - Chỉ trả khi người xem có quyền đọc một bài chứa câu tham chiếu hash đó (truy vấn `lesson_items` theo `learner_id`).
  - `Cache-Control: private, max-age=31536000, immutable`, hỗ trợ `Range` cho Safari.
- **Sao lưu:** `audio_assets` vào `lib/backup-contract.mjs`. Tệp R2 tạo lại được từ lời thoại, nên không cần sao lưu riêng.

**L3. Bằng chứng và mô hình người học:**
- `lesson_items.stimulus TEXT NOT NULL DEFAULT 'text' CHECK(stimulus IN ('text','audio'))` (ADD COLUMN trong `0029`). `attempts` đọc qua `lesson_items`.
- **Mức hỗ trợ khi nghe** dùng lại thang `support`:
  - nghe chậm (0,75×) hoặc nghe quá `maxPlays` → `hint1`;
  - xem lời thoại trước khi trả lời → `hint2`;
  - xem lời giải → `solution`.

  Mở rộng `POST /api/lessons/[id]/items/[itemId]/reveal` với `level: 'slow' | 'transcript'`. Lưu số lần phát trong `learning_lessons.support`.
- **`lib/learner-model/rules.ts` và `recompute.ts`:**
  - Tính thêm `skill_states.listening` (JSON `{attempts, independentDays, lastAt, level: 'none'|'emerging'|'secure'}`) từ các câu `stimulus='audio'`. Thêm cột trong `0029`.
  - `secure` = làm độc lập đúng ở 2 ngày.
  - Mastery tổng không đổi công thức. Nghe là một chiều xem riêng.
- **`lib/roadmap/progress.ts`:** với sổ ngôn ngữ (`framework.key` ∈ `de-cefr`, `en-cefr`, `zh-hsk`), bước chỉ `passed (mastery)` khi kỹ năng của bước có `listening.level='secure'` hoặc bước được đánh dấu "không cần nghe" (`roadmap_steps.listening=0`, ADD COLUMN).

**L4. Hub quyết tỉ lệ câu nghe, Qwen soạn:**
- `decideNext` thêm `listening: {min, max}` số câu nghe mỗi bài cho sổ ngôn ngữ:
  - intro: 1–2;
  - practice: 2–3, tăng lên 3–4 nếu kỹ năng đích có `listening.level='none'` sau 3 bài;
  - review: 1–2;
  - challenge: ≥ 2;
  - sổ không phải ngôn ngữ: 0.
- Context (`lib/ai-jobs/context/plan.ts`) gửi `adaptive.listening` và `tts.voices` (chỉ nhãn a/b). `integrations/home-runner/job.mjs` ràng buộc schema theo số câu nghe.
- **Prompt `plan-request.md`**, mục mới "Câu nghe":
  - Lời thoại tự nhiên, đúng mức CEFR/HSK của bước.
  - Câu ngắn ở band thấp. Hội thoại có tình huống thật (đổi lịch họp, hỏi đường).
  - Đề bài viết bằng tiếng Việt, **không lặp lại lời thoại** trong đề.
  - Câu chọn không được đoán ra được mà không nghe.
  - Lời thoại không chứa tên thật hay dữ liệu người học.
- **Chấm câu `long` nghe:** `lib/ai-jobs/context/assess.ts` gửi kèm lời thoại cho Qwen. `assess-local.md` thêm cách chấm hiểu ý chính.

**L5. Giao diện nghe (theo mockup M2 đã duyệt):**
- `app/hub/lesson-v2/audio.tsx`:
  - nút phát lớn, sóng âm tĩnh, đếm lượt nghe còn lại, nút "Chậm hơn" (báo nhẹ là có tính là gợi ý);
  - sau khi trả lời mới có "Xem lời thoại".
- Phát bằng `<audio preload="none">`, chỉ khi người học bấm (iOS cần thao tác).
- Phím tắt: Space để phát hoặc dừng, R để nghe lại.
- **Trợ năng:** trong Cài đặt hồ sơ có "Thay âm thanh bằng chữ" cho người không nghe được. Câu nghe hiện lời thoại, ghi `stimulus` thực tế là `text` và không tính vào chiều nghe.
- Tờ tổng kết và trang Sổ thêm dòng "Nghe: đang luyện / vững" theo kỹ năng.

**L6. Thử nghiệm:**
- Deutsch trước (sổ của chủ dự án), 1 tuần. Rồi Tiếng Trung.
- Theo dõi:
  - tỉ lệ đúng lần đầu câu nghe so với câu đọc cùng kỹ năng;
  - số lần dùng "Chậm hơn" và "Xem lời thoại";
  - thời gian tạo giọng mỗi bài (mục tiêu dưới 20 giây);
  - lỗi phát trên iPhone.

**Test L:**
- `tests/lesson-v3.test.mjs`: hợp đồng audio, giới hạn theo band.
- `tests/listening.test.mjs`: chấm `dictation` tiếng Đức (ß/ss, dấu câu), tiếng Trung (chữ Hán, pinyin dấu, pinyin số), WER và partial.
- `tests/home-runner.test.mjs`: TTS giả lập, tải lên đúng hash, thiếu giọng thì không báo `tts`.
- `tests/uploads.test.mjs`: `/api/audio` kiểm quyền, `Range`, tải trùng.
- `tests/learner-model-rules.test.mjs`: `listening` và mức hỗ trợ.
- `tests/roadmap-progress.test.mjs`: bước ngôn ngữ cần nghe vững.

### G · Chấm tin cậy hơn (Qwen chấm, Hub kiểm)

1. **Đáp án tương đương:**
   - Prompt yêu cầu `accepted` đủ biến thể cho câu ngắn (2–6).
   - `answer.ts` chuẩn hoá dấu, khoảng trắng, dấu câu cuối, và số thập phân dấu phẩy/chấm.
   - Câu `order` cho phép `sequences` (nhiều thứ tự đúng, tối đa 4).
2. **Rubric có bằng chứng:**
   - `assess-result` bắt buộc mỗi lỗi kèm `quote` (đoạn ≤ 80 ký tự trong câu trả lời) và tiêu chí rubric bị trừ.
   - Hub từ chối kết quả có `quote` không nằm trong câu trả lời. Đây là chống bịa lỗi.
3. **Bộ câu chuẩn:**
   - 32 câu eval đã có (`docs/plan/LOCAL-GRADER.md`) cộng thêm câu nghe.
   - Runner chạy hằng tuần (`--calibrate`), ghi tỉ lệ khớp vào `alert_events` loại `grading_calibration`.
   - Dưới 90% thì Quản trị → Cần xem có dòng cảnh báo.
4. **Chấm lại khi người học bấm "Chấm sai?"** vẫn do Qwen, với lời nhắc đọc kỹ tranh chấp. Không đồng thuận thì chuyển người (`needs_human`).

### T · Gia sư "Hỏi" trả lời ngay

1. **Kênh:**
   - Runner mở một WebSocket **ra ngoài** tới Durable Object `TutorRelay` (SQLite backend, có trong gói Free; kiểm hạn mức trước khi làm).
   - Trình duyệt gửi câu hỏi qua `POST /api/tutor`. Worker chuyển tới DO, DO chuyển cho runner. Qwen trả lời từng đoạn, DO đẩy lại trình duyệt bằng SSE.
   - Mac không mở cổng nào.
2. **Phạm vi:**
   - Gia sư chỉ thấy câu hiện tại, câu trả lời nháp, phần kiến thức của bài và ghi chú Knowledge của bước.
   - Gia sư gợi mở và không đưa đáp án. Hỏi thẳng đáp án thì gia sư nói sẽ hiện như "xem lời giải" (`solution`).
   - Mỗi lượt hỏi ghi vào `learning_lessons.support` như `hint1`, để bằng chứng không bị thổi phồng.
3. **Khi runner tắt:** nút Hỏi hiện "Gia sư đang nghỉ, câu hỏi sẽ được trả lời khi máy bật". Câu hỏi lưu như `explore` cũ.
4. **Giới hạn:** 20 lượt mỗi bài, 2000 ký tự mỗi câu hỏi. Lọc dữ liệu cá nhân bằng `lib/privacy.ts` trước khi gửi.
5. **Test:**
   - `tests/tutor.test.mjs`: quyền, giới hạn, mức hỗ trợ, khi runner tắt.
   - Kiểm thật thời gian chữ đầu tiên dưới 3 giây trên mạng nhà.

### K · ChatGPT chỉ cập nhật tài liệu (khớp Adaptive Roadmap R4)

- Không thêm việc mới cho ChatGPT. Chỉ đảm bảo:
  - cổng K0 đã chạy và có kết quả ghi trong `docs/ops/KNOWLEDGE-MAINTAINER.md`;
  - lịch **chủ nhật 02:00 Europe/Berlin** dùng `integrations/runner-prompts/knowledge-maintainer.md`;
  - kết nối ChatGPT chỉ có `hub:knowledge` (sau C).
- Prompt Knowledge thêm: với chủ đề ngôn ngữ, ưu tiên nguồn mẫu hội thoại và từ vựng theo cấp (Goethe, HSK chính thức), để Qwen có tư liệu soạn câu nghe đúng cấp.

## 4. Triển khai production (mỗi dòng cần chủ dự án đồng ý)

| # | Việc | Ghi chú |
|---|---|---|
| 1 | S: sao lưu, diễn tập khôi phục, xuất lưu trữ v1 | Tệp lưu trữ giao cho chủ dự án |
| 2 | C: deploy, áp `0026`, gỡ kết nối ChatGPT cũ | Kiểm kết nối Knowledge vẫn chạy |
| 3 | V: deploy theo V1 → V5, áp `0027`, `0028` | Diễn tập trên bản sao, so số dòng |
| 4 | M: duyệt mockup | Không deploy |
| 5 | Runner: cập nhật `main`, bật `TTS_VOICES`, chạy `--once` | Trên Mac của chủ dự án |
| 6 | L1–L3: áp `0029`, deploy; thử một bài nghe Deutsch | Kiểm trên iPhone và máy tính |
| 7 | U + L5: deploy giao diện | Lặp lại kịch bản đầy đủ |
| 8 | G, T | Theo thứ tự |

Sau mỗi lần deploy: `curl https://learn.unhuman.cc/api/health`, rồi đi trọn một lượt học thật (bàn → bài → tổng kết → bài tiếp theo), kiểm job `succeeded` và mã bài hoặc điểm đã lưu.

## 5. Đo thành công

| Chỉ số | Cách đo | Mục tiêu đầu |
|---|---|---|
| Thời gian đến câu đầu tiên | Từ lúc tải trang bàn đến lúc hiện câu 1 (log phía trình duyệt, không có nội dung) | < 10 giây |
| Đúng lần đầu, không gợi ý | Theo kỹ năng và band, đọc và nghe tách riêng | Tăng dần theo tuần |
| Nhớ khi ôn | Đúng ở bài ôn đến hạn | ≥ 70% |
| Ngày học mỗi tuần | `study_time` | ≥ 4 |
| Độ khớp chấm | Bộ câu chuẩn | ≥ 90% |
| Mã gọn | Số dòng `app` + `lib`, số route, số bảng | Giảm sau V |

## 6. Rủi ro

- **Xoá nhầm dữ liệu:** sao lưu, diễn tập khôi phục và xuất lưu trữ trước. Mỗi migration xoá có kiểm toàn vẹn. Chỉ xoá sau khi chủ dự án đồng ý.
- **Giọng hệ thống nghe "máy":** cho chọn giọng chất lượng cao trên Mac. Nếu chưa đủ, thử TTS mở chạy local (ví dụ Piper) ở bước sau, cùng giao diện tải lên theo hash.
- **iPhone không phát:** dùng AAC/m4a, `Range`, phát sau thao tác. Thử Safari trên iOS trước khi bật cho cả nhà.
- **Mac tắt thì không có bài nghe mới:** bài vẫn soạn được khi có runner. Hub không giao câu nghe nếu runner thiếu `tts`, và vẫn giao câu đọc.
- **Đổi giao diện làm mất thói quen:** mockup duyệt trước, giữ cửa sổ, giấy và cách sửa tại chỗ đã quen.

## 7. Chủ dự án cần quyết khi tới bước

1. Đồng ý xoá 4 bài v1 và các bảng v1 sau khi nhận tệp lưu trữ (bước V2).
2. Giọng đọc cho mỗi ngôn ngữ (nghe thử các giọng trên Mac ở bước 5).
3. Duyệt mockup M1–M4.
4. Thứ tự sau Nghe: chạy code có test (Rust, Python) hay toán từng bước (Toán 7).
