# Kế hoạch: Lộ trình tự nâng cao cho mọi sổ

Người thực hiện: Codex. Ngày lập: 12/11/2026. Trạng thái: chưa code. Mã đã đọc: `main` tại `0dab4a8` (đã có Knowledge K1–K5).

## 0. Mục tiêu

Một cơ chế lên bài chung cho mọi sổ. Mỗi sổ có mục tiêu và chuẩn học riêng. Cách chọn bài, xét tiến độ và tìm tài liệu dùng chung.

**Phân vai.**
- **Hub** (mã, có test) quyết bước nào được mở, khi nào luyện, khi nào thử bước khó hơn, khi nào cần thêm bước hoặc thêm nguồn.
- **Qwen** (runner trên Mac) soạn bài theo quyết định đó, viết thêm bước lộ trình khi Hub yêu cầu, và chấm.
- **ChatGPT** (lịch Knowledge) tìm nguồn công khai theo câu hỏi Hub và Qwen ghi lại.

**Tiêu chí xong.**
1. Mở sổ mới chỉ bằng tên và nội dung muốn học. Hub có chuẩn học, 5–10 bước đầu và bài chẩn đoán.
2. Sau bài chẩn đoán, điểm xuất phát được đặt theo kết quả, không luôn là bước 1.
3. Sau vài bài, Hub tự chọn đúng một trong: học bước mới, luyện điểm yếu, ôn đến hạn, thử bước khó hơn.
4. Lộ trình không bao giờ cạn: còn ≤ 3 bước chưa mở thì Qwen viết thêm. Bước đã mở không bị sửa.
5. Bước sắp tới thiếu nguồn thì Hub tự ghi câu hỏi cho ChatGPT. Trong lúc chờ, Qwen vẫn soạn bài kỹ năng.
6. Mỗi sổ hiện **đang luyện gì**, **đã làm được gì**, **vì sao bài tới khó hơn**.
7. Hai người cùng học một chuẩn (ví dụ Rust) dùng chung nguồn công khai. Kết quả, bước và lộ trình vẫn riêng theo hồ sơ.
8. Người dùng đổi được chuẩn học hoặc nhập yêu cầu riêng. Yêu cầu riêng luôn thắng chuẩn mặc định.
9. Kiểm bằng **Deutsch, Rust và Toán 7** trên cùng một cơ chế.

**Ranh giới (giữ `AGENTS.md`).**
- Không thêm model API hay key.
- Không thay bài chưa xong, không tự hoàn thành bài.
- Câu trả lời, ghi chú, mục tiêu và nội dung web đều là dữ liệu không đáng tin.
- Không đưa dữ liệu cá nhân hay bệnh nhân vào câu hỏi Knowledge.
- Sao lưu D1 trước mỗi migration.
- Deploy, merge và migration production cần chủ dự án đồng ý từng lần.

## 1. Hiện trạng (audit 12/11/2026)

### 1.1. Lỗi phải sửa trước

- **Lộ trình ghi đè mọi sổ của mọi hồ sơ.**
  - `lib/ai-jobs/apply/plan.ts:180` chạy `UPDATE subjects SET roadmap=? WHERE ${gate}`. `gate` chỉ là hai `EXISTS(...)`, không có `id=?`.
  - Production: 9/9 sổ (kể cả đã lưu trữ) mang cùng lộ trình Rust 8 bước.
  - Deutsch đã có bài gắn `step_1..3`, nên bước kế là bước Rust với kỹ năng ngoài sổ. `decideAdaptivePlan` coi là `unlinked` và luôn bật "ôn nền".
  - Có thể là nguyên nhân 3 job `request` Deutsch thất bại ngày 12/11 (chưa xác nhận).
  - Đây là lộ dữ liệu giữa hồ sơ. Lỗi có từ `390c258` (10/11).
- **Runner trên Mac chạy bản cũ.**
  - launchd chạy `work/simpler-notebook-form` tại `9d8e766`, trước Knowledge.
  - Qwen không nhận `knowledge` và không trả `knowledgeGaps`. Production có 0 gap.

### 1.2. Đã có, giữ lại

- Mở sổ: `opening_brief` → job `initial` → `notebookSetup` (goal/level/curriculum/instructions), 8 kỹ năng, 5–10 bước, bài chẩn đoán (`integrations/runner-prompts/plan-request.md`, `integrations/home-runner/job.mjs:89`).
- Quyết định do Hub: `lib/ai-jobs/adaptive.ts` `decideAdaptivePlan` (learn/practice/personal/none). Bước lưu kiểm loại bài đúng quyết định (`apply/plan.ts:65`, `apply/explorations.ts:95`).
- Bằng chứng và mức thành thạo: `lib/learner-model/rules.ts`.
  - Gợi ý và lời giải hạ mức bằng chứng.
  - "Vững" cần làm độc lập ở 2 ngày.
  - Lỗi "xác nhận" cần 2 ngày.
  - Có lịch ôn.
- Bài đã giới thiệu bước nào: `learning_lessons.roadmap_step_id` cùng unique index `adaptive_roadmap_introduction`.
- Knowledge:
  - Có phiên bản, probe, rollback và gap.
  - Đưa ≤ 4 KB ghi chú vào context (`lib/knowledge/service.ts:71`).
  - 11 công cụ `hub2_kb_*`.
  - Hiện có 6 nguồn do người vận hành nạp tay.
- Hiển thị: `lib/notebook-report.ts` (tuần, 3 bước tới), `app/hub/skill-progress.tsx`.

### 1.3. Còn thiếu

| # | Thiếu | Chỗ |
|---|---|---|
| G1 | Không có chuẩn học có cấu trúc. `curriculum` là chữ tự do, đang trống ở Toán 7 và Rust | `drizzle/0007_subjects.sql` |
| G2 | Mã bước là vị trí trong mảng (`'step_'+(index+1)`). Đổi lộ trình là lệch | `lib/ai-jobs/adaptive.ts:31` |
| G3 | Lộ trình bị đóng băng sau lượt mở sổ. Lượt adaptive đêm và lượt xin bài đều từ chối `roadmap`. Hết 8 bước thì `mode: none` mãi | `apply/plan.ts:33,66`, `job.mjs:75` |
| G4 | Bài chẩn đoán không đặt điểm xuất phát. "Vững" cần 2 ngày nên một buổi chẩn đoán không mở được bước nào | `adaptive.ts`, `rules.ts:86` |
| G5 | Không có bài thử bước khó hơn, không có tiêu chí "qua bước" | — |
| G6 | Độ khó không theo bước. `limits.maxDifficulty` cố định 3/5 | `lib/subjects/sql.ts:20` |
| G7 | Chưa đo riêng việc làm được trong tình huống mới | `rules.ts` |
| G8 | Lượt xin bài adaptive không cập nhật `progressSummary` (runner ép `''`) | `job.mjs:68` |
| G9 | Nguồn gắn theo `subject_id`: hai sổ Rust không dùng chung | `knowledge_links`, `scoreNotes` |
| G10 | Truy vấn nguồn theo tên và mục tiêu sổ, không theo các bước sắp tới | `context/plan.ts:42` |
| G11 | Hub không tự phát hiện bước sắp tới thiếu nguồn | — |
| G12 | Lịch ChatGPT chưa chứng minh chạy (cổng K0). Chưa có phiên bản KB nào do ChatGPT tạo | `docs/ops/KNOWLEDGE-MAINTAINER.md` |
| G13 | Giao diện chưa có "bước X/Y", "đã làm được", "vì sao khó hơn" | `skill-progress.tsx`, `notebook-report.ts` |
| G14 | Dạng bài v3 chỉ bật tay cho từng sổ bởi admin (`limits.package=3`) | `app/api/subjects/route.ts:41` |

## 2. Quyết định thiết kế

1. **Bước lộ trình là một dòng dữ liệu riêng** (`roadmap_steps`), có ID bền. JSON `subjects.roadmap` chỉ còn để đọc lùi, không ghi nữa.
2. **Qwen không ghi đè lộ trình.** Qwen chỉ gửi `roadmapChanges` dạng thao tác:
   - `append`;
   - `insert_before` một bước chưa mở;
   - `revise` hoặc `retire` một bước **chưa mở**.

   Hub kiểm từng thao tác. Bước đã mở, đang luyện hoặc đã qua không đổi được.
3. **Chuẩn học** lưu ở `subjects.framework` (JSON) và `subjects.topic_key`, có hai lớp:
   - Thư viện nhỏ trong mã: `lib/roadmap/frameworks.ts`.
   - Tuỳ chọn `custom` cho yêu cầu riêng.

   `topic_key` là khoá dùng chung nguồn Knowledge giữa các hồ sơ.
4. **Hub đặt điểm xuất phát bằng luật**, không cần Qwen: kết quả chẩn đoán theo bước → đánh dấu `placed`.
5. **"Qua bước"** có hai đường:
   - Mọi kỹ năng của bước đạt "vững" theo luật hiện có.
   - Hoặc qua bài thử. Bài thử có tiêu chí cố định trong mã.
6. **Độ khó theo bước**: mỗi bước có `band` 1–5. Câu trong bài cho bước đó nằm trong `[band-1, band+1]`, cắt theo trần `limits.maxDifficulty` do người dùng đặt.
7. **Không thêm `purpose` job mới** (bảng `ai_jobs` có CHECK, phải dựng lại bảng). Việc lộ trình đi kèm job `initial`, `daily` hoặc `request` qua `context.roadmapTask`.
8. **Nguồn công khai gắn theo `topic_key`.** Gap gộp theo `topic_key` và câu hỏi. Kết quả học không bao giờ vào Knowledge.
9. **Lịch Knowledge chạy hằng tuần**, chủ nhật 02:00 Europe/Berlin, theo đề xuất của chủ dự án. Thêm một lượt "khi cần" nếu có gap ưu tiên cao cho bước đang mở. Chạy được hay không phụ thuộc cổng K0 (mục R4.6).

## 3. Các PR theo thứ tự

Mỗi PR chạy `npm run test`, `npm run typecheck`, `npm run lint`, `npm run contracts:check`, `npm run build` và cập nhật `DESIGN.md`/docs khi đổi hành vi.

### R0 · Sửa lỗi ghi đè lộ trình và cập nhật runner (nhỏ, làm ngay)

1. `lib/ai-jobs/apply/plan.ts:180`: `UPDATE subjects SET roadmap=? WHERE id=? AND learner_id=? AND ${gate}`. Rà mọi `UPDATE … WHERE ${gate}` khác trong `lib/ai-jobs/apply/*` và `lib/knowledge/*` theo cùng mẫu.
2. Test mới trong `tests/ai-jobs.test.mjs`:
   - Hai hồ sơ, ba sổ.
   - Áp kết quả `initial` cho một sổ.
   - Các sổ còn lại giữ nguyên `roadmap`, `revision`, `updated_at`.
3. Script `scripts/repair-roadmaps.mjs`, mặc định chạy thử, có `--apply`. Với mỗi sổ:
   - **Khôi phục:** lấy `roadmap` trong `context_snapshot` của job sớm nhất **sau** job `initial` của chính sổ đó, nếu mọi kỹ năng trong bước thuộc sổ.
   - **Không khôi phục được:** đặt `roadmap='[]'` và đánh dấu sổ cần lập lại lộ trình (R3 xử lý).
   - **Bài cũ:** `roadmap_step_id` không khớp lộ trình khôi phục thì giữ nguyên lịch sử, chỉ ghi vào báo cáo.
   - In báo cáo theo sổ. Không in nội dung riêng.
4. Chạy trên bản sao D1 production trước, rồi production sau khi chủ dự án đồng ý.
5. Runner: chuyển launchd sang `main` theo `integrations/home-runner/README.md`, chạy `--once`, kiểm log có `knowledge` trong context. Báo lại cho chủ dự án vì đây là máy của họ.

**Xong khi:** test mới đạt; mọi sổ production có lộ trình đúng chủ đề hoặc rỗng chờ lập lại; runner báo đúng phiên bản.

### R1 · Dữ liệu lộ trình chuẩn (migration `0024_roadmap.sql`)

**Bảng mới:**
```sql
CREATE TABLE roadmap_steps (
  id TEXT PRIMARY KEY,                       -- 'rs_' + 20 hex; bước chuyển từ JSON: '<subject_id>:s<n>'
  learner_id TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES subjects(id),
  ord REAL NOT NULL,                         -- chèn giữa hai bước bằng trung bình, không đánh lại số
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  objective TEXT NOT NULL CHECK(length(objective) <= 500),   -- "làm được việc gì"
  situation TEXT NOT NULL DEFAULT '' CHECK(length(situation) <= 300),
  skill_ids TEXT NOT NULL,                   -- JSON 1–3 skill id của cùng sổ
  requires TEXT NOT NULL DEFAULT '[]',       -- JSON id bước học trước
  band INTEGER NOT NULL CHECK(band BETWEEN 1 AND 5),
  level_label TEXT,                          -- 'A2.1', 'Lớp 7 · Hình học', 'Ownership'
  kind TEXT NOT NULL DEFAULT 'new' CHECK(kind IN ('new','review','mixed')),
  status TEXT NOT NULL CHECK(status IN ('planned','open','practising','passed','placed','retired')),
  passed_via TEXT CHECK(passed_via IS NULL OR passed_via IN ('mastery','challenge','placement','learner')),
  origin TEXT NOT NULL CHECK(origin IN ('ai','user','migration')),
  origin_job_id TEXT, opened_at TEXT, passed_at TEXT, retired_reason TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX roadmap_steps_subject ON roadmap_steps(learner_id, subject_id, status, ord);
```

**Cột mới (ADD COLUMN, không dựng lại bảng):**
- `subjects.framework TEXT` (JSON `{key,label,kind,custom?}`, `kind` ∈ `international|national|milestones|custom`).
- `subjects.topic_key TEXT` (ví dụ `de-cefr`, `rust`, `vn-gdpt-toan-7`, `custom:<slug>`).
- `learning_lessons.step_role TEXT CHECK(step_role IS NULL OR step_role IN ('intro','practice','challenge','placement'))`.

**Chuyển dữ liệu:**
- Chạy sau R0. Với mỗi sổ có `roadmap` khác `'[]'`, chèn từng bước bằng `json_each`:
  - `id = subject_id||':s'||(key+1)`, để khớp `roadmap_step_id='step_N'` cũ;
  - `ord = key+1`;
  - `band = 2`.
- Cập nhật `learning_lessons.roadmap_step_id` từ `step_N` sang ID mới, chỉ khi cùng sổ.
- Trạng thái ban đầu:
  - bước đã có bài intro → `open`;
  - bài intro đã xong → `practising`;
  - còn lại → `planned`.
- Kiểm toàn vẹn kiểu `_v3_integrity_guard` của `0022`: số dòng, khoá ngoại.

**Mã:**
- `lib/roadmap/types.ts`.
- `lib/roadmap/store.ts`: `listSteps`, `nextSteps(k)`, `applyRoadmapChanges` trả các câu lệnh để gộp vào batch apply.
- `lib/roadmap/frameworks.ts`: thư viện chuẩn, mục R3.1.
- `lib/backup-contract.mjs`, export và restore thêm `roadmap_steps` và cột mới.
- `lib/subjects/service.ts` trả `roadmap` từ bảng mới, cùng hình dạng cũ cộng `id`, `status`, `band`.
- `adaptive.ts` đọc bảng mới, bỏ `'step_'+(index+1)`.

**Test:**
- `tests/roadmap-migration.test.mjs`: chuyển JSON và bài cũ, sổ rỗng, sổ legacy, chạy lại không đổi.
- `tests/backup-store.test.mjs`: bảng mới có trong backup và restore.

### R2 · Luật tiến độ do Hub quyết (`lib/roadmap/progress.ts`)

**R2.1. Trạng thái bước** (một hàm thuần `stepStatus(step, skills, errors, evidence)` cùng một hàm ghi):
- `planned → open`: Hub giao bài intro cho bước. Gắn khi lưu bài `step_role='intro'`.
- `open → practising`: bài intro đã hoàn thành.
- `practising → passed (mastery)`:
  - mọi kỹ năng của bước có `mastery='demonstrated'`;
  - **và** có ít nhất một câu `stage='independent'` đúng lần đầu, `support='none'`, thuộc hoạt động chuyển giao (`apply`, `transform`, `create`, `investigate`). Đây là bằng chứng "làm được trong tình huống mới" (G7).
- `→ passed (challenge)`: theo R2.3.
- `planned → placed`: theo R2.4.
- Không lùi trạng thái tự động. Lỗi xác nhận ở kỹ năng của bước đã qua sinh bài luyện, không mở lại bước.
- Tính lại sau mỗi lượt chấm ở `lib/learner-model/recompute.ts`, trong cùng batch, có `revision`.

**R2.2. Quyết định bài tiếp theo.** Thay `decideAdaptivePlan` bằng `decideNext(state, purpose)`. Kết quả gồm:
- `mode` ∈ `learn|practice|review|challenge|personal|none`;
- `stepId`, `stepRole`, `targetSkills` (≤ 3);
- `difficulty {min,max}`;
- `reasonCode`;
- `roadmapTask`.

Thứ tự ưu tiên:
1. Lỗi `confirmed` đang mở ở kỹ năng của bước đang luyện hoặc đã qua → `practice` (remediation).
2. ≥ 3 kỹ năng đến hạn ôn, hoặc kỹ năng đến hạn quá 7 ngày → `review`.
3. Bước `practising` đủ điều kiện thử (R2.3) → `challenge`.
4. Bước `practising` chưa qua → `practice` trên kỹ năng của bước.
5. Bước `planned` đầu tiên theo `ord` có mọi `requires` đã `passed|placed` → `learn`.
6. Kỹ năng đến hạn (1–2) → `review`.
7. Không còn gì → `none`.

Ngoài ra:
- Lượt `request` "Bài tiếp theo" dùng cùng thứ tự.
- `personal` chỉ khi người học ghi nội dung riêng.
- Không quá 2 bài `practice|review` liên tiếp nếu còn bước `learn` hợp lệ và không có lỗi xác nhận. Tránh lỗi cũ "luyện lỗi lấn át học mới" ghi trong `DEUTSCH-ADAPTIVE-PILOT.md`.
- `reasonCode` là mã cố định, ví dụ `next_step`, `step_practice`, `challenge_ready`, `confirmed_error`, `reviews_due`, `scaffold`, `roadmap_empty`.
- Câu chữ tiếng Việt cho mỗi mã nằm trong `lib/roadmap/reasons.ts`, không do model viết. Lưu mã vào `learning_lessons.reason_refs`.

**R2.3. Bài thử bước khó hơn (challenge).**
- **Đủ điều kiện:**
  - bước `practising`;
  - mọi kỹ năng của bước có ít nhất 1 ngày làm độc lập đúng;
  - không có lỗi `confirmed` mở;
  - chưa có challenge cho bước này trong 3 ngày.
- **Hình thức:**
  - 5–6 câu, ≥ 1 câu ở `band+1`, ≥ 2 câu chuyển giao, ≥ 1/2 số câu chấm ngay;
  - không gợi ý;
  - `kind='diagnostic'`, `step_role='challenge'`.
- **Qua khi:** ≥ 80% câu đúng lần đầu, `support='none'`, mỗi kỹ năng của bước có ít nhất một câu đúng.
  - Bước thành `passed (challenge)`.
  - Bước kế nếu có `requires` chỉ tới bước này thì đủ điều kiện mở.
  - Bằng chứng vẫn vào `rules.ts` như mọi câu khác.
- **Trượt:** quay lại `practice` với kỹ năng có câu sai. Không phạt mastery ngoài luật hiện có.

**R2.4. Đặt điểm xuất phát (placement).**
- Bài chẩn đoán của lượt mở sổ có `step_role='placement'`. Mỗi câu gắn kỹ năng của một bước trong 5–8 bước đầu.
- Khi bài chẩn đoán đã chấm xong, đi theo `ord`. Bước có mọi câu đúng lần đầu, không gợi ý → `placed`. Dừng ở bước đầu tiên có câu sai hoặc bỏ trống.
- Nếu mọi bước đều `placed` → `roadmapTask='extend'` ở lượt kế, kèm ghi chú "trình độ cao hơn dự kiến".
- `placed` không đổi `skill_states`. Kỹ năng đó vẫn có lịch ôn bình thường từ bằng chứng thật.

**R2.5. Độ khó.**
- `difficulty = {min:max(1,band-1), max:min(band+1, limits.maxDifficulty)}`, truyền vào `validateLessonPackage` (thêm `minDifficulty`).
- `limits.maxDifficulty` mặc định 5 cho người lớn, 3 cho trẻ em. Sổ cũ giữ giá trị đã lưu.
- Bước mới do Qwen viết phải có `band` ≥ `band` của bước trước trừ 1. Hub kiểm.

**Test** (`tests/roadmap-progress.test.mjs`, SQLite thật như các test hiện có):
- chuyển trạng thái;
- thứ tự ưu tiên;
- giới hạn 2 bài luyện liên tiếp;
- challenge qua và trượt;
- placement dừng đúng chỗ;
- `band` cắt theo trần;
- hai hồ sơ cùng chuẩn không ảnh hưởng nhau;
- lượt đêm và lượt xin bài cùng lúc không mở trùng bước (unique index cũ vẫn giữ).

### R3 · Nối Qwen: mở sổ, viết thêm bước, prompt

**R3.1. Chuẩn học khi mở sổ.**
- `lib/roadmap/frameworks.ts` khai báo vài chuẩn, mỗi chuẩn có `key`, `label`, `levels` (mốc), `topicKey`:
  - `de-cefr`: A1.1 → C2;
  - `en-cefr`;
  - `vn-gdpt-2018-toan` (lớp 1–12, mạch Số–Đại số / Hình học–Đo lường / Thống kê–Xác suất);
  - `rust-core`: cú pháp → hàm → kiểu → ownership → borrowing → lifetimes → traits → error handling → modules → async;
  - `python-core`;
  - `milestones` (chung).
- Context `initial` có `frameworks` (chỉ key, label, mốc).
- Qwen trả `framework: {key, levelFrom, levelTo, custom?}` trong `notebookSetup`.
- Hub nhận `key` có trong thư viện, hoặc `custom` với `label` ≤ 80 ký tự. `topic_key` của `custom` là `custom:` + slug của nhãn.
- **Yêu cầu riêng thắng chuẩn.**
  - Prompt nói rõ: nếu `opening_brief` nêu giáo trình, kỳ thi hoặc chương trình riêng, dùng `custom` và giữ nguyên tên đó trong `curriculum`.
  - Ví dụ: "Toán 7 theo GDPT" → `vn-gdpt-2018-toan`, mốc "Lớp 7".
- Lượt mở sổ trả 5–10 bước kèm `band`, `level_label`, `requires`. Bài chẩn đoán phủ 5–8 bước đầu (R2.4).

**R3.2. `roadmapChanges` trong mọi kết quả soạn.**
- `lib/contracts/ai-common.ts`: thêm `roadmapChanges` (≤ 6 thao tác).
  - `append{step}`, `insert_before{beforeStepId, step}`, `revise{stepId, fields}`, `retire{stepId, reason}`.
  - `step` gồm `title, objective, situation, skills(ref), requires(ref|stepRef), band, levelLabel, kind`.
- Giữ `roadmap` cũ cho đường MCP/ChatGPT đến khi gỡ hẳn, nhưng chỉ chấp nhận khi sổ chưa có bước nào.
- `apply/plan.ts` và `apply/explorations.ts` gọi `applyRoadmapChanges`. Từ chối nếu:
  - đụng bước khác `planned`;
  - kỹ năng ngoài sổ;
  - vòng `requires`;
  - `band` tụt quá 1;
  - tổng bước `planned` > 12;
  - thao tác trùng tiêu đề trong 90 ngày.
- Bước mới cần kỹ năng mới thì đi kèm `skillChanges.add`, giới hạn `limits.maxNewSkillsPerWeek` như hiện có.
- Bỏ chặn ở `apply/plan.ts:33,66` cho `roadmapChanges`. Giữ chặn `roadmap` toàn phần.

**R3.3. `roadmapTask` (Hub yêu cầu, Qwen làm trong cùng job).**
- `extend`: còn ≤ 3 bước `planned` hợp lệ. Qwen thêm 3–6 bước.
- `replan`: sổ có `roadmap='[]'` sau R0, hoặc sổ cũ có bài nhưng chưa có bước. Qwen đọc kỹ năng, lỗi và bài gần đây, rồi viết 5–10 bước.
  - Hub đánh dấu `passed (mastery)` ngay các bước có kỹ năng đã vững. Phần này làm bằng luật, không do Qwen quyết.
- `none`: không động vào lộ trình.
- Mode `none` ở R2.2 luôn đi kèm `extend`. Lượt đó vẫn giao một bài ôn hoặc luyện nếu có kỹ năng, để người bấm "Xin bài" không về tay không.

**R3.4. Lượt xin bài cập nhật tiến độ (G8).**
- Runner (`job.mjs:68`) bỏ ép `progressSummary: ''` cho lượt adaptive.
- Bước lưu chấp nhận `progressSummary` và `roadmapChanges` kèm bài trong `explorations`.
- Vẫn không cho `primaryLesson`.

**R3.5. Prompt và runner.**
- `integrations/runner-prompts/plan-request.md`:
  - Thay đoạn `extra_practice` ưu tiên lỗi bằng "làm đúng `adaptive.mode`, `stepRole`, `difficulty`, `targetSkills`".
  - Thêm cách viết `roadmapChanges`, `framework`, và câu cho bài thử, bài xếp chỗ.
- Cập nhật tương tự `deutsch-unhuman.md` cho đường ChatGPT/MCP.
- `integrations/home-runner/job.mjs`: schema ràng buộc theo `roadmapTask`. Ví dụ `extend` cần `roadmapChanges` có ≥ 3 `append`.
- Runner khai báo capability `roadmap-v2`. Hub chỉ đặt `roadmapTask` khi runner có capability này, nếu không giữ hành vi cũ.
- **v3 mặc định:** sổ mới không phải sổ trẻ em mặc định `limits.package=3` nếu chủ dự án đồng ý (mục 5). Giữ chặn bật tay cho sổ legacy.

**Test:**
- `tests/ai-jobs.test.mjs`: áp `roadmapChanges` hợp lệ và từ chối từng trường hợp; `extend` khi cạn bước; `replan` sau R0; framework `custom` thắng.
- `tests/home-runner.test.mjs`: schema theo `roadmapTask` và capability.

### R4 · Nối Knowledge vào lộ trình (migration `0025_knowledge_topics.sql`)

1. **Dùng chung theo chủ đề (G9).**
   - Thêm `knowledge_links.topic_key TEXT`, `knowledge_gaps.topic_key TEXT`, `knowledge_probes.topic_key TEXT`.
   - Backfill từ `subjects.topic_key` của sổ đã gắn.
   - `scoreNotes` khớp `l.subject_id=? OR l.topic_key=?`.
   - Công cụ `hub2_kb_*` nhận `topicKey` thay cho hoặc cùng `subjectId`.
   - `inventory` liệt kê chủ đề, số sổ dùng và bước sắp tới cần nguồn. Chỉ có tiêu đề bước, không có tên hồ sơ.
2. **Truy vấn theo bước (G10).** `contextExcerpt` nhận truy vấn ghép từ:
   - bước đích và 2 bước kế;
   - `objective`;
   - tên kỹ năng đích;
   - `level_label`.

   Giữ trần 4 KB. Context ghi `knowledge.forStepIds`.
3. **Hub tự phát hiện thiếu nguồn (G11).** `lib/roadmap/coverage.ts` `checkCoverage(db, subjectId)`:
   - Gọi sau mỗi lần lưu `roadmapChanges` và trong cron đêm.
   - Với bước `open|practising` và 3 bước `planned` kế: nếu `scoreNotes` (top 1) = 0 thì ghi gap.
     - `origin='plan'`, `topic_key`.
     - `question` dựng từ mẫu cố định + `title`/`objective` của bước.
     - `priority='high'` nếu bước đang mở.
   - Chuỗi phải qua `requirePublicText`. Không qua thì bỏ, ghi log, không gửi.
   - `dedupe_hash` theo `topic_key` + câu hỏi chuẩn hoá. Hai người học Rust sinh một gap.
4. **Khi thiếu nguồn.** Qwen vẫn soạn bài kỹ năng (đã có trong prompt), không soạn bài `reading` cần nguồn. Context ghi `knowledge.missingForStepIds` để prompt nói rõ.
5. **Gap của Qwen.** Giữ `knowledgeGaps` hiện có, gắn thêm `topic_key` và `stepId` nếu có.
6. **Lịch ChatGPT.**
   - Chạy cổng K0 theo `docs/ops/KNOWLEDGE-MAINTAINER.md`: tác vụ thử một lần, gọi được `hub2_kb_inventory` và `hub2_kb_stage` không cần bấm xác nhận.
   - Đạt thì đặt lịch **chủ nhật 02:00 Europe/Berlin**.
   - Prompt `integrations/runner-prompts/knowledge-maintainer.md`:
     - ưu tiên gap `high` của bước đang mở;
     - mỗi chủ đề tối đa 3 nguồn mỗi lượt;
     - ghi probe theo `topicKey`.
   - **Lượt khi cần:** trong cron đêm, nếu có gap `high` mở quá 48 giờ, ghi cờ trong `hub2_kb_inventory`. Lịch ChatGPT không tự thức theo Hub được, nên phần này chỉ dùng được với phương án dự phòng Mac `codex exec` (chạy hằng đêm, chỉ khi có cờ).
   - K0 trượt thì dùng phương án dự phòng hằng tuần.
7. **Test:** `tests/knowledge.test.mjs`:
   - chia sẻ theo `topic_key`;
   - không lộ dữ liệu giữa hồ sơ;
   - coverage ghi gap đúng, gộp trùng;
   - chuỗi có dữ liệu riêng bị bỏ;
   - context chọn ghi chú theo bước.

### R5 · Hiện tiến độ theo bước

1. API `GET /api/subjects/[id]` trả thêm `progress`:
   - `current {stepId,title,levelLabel,status}`;
   - `done [{title,passedVia,passedAt}]`, 10 bước gần nhất;
   - `next [{title,band}]`, 3 bước;
   - `position {index,total}`;
   - `whyNext` (câu từ `reasonCode` + so sánh `band`);
   - `sources [{title,publisher,url}]` của bài hiện tại (đọc từ `knowledge` trong context job đã soạn bài).
2. `app/hub/skill-progress.tsx` và `notebook-report.ts`:
   - Thêm dải "Lộ trình": bước đã qua, đang luyện, sắp tới.
   - Dòng **Đang luyện**, **Đã làm được**, **Bài tới khó hơn vì…**. Ví dụ: "Bạn đã qua bài thử *Ownership*, bài tới sang *Borrowing* (mức 3 → 4)."
   - Nhãn chữ đi kèm màu, theo `DESIGN.md`. Giữ thiết kế giấy kẻ.
3. **Cài đặt sổ** (chỉ người lớn, hoặc người giám hộ với sổ trẻ em):
   - Chọn **Chuẩn học**: danh sách từ `frameworks.ts` + "Yêu cầu riêng" (ô chữ). Đổi chuẩn → `roadmapTask='replan'` ở lượt kế. Bước đã qua giữ nguyên.
   - **Bỏ qua bước** (→ `passed (learner)`) và **Học lại bước** (tạo bài `practice`, không đổi trạng thái).
4. Bài đã học: tag thêm tên bước và vai trò (Học mới / Luyện / Bài thử / Xếp chỗ).
5. **Test:**
   - `tests/notebook-report.test.mjs`, `tests/subjects-api.test.mjs`.
   - Kiểm bằng trình duyệt ở khổ điện thoại và máy tính, chế độ sáng và tối.

### R6 · Kiểm cùng cơ chế trên ba kiểu môn

1. `tests/roadmap-scenarios.test.mjs` dùng SQLite và kết quả Qwen giả lập (fixture JSON, không gọi model):
   - **Deutsch** (`de-cefr`, A2):
     - xếp chỗ qua 2 bước;
     - lỗi `Dativ` xác nhận → luyện;
     - qua bài thử;
     - mở bước mới;
     - cạn bước → `extend`.
   - **Rust** (`rust-core`, mới bắt đầu):
     - hai hồ sơ cùng chủ đề;
     - một nguồn chung;
     - tiến độ riêng;
     - bước "Borrowing" thiếu nguồn → một gap chung.
   - **Toán 7** (`vn-gdpt-2018-toan`, yêu cầu "hình học lớp 7"):
     - `custom` không ghi đè chuẩn khi người học nêu GDPT;
     - `band` tăng theo bước;
     - trần độ khó của sổ trẻ em.
2. Chạy thật trên staging rồi production, với runner `--once`:
   - mở một sổ mới chỉ bằng tên + nội dung;
   - làm chẩn đoán;
   - xin 3 bài;
   - kiểm `roadmap_steps`, `reason_refs`, gap và giao diện.

## 4. Triển khai production (mỗi bước cần chủ dự án đồng ý)

| Bước | Việc |
|---|---|
| 1 | R0: deploy bản sửa. Sao lưu D1. Chạy `repair-roadmaps.mjs` thử trên bản sao, rồi `--apply` |
| 2 | Chuyển runner sang `main`, kiểm `--once` |
| 3 | R1: sao lưu D1, diễn tập `0024` trên bản sao (số dòng, integrity), rồi áp production và deploy |
| 4 | R2 + R3: deploy Hub trước. Runner khai báo `roadmap-v2` sau, để Hub cũ không nhận kết quả mới |
| 5 | R4: `0025` như bước 3. Chạy K0, đặt lịch ChatGPT hoặc phương án dự phòng |
| 6 | R5: deploy giao diện, kiểm trên điện thoại |
| 7 | Theo dõi một tuần, báo cáo số liệu dưới đây |

**Số liệu theo dõi** (mỗi sổ):
- số bước đã qua theo từng đường;
- tỉ lệ đúng lần đầu không gợi ý theo `band`;
- số lượt `none`;
- số gap mở/đóng theo chủ đề;
- thời gian từ lúc bấm đến lúc có bài.

## 5. Chủ dự án cần quyết trước khi code

1. Dạng bài v3 làm mặc định cho sổ mới của người lớn (đề xuất: có, sau khi R6 đạt với Rust).
2. Trần độ khó mặc định cho người lớn là 5 (đề xuất: có).
3. Lịch Knowledge hằng tuần chủ nhật 02:00, cộng lượt khi cần qua Mac nếu có gap ưu tiên cao (đề xuất: có).
4. Người học được tự bỏ qua bước (đề xuất: người lớn có, trẻ em cần người giám hộ).

## 6. Rủi ro

- **Qwen viết bước kém chất lượng.** Hub chặn bằng luật, chỉ cho sửa bước chưa mở. Chủ dự án xem được và chỉnh trong Cài đặt sổ.
- **Bài thử quá dễ, cho nhảy bước sai.** Tiêu chí cố định trong mã, có test. Nếu lỗi xác nhận xuất hiện ở bước đã qua, Hub giao bài luyện ngay.
- **Gộp nguồn theo chủ đề lộ dữ liệu.** Chỉ nguồn công khai và câu hỏi qua `requirePublicText` vào Knowledge. Test riêng cho trường hợp hai hồ sơ.
- **Workers Free CPU/D1.** `progress.ts` dùng dữ liệu đã đọc trong context, thêm tối đa 2 truy vấn mỗi job. Thêm test đếm số truy vấn D1 của một job (bọc `prepare` trong adapter test).
