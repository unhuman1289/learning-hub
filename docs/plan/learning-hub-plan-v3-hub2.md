# Learning Hub — Plan v3: Learning Hub 2.0

Cập nhật 12/10/2026. Trạng thái: **chờ duyệt, chưa code.**

- **Thiết kế:** [docs/hub2/](../hub2/README.md): quyết định D1–D17, [hướng xây dựng bài học](../hub2/LESSON-DESIGN.md), [mô hình dữ liệu](../hub2/DATA-MODEL.md), [API AI](../hub2/AI-API.md).
- **Quan hệ với plan v2:** plan v2 ([learning-hub-plan-v2-cloudflare.md](learning-hub-plan-v2-cloudflare.md)) vẫn là nguồn cho Phase 0–1. Plan này **thay Phase 2** của v2, và thay các task P1.6, P1.9, P1.12 (xem §13).

## 0. Tóm tắt

- Mỗi người có kệ, sổ, tiến độ riêng; chỉ admin xem được của mọi người, phụ huynh xem được của con.
- Bài v2 có từng câu, gợi ý, lời giải. Câu đóng chấm bằng code; câu mở do AI chấm theo rubric, có ảnh bài giải. Có phản đối điểm và chấm lại.
- Learner model gồm bằng chứng, trạng thái kỹ năng 4 chiều, mẫu lỗi, lịch ôn; luật ở server, AI chỉ đề xuất.
- Hai loại job AI:
  - **plan:** tác vụ ChatGPT chạy đêm, gọi thẳng API.
  - **assess:** Worker `learning-hub-assessor` giữ key Anthropic, model `claude-opus-5-5`.

  Hub không chứa key model.
- Học theo bốn cấp: tập trung → xen kẽ → kết nối → tổng hợp. Hai cấp đầu có ngay trong từng sổ (H2–H7). Hai cấp sau dựa trên mạng kiến thức của từng người, làm ở H9.
- Pilot: Ếch × Deutsch, 3 tuần. Sau đó mở Toán 7, Hóa 7 (chương trình GDPT 2018 lớp 7), rồi các sổ của người lớn, rồi kết nối giữa các sổ.

## 1. Điểm xuất phát (12/10/2026)

| Mảng | Hiện trạng |
| --- | --- |
| Production | `learn.unhuman.cc`, Worker `learning-hub-prod`, D1 `learning-hub-prod`. Đã cutover khỏi Sites. |
| Git | Phase 1 (learner scope, automation v1, Access, Sites bridge, migration `0004_learner_scope`–`0006_study_time`) đang chạy trên production nhưng **chưa commit**; đang nằm ở nhánh `codex/phase-1-automation-cutover` trong checkout chính. |
| Soạn bài | Không có lịch soạn bài nào. Automation v1 bật trên staging, tắt trên production. |
| Dữ liệu học | 5 mảng cố định. Mỗi bài có một ô `response` text. Ghi chú, nhật ký, dự án dùng chung cả nhà. |
| Lỗi đã biết | B1 (regex điện thoại khớp ngày, ISBN), B2 (heuristic lâm sàng trên toàn JSON). Danh sách B1–B6 ở [ARCHITECTURE §11](../ARCHITECTURE.md#11-rủi-ro-và-nợ-kỹ-thuật). |

## 2. Roadmap

```text
H0 Đồng bộ           H1 Sổ theo người        H2 Bài v2              H3 Nộp & chấm tự động
H0.1 commit Phase 1  H1.1 0007_subjects      H2.1 lesson-package/2  H3.1 0011_evidence
H0.2 sửa B1          H1.2 lớp quyền          H2.2 0009_lessons_v2   H3.2 autograde
H0.3 sửa B2          H1.3 workspace riêng    H2.3 API bài           H3.3 nộp bài
H0.4 AGENTS.md       H1.4 API sổ             H2.4 ảnh + R2          H3.4 lời phê, sửa lại
                     H1.5 tủ sách theo người H2.5 trang bài skill   H3.5 Ếch dùng thử ─Cổng A─►
                     H1.6 admin: phụ huynh   H2.6 trang bài reading
                     H1.7 lọc theo sensitivity H2.7 nhập bài soạn tay
                     H1.8 tài khoản Ếch

H4 Learner model     H5 API job v2           H6 Chấm sai, khám phá  H7 Runner thật, pilot   H8 Mở rộng
H4.1 0012            H5.1 0013_ai_jobs       H6.1 API phản đối      H7.1 thử ChatGPT        H8.1 Toán 7
H4.2 luật            H5.2 hợp đồng           H6.2 UI phản đối       H7.2 thử Queue CF       H8.2 Hóa 7
H4.3 tính lại        H5.3 lease              H6.3 yêu cầu           H7.3 Worker chấm bài    H8.3 Deutsch NL
H4.4 cron đêm        H5.4 context            H6.4 bài khám phá      H7.4 prompt + eval      H8.4 sổ reading
H4.5 trang đầu sổ    H5.5 áp kết quả         H6.5 Sổ liên lạc       H7.5 cấu hình prod      H8.5 Bột
                     H5.6 tạo job, ngân sách     ─Cổng B─►          H7.6 staging 3 đêm      H8.6 dọn dẹp
                     H5.7 runner giả, e2e                           H7.7 pilot 3 tuần ─Cổng C─►
                     H5.8 trang Lượt AI
                     H5.9 đo CPU

H9 Kết nối và chuyển giao
H9.1 0014_concepts  H9.2 luật chuyển giao  H9.3 hợp đồng /2  H9.4 áp kết nối  H9.5 Sổ kết nối
H9.6 prompt + eval  H9.7 thử: người lớn (Bayes) ─Cổng D─► H9.8 Ếch (Toán ↔ Hóa)
```

Ước lượng thô (một người cùng agent, tính cả review): H0 2–3 ngày; H1–H3 2–3 tuần; H4–H6 2–3 tuần; H7 1 tuần, sau đó 3 tuần pilot; H8 khoảng 2–4 ngày mỗi môn; H9 khoảng 2 tuần, sau đó 2 tuần thử.

## 3. Cổng

- **Cổng A** (sau H3):
  - Ếch làm được ít nhất 3 bài v2 soạn tay trên điện thoại và máy tính.
  - Câu đóng chấm ngay; sửa lại được ghi là lần 2; gợi ý và lời giải được ghi lại.
  - Người học khác không thấy kệ hay tiến độ của nhau.
  - Mọi test xanh.
- **Cổng B** (sau H6):
  - Cả vòng chạy trên staging với runner giả: nộp → chấm → lời phê → trạng thái kỹ năng → plan đêm → bài và bộ ôn mới; phản đối → chấm lại → lật điểm; câu hỏi khám phá → bài.
  - Mọi bất biến ở [DATA-MODEL §4](../hub2/DATA-MODEL.md#4-bất-biến) có test.
  - Số đo CPU được ghi lại.
- **Cổng C** (sau pilot): đạt các ngưỡng ở §11, hoặc có quyết định ghi lại về điều phải đổi trước khi mở rộng.
- **Cổng D** (sau H9.7):
  - Người lớn làm ít nhất 4 bài kết nối và 1 bài tổng hợp.
  - Không liên kết nào bị bác vì sai chuyên môn.
  - Lời phê tách được lỗi kỹ năng với lỗi kết nối, phụ huynh hoặc người học đồng ý ≥90%.
  - Bài kết nối được đánh giá có ích (3 câu hỏi cảm nhận).

## 4. Quy ước

- **PR và nhánh:** mỗi task là một PR, trừ khi ghi gộp. Nhánh `hub2/<task-id>-<tên-ngắn>`. Commit có thể review được.
- **Trước khi mở PR:** chạy `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`. Test SQLite hiện có (cổng hoàn thành, mảng độc lập, thử lại, giữ câu trả lời, DST Berlin) phải giữ nguyên.
- **Migration:**
  - Chỉ thêm, theo số tăng dần (§7).
  - Migration dựng lại bảng phải chạy thử trên bản sao dữ liệu thật ở local trước, và có bản sao lưu R2 mới trước khi áp lên production.
- **Deploy:** staging trước; production chỉ sau khi tiêu chí "Chấp nhận khi" đạt trên staging. Bằng chứng ghi vào `docs/VALIDATION.md`.
- **Cờ:**
  - `HUB2_ENABLED` (biến môi trường): bật route và giao diện v2.
  - `subjects.ai_enabled`: bật AI cho từng sổ.
  - Ngân sách AI theo người.
- **Giao diện:** theo DESIGN.md (Sổ Học). Tiếng Việt, thuật ngữ EN/DE. Không lộ thuật ngữ backend hay model với người học. Chỉ hiện "Đã lưu" hay "Đã chấm" sau khi server xác nhận.
- **Dữ liệu riêng tư:** không commit `.env*`, token, `private-data/`, bài làm hay ảnh thật. Fixture chỉ dùng nội dung soạn mới.

## 5. Chi tiết task

### H0 — Đồng bộ và mở khoá

#### H0.1 Commit Phase 1 và đồng bộ migration
- **Mục tiêu:** `main` deploy ra đúng production hiện tại.
- **Thay đổi:**
  - Phiên Phase 1 commit nhánh `codex/phase-1-automation-cutover`.
  - Giữ `0004_learner_scope`, `0005_automation`, `0006_study_time`; bỏ `0004_study_time`.
  - `_journal.json` khớp bảng `d1_migrations` trên staging và production.
  - Merge vào `main`.
- **Test:** CI hiện có; liệt kê migration remote không còn mục chờ.
- **Chấp nhận khi:** deploy production từ `main`; `/api/health` báo đúng commit; không mất dữ liệu (đếm dòng các bảng trước và sau).
- **Phụ thuộc:** không. **Cỡ:** M. **Rủi ro:** tên migration lệch với `d1_migrations` → sửa journal, không chạy lại SQL.

#### H0.2 Sửa B1: regex điện thoại
- **Thay đổi:** `lib/automation/privacy.ts`. Chỉ coi là số điện thoại khi có dạng quốc tế (`+49 …`) hoặc có mã vùng (`(0451) …`), có ít nhất 9 chữ số, không phải ngày ISO, dải năm, ISBN hay DOI.
- **Test:**
  - Không bị bắt: `2026-10-09`, `2019-2024`, `978-3-16-148410-0`, `10.1038/s41586-020-2649-2`.
  - Bị bắt: `+49 451 1234567`, `0451/1234567`.
  - Context không còn thay ngày bằng `[phone redacted]`.
- **Chấp nhận khi:** test xanh; bài mẫu có `publishedAt` dạng ngày được nhận trên staging.
- **Phụ thuộc:** H0.1. **Cỡ:** S.

#### H0.3 Sửa B2: heuristic lâm sàng
- **Thay đổi:** `privacy.ts` và `state.ts`.
  - Chỉ xét các trường văn bản bài học, không xét toàn bộ JSON.
  - Chặn khi có dấu hiệu định danh: họ tên đi với ngày sinh, số hồ sơ hay mã bệnh viện, ngày sinh cụ thể, địa chỉ.
  - Không chặn chỉ vì "patient/case" đứng cùng "cancer/tumor".
- **Test:**
  - Nhận: "Ca giả lập: nữ 58 tuổi, NSCLC, EGFR L858R".
  - Chặn: "Max Mustermann, geb. 12.03.1961, Fall-Nr. 448812".
- **Chấp nhận khi:** bài MTB và Cardio mẫu hợp lệ được nhận; bài có định danh bị chặn với mã `privacy`.
- **Phụ thuộc:** H0.1. **Cỡ:** S.

#### H0.4 AGENTS.md và chỉ dẫn plan
- **Thay đổi:**
  - Áp các sửa đổi AGENTS.md đã duyệt (§14).
  - Plan v2 §5 Phase 2: ghi "được thay bằng plan v3".
  - README: thêm liên kết.
- **Chấp nhận khi:** bạn duyệt nội dung. **Phụ thuộc:** duyệt thiết kế. **Cỡ:** S.

### H1 — Sổ theo người, riêng tư

#### H1.1 Migration `0007_subjects`
- **Mục tiêu:** sổ động theo người thay cho 5 mảng cố định ([DATA-MODEL §2.1](../hub2/DATA-MODEL.md#21-người-học-và-môn)).
- **Migration:**
  - Thêm cột cho `learner_settings`: `role`, `display_name`, `explain_language`, `preferences`, `ai_budget`.
  - Tạo `guardians`, `subjects`, `skills`, `learner_requests`.
  - Backfill: với mỗi `(user_id, track)` có trong `learning_lessons`, tạo `subjects` có `legacy_track`, khuôn và `sensitivity` theo bảng ở [DATA-MODEL §6](../hub2/DATA-MODEL.md#6-chuyển-dữ-liệu-cũ). Gắn `ai_enabled = 0`.
- **Thay đổi:** `db/schema.ts`; `lib/subjects/sql.ts`.
- **Test:** chạy migration trên bản sao dữ liệu thật (local, riêng tư): số sổ bằng số cặp (người, mảng); bài và câu trả lời không đổi. Kiểm tra CHECK và UNIQUE.
- **Chấp nhận khi:** staging sau migration verify đủ; `npm run db:verify` xanh.
- **Phụ thuộc:** H0.1. **Cỡ:** M.

#### H1.2 Lớp quyền `lib/access.ts`
- **Mục tiêu:** một hàm `canAccessLearner(viewer, learnerId, action)` cho mọi route, theo [DATA-MODEL §5](../hub2/DATA-MODEL.md#5-quyền-truy-cập).
- **Thay đổi:**
  - `lib/access.ts`, gồm các action: `read_progress`, `read_work`, `edit_goals`, `edit_settings`, `resolve_dispute`, `edit_workspace`.
  - Áp vào `/api/daily`, `/api/study`, `/api/workspace`, `/api/export` và mọi route mới.
  - Tham số `?learner=` chỉ cho phụ huynh và admin.
- **Test:** bảng đủ các ô (người học, người học khác, phụ huynh, admin, chưa duyệt). Người học khác nhận 404, không phải 403, để không lộ việc tồn tại.
- **Chấp nhận khi:** test xanh; route cũ giữ hành vi với chính chủ.
- **Phụ thuộc:** H1.1. **Cỡ:** M.

#### H1.3 Workspace theo người (`0008_workspace_per_user`)
- **Mục tiêu:** ghi chú, nhật ký, mốc dự án, dấu "đã học" bài nền thuộc từng người (D15). Đây là P2.8 của plan v2.
- **Migration:** dòng `learning_workspace` có `owner = '__shared_family_workspace__'` đổi `owner` thành id của admin đầu tiên (giống `0004_learner_scope`). Người khác bắt đầu trống.
- **Thay đổi:** `lib/workspace-*`, `/api/workspace` đọc và ghi theo `viewer.id`. Phụ huynh và admin xem chỉ đọc.
- **Test:** A không đọc hay ghi được workspace của B; revision và optimistic concurrency giữ nguyên; bản sao lưu và restore có workspace theo người.
- **Chấp nhận khi:** staging verify; giao diện Ghi chú chỉ hiện của người đăng nhập.
- **Phụ thuộc:** H1.2. **Cỡ:** M.

#### H1.4 API sổ và cài đặt
- **Thay đổi:**
  - `app/api/subjects/route.ts` (GET, POST), `app/api/subjects/[id]/route.ts` (GET, PATCH).
  - `app/api/learners/[id]/settings/route.ts`.
  - `lib/subjects/policy.ts`: kiểm `limits`; trẻ em không sửa được; trạng thái `setup` → `active` chỉ khi đã có lộ trình hoặc người lớn bật tay.
- **Test:** quyền; kiểm tra đầu vào; `PATCH` có `revision` (409 khi lệch).
- **Chấp nhận khi:** test xanh. **Phụ thuộc:** H1.2. **Cỡ:** M.

#### H1.5 Tủ sách và bàn học theo người
- **Thay đổi:**
  - `app/hub/model.ts`: bỏ phụ thuộc `learningTracks`, dùng `subjects`.
  - `app/hub/desk.tsx`, `components/notebook/house.tsx`:
    - chỉ kệ của mình;
    - phụ huynh có thêm kệ con (nhãn tên con);
    - admin có ô chọn người học;
    - hộp thoại **Mở sổ mới** (tên, khuôn, mục tiêu, trình độ, chương trình).
  - `app/api/study/route.ts` và `use-study-clock.ts`: khoá sổ là `subject_id` (sổ cũ vẫn dùng tên mảng).
- **Test:**
  - Thành phần: chọn người học, mở sổ mới.
  - E2E local: người học thường không thấy ô chọn và không gọi được dữ liệu người khác.
- **Chấp nhận khi:** trên staging, 3 tài khoản thử (admin, người lớn, trẻ em có phụ huynh) thấy đúng phạm vi.
- **Phụ thuộc:** H1.3, H1.4. **Cỡ:** L.

#### H1.6 Admin: trẻ em và phụ huynh
- **Thay đổi:**
  - Trang Quản trị: đặt `role = child`, `display_name`, gắn hoặc gỡ phụ huynh.
  - `app/api/admin/guardians/route.ts`.
  - Ghi nhật ký admin: ai gắn ai, lúc nào.
- **Test:** chỉ admin; không tự gắn chính mình; xoá liên kết thì mất quyền ngay.
- **Chấp nhận khi:** test xanh. **Phụ thuộc:** H1.2. **Cỡ:** S.

#### H1.7 Bộ lọc riêng tư theo `sensitivity`
- **Thay đổi:** `lib/automation/privacy.ts`, `state.ts`: chọn bộ lọc theo `subjects.sensitivity` (`clinical`, `child_dev`) thay vì so tên `MTB`/`Cardio`.
- **Test:** sổ mới tên tuỳ ý nhưng `clinical` vẫn bị lọc; sổ `normal` không bị.
- **Phụ thuộc:** H0.3, H1.1. **Cỡ:** S.

#### H1.8 Tài khoản và sổ của Ếch
- **Việc:**
  - Ếch đăng ký bằng email riêng. Admin duyệt, đặt `role = child`, `display_name = "Ếch"`, gắn phụ huynh.
  - Tạo ba sổ, `curriculum = "Chương trình GDPT 2018 (Việt Nam), lớp 7"`:
    - **Toán 7** (`skill`);
    - **Hóa 7** (`skill`; phần Hóa của Khoa học tự nhiên 7);
    - **Deutsch** (`skill`; ghi trình độ hiện tại).
  - Đặt mục tiêu phút.
- **Chấp nhận khi:** làm trên staging với tài khoản thử, rồi trên production. Ếch chỉ thấy kệ của mình.
- **Phụ thuộc:** H1.5, H1.6. **Cỡ:** S (thao tác tay).

### H2 — Bài v2 và trang bài

#### H2.1 Hợp đồng `lesson-package/2`
- **Mục tiêu:** một nguồn duy nhất cho schema, dùng chung cho Hub, Worker chấm bài và runner giả.
- **Thay đổi:**
  - `lib/contracts/lesson-package-v2.ts`: zod theo [AI-API §6.1](../hub2/AI-API.md#61-lesson-package2).
  - `lib/lesson-v2/validate.ts`: luật ngoài schema (giai đoạn theo khuôn, số câu, `key` hoặc `rubric`, loại `key`, độ khó, dung lượng). `prompt_hash` và `stuckOn` cần DB nên làm ở H5.5.
  - Script `npm run contracts:schema` xuất JSON Schema ra `contracts/*.schema.json` (commit vào repo).
- **Test:** `fixtures/contracts/lesson-v2/{valid,invalid}/*.json`, mỗi luật có ít nhất một fixture sai.
- **Chấp nhận khi:** test xanh; JSON Schema xuất ra khớp tài liệu.
- **Phụ thuộc:** H0.1. **Cỡ:** M.

#### H2.2 Migration `0009_lessons_v2` và lưu bài
- **Migration:**
  - Dựng lại `learning_lessons`: bỏ `UNIQUE(user_id, track, assigned_date)`; `track` nhận null; thêm `subject_id`, `package_version`, `template`, `kind`, `slot`, `reason`, `reason_refs`, `est_minutes`, `draft`, `draft_revision`, `support`, `snoozed_until`, `origin_job_id`.
  - Chỉ mục duy nhất một phần theo `(user_id, subject_id, assigned_date, slot)` khi `slot` là `primary` hoặc `review`.
  - Tạo `lesson_items`.
  - Backfill bài cũ: `package_version = '1'`, `kind = 'legacy'`, `slot = 'primary'`, `subject_id` theo sổ cũ.
- **Thay đổi:** `lib/lesson-v2/store.ts` (ghi bài cùng câu trong một batch; đọc có cắt `key`/`hints`/`solution`/`explanation`); `lib/daily-*` dùng `subject_id`.
- **Test:**
  - Migration trên bản sao thật: mọi bài v1 giữ id, payload, câu trả lời, `completed_at`.
  - Các test daily hiện có vẫn xanh.
  - DB chặn bài `primary` thứ hai trong cùng ngày.
- **Chấp nhận khi:** đã sao lưu trước; staging verify từng ô; giao diện bài v1 không đổi.
- **Phụ thuộc:** H1.1, H2.1. **Cỡ:** L. **Rủi ro:** dựng lại bảng lỗi giữa chừng → một file migration (D1 áp theo giao dịch), có bản sao lưu.

#### H2.3 API bài
- **Thay đổi:**
  - `app/api/lessons/[id]/route.ts` (GET).
  - `.../draft/route.ts` (PUT, có `revision`).
  - `.../items/[itemId]/reveal/route.ts` (POST: ghi `support` trước rồi mới trả nội dung).
  - `.../snooze/route.ts`.
- **Test:**
  - GET không lộ phần bí mật.
  - `reveal` lần 2 không hạ mức hỗ trợ.
  - Nháp: 409 khi lệch revision.
  - Quyền (phụ huynh đọc, không sửa nháp của con).
- **Phụ thuộc:** H2.2. **Cỡ:** M.

#### H2.4 Ảnh bài làm
- **Thay đổi:**
  - Bucket R2 `learning-hub-uploads-<env>`, binding `UPLOADS`, lifecycle xoá sau 30 ngày.
  - Migration `0010_attachments`.
  - `app/api/uploads/route.ts` (POST: kiểm magic bytes, ≤3 MB, ≤2400 px) và `[id]/route.ts` (GET theo quyền).
  - `app/hub/lesson-v2/photo.ts`: chọn hoặc chụp ảnh, thu nhỏ bằng canvas, mã hoá lại JPEG (xoá EXIF).
- **Test:**
  - File giả mạo đuôi bị từ chối.
  - Vượt kích thước bị từ chối.
  - Người khác không đọc được ảnh.
  - Ảnh sau khi mã hoá lại không còn EXIF (kiểm bằng fixture có GPS).
- **Phụ thuộc:** H2.2. **Cỡ:** M.

#### H2.5 Trang bài khuôn `skill`
- **Thay đổi:** `app/hub/lesson-v2/`:
  - `cover.tsx`, `stage.tsx`, `sheet.tsx`;
  - `item-card.tsx` với ba kiểu nhập: `choice`, `short`, `long`;
  - `hints.tsx` (Gợi ý 1, Gợi ý 2, Xem lời giải có xác nhận);
  - mỗi câu một màn trên điện thoại.

  `lesson-page.tsx` chọn giao diện v1 hoặc v2 theo `package_version`. Nháp tự lưu (debounce, chỉ hiện "Đã lưu" khi server xác nhận).
- **Test:**
  - Bàn phím đi hết các câu; focus nhìn thấy được; nhãn cho trình đọc màn hình.
  - Ảnh chụp màn hình ở 375 px và 1280 px.
  - Mất mạng thì hiện "Chưa lưu", nháp giữ trong bộ nhớ.
- **Phụ thuộc:** H2.3. **Cỡ:** L.

#### H2.6 Trang bài khuôn `reading`
- **Thay đổi:** các phần đọc kèm nguồn (URL, phần đã đọc, ngày); câu phân tích (`long`); ô đầu ra.
- **Phụ thuộc:** H2.5. **Cỡ:** M.

#### H2.7 Nhập bài soạn tay
- **Thay đổi:**
  - `app/api/admin/lessons/import/route.ts` (chỉ admin; kiểm tra bằng H2.1; gán người học và sổ; vẫn giữ bất biến giao bài).
  - Ô dán JSON trên trang Quản trị.
  - `fixtures/lessons/`:
    - Deutsch: Modalverb, W-Fragen, nicht/kein;
    - Toán 7: tỉ lệ thức, theo GDPT 2018;
    - Hóa 7: nguyên tử;
    - một bộ ôn.

  Nội dung soạn theo AGENTS.md; phụ huynh duyệt trước khi giao.
- **Test:** nhập fixture hợp lệ thành công; fixture sai trả lỗi có `path`.
- **Phụ thuộc:** H2.2. **Cỡ:** M.

### H3 — Nộp bài, chấm tự động

#### H3.1 Migration `0011_evidence`
- **Migration:** `submissions`, `attempts`, `grades`, `disputes` ([DATA-MODEL §2.3](../hub2/DATA-MODEL.md#23-bằng-chứng)); chỉ mục `(learner_id, subject_id, day)`, `(lesson_id, item_id)`; `UNIQUE(learner_id, client_submission_id)`.
- **Phụ thuộc:** H2.2. **Cỡ:** S.

#### H3.2 Chấm tự động
- **Thay đổi:** `lib/evidence/autograde.ts`:
  - `choice`: khớp đúng tập.
  - `numeric`: `0,75`, `0.75`, `3/4`, đơn vị tuỳ chọn, `tolerance`.
  - `text`: bỏ khoảng trắng thừa và dấu câu cuối, `caseSensitive`, không đổi Umlaut.
- **Test:** bảng ít nhất 40 trường hợp, gồm số âm, phân số chưa rút gọn, `7,50 €`, `kochen`/`Kochen`, `ä`/`ae`.
- **Phụ thuộc:** H2.1. **Cỡ:** S.

#### H3.3 Nộp bài
- **Thay đổi:**
  - `lib/evidence/submit.ts`: một batch gồm submission, attempts (lấy `support` từ server, `attempt_no`, `day` Berlin), grade `auto` cho câu đóng. Câu mở để `pending`.
  - `lib/evidence/strength.ts` (E0–E3).
  - `app/api/lessons/[id]/submissions/route.ts`, `app/api/submissions/[id]/route.ts`.
  - Bộ lọc riêng tư cho câu trả lời ở sổ `clinical`.
- **Test:**
  - Nộp lại cùng `clientSubmissionId`: cùng kết quả, không trùng.
  - Sửa lại: `attempt_no = 2`, `retry_of` đúng.
  - Không nộp được câu thuộc bài người khác.
  - Câu đã xem lời giải được ghi `support = solution`.
- **Phụ thuộc:** H3.1, H3.2. **Cỡ:** M.

#### H3.4 Lời phê, sửa lại, hoàn thành
- **Thay đổi:**
  - `app/hub/lesson-v2/feedback.tsx`: bút đỏ ✓ / ½ / ✗, lời giải, giải thích.
  - Nút **Sửa lại**.
  - Câu mở hiện "Đang chờ chấm".
  - Đánh dấu hoàn thành độc lập với điểm, giữ luật mốc 03:00 và bỏ dấu.
- **Test:** giao diện ở hai cỡ màn hình; test SQLite cho hoàn thành và bỏ dấu với bài v2.
- **Phụ thuộc:** H3.3. **Cỡ:** M.

#### H3.5 Ếch dùng thử (Cổng A)
- **Việc:** bật `HUB2_ENABLED`; nhập 3–5 bài soạn tay cho Ếch; Ếch làm trong một tuần. Ghi nhận khó khăn (gõ trên điện thoại, độ dài, gợi ý). Sửa các lỗi giao diện lớn trước H4.
- **Chấp nhận khi:** đạt Cổng A (§3). **Cỡ:** S, cộng một tuần dùng thử song song với H4.

### H4 — Learner model

#### H4.1 Migration `0012_learner_model`
- **Migration:** `skill_states`, `error_patterns` ([DATA-MODEL §2.4](../hub2/DATA-MODEL.md#24-learner-model)). **Cỡ:** S. **Phụ thuộc:** H3.1.

#### H4.2 Luật thuần hàm
- **Thay đổi:** `lib/learner-model/rules.ts`: độ mạnh bằng chứng, 4 chiều, mức trần, `needs_review`, bậc ôn, vòng đời lỗi, `stuckOn`, điều kiện `slip` ([DATA-MODEL §3](../hub2/DATA-MODEL.md#3-luật-thuần-hàm-có-test)).
- **Test:** bảng kịch bản, tối thiểu:
  - 40 câu `recognize` đúng nhưng `create` sai → `recognition = 3`, `application = 1`, `developing`, `stuckOn = recognize`.
  - E3 trên 2 ngày → `demonstrated`; E0 sau đó → `needs_review`, bậc ôn về 1.
  - E1 → lùi bậc; mỗi ngày tăng tối đa một bậc.
  - Bậc 60 ngày đạt E3 → `maintained`.
  - `slip` không có E3 cùng lần nộp → `unknown`.
  - Lỗi gặp trên 2 ngày → `confirmed`; 2 ngày E3 sau đó → `resolved`; gặp lại → mở lại.
  - Câu bị phản đối hoặc huỷ không được tính.
- **Phụ thuộc:** không (thuần hàm). **Cỡ:** M.

#### H4.3 Tính lại và áp đề xuất
- **Thay đổi:**
  - `lib/learner-model/recompute.ts`: đọc bằng chứng của một kỹ năng, gọi luật, ghi có `revision`.
  - `lib/learner-model/proposals.ts`: cắt theo mức trần, kẹp lịch ôn, ghi `clipped`.
  - Gọi sau mỗi grade, phản đối, `item_void`.
- **Test:** SQLite: chuỗi nộp → trạng thái đúng; hai lần tính đồng thời không ghi đè nhau.
- **Phụ thuộc:** H4.1, H4.2, H3.3. **Cỡ:** M.

#### H4.4 Cron đêm
- **Thay đổi:** handler cron hiện có (`0 1,2 * * *`, chạy khi đúng 03:00 Berlin): đánh dấu quá hạn ôn, tính lại `needs_review`, đánh dấu ảnh hết hạn (`deleted_at`).
- **Test:** DST Berlin (giữ test hiện có); chạy lại hai lần trong một đêm không đổi kết quả.
- **Phụ thuộc:** H4.3, H2.4. **Cỡ:** S.

#### H4.5 Trang đầu sổ và "Cần ôn"
- **Thay đổi:**
  - `app/hub/notebook-view.tsx`: lộ trình và kỹ năng (chip, 4 chấm, ngày ôn), lỗi hay gặp (mẫu `suspected` ghi "nghi ngờ"), nhận xét.
  - `app/hub/desk.tsx`: post-it **Cần ôn**.
  - `app/api/skills/[id]/route.ts` (PATCH cho người lớn và phụ huynh).
- **Test:** giao diện với dữ liệu thử; quyền PATCH.
- **Phụ thuộc:** H4.3. **Cỡ:** M.

### H5 — API job v2 và runner giả

#### H5.1 Migration `0013_ai_jobs` và quyền client
- **Migration:** `ai_jobs` ([DATA-MODEL §2.6](../hub2/DATA-MODEL.md#26-job-ai)).
- **Thay đổi:** `lib/auth/automation.ts`:
  - scope `jobs:plan`, `jobs:assess`, `attachments:read`;
  - trường `purposes`, `triggers` cho mỗi client ([AI-API §2](../hub2/AI-API.md#2-xác-thực)).
- **Test:** scope sai → 403; client cũ v1 vẫn chạy cho đến H8.6.
- **Phụ thuộc:** H0.1. **Cỡ:** S.

#### H5.2 Hợp đồng plan và assess
- **Thay đổi:** `lib/contracts/`: `plan-context-v1.ts`, `plan-result-v1.ts`, `assess-context-v1.ts`, `assess-result-v1.ts` ([AI-API §6](../hub2/AI-API.md#6-hợp-đồng)); `contracts:schema` xuất thêm.
- **Test:** fixture hợp lệ và không hợp lệ cho từng hợp đồng.
- **Phụ thuộc:** H2.1. **Cỡ:** M.

#### H5.3 Endpoint lease
- **Thay đổi:**
  - `lib/ai-jobs/lease.ts`: `UPDATE … RETURNING` nguyên tử; độ ưu tiên hiệu lực (`on_demand` chờ quá 15 phút thành `deferred`); token; heartbeat; hết hạn; `lease_count`.
  - `app/api/automation/v2/`: `schema`, `jobs/lease`, `jobs/[id]`, `jobs/[id]/heartbeat`, `jobs/[id]/fail`, `jobs/[id]/attachments/[imgId]`.
- **Test:**
  - Hai lease đồng thời chỉ một thành công.
  - Lease hết hạn thì job quay lại hàng đợi; lần thứ 3 thì `failed`.
  - Bộ lọc `purposes`/`triggers` giao với danh sách được phép của client.
  - Ảnh chỉ đọc được bằng đúng lease token.
- **Phụ thuộc:** H5.1. **Cỡ:** M.

#### H5.4 Dựng context
- **Thay đổi:**
  - `lib/ai-jobs/context/plan.ts`: 14 ngày gần nhất, trạng thái kỹ năng, mẫu lỗi, yêu cầu, slot, chỉ số chấm.
  - `lib/ai-jobs/context/assess.ts`: attempts, kỹ năng liên quan, bằng chứng 14 ngày, calibration, recheck, ảnh hết hạn.
  - Trần 128 KB và 96 KB, cắt theo thứ tự cố định, `truncated`, `contextHash`.
  - Chụp vào `context_snapshot` lúc lease.
- **Test:** context không có email hay user id; vượt trần thì cắt đúng thứ tự; hash ổn định (sắp khoá JSON).
- **Phụ thuộc:** H5.2, H4.3. **Cỡ:** M.

#### H5.5 Áp kết quả
- **Thay đổi:**
  - `lib/ai-jobs/apply/plan.ts`: schema → tham chiếu → luật: `slot_taken`, `not_eligible`, `over_budget`, `difficulty_limit`, `duplicate_item` theo `prompt_hash` 90 ngày, `repetition` theo `stuckOn`, `skill_graph`, `privacy`. Áp từng sổ; `stale` không chặn sổ khác.
  - `lib/ai-jobs/apply/assess.ts`: đủ grade cho câu mở; câu chấm tự động bị khoá; `evidence` phải là chuỗi con có thật trong câu trả lời; tối đa 2 `checkItem`; mẫu lỗi; đề xuất qua H4.3.
  - `dryRun`; `result_hash`; phát lại; 409; 422 giữ lease; 3 lần 422 thì `failed`.
  - `app/api/automation/v2/jobs/[id]/context`, `.../result`.
- **Test:** mỗi mã lỗi 422 có ít nhất một test; phát lại đúng thì cùng `outcome`; kết quả khác thì 409; mọi bất biến ở [DATA-MODEL §4](../hub2/DATA-MODEL.md#4-bất-biến).
- **Phụ thuộc:** H5.3, H5.4. **Cỡ:** L.

#### H5.6 Tạo job, ngân sách, báo việc
- **Thay đổi:** `lib/ai-jobs/queue.ts`.
  - **Nguồn tạo job:**
    - nộp bài: luật bỏ qua khi mọi câu đóng và có không quá một câu sai;
    - cron 03:00: plan `daily` cho mỗi người có sổ `active` và `ai_enabled`;
    - mở sổ: plan `initial`;
    - yêu cầu "ngay": plan `request`;
    - phản đối: assess `recheck` (dùng ở H6).
  - **Chống trùng:** `dedupe_key`.
  - **Ngân sách:** theo [AI-API §7](../hub2/AI-API.md#7-ngân-sách-và-ưu-tiên); `AI_JOBS_DAILY_CAP`.
  - **Báo việc:** producer `AI_QUEUE`; webhook HMAC tuỳ chọn.
- **Test:** vượt ngân sách thì job thành `deferred`; trùng thì không tạo thêm; webhook ký đúng; Queue nhận đúng `jobId`.
- **Phụ thuộc:** H5.5. **Cỡ:** M.

#### H5.7 Runner giả và e2e
- **Thay đổi:**
  - `scripts/fake-runner.mjs`: lease → context → kết quả hợp lệ, có thể dự đoán (chấm theo từ khoá trong `solution`; bài lấy từ fixture, đổi id) → `dryRun` → gửi → xác minh.
  - `scripts/e2e-hub2.mjs`: chạy đủ vòng trên staging với tài khoản thử.
- **Chấp nhận khi:** e2e xanh trên staging, có nhật ký trong VALIDATION.md.
- **Phụ thuộc:** H5.6. **Cỡ:** M.

#### H5.8 Trang "Lượt AI"
- **Thay đổi:**
  - `app/admin/ai-jobs/*`: danh sách job (lọc trạng thái, người học, kind), xem context đã chụp, `outcome`, usage, chi phí ước tính theo `AI_PRICE_TABLE`, huỷ, tạo plan thủ công.
  - API `app/api/admin/ai-jobs/**`.
  - Thay phần đọc lượt v1 (B5).
- **Phụ thuộc:** H5.6. **Cỡ:** M.

#### H5.9 Đo CPU
- **Việc:** trên staging (Worker Free), đo CPU khi kiểm gói bài 96 KB, dựng context 128 KB, áp kết quả plan có 3 sổ. Ghi vào VALIDATION.md.
- **Chấp nhận khi:** dưới giới hạn với biên an toàn, hoặc có đề xuất cụ thể kèm số đo (theo AGENTS.md). **Cỡ:** S.

### H6 — Chấm sai, khám phá, Sổ liên lạc

#### H6.1 API phản đối
- **Thay đổi:**
  - `app/api/attempts/[id]/disputes/route.ts`, `app/api/disputes/route.ts`, `.../[id]/resolve`, `.../[id]/escalate`.
  - `apply/assess.ts`, nhánh `recheck`: `upheld`, `overturned`, `item_void`; gắn `key_issue` khi lật điểm chấm tự động.
  - Câu có ảnh đã hết hạn vẫn chấm lại được phần chữ; context ghi rõ ảnh `expired`.
- **Test:**
  - Phản đối: attempt ra khỏi luật ngay.
  - Lật điểm: tính lại kỹ năng.
  - Chấm lại tối đa một lần; lần sau `needs_human`.
  - Hết ngân sách: `needs_human`.
  - Phụ huynh đặt điểm: grade `guardian`.
  - Người khác không phản đối được.
- **Phụ thuộc:** H5.6, H4.3. **Cỡ:** M.

#### H6.2 Giao diện phản đối
- **Thay đổi:** `app/hub/lesson-v2/dispute-dialog.tsx`:
  - nút **Chấm sai?**;
  - lý do, lời nhắn, ô yêu cầu chấm lại;
  - trạng thái "Đang chấm lại", kết quả, nút **Nhờ phụ huynh xem**.
- **Test:** bàn phím và focus trong hộp thoại; thông báo đúng sự thật ở từng trạng thái.
- **Phụ thuộc:** H6.1. **Cỡ:** S.

#### H6.3 Yêu cầu cho planner
- **Thay đổi:**
  - `app/api/requests/route.ts`.
  - Ở lề cuốn sổ: **Hỏi thêm** (khám phá, chọn đêm nay hoặc ngay) và **Xin thêm bài**.
  - Trong Sổ liên lạc: **Tuần này ở trường** và **Dặn planner**.
  - Hết hạn 14 ngày với `school_topic` và `note`.
- **Test:** quyền (trẻ em gửi được câu hỏi khám phá, không gửi được `note`); ngân sách loại "ngay".
- **Phụ thuộc:** H5.6. **Cỡ:** S.

#### H6.4 Bài khám phá
- **Thay đổi:** `apply/plan.ts`, nhánh `explorations`: gán vào sổ đã có, hoặc tự tạo sổ "Khám phá" (khuôn `reading`, `ai_enabled = 1`); post-it **Khám phá**.
- **Test:** ngân sách bài `extra`; yêu cầu bị từ chối có lý do hiển thị cho người hỏi.
- **Phụ thuộc:** H6.3. **Cỡ:** S.

#### H6.5 Sổ liên lạc và chỉ số chấm
- **Thay đổi:**
  - `app/hub/guardian/*`: cài đặt (phút, môn, giới hạn, ngân sách), yêu cầu, phản đối cần xử lý, nhận xét từng sổ.
  - Chỉ số chấm 14 và 30 ngày (`app/api/admin/quality`, kèm bản theo người học cho phụ huynh).
  - Trang Quản trị: "Chấm sai cần xem".
- **Test:** chỉ phụ huynh của đúng trẻ và admin thấy; chỉ số khớp dữ liệu thử.
- **Phụ thuộc:** H6.1, H6.3. **Cỡ:** M.
- **Sau task này:** kiểm **Cổng B**.

### H7 — Runner thật và pilot

#### H7.1 Thử ChatGPT gọi API trực tiếp
- **Việc:** trên staging, tạo client `chatgpt-nightly` (quyền tối thiểu) và một tác vụ định kỳ ChatGPT thử. Kiểm từng điểm ở [AI-API §9.1](../hub2/AI-API.md#91-r1-tác-vụ-định-kỳ-chatgpt):
  - header tuỳ ý;
  - POST JSON khoảng 100 KB;
  - đọc ảnh;
  - số job mỗi lần chạy;
  - giờ Berlin;
  - xử lý 422 với `dryRun`;
  - xác minh bằng `GET /jobs/{id}`.
- **Chấp nhận khi:** ghi kết quả từng điểm vào VALIDATION.md và chọn R1 (ChatGPT trực tiếp, hoặc phương án thay theo thứ tự trong §9.1).
- **Phụ thuộc:** H5.7. **Cỡ:** S.

#### H7.2 Thử giới hạn Cloudflare cho Worker chấm bài
- **Việc:** trên staging, dựng consumer Queue tối thiểu chờ một lệnh `fetch` 2–3 phút (giả lập gọi model). Kiểm:
  - Queue có trong gói hiện tại không;
  - thời gian chạy tối đa của consumer;
  - cron mỗi giờ.
- **Chấp nhận khi:** ghi kết quả. Nếu không đạt: chọn chuyển riêng Worker chấm bài sang gói trả phí, hoặc dùng cron và nhận độ trễ cao hơn.
- **Phụ thuộc:** H5.6. **Cỡ:** S.

#### H7.3 Worker chấm bài `integrations/assessor/`
- **Thay đổi:** theo [AI-API §9.2](../hub2/AI-API.md#92-r2-worker-chấm-bài).
  - **Mã nguồn:** `src/index.ts` (consumer Queue, cron), `src/hub.ts` (lease, context, ảnh, result, fail, xác minh), `src/model.ts` (`@anthropic-ai/sdk`).
  - **Gọi model:**
    - `claude-opus-5-5`, `effort: high`;
    - structured output theo schema `lib/contracts`;
    - ảnh base64;
    - `system` có cache;
    - fallback mặc định;
    - streaming cho plan.
  - **Cấu hình:** `wrangler.jsonc` riêng; workflow GitHub Actions `deploy-assessor` (staging, production); secret qua `wrangler secret put`.
- **Test:**
  - Unit với phản hồi model đã ghi sẵn (không gọi API thật trong CI).
  - Xử lý `refusal`, `max_tokens`, 429.
  - 422 → sửa một lần.
  - Lỗi mạng sau khi gửi → `GET /jobs/{id}`.
- **Chấp nhận khi:** trên staging, một lần nộp thật được chấm trong 3 phút; usage và chi phí hiện ở trang Lượt AI.
- **Phụ thuộc:** H7.2, H5.8. **Cỡ:** L.

#### H7.4 Prompt và bộ bài mẫu đo chất lượng
- **Thay đổi:** `integrations/runner-prompts/plan.md` và `assess.md`, viết từ [LESSON-DESIGN.md](../hub2/LESSON-DESIGN.md), gồm cả phần xen kẽ trong sổ (§3, cấp 2). Khi sửa nguyên tắc soạn hay chấm, sửa LESSON-DESIGN trước rồi mới sửa prompt.
  - Quy tắc AGENTS.md.
  - Nguyên tắc chấm của Eck: từng câu; không đoán phần không rõ; cách diễn đạt khác nhưng đúng; chỉ giải thích phần sai; trích bằng chứng.
  - Tăng độ khó bằng tư duy; đổi dạng bài khi lỗi lặp.
  - Bám chương trình GDPT 2018 cho Toán 7 và Hóa 7.
- **Bộ bài mẫu:** `fixtures/eval/assess/` gồm 25 câu trả lời mẫu (Deutsch và Toán 7, có 5 ảnh bài giải soạn mới), do phụ huynh chấm tay làm chuẩn. `scripts/eval-assess.mjs` chạy Worker chấm bài trên staging và so với chuẩn.
- **Chấp nhận khi:** đồng ý với chuẩn ít nhất 90%; không có trường hợp nào chấm đúng thành sai mà không có bằng chứng. Mỗi lần sửa prompt thì chạy lại.
- **Phụ thuộc:** H7.3. **Cỡ:** M. **Ghi chú:** mỗi lần chạy tốn tiền API thật; khoảng $5 mỗi lượt 25 câu.

#### H7.5 Cấu hình production
- **Việc:** theo §8.
  - Access application và 2 service token (`chatgpt-nightly`, `assessor`).
  - `AUTOMATION_CLIENTS` có scope v2.
  - Queue, bucket uploads, `HUB2_ENABLED`, `AI_PRICE_TABLE`, `AI_JOBS_DAILY_CAP`.
  - Secret của Worker chấm bài.
  - Giới hạn chi tiêu trong Anthropic Console.
  - Viết runbook `docs/ops/AI-RUNNERS.md`: xoay khoá, tắt khẩn cấp (xoá client, tắt `ai_enabled`), đọc trang Lượt AI.
- **Phụ thuộc:** H7.1, H7.3. **Cỡ:** S.

#### H7.6 Staging 3 đêm
- **Việc:** tài khoản thử có sổ Deutsch, bật `ai_enabled`; R1 chạy plan 3 đêm liên tiếp; mỗi ngày nộp bài để R2 chấm; thử một lần phản đối.
- **Chấp nhận khi:** 3/3 đêm `succeeded`; không vi phạm bất biến; lời phê dùng được (phụ huynh đọc thử).
- **Phụ thuộc:** H7.4, H7.5. **Cỡ:** S, cộng 3 ngày.

#### H7.7 Pilot Ếch × Deutsch (3 tuần)
- **Việc:** chỉ bật `ai_enabled` cho sổ Deutsch của Ếch trên production. Mỗi tuần: phụ huynh soát 20 câu đã chấm, đọc chỉ số, ghi 3 câu hỏi cảm nhận. Sửa prompt hay luật nếu cần, mỗi lần sửa là một PR.
- **Chấp nhận khi:** **Cổng C** (§11). **Cỡ:** 3 tuần.

### H8 — Mở rộng và dọn dẹp

| Task | Việc | Điều kiện |
| --- | --- | --- |
| H8.1 | Bật Toán 7 của Ếch (ảnh bài giải) | Cổng C; đọc ảnh đạt trong bộ bài mẫu |
| H8.2 | Bật Hóa 7 của Ếch | H8.1 ổn 1 tuần |
| H8.3 | Bật Deutsch của người lớn | Cổng C |
| H8.4 | Bật các sổ `reading` của người lớn (AI, MTB, Cardio), nguồn bắt buộc | H0.3; runner đêm soạn được bài có nguồn đã mở |
| H8.5 | Bật Bột (`child_dev`) | H8.4 ổn |
| H8.6 | Tắt automation v1 (410); bỏ dùng `learning_slots`; sao lưu dạng 4 (bảng mới; ghi rõ ảnh không nằm trong bản sao lưu); cập nhật FEATURES, ARCHITECTURE, VALIDATION | Sau H8.3 |

Mỗi bước mở rộng chạy 1 tuần và đọc lại chỉ số trước bước sau.

### H9 — Kết nối và chuyển giao

Thiết kế: [LESSON-DESIGN §3](../hub2/LESSON-DESIGN.md#3-bốn-cấp-tập-trung--xen-kẽ--kết-nối--tổng-hợp), [DATA-MODEL §2.5, §3.7](../hub2/DATA-MODEL.md#25-mạng-kiến-thức-từ-h9), [AI-API §6.6](../hub2/AI-API.md#66-phần-thêm-cho-kết-nối-plan-context2-plan-result2-từ-h9). **Bắt đầu khi** có ít nhất hai sổ cùng người đã bật AI và chạy ổn (H8.3 hoặc H8.4).

#### H9.1 Migration `0014_concepts`
- **Migration:**
  - Tạo `concepts`, `skill_concepts`, `concept_links`.
  - Thêm cột `subjects.system_kind`, `learning_lessons.related_subject_ids`, `lesson_items.concept_ids`.
  - Thêm giá trị `connect`, `synthesis` cho `kind` và `slot`.
- **Test:** CHECK quan hệ; `limits` bắt buộc với `analogy`/`contrast`; không liên kết chéo người học; sao lưu và restore.
- **Cỡ:** S.

#### H9.2 Luật chuyển giao
- **Thay đổi:** `lib/learner-model/transfer.ts`: câu chuyển giao, `transfer_level`, `transfer_contexts`, ứng viên kết nối ([DATA-MODEL §3.7](../hub2/DATA-MODEL.md#37-chuyển-giao-từ-h9)).
- **Test:**
  - Câu chuyển giao đạt E3 → mức 2; hai bối cảnh cách 7 ngày → mức 3.
  - Sai tiêu chí kỹ năng không trừ chuyển giao.
  - Thành thạo kỹ năng không đổi vì chuyển giao.
- **Cỡ:** M. **Phụ thuộc:** H9.1, H4.3.

#### H9.3 Hợp đồng `/2`
- **Thay đổi:** `lib/contracts/plan-context-v2.ts`, `plan-result-v2.ts` (chỉ thêm trường). `lesson-package/2` nhận `concepts` và kỹ năng nhiều sổ cho kind `connect`/`synthesis`. Context builder thêm `concepts`, `connectionCandidates`, hạn mức tuần.
- **Test:** fixture hợp lệ và không hợp lệ; runner `/1` vẫn chạy.
- **Cỡ:** M. **Phụ thuộc:** H9.2, H5.4.

#### H9.4 Áp kết nối
- **Thay đổi:** `apply/plan.ts`:
  - `conceptChanges` (add, map, link, retire);
  - `connections` với điều kiện `connection_gate`, `weekly_cap`, `link_limits_missing`, độ khó theo mọi sổ liên quan;
  - tự tạo Sổ kết nối.

  `apply/assess.ts`: tiêu chí rubric gắn khái niệm cho ra bằng chứng chuyển giao.
- **Test:** mỗi mã lỗi mới; bài vượt hạn mức tuần bị từ chối; trẻ em chỉ 1 bài tổng hợp mỗi tuần.
- **Cỡ:** M. **Phụ thuộc:** H9.3.

#### H9.5 Sổ kết nối
- **Thay đổi:** `app/hub/connections/*`:
  - bản đồ khái niệm (danh sách, hoặc sơ đồ đơn giản khi đủ khái niệm), cho thấy sổ liên quan, mức chuyển giao, quan hệ kèm lý do và giới hạn;
  - nút **Bác liên kết** (người lớn, phụ huynh);
  - bài `connect`/`synthesis` dùng trang bài v2.
  - Post-it **Kết nối** trên bàn khi có bài.
- **Test:** bàn phím, mobile; quyền (trẻ em không bác được, phụ huynh bác được).
- **Cỡ:** M. **Phụ thuộc:** H9.4.

#### H9.6 Prompt và bộ bài mẫu
- **Thay đổi:**
  - `plan.md`: khi nào kết nối, cách viết bài kết nối tường minh, chỉ chuyển giao gần.
  - `assess.md`: chấm tách thành phần và tổng hợp.
  - Bộ bài mẫu: 10 câu trả lời cho bài kết nối hoặc tổng hợp (Bayes cho người lớn; tỉ lệ Toán ↔ Hóa cho Ếch), có chuẩn chấm tay.
- **Chấp nhận khi:** đồng ý ≥90%; mọi liên kết sinh ra có lý do, và có giới hạn khi cần.
- **Cỡ:** M. **Phụ thuộc:** H9.4, H7.4.

#### H9.7 Thử với người lớn (Cổng D)
- **Việc:** 2 tuần, các sổ AI, MTB, Cardio; khái niệm khởi đầu là suy luận Bayes và đánh giá bằng chứng. Đo theo Cổng D.
- **Cỡ:** 2 tuần.

#### H9.8 Mở cho Ếch
- **Việc:** chỉ cặp Toán 7 ↔ Hóa 7 (tỉ lệ, phần trăm khối lượng), trong chương trình lớp 7, tối đa 1 bài tổng hợp mỗi tuần. Phụ huynh xem bản đồ trong Sổ liên lạc.
- **Điều kiện:** Cổng D; Toán 7 và Hóa 7 đã ổn (H8.1, H8.2).

## 6. Thứ tự PR

1. H0.1 Commit Phase 1, đồng bộ migration (phiên Phase 1).
2. H0.2 + H0.3 Sửa B1, B2.
3. H0.4 AGENTS.md và chỉ dẫn plan (sau khi duyệt).
4. H1.1 `0007_subjects`.
5. H1.2 Lớp quyền.
6. H1.3 `0008_workspace_per_user`.
7. H1.4 API sổ và cài đặt; H1.6 admin phụ huynh.
8. H1.5 Tủ sách theo người; H1.7 lọc theo `sensitivity`.
9. H1.8 Tài khoản Ếch (thao tác tay).
10. H2.1 `lesson-package/2`; H3.2 chấm tự động (thuần hàm, có thể làm song song).
11. H2.2 `0009_lessons_v2`.
12. H2.3 API bài; H2.7 nhập bài soạn tay.
13. H2.4 Ảnh (`0010_attachments`, R2).
14. H2.5 Trang bài `skill`.
15. H3.1 `0011_evidence`; H3.3 nộp bài.
16. H3.4 Lời phê, sửa lại, hoàn thành.
17. H2.6 Trang bài `reading`.
18. H3.5 Ếch dùng thử → **Cổng A**. H4.2 làm song song.
19. H4.1 + H4.3 Learner model, tính lại.
20. H4.4 Cron đêm; H4.5 trang đầu sổ.
21. H5.1 `0013_ai_jobs`; H5.2 hợp đồng.
22. H5.3 Lease.
23. H5.4 Context.
24. H5.5 Áp kết quả.
25. H5.6 Tạo job, ngân sách, báo việc.
26. H5.7 Runner giả, e2e; H5.9 đo CPU.
27. H5.8 Trang Lượt AI.
28. H6.1 + H6.2 Phản đối.
29. H6.3 + H6.4 Yêu cầu, khám phá.
30. H6.5 Sổ liên lạc → **Cổng B**.
31. H7.1 + H7.2 Hai lần thử (không code sản phẩm).
32. H7.3 Worker chấm bài.
33. H7.4 Prompt, bộ bài mẫu.
34. H7.5 Cấu hình production; H7.6 staging 3 đêm.
35. H7.7 Pilot → **Cổng C**.
36. H8.1–H8.6 theo bảng.
37. H9.1 `0014_concepts`; H9.2 luật chuyển giao.
38. H9.3 hợp đồng `/2`; H9.4 áp kết nối.
39. H9.5 Sổ kết nối.
40. H9.6 prompt và bộ bài mẫu → H9.7 thử với người lớn → **Cổng D** → H9.8 Ếch.

## 7. Migration

| Số | Tên | Nội dung | Task |
| --- | --- | --- | --- |
| 0007 | `0007_subjects` | Cột `learner_settings`; `guardians`, `subjects`, `skills`, `learner_requests`; tạo sổ từ 5 mảng cũ | H1.1 |
| 0008 | `0008_workspace_per_user` | Workspace chung giao cho admin đầu tiên | H1.3 |
| 0009 | `0009_lessons_v2` | Dựng lại `learning_lessons`; `lesson_items` | H2.2 |
| 0010 | `0010_attachments` | `attachments` | H2.4 |
| 0011 | `0011_evidence` | `submissions`, `attempts`, `grades`, `disputes` | H3.1 |
| 0012 | `0012_learner_model` | `skill_states`, `error_patterns` | H4.1 |
| 0013 | `0013_ai_jobs` | `ai_jobs` | H5.1 |
| 0014 | `0014_concepts` | `concepts`, `skill_concepts`, `concept_links`; cột kết nối | H9.1 |

Mỗi migration có test trên DB trống và trên bản sao dữ liệu thật (local). `lib/backup-contract.mjs` thêm bảng mới ngay trong PR tạo bảng; dạng sao lưu tăng lên 4 ở H2.2.

## 8. Cấu hình và secret mới

| Tên | Loại | Ở đâu | Task |
| --- | --- | --- | --- |
| `HUB2_ENABLED` | var | Hub (staging, production) | H3.5 |
| `UPLOADS` → `learning-hub-uploads-<env>` | R2 binding, lifecycle 30 ngày | Hub | H2.4 |
| `AI_QUEUE` → `learning-hub-ai-<env>` | Queue producer | Hub | H5.6 |
| `AI_JOBS_DAILY_CAP` | var (mặc định 300) | Hub | H5.6 |
| `AI_PRICE_TABLE` | var JSON (giá theo model) | Hub | H5.8 |
| `AI_DISPATCH_URL`, `AI_DISPATCH_SECRET` | var, secret (tuỳ chọn) | Hub | H5.6 |
| `AUTOMATION_CLIENTS` | secret, thêm `chatgpt-nightly`, `assessor` có scope, `purposes`, `triggers` | Hub | H5.1, H7.5 |
| `AUTOMATION_ACCESS_AUD` | var | Hub production (đang thiếu, B6) | H7.5 |
| Access service token × 2 | Cloudflare Zero Trust | Tài khoản | H7.5 |
| `ANTHROPIC_API_KEY` | secret | **Chỉ** Worker chấm bài | H7.3 |
| `HUB_BASE_URL`, `HUB_ACCESS_CLIENT_ID`, `HUB_ACCESS_CLIENT_SECRET`, `HUB_BEARER` | var, secret | Worker chấm bài | H7.3 |
| Consumer `learning-hub-ai-<env>`, cron `17 * * * *` | Queue consumer, cron | Worker chấm bài | H7.3 |
| Credential của client `chatgpt-nightly` | Trong hướng dẫn tác vụ ChatGPT | Tài khoản ChatGPT | H7.1 |

## 9. Chiến lược test

| Lớp | Công cụ | Phủ |
| --- | --- | --- |
| Thuần hàm | `node --test` | Luật learner model, chấm tự động, kiểm gói bài, dựng context (cắt, hash) |
| SQLite | `node:sqlite` như test hiện có | Bất biến giao bài, migration, nộp bài idempotent, phản đối, lease đồng thời, áp kết quả, quyền |
| Hợp đồng | Fixture hợp lệ và không hợp lệ cho mọi schema | Hub, runner giả, Worker chấm bài dùng chung |
| E2E | `scripts/e2e-hub2.mjs` + runner giả trên staging | Cả vòng (Cổng B) |
| Chất lượng chấm | `scripts/eval-assess.mjs` + 25 câu mẫu có chuẩn | Trước pilot và sau mỗi lần sửa prompt |
| Giao diện | Kiểm tay trên 375 px và 1280 px; bàn phím; trình đọc màn hình cơ bản | Trang bài, hộp thoại phản đối, Sổ liên lạc |

CI không gọi API model thật.

## 10. Rollback

| Sự cố | Cách lùi |
| --- | --- |
| Giao diện v2 lỗi | Tắt `HUB2_ENABLED`. Bài v1 vẫn hiện bình thường; bài v2 giữ nguyên trong DB. |
| AI soạn hoặc chấm sai hàng loạt | Tắt `ai_enabled` của sổ; xoá client khỏi `AUTOMATION_CLIENTS` (hiệu lực ngay); huỷ job ở trang Lượt AI. Grade AI có thể đánh dấu `void` hàng loạt bằng script admin (không xoá). |
| Chi phí vượt dự kiến | Giảm ngân sách hoặc `AI_JOBS_DAILY_CAP`; giới hạn chi tiêu ở Anthropic Console tự chặn. |
| Migration dựng lại bảng lỗi | Không áp được thì D1 không đổi. Áp xong mới thấy lỗi thì restore từ bản sao lưu R2 chụp ngay trước đó, rồi deploy lại commit trước. |
| Worker chấm bài hỏng | Mọi assess thành `deferred` và runner đêm chấm; không ảnh hưởng Hub. |

## 11. Pilot (H7.7)

| Chỉ số | Ngưỡng Cổng C | Nguồn |
| --- | --- | --- |
| Đều đặn | Ếch học ít nhất 4/7 ngày; trung vị ≥70% mục tiêu phút | `study_time` |
| Chất lượng chấm | Bị lật ≤10% số câu AI chấm; phụ huynh soát 20 câu mỗi tuần, đồng ý ≥90% | `disputes`, `grades`, phiếu soát |
| Thích ứng thật | ≥80% bài chính có `reasonRefs` trỏ tới mẫu lỗi đang mở hoặc kỹ năng đến hạn; không kỹ năng `stuckOn` nào bị giao lại cùng dạng quá ngưỡng | `learning_lessons`, `lesson_items` |
| Vận hành | Plan đêm thành công ≥6/7; trung vị thời gian chấm ≤3 phút | `ai_jobs` |
| Khối lượng | Không ngày nào bài mở vượt 1,5 × mục tiêu phút | `learning_lessons` |
| Chi phí | Trong ước tính ($15–25/tháng) hoặc có giải thích | Trang Lượt AI |
| Cảm nhận | Ếch và phụ huynh trả lời 3 câu cuối mỗi tuần (dễ hiểu, vừa sức, có ích) | Ghi tay |

Mỗi tuần dành 30 phút: xem trang Lượt AI và chỉ số chấm, đọc 20 câu, quyết định có sửa gì không.

## 12. Việc của bạn

| Việc | Khi nào |
| --- | --- |
| Duyệt thiết kế hub2 và plan này; duyệt sửa AGENTS.md | Trước H0.4 |
| Để Ếch đăng ký bằng email riêng; duyệt tài khoản | H1.8 |
| Cho biết trình độ tiếng Đức hiện tại và mục tiêu phút của Ếch | H1.8 |
| Duyệt nội dung 5–6 bài soạn tay trước khi giao cho Ếch | H2.7 |
| Tạo API key Anthropic cho Worker chấm bài; đặt giới hạn chi tiêu trong Console | H7.3 |
| Tạo hai service token Access (hoặc cấp quyền để agent hướng dẫn từng bước) | H7.1, H7.5 |
| Tạo tác vụ định kỳ ChatGPT và dán hướng dẫn cùng credential | H7.1 |
| Chấm tay 25 câu mẫu làm chuẩn | H7.4 |
| Soát 20 câu mỗi tuần trong pilot | H7.7 |

## 13. Ánh xạ từ plan v2

| Plan v2 | Plan v3 |
| --- | --- |
| P1.6 tách instructions/goals khỏi code (`track_goals`) | H1.1 (`subjects.goal`, `level`, `curriculum`), H7.4 (prompt trong repo) |
| P1.9 admin API, run status đọc bảng mới | H5.8 |
| P1.12 thử AI runner thật | H7.1–H7.6 |
| P2.1 quests/answers/assessments | H2.2, H3.1, H3.3 |
| P2.2 chấm tự động | H3.2 |
| P2.3 open-ended → AI grading | H5.5, H7.3 |
| P2.4 mastery từ evidence | H4.2, H4.3 |
| P2.5 review queue | H4.2 (lịch ôn), H5.5 (bộ ôn từ plan) |
| P2.6 context v2 | H5.4 |
| P2.7 UI tối thiểu | H2.5, H3.4, H4.5 |
| P2.8 notes/logs theo user | H1.3 |

## 14. Đề xuất sửa AGENTS.md (chờ bạn duyệt, áp ở H0.4)

| Hiện tại | Đề xuất |
| --- | --- |
| "Everyone can study every track; do not split navigation into Vũ/Ly/Gia đình." | Mỗi người có kệ và sổ riêng; mỗi người chỉ thấy tiến độ và bài làm của mình; admin thấy tất cả; phụ huynh thấy của con. |
| "Follow `docs/plan/learning-hub-plan-v2-cloudflare.md` in order…" | Plan v2 cho Phase 0–1; plan v3 cho Learning Hub 2.0, theo thứ tự §6 và các cổng A, B, C. |
| "Sites keeps v5 until cutover…", "`/api/learning-run` currently relies on the Sites access boundary." | Bỏ (cutover xong 10/10/2026; route trả 410). |
| "Do not introduce model API dependencies or keys unless the user requests immediate AI inside the app." | Chủ dự án đã yêu cầu chấm ngay khi nộp (12/10/2026). Key model chỉ nằm trong Worker `learning-hub-assessor`; Hub không chứa key và không gọi model trực tiếp. Lịch đêm dùng thuê bao ChatGPT. |
| Phần "Content quality" | Rút gọn thành liên kết tới `docs/hub2/LESSON-DESIGN.md`, nguồn duy nhất cho cách soạn và chấm bài. Giữ các câu cấm (nguồn bịa, chép bản quyền, dữ liệu bệnh nhân, hứa IQ hay chiều cao). |
| "Each lesson needs … 2–8 questions with rubrics…" | Bài v2: 3–25 câu, mỗi câu có `key` hoặc `rubric`, có gợi ý và lời giải; khuôn `reading` bắt buộc nguồn; bài của Ếch bám GDPT 2018 lớp 7. |
| "Initial GET creates a unique `runId`…", "A task is not a successful run until the actual saved lesson IDs…" | Áp cho job v2: lease tạo `leaseToken`; job chỉ `succeeded` khi `outcome` ghi id bài đã lưu; xác minh và khôi phục sau lỗi ghi bằng `GET /jobs/{id}`, không tạo job mới. |
| (chưa có) | Câu trả lời của trẻ em chỉ gửi kèm biệt danh; không chat tự do với trẻ; mọi lời phê AI hiện cho phụ huynh; ảnh bài làm xoá sau 30 ngày. |
