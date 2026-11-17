# HUB-NEXT · Trạng thái

Bảng tổng hợp trên `codex/hub-next-wip`, cập nhật khi gộp PR. Chi tiết tiến độ và kết quả kiểm tra nằm trong `docs/plan/status/<bước>.md` trên nhánh của bước đó.

**Cập nhật ngày 17/11/2026.** Nhánh `codex/hub-next-wip`, [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144).

## Môi trường

Mục tiêu là các luồng AI trên staging dùng OpenAI API và bỏ phụ thuộc Qwen local theo [quyết định 16/11](HUB-NEXT.md#quyết-định-16112026--openai-api-và-chấm-cuối-bài). Queue OpenAI và chế độ nộp cả bài hiện mới bật cho sổ demo người lớn **QA H5 Deutsch**. Bài nghe còn cần nối TTS vào luồng API.

Khung staging L1 và P3 (migration `0030`) đã kết thúc lúc 02:50 Europe/Berlin.
Khung kiểm thử OpenAI và nộp cả bài ngày 16/11 đã kết thúc lúc 05:00 Europe/Berlin.
Khung deploy #169 và #170 ngày 16/11 đã đóng sau khi xác nhận staging lúc 05:02 Europe/Berlin.

Khung sửa và nghiệm thu **Chấm sai?** trên QA H5 Deutsch đã đóng sau khi đọc lại quyết định Terra và điểm lưu ngày 16/11.

Khung L4 đã đóng sau lượt Cổng Q ngày 16/11. Đã khôi phục danh sách bật OpenAI trước thử và xác nhận smoke staging đạt.

Khung #174 đã đóng sau lượt chẩn đoán Cổng Q ngày 17/11. Đã khôi phục danh sách bật OpenAI trước thử và xác nhận smoke staging đạt.

Chỉ deploy staging từ `codex/hub-next-wip`. Trước khi deploy, ghi một dòng theo mẫu `staging: <luồng>, đến <giờ> Europe/Berlin`. Trong khung đã ghi, luồng khác hỏi chủ dự án trước khi deploy.

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261113-1` (`0625f56`), health `hub2-request-recovery-2026-11-13` | Chưa áp `0026`–`0028`. Còn 4 bài v1 |
| Runner production | `~/Code/learning-hub-prod` tại `prod-20261113-1` | launchd `cc.unhuman.learning-hub-runner.production` |
| Staging | `e8221b073660d60c9dcee4afdf8ceda5d326d203` | [Deploy #174 ngày 17/11 lúc 07:01 Berlin](https://github.com/unhuman1289/learning-hub/actions/runs/44027908662). Hub và MCP cùng SHA, D1 kết nối, smoke đạt cả sau khi khôi phục cấu hình QA. Không có migration chờ. |
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
| P3 đo tốc độ | Đạt trên Safari iPhone thật. Quản trị → Hệ thống khớp D1 ngày 16/11 Berlin cho `DE / phone / first_question`, 4 lượt, p75 824 ms. [#171](https://github.com/unhuman1289/learning-hub/pull/171) đã gộp [biên bản](status/P3-rum.md). | Gắn `audio_play` và `tutor_first_token` khi nghiệm thu L6/T5. |
| M mockup | **M1–M4 đã được chủ dự án duyệt ngày 14/11/2026** | [Bản mockup đã duyệt](../mockups/index.html) tại `35e8635` |
| U1 bàn học | Đã gộp [#145](https://github.com/unhuman1289/learning-hub/pull/145) | [Kết quả U1](status/U1.md). Kiểm điện thoại |
| U2–U4 | Đã gộp [#146](https://github.com/unhuman1289/learning-hub/pull/146), [#148](https://github.com/unhuman1289/learning-hub/pull/148), [#149](https://github.com/unhuman1289/learning-hub/pull/149) và deploy staging | [Bàn giao U](status/U.md). Chờ kiểm điện thoại, e2e và ngân sách mục 4.2. |
| Q2 mở sổ | Đã gộp [#154](https://github.com/unhuman1289/learning-hub/pull/154), deploy staging | [Kết quả Q2](status/Q2.md). Bước 9 PHONE-CHECK đạt trên staging |
| U5 tốc độ | Đã gộp [#153](https://github.com/unhuman1289/learning-hub/pull/153), deploy staging | E2E CI đạt sau khi test chờ trang lật xong (`0536c21`). PHONE-CHECK bước 8–9 đạt trên staging. Chủ dự án bỏ qua thử thiết bị thật |
| U6 mép sổ | [#160](https://github.com/unhuman1289/learning-hub/pull/160), [#161](https://github.com/unhuman1289/learning-hub/pull/161) và #169 đã lên staging. Bản ghép local `808fb91` đạt 6/6 e2e. CI sau khi gộp cũng không ghi nhận tác vụ dài trong hai lần lật ở CPU chậm 4×. | Biên bản U6 ở commit local `639186a`. Năm tệp sửa thử được giữ riêng. Chủ dự án còn duyệt trên iPhone thật. |
| Ngân sách bàn học | [#166](https://github.com/unhuman1289/learning-hub/pull/166) và [#169](https://github.com/unhuman1289/learning-hub/pull/169) đã gộp và deploy. CI sau khi gộp đo 176.993 B gzip trên iPhone 13 và Pixel 7 giả lập, ngưỡng 180.000 B. | [Kết quả CI](https://github.com/unhuman1289/learning-hub/actions/runs/43797525717). |
| L1–L4 | L1 [#158](https://github.com/unhuman1289/learning-hub/pull/158), L2 [#164](https://github.com/unhuman1289/learning-hub/pull/164) và L3 [#167](https://github.com/unhuman1289/learning-hub/pull/167) đã gộp. L4 [#173](https://github.com/unhuman1289/learning-hub/pull/173) và chẩn đoán [#174](https://github.com/unhuman1289/learning-hub/pull/174) đã lên staging. Cổng Q **chưa đạt**. Job mới `job_270ea5f60cb745919924` thất bại sau một lượt thuê vì Speech API trả HTTP 401, với 0 bài và 0 tệp audio đã lưu. | Xác minh quyền gọi Speech của key thuộc project OpenAI staging trước lượt thử khác. [Biên bản L4](status/L4.md) ghi đường dẫn trường và bằng chứng. |
| L5–L6 | L5 [#172](https://github.com/unhuman1289/learning-hub/pull/172) đã gộp. [Biên bản local](status/L5.md) ghi 8/8 ca qua Worker/D1/R2 với API nghe thật. Bàn học đạt 176.805 B gzip trên hai cấu hình giả lập. | L6 chờ L4. Dùng bài nghe đã lưu qua API để thử loa, im lặng, Bluetooth và Zalo trên máy thật. |
| G | G1 [#162](https://github.com/unhuman1289/learning-hub/pull/162) và G2 [#157](https://github.com/unhuman1289/learning-hub/pull/157) đã lên staging. | G2 còn kiểm lời phê bài ảnh trên máy thật. Còn G3 hiệu chuẩn và G4 xử lý điểm khi chấm lại. |
| T | T0 đạt trên local. T1 [#168](https://github.com/unhuman1289/learning-hub/pull/168) đang mở. | Nối ghi `hint1` sau L3. T2 còn kiểm WebSocket qua Access. Sau đó làm T3–T5. |
| K | K1 [#156](https://github.com/unhuman1289/learning-hub/pull/156) đã lên staging cùng SHA với Hub. | K2 còn xác nhận OAuth staging đủ 11 công cụ và lịch riêng. K3 kiểm kết quả lượt đầu. |

**Migration tiếp theo.** [#168](https://github.com/unhuman1289/learning-hub/pull/168) đề xuất dùng `0032` cho T1 và chuyển G3 sang `0033`. Xác nhận thứ tự khi gộp. Phạm vi LGTK chỉ đến staging.

## Chờ chủ dự án

- Bạn và Ếch thử staging theo [PHONE-CHECK.md](../ops/PHONE-CHECK.md).
- Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.

Mỗi merge U2–U4 đạt 409 test, typecheck, lint, contracts:check, build và Qwen replay offline. Commit staging giữ bản sửa đăng nhập `lib/auth/runtime.ts` từ `codex/phone-fixes`. Chờ thử điện thoại thật và chạy job thật trên bản staging này.

## OpenAI staging · nghiệm thu 16/11/2026

- Hub và MCP staging đã được đọc lại ở commit `ffd86264015d1431f73360d74973100145a375c0`. D1 kết nối. Đã sao lưu staging trước migration `0031_listening.sql`. Smoke trong workflow gặp `ECONNRESET` sau khi hai Worker đã deploy. Chạy lại smoke từ máy đạt.
- Luna đã chấm và đọc lại lượt nộp demo `subm_95f513a5a67e7daf42d1` gồm 8 câu. Đã ghi gợi ý và tính 0 điểm cho câu ngắn đã xem đáp án. Gửi lại cùng mã nộp chỉ trả một lượt. Terra đã soạn và đọc lại bài `les_3d6e2b7eec96b6e65c9b` ở chế độ nộp cả bài. D1 ghi cả hai job thành công với đúng model và đã lưu số token. Kiểm thử local đạt 444/444.
- Terra đã chấm lại một câu trong **QA H5 Deutsch** qua giao diện staging, giữ nguyên điểm và lưu lời giải thích. Còn xác nhận lượt giao lúc 00:00 Berlin và thao tác trên điện thoại thật. Số tiền trừ credit cần đối chiếu với OpenAI Usage. Xem [biên bản](../ops/QA-H5-OPENAI-ACCEPTANCE.md).
