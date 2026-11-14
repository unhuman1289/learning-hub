# HUB-NEXT · Trạng thái

Cập nhật cuối mỗi luồng làm việc (plan mục 10). Mỗi dòng ngắn, chỉ ghi sự thật đã kiểm.

**Cập nhật ngày 14/11/2026.** Nhánh `codex/hub-next-wip`, [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144).

## Môi trường

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261113-1` (`0625f56`), health `hub2-request-recovery-2026-11-13` | Chưa áp `0026`–`0028`. Còn 4 bài v1 |
| Runner production | `~/Code/learning-hub-prod` tại `prod-20261113-1` | launchd `cc.unhuman.learning-hub-runner.production` |
| Staging | Worker version `70771acb-3c56-4ab8-ab08-e475e4e5efcd` (100% traffic, deploy 13/11 lúc 19:10 Berlin) | Health `ok`, D1 kết nối. Bản deploy từ checkout chưa commit, health vẫn mang nhãn `hub2-adaptive-roadmap-2026-11-12` và metadata không có Git SHA. Snapshot đối chiếu hiện có là `35e8635` (mã ứng dụng đến `4c85759`), chưa xác minh trùng khớp với bản build đang chạy. `0026`–`0028` đã áp theo audit 13/11. |
| Dev chính | `~/Code/Learning Hub` trên `codex/hub-next-wip`, từ `main` sau PR #143 | Đã lưu 89 tệp thay đổi sau khi thay bản plan chưa track bằng bản trên `main`. |

## Các bước

| Bước | Trạng thái | Còn lại |
|---|---|---|
| E1 local | WIP tại `42badfc` | Có `dev-setup`, `fake-runner`, `DEVELOPMENT.md`; còn kiểm trên clone mới |
| E2 phát hành | WIP tại `42badfc` | `release.mjs` chưa xong; health staging chưa hiện commit |
| E3 tách production | **Xong** | Gỡ `work/simpler-notebook-form` sau 24 giờ runner chạy ổn |
| S chuẩn bị | **Xong** | Lưu trữ v1 ở bộ nhớ riêng; `AGENTS.md` đã duyệt và lưu tại `42badfc`; chủ dự án đã cho phép xoá v1 |
| C bỏ ChatGPT soạn/chấm | Trên staging theo audit 13/11; WIP tại `6eeb62d` | Kiểm kết nối Knowledge có đăng nhập; production chờ đồng ý |
| V1–V2 gỡ v1 | Trên staging theo audit 13/11 (API v1 trả 410, `0027` đã áp); WIP tại `ffe4ec4` | Production chờ đồng ý |
| V3 một gói bài | **Bị chặn**, WIP tại `f8c831a` | Qwen soạn Deutsch theo v3 bị Hub từ chối. Làm theo V3 bản 3 (`itemKinds` theo sổ, cổng Q) |
| P điện thoại | WIP tại `4c85759` | Có manifest, `keyboard.ts`, `offline-draft.ts`, tải riêng trang Quản trị; còn `/api/rum`, `/api/today` gom và e2e |
| M mockup | **M1–M4 đã được chủ dự án duyệt ngày 14/11/2026**, [docs/mockups/index.html](../mockups/index.html) tại `35e863517e11a3f050ba7894129707309ca0881d` | Hoàn tất cổng M |
| U1 bàn học | **Chủ dự án đã duyệt ảnh**, [draft PR #145](https://github.com/unhuman1289/learning-hub/pull/145), `codex/u-desk-lesson-notebook` từ `codex/hub-next-wip` | Chrome local 390/1280 px và `runner:fake` đạt; còn kiểm iPhone/Android/WebView thật |
| U2 bài học | **Chủ dự án đã duyệt**, [draft PR #146](https://github.com/unhuman1289/learning-hub/pull/146), `codex/u2-lesson` từ nhánh U1 | Đã gộp các câu ngắn theo góp ý; Chrome 390/1280 px và `runner:fake` đạt |
| U3 sổ | Nhánh `codex/u3-notebook` từ U2 | Chrome 390/1280 px và `runner:fake` đạt; chờ duyệt ảnh |
| U4, L, G, T, K | Chưa bắt đầu | Chờ duyệt U3 |

## Chờ chủ dự án

1. Review U3 và ảnh local.
2. Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.

U1 local: 402 test, typecheck, lint, contracts:check và build đạt. `dev:fresh` áp đến `0028` trong D1 demo mới; `runner:fake` lưu bài `les_58258fd6fe851a0f8ea6` và đọc lại qua `/api/today` và `/api/lessons/{id}`. Chrome kiểm bàn → bài → về bàn, mất mạng và bàn trống.

U1 bàn học gọi 2 API lúc tải (`/api/today` và `/api/ambient`); JS 187.147 byte gzip so với mục tiêu 180 KB. Còn đo tốc độ 4G Việt Nam và nghiệm thu điện thoại thật. Staging và production giữ nguyên.


U2 local: 402 test, typecheck, lint, contracts:check và build đạt. `dev:fresh` áp đến `0028` trong D1 demo riêng. Chrome kiểm bàn → câu chọn → sai lần đầu theo D21 → sửa đúng → nhập ký tự Đức và khôi phục nháp sau mất mạng → câu mở được `runner:fake` chấm → tổng kết → bài tiếp theo.

U2 gộp dữ liệu bài và lịch sử chấm vào một yêu cầu. Thước phút và kệ sổ vẫn có lời gọi riêng; còn ngân sách API, Playwright P4 và kiểm điện thoại thật/WebView. Luyện nghe và gia sư thuộc L/T.

U2 sau góp ý: gộp tối đa ba câu ngắn liền nhau; câu dài hoặc có bảng, hình, mã hay ảnh bài làm có trang riêng. Tài liệu chung mở khi cần; bài đọc hiện nội dung ở đầu. 403 test đạt.


U3 local: 403 test, typecheck, lint và build đạt. D1 demo riêng áp tới `0028`. Chrome kiểm mở sổ từ bàn, đường học và khoảng trống nguồn mẫu, lịch sử theo ngày, mở/đóng cài đặt và đọc lại mục tiêu đã lưu. `runner:fake` lưu bài `les_f36fc2a6750e1ccc2926`, mở lại từ sổ và xác minh ID qua API. Thiết bị thật, WebView và ngân sách API còn chờ.
