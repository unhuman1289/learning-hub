# HUB-NEXT · Trạng thái

Bảng tổng hợp trên `codex/hub-next-wip`, cập nhật khi gộp PR. Chi tiết tiến độ và kết quả kiểm tra nằm trong `docs/plan/status/<bước>.md` trên nhánh của bước đó.

**Cập nhật ngày 14/11/2026.** Nhánh `codex/hub-next-wip`, [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144).

## Môi trường

staging: PHONE-CHECK, đến 18:19 Europe/Berlin

Chỉ deploy staging từ `codex/hub-next-wip`. Trong thời gian ghi trên, luồng khác hỏi chủ dự án trước khi deploy.

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261113-1` (`0625f56`), health `hub2-request-recovery-2026-11-13` | Chưa áp `0026`–`0028`. Còn 4 bài v1 |
| Runner production | `~/Code/learning-hub-prod` tại `prod-20261113-1` | launchd `cc.unhuman.learning-hub-runner.production` |
| Staging | `1881dfe88e04b07ec9e6d029191569e5f7acf7b8` · Worker version `9a772a96-482b-43d7-a226-bf89b464113e` | Deploy hiệu ứng lật trang 14/11. Health đúng SHA, D1 kết nối, smoke test đạt. Đã sao lưu D1 trước deploy, không có migration chờ áp (`0029` đã áp). |
| Dev chính | `~/Code/Learning Hub` trên `codex/u2-lesson` | Nhánh tích hợp `codex/hub-next-wip` ở `/private/tmp/learning-hub-e2`. Worktree U3 ở `work/learning-hub-u3`. |

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
| U2–U4 | Đã gộp [#146](https://github.com/unhuman1289/learning-hub/pull/146), [#148](https://github.com/unhuman1289/learning-hub/pull/148), [#149](https://github.com/unhuman1289/learning-hub/pull/149) và deploy staging | [Bàn giao U](status/U.md). Chờ kiểm điện thoại, e2e và ngân sách mục 4.2. |
| L, G, T, K | Chưa gộp | |

**Migration tiếp theo** · P3 đo tốc độ dùng `0030`, L âm thanh dùng `0031`.

## Chờ chủ dự án

- Bạn và Ếch thử staging theo [PHONE-CHECK.md](../ops/PHONE-CHECK.md).
- Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.

Mỗi merge U2–U4 đạt 409 test, typecheck, lint, contracts:check, build và Qwen replay offline. Commit staging giữ bản sửa đăng nhập `lib/auth/runtime.ts` từ `codex/phone-fixes`. Chờ thử điện thoại thật và chạy job thật trên bản staging này.
