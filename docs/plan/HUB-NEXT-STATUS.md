# HUB-NEXT · Trạng thái

Bảng tổng hợp trên `codex/hub-next-wip`, cập nhật khi gộp PR. Chi tiết tiến độ và kết quả kiểm tra nằm trong `docs/plan/status/<bước>.md` trên nhánh của bước đó.

**Cập nhật ngày 16/11/2026.** Nhánh `codex/hub-next-wip`, [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144).

## Môi trường

staging: thử runner OpenAI và nộp cả bài, đến 05:00 Europe/Berlin

Staging có Queue consumer OpenAI và chế độ nộp cả bài theo [quyết định 16/11](HUB-NEXT.md#quyết-định-16112026--openai-api-và-chấm-cuối-bài). Danh sách sổ dùng OpenAI mặc định trống. Lượt thử trực tiếp dùng sổ demo văn bản người lớn. Nghiệm thu model cần kết quả bài và lời phê đã lưu.

Khung staging L1 và P3 (migration `0030`) đã kết thúc lúc 02:50 Europe/Berlin.

Chỉ deploy staging từ `codex/hub-next-wip`. Trước khi deploy, ghi một dòng theo mẫu `staging: <luồng>, đến <giờ> Europe/Berlin`. Trong khung đã ghi, luồng khác hỏi chủ dự án trước khi deploy.

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261113-1` (`0625f56`), health `hub2-request-recovery-2026-11-13` | Chưa áp `0026`–`0028`. Còn 4 bài v1 |
| Runner production | `~/Code/learning-hub-prod` tại `prod-20261113-1` | launchd `cc.unhuman.learning-hub-runner.production` |
| Staging | `2bbcd3f480769aa353e0a4e7fbd4cefc6bd20975` | [Deploy 16/11 lúc 04:02 Berlin](https://github.com/unhuman1289/learning-hub/actions/runs/43795513273). Hub và MCP cùng SHA, D1 kết nối, smoke test đạt. Đã áp `0030_perf.sql` và [`0031_listening.sql`](https://github.com/unhuman1289/learning-hub/actions/runs/43794102258). Lượt deploy thành công không còn migration chờ. |
| Dev | `work/learning-hub-hub-next` | Worktree nhánh tích hợp `codex/hub-next-wip`. Mỗi bước dùng nhánh và worktree riêng. |

## Các bước

| Bước | Trạng thái | Còn lại |
|---|---|---|
| E1 local | WIP tại `42badfc` | Có `dev-setup`, `fake-runner`, `DEVELOPMENT.md`; còn kiểm trên clone mới |
| E2 phát hành | Staging đã xác nhận SHA | [Kiểm tra E2](status/E2.md). Production hiện SHA sau lần phát hành có E2 |
| E3 tách production | **Xong** | Gỡ `work/simpler-notebook-form` sau 24 giờ runner chạy ổn |
| S chuẩn bị | **Xong** | Lưu trữ v1 ở bộ nhớ riêng; `AGENTS.md` đã duyệt và lưu tại `42badfc`; chủ dự án đã cho phép xoá v1 |
| C bỏ ChatGPT soạn/chấm | Trên staging theo audit 13/11; WIP tại `6eeb62d` | Kiểm kết nối Knowledge có đăng nhập; production chờ đồng ý |
| V1–V2 gỡ v1 | Trên staging theo audit 13/11 (API v1 trả 410, `0027` đã áp); WIP tại `ffe4ec4` | Production chờ đồng ý |
| V3 một gói bài | Đã gộp [#147](https://github.com/unhuman1289/learning-hub/pull/147), đạt cổng Q local | [Kết quả V3](status/V3.md). Staging đã deploy. Chờ kiểm điện thoại |
| P điện thoại | Có manifest, hỗ trợ bàn phím, nháp offline, `/api/today` gom và Playwright | [#165](https://github.com/unhuman1289/learning-hub/pull/165) đã sửa PHONE-CHECK ở local và đã lên staging. Còn chạy lại trên staging theo [PHONE-CHECK](status/PHONE.md). |
| P3 đo tốc độ | [#159](https://github.com/unhuman1289/learning-hub/pull/159) đã gộp và lên staging với `0030` | Xác nhận PHONE-CHECK bước 3 tạo mẫu `first_question` có mã quốc gia thật trong `perf_daily`, và số liệu hiện ở Quản trị → Hệ thống. Gắn phép đo phát âm thanh và chữ đầu gia sư ở L6/T5. |
| M mockup | **M1–M4 đã được chủ dự án duyệt ngày 14/11/2026** | [Bản mockup đã duyệt](../mockups/index.html) tại `35e8635` |
| U1 bàn học | Đã gộp [#145](https://github.com/unhuman1289/learning-hub/pull/145) | [Kết quả U1](status/U1.md). Kiểm điện thoại |
| U2–U4 | Đã gộp [#146](https://github.com/unhuman1289/learning-hub/pull/146), [#148](https://github.com/unhuman1289/learning-hub/pull/148), [#149](https://github.com/unhuman1289/learning-hub/pull/149) và deploy staging | [Bàn giao U](status/U.md). Chờ kiểm điện thoại, e2e và ngân sách mục 4.2. |
| Q2 mở sổ | Đã gộp [#154](https://github.com/unhuman1289/learning-hub/pull/154), deploy staging | [Kết quả Q2](status/Q2.md). Bước 9 PHONE-CHECK đạt trên staging |
| U5 tốc độ | Đã gộp [#153](https://github.com/unhuman1289/learning-hub/pull/153), deploy staging | E2E CI đạt sau khi test chờ trang lật xong (`0536c21`). PHONE-CHECK bước 8–9 đạt trên staging. Chủ dự án bỏ qua thử thiết bị thật |
| U6 mép sổ | Đã gộp [#160](https://github.com/unhuman1289/learning-hub/pull/160), [#161](https://github.com/unhuman1289/learning-hub/pull/161) và deploy staging | So sánh bản tích hợp sau [#169](https://github.com/unhuman1289/learning-hub/pull/169) với các sửa đổi cục bộ của `codex/u6-turn-long-task`. Xác nhận lật trang ≤ 50 ms ở CPU chậm 4× và xin chủ dự án duyệt trên iPhone thật. |
| Ngân sách bàn học | [#166](https://github.com/unhuman1289/learning-hub/pull/166) đã gộp. [#169](https://github.com/unhuman1289/learning-hub/pull/169) đang mở và đo 176.991 B gzip trên cả iPhone 13 lẫn Pixel 7 giả lập ([CI](https://github.com/unhuman1289/learning-hub/actions/runs/43694103205)) | Duyệt #169. Đo lại trên nhánh tích hợp với ngưỡng 180.000 B. |
| L1–L4 | L1 [#158](https://github.com/unhuman1289/learning-hub/pull/158) và L2 [#164](https://github.com/unhuman1289/learning-hub/pull/164) đã lên staging. L3 [#167](https://github.com/unhuman1289/learning-hub/pull/167) đang mở. | Xử lý xung đột và [lỗi ghi hỗ trợ khi nộp trong lúc phát](https://github.com/unhuman1289/learning-hub/pull/167#discussion_r4576736798), chạy lại CI rồi làm L4. |
| L5–L6 | L5 [#163](https://github.com/unhuman1289/learning-hub/pull/163) đã gộp, có ảnh 390 px và đạt e2e giao diện trên fixture. | Chạy lại luồng L5 với L2/L3 đã tích hợp. L6 chờ L4 và P3, dùng bài Deutsch đã lưu để kiểm hai giọng và PHONE-CHECK bước 10 trên máy thật. |
| G | G1 [#162](https://github.com/unhuman1289/learning-hub/pull/162) và G2 [#157](https://github.com/unhuman1289/learning-hub/pull/157) đã lên staging. | G2 còn kiểm lời phê bài ảnh trên máy thật. Còn G3 hiệu chuẩn và G4 xử lý điểm khi chấm lại. |
| T | T0 đạt trên local. T1 [#168](https://github.com/unhuman1289/learning-hub/pull/168) đang mở. | Nối ghi `hint1` sau L3. T2 còn kiểm WebSocket qua Access. Sau đó làm T3–T5. |
| K | K1 [#156](https://github.com/unhuman1289/learning-hub/pull/156) đã lên staging cùng SHA với Hub. | K2 còn xác nhận OAuth staging đủ 11 công cụ và lịch riêng. K3 kiểm kết quả lượt đầu. |

**Migration tiếp theo.** [#168](https://github.com/unhuman1289/learning-hub/pull/168) đề xuất dùng `0032` cho T1 và chuyển G3 sang `0033`. Xác nhận thứ tự khi gộp. Phạm vi LGTK chỉ đến staging.

## Chờ chủ dự án

- Bạn và Ếch thử staging theo [PHONE-CHECK.md](../ops/PHONE-CHECK.md).
- Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.

Mỗi merge U2–U4 đạt 409 test, typecheck, lint, contracts:check, build và Qwen replay offline. Commit staging giữ bản sửa đăng nhập `lib/auth/runtime.ts` từ `codex/phone-fixes`. Chờ thử điện thoại thật và chạy job thật trên bản staging này.
