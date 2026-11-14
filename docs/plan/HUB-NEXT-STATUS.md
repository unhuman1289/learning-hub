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
| M mockup | **M1–M4 đã duyệt** · [docs/mockups/index.html](../mockups/index.html) tại `35e863517e11a3f050ba7894129707309ca0881d` | Hoàn tất cổng M |
| U1 bàn học | Đã duyệt ảnh · [draft PR #145](https://github.com/unhuman1289/learning-hub/pull/145) | Còn kiểm thiết bị thật và ngân sách tải |
| U2 bài học | Đã duyệt ảnh · [STATUS U2](status/U2.md) | Còn kiểm thiết bị thật |
| U3 sổ | [STATUS U3](status/U3.md) · [draft PR #148](https://github.com/unhuman1289/learning-hub/pull/148) | Đã duyệt ảnh; còn kiểm thiết bị thật |
| U4 quản trị | [STATUS U4](status/U4.md) | Đã duyệt ảnh; còn kiểm thiết bị thật, p75 chờ P3 |
| L, G, T, K | Chưa bắt đầu | |

## Chờ chủ dự án

1. Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.

Kiểm tra local đạt 402 test, typecheck, lint, contracts:check và build. Chưa kiểm điện thoại thật hoặc e2e. Lượt này không chạy Qwen, deploy hay áp migration.
