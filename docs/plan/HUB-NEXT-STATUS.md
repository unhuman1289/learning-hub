# HUB-NEXT · Trạng thái

Cập nhật cuối mỗi luồng làm việc (plan mục 10). Mỗi dòng ngắn, chỉ ghi sự thật đã kiểm.

**Cập nhật ngày 14/11/2026.** Nền `codex/hub-next-wip`, [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144). V3 làm tại `codex/v3-item-kinds`, commit mã `e993ae1`; PR V3 chờ xác nhận đích push.

## Môi trường

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261113-1` (`0625f56`), health `hub2-request-recovery-2026-11-13` | Chưa áp `0026`–`0028`. Còn 4 bài v1 |
| Runner production | `~/Code/learning-hub-prod` tại `prod-20261113-1` | launchd `cc.unhuman.learning-hub-runner.production` |
| Staging | Worker version `70771acb-3c56-4ab8-ab08-e475e4e5efcd` (100% traffic, deploy 13/11 lúc 19:10 Berlin) | Health `ok`, D1 kết nối. Bản deploy từ checkout chưa commit, health vẫn mang nhãn `hub2-adaptive-roadmap-2026-11-12` và metadata không có Git SHA. Snapshot đối chiếu hiện có là `35e8635` (mã ứng dụng đến `4c85759`), chưa xác minh trùng khớp với bản build đang chạy. `0026`–`0028` đã áp theo audit 13/11. |
| V3 local | Worktree `work/v3-item-kinds`, Hub demo cổng 5183 | `0028` và `0029` đã áp trên D1 demo; diễn tập SQLite giữ bài, bản nháp và completion. |
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
| V3 một gói bài | **Cổng Q chưa đạt sau 3 vòng** | Đã triển khai `itemKinds`, lưu mới v3 và replay. Vòng 3 lưu Deutsch 2/2, Rust 2/2, Toán 7 1/2; Toán còn lỗi nhiều đáp án text dài sau một lần sửa. |
| P điện thoại | WIP tại `4c85759` | Có manifest, `keyboard.ts`, `offline-draft.ts`, tải riêng trang Quản trị; còn `/api/rum`, `/api/today` gom và e2e |
| M mockup | Bản đầu tại `35e8635` | **Chờ chủ dự án duyệt M1–M4 hoặc gửi danh sách sửa** |
| U, L, G, T, K | Chưa bắt đầu | U bắt đầu ngay khi M được duyệt |

## Chờ chủ dự án

1. Duyệt mockup M1–M4.
2. Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.

3. Xác nhận đích push `unhuman1289/learning-hub` để mở PR V3. Hệ thống duyệt tự động đã chặn lệnh push vì chưa xác nhận đích nhận mã nguồn.

## Cổng Q local

Qwen `qwen/qwen3.6-35b-a3b`, bài xếp chỗ từ các sổ demo trên `dev:fresh`. Đã đọc lại ID bài qua API job và API bài học. Dừng ở vòng 3 trước khi đủ 5 mẫu mỗi sổ.

| Vòng | Deutsch | Rust | Toán 7 |
|---|---|---|---|
| 1 | 1/2, một job vướng giới hạn phút của hồ sơ demo | 0/1, lệch số ô và đáp án cloze | 1/1 |
| 2 | — | 2/2, một bài qua sau một lần sửa bước tiên quyết | — |
| 3 | 2/2 | 2/2 | 1/2, lỗi `/items/1/key/accepted` sau một lần sửa |

Hướng tiếp theo để chủ dự án chọn: giới hạn đáp án text tự sinh còn một giá trị khi chẩn đoán Toán; ưu tiên đáp số numeric cho câu tính; hoặc cho lượt sửa đổi câu trả lời mở sang rubric nếu sổ cho phép.

Local đạt 404 test, typecheck, lint, contracts:check, build và replay 9 fixture. Chrome đã kiểm lưu Cài đặt sổ ở 1280 và 390 px và mở bài Deutsch ở 390 px. Safari iPhone và Chrome Android trên máy thật chưa kiểm. Staging và production giữ các bản ghi ở trên.
