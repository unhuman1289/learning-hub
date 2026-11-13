# HUB-NEXT · Trạng thái

Cập nhật cuối mỗi luồng làm việc (plan mục 10). Mỗi dòng ngắn, chỉ ghi sự thật đã kiểm.

**Cập nhật:** 13/11/2026 23:45 (Claude, audit phiên Codex).

## Môi trường

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261113-1` (`0625f56`), health `hub2-request-recovery-2026-11-13` | Chưa áp `0026`–`0028`. Còn 4 bài v1 |
| Runner production | `~/Code/learning-hub-prod` tại `prod-20261113-1` | launchd `cc.unhuman.learning-hub-runner.production` |
| Staging | **code chưa commit** từ `~/Code/Learning Hub` (health vẫn báo nhãn cũ `hub2-adaptive-roadmap-2026-11-12`) | Đã áp `0026`, `0027`, `0028` |
| Dev chính | `~/Code/Learning Hub` trên `main` (`03902ed`) + 65 tệp sửa, 18 tệp mới **chưa commit** | Cần chuyển sang nhánh `codex/hub-next-wip` |

## Các bước

| Bước | Trạng thái | Còn lại |
|---|---|---|
| E1 local | Dở (chưa commit) | `dev-setup`, `fake-runner`, `DEVELOPMENT.md` đã có; cần commit và kiểm trên clone mới |
| E2 phát hành | Dở | `release.mjs` chưa xong; health staging chưa hiện commit |
| E3 tách production | **Xong** | Gỡ `work/simpler-notebook-form` sau 24 giờ runner chạy ổn |
| S chuẩn bị | **Xong** | Lưu trữ v1 ở `private-data/release-20261113/`; `AGENTS.md` đã duyệt (chưa commit); chủ dự án đã cho phép xoá v1 |
| C bỏ ChatGPT soạn/chấm | Trên staging | Kiểm kết nối Knowledge có đăng nhập; production chờ đồng ý |
| V1–V2 gỡ v1 | Trên staging (API v1 trả 410, `0027` đã áp) | Production chờ đồng ý |
| V3 một gói bài | **Bị chặn** | Qwen soạn Deutsch theo v3 bị Hub từ chối. Làm theo V3 bản 3 (`itemKinds` theo sổ, cổng Q) |
| P điện thoại | Dở (chưa commit) | Đã có manifest, `keyboard.ts`, `offline-draft.ts`, tách trang Quản trị; còn `/api/rum`, `/api/today` gom, e2e |
| M mockup | Bản đầu trong `docs/mockups/` | **Chờ chủ dự án: "Duyệt M1–M4" hoặc danh sách sửa** |
| U, L, G, T, K | Chưa bắt đầu | U bắt đầu ngay khi M được duyệt |

## Chờ chủ dự án

1. Duyệt mockup M1–M4.
2. Merge PR #143 (plan bản 3) để Codex đọc plan từ `main`.
