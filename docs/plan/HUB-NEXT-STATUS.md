# HUB-NEXT · Trạng thái

Bảng tổng hợp trên `codex/hub-next-wip`, cập nhật khi gộp PR. Chi tiết tiến độ và kết quả kiểm tra nằm trong `docs/plan/status/<bước>.md` trên nhánh của bước đó.

**Cập nhật ngày 14/11/2026.** Nhánh `codex/hub-next-wip`, [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144).

## Môi trường

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261113-1` (`0625f56`), health `hub2-request-recovery-2026-11-13` | Chưa áp `0026`–`0028`. Còn 4 bài v1 |
| Runner production | `~/Code/learning-hub-prod` tại `prod-20261113-1` | launchd `cc.unhuman.learning-hub-runner.production` |
| Staging | `74167349b58331b100e1d71ff60f2720f14dcb6e` · Worker version `60643d54-3980-4fff-ae9b-5d48dd6fd1d6` | Deploy 14/11. Health xác nhận đúng SHA, D1 kết nối. Đã sao lưu và kiểm khôi phục D1 trước khi áp `0029_item_kinds.sql`. |
| Dev chính | `~/Code/Learning Hub` trên `codex/hub-next-wip`, từ `main` sau PR #143 | Đã lưu 89 tệp thay đổi sau khi thay bản plan chưa track bằng bản trên `main`. |

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
| P điện thoại | WIP tại `4c85759` | Có manifest, `keyboard.ts`, `offline-draft.ts`, tải riêng trang Quản trị; còn `/api/rum`, `/api/today` gom và e2e |
| M mockup | **M1–M4 đã được chủ dự án duyệt ngày 14/11/2026** | [Bản mockup đã duyệt](../mockups/index.html) tại `35e8635` |
| U1 bàn học | Đã gộp [#145](https://github.com/unhuman1289/learning-hub/pull/145) | [Kết quả U1](status/U1.md). Kiểm điện thoại |
| U2–U4, L, G, T, K | Chưa gộp | |

**Migration tiếp theo** · P3 đo tốc độ dùng `0030`, L âm thanh dùng `0031`.

## Chờ chủ dự án

- Bạn và Ếch thử staging theo [PHONE-CHECK.md](../ops/PHONE-CHECK.md).
- Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.

Bản V3 + U1 đạt 408 test, typecheck, lint, kiểm schema, Qwen replay offline và build. Staging qua smoke test và runner đọc được schema V3. Kiểm điện thoại thật và chạy job thật trên bản staging này còn chờ.
