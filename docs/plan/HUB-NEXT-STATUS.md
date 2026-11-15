# HUB-NEXT · Trạng thái

Bảng tổng hợp trên `codex/hub-next-wip`, cập nhật khi gộp PR. Chi tiết tiến độ và kết quả kiểm tra nằm trong `docs/plan/status/<bước>.md` trên nhánh của bước đó.

**Cập nhật ngày 15/11/2026.** Nhánh `codex/hub-next-wip`, [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144).

## Môi trường

Khung staging L1 và P3 (migration `0030`) đã kết thúc lúc 02:50 Europe/Berlin.

Chỉ deploy staging từ `codex/hub-next-wip`. Trước khi deploy, ghi một dòng theo mẫu `staging: <luồng>, đến <giờ> Europe/Berlin`. Trong khung đã ghi, luồng khác hỏi chủ dự án trước khi deploy.

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261113-1` (`0625f56`), health `hub2-request-recovery-2026-11-13` | Chưa áp `0026`–`0028`. Còn 4 bài v1 |
| Runner production | `~/Code/learning-hub-prod` tại `prod-20261113-1` | launchd `cc.unhuman.learning-hub-runner.production` |
| Staging | `1e85ffdf921fda9799cd0e266eb1c9abf3e68f7c` | Deploy 15/11 lúc 02:50 Berlin từ `codex/hub-next-wip` sau khi gộp #158 (L1) và #159 (P3). Đã sao lưu D1 staging trước, rồi áp `0030_perf.sql`; không còn migration chờ. Hub và MCP cùng SHA, health đúng SHA, D1 kết nối, smoke test đạt. PHONE-CHECK bước 3–7 đang lỗi từ U6, chờ sửa. Xem [PHONE-CHECK](status/PHONE.md). |
| Dev chính | `~/Code/Learning Hub` trên `codex/u2-lesson` | Nhánh tích hợp `codex/hub-next-wip` ở `work/learning-hub-hub-next`. Worktree U3 ở `work/learning-hub-u3`. |

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
| Q2 mở sổ | Đã gộp [#154](https://github.com/unhuman1289/learning-hub/pull/154), deploy staging | [Kết quả Q2](status/Q2.md). Bước 9 PHONE-CHECK đạt trên staging |
| U5 tốc độ | Đã gộp [#153](https://github.com/unhuman1289/learning-hub/pull/153), deploy staging | E2E CI đạt sau khi test chờ trang lật xong (`0536c21`). PHONE-CHECK bước 8–9 đạt trên staging. Chủ dự án bỏ qua thử thiết bị thật |
| U6 lật trang | Trong [LGTK.md](LGTK.md) mục 3a | Bỏ nút lật, dùng mép sổ cong; hiệu ứng như giấy cong. Làm trước, song song với P3-rum |
| U6 mép sổ | Đã gộp [#160](https://github.com/unhuman1289/learning-hub/pull/160), [#161](https://github.com/unhuman1289/learning-hub/pull/161) (hai tờ cùng khung, góc trên), deploy staging | Chờ chủ dự án thử cảm giác lật trên iPhone |
| L, G, T, K | Plan chi tiết [LGTK.md](LGTK.md) ngày 14/11; chỉ lên staging | Bắt đầu bằng U6, P3-rum, K1 và L1 song song. Đã quyết giọng, đáp án chuẩn, gia sư cho trẻ em, lịch ChatGPT; còn chờ ở LGTK mục 8 |

**Migration tiếp theo** · P3 đo tốc độ dùng `0030`, L âm thanh dùng `0031`, G hiệu chuẩn dùng `0032`, T gia sư dùng `0033`. Cả bốn chỉ áp trên staging.

## Chờ chủ dự án

- Bạn và Ếch thử staging theo [PHONE-CHECK.md](../ops/PHONE-CHECK.md).
- Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.

Mỗi merge U2–U4 đạt 409 test, typecheck, lint, contracts:check, build và Qwen replay offline. Commit staging giữ bản sửa đăng nhập `lib/auth/runtime.ts` từ `codex/phone-fixes`. Chờ thử điện thoại thật và chạy job thật trên bản staging này.
