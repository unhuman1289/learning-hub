# HUB-NEXT · Trạng thái

Cập nhật cuối mỗi luồng làm việc (plan mục 10). Mỗi dòng ngắn, chỉ ghi sự thật đã kiểm.

**Cập nhật ngày 14/11/2026.** Nền `codex/hub-next-wip`, [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144). V3 tại `codex/v3-item-kinds`, [draft PR #147](https://github.com/unhuman1289/learning-hub/pull/147), cổng Q đo trên `71cc8dd`.

## Môi trường

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261113-1` (`0625f56`), health `hub2-request-recovery-2026-11-13` | Chưa áp `0026`–`0028`. Còn 4 bài v1 |
| Runner production | `~/Code/learning-hub-prod` tại `prod-20261113-1` | launchd `cc.unhuman.learning-hub-runner.production` |
| Staging | Worker version `70771acb-3c56-4ab8-ab08-e475e4e5efcd` (100% traffic, deploy 13/11 lúc 19:10 Berlin) | Health `ok`, D1 kết nối. Bản deploy từ checkout chưa commit, health vẫn mang nhãn `hub2-adaptive-roadmap-2026-11-12` và metadata không có Git SHA. Snapshot đối chiếu hiện có là `35e8635` (mã ứng dụng đến `4c85759`), chưa xác minh trùng khớp với bản build đang chạy. `0026`–`0028` đã áp theo audit 13/11. |
| V3 local | Worktree `work/v3-item-kinds`, Hub demo cổng 5184 | `0028` và `0029` đã áp trên D1 demo; diễn tập SQLite giữ bài, bản nháp và completion. |
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
| V3 một gói bài | **Đạt cổng Q trên local** | Đã triển khai `itemKinds`, lưu mới v3 và replay. Deutsch, Rust và Toán 7 đều 5/5. Chờ review và kiểm staging. |
| P điện thoại | WIP tại `4c85759` | Có manifest, `keyboard.ts`, `offline-draft.ts`, tải riêng trang Quản trị; còn `/api/rum`, `/api/today` gom và e2e |
| M mockup | Bản đầu tại `35e8635` | **Chờ chủ dự án duyệt M1–M4 hoặc gửi danh sách sửa** |
| U, L, G, T, K | Chưa bắt đầu | U bắt đầu ngay khi M được duyệt |

## Chờ chủ dự án

1. Duyệt mockup M1–M4.
2. Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.

3. Review [draft PR V3 #147](https://github.com/unhuman1289/learning-hub/pull/147).

## Cổng Q local

Qwen `qwen/qwen3.6-35b-a3b` soạn 15 bài xếp chỗ trên cùng commit `71cc8dd`, từ `dev:fresh`, tối đa hai job mỗi đợt. Đọc lại từng ID từ API job và API bài học. Hồ sơ demo dùng mục tiêu 720 phút để bài mẫu đang mở không làm chạm giới hạn phút.

| Sổ | Lưu ngay | Lưu sau một lần sửa | Đã đọc lại |
|---|---:|---:|---:|
| Deutsch | 4 | 1 | 5/5 |
| Rust | 5 | 0 | 5/5 |
| Toán 7 | 0 | 5 | 5/5 |

Cả 5 job Toán và 1 job Deutsch cần sửa `numeric.value` sai định dạng. Replay offline xác nhận fixture Toán có đáp án chữ dài được chuyển sang rubric, giữ đề và lời giải mẫu.

<details>
<summary>ID bài đã đọc lại</summary>

- Deutsch · `les_a08ec00c34e6c6f188bc`, `les_7df4f2b751489a606863`, `les_288de0608b09a52b5c7e`, `les_86b7af9e9c5b31bdc647`, `les_ba3966b1bbca754a0412`
- Rust · `les_adbcb63ded6d9bdc4fee`, `les_91833cfdcf7e54cadcbe`, `les_889ec63e75864069da5e`, `les_2973da2cca5260fa8cc3`, `les_2252014abddd9b78cc5b`
- Toán 7 · `les_cc3302a97125c0aaf213`, `les_fdea8ffcccb0526e95a5`, `les_37b518674eaa3b69e379`, `les_cc0c757c92462d6b975a`, `les_5a68c8d601d7bfc39902`

</details>

Local đạt 405 test, typecheck, lint, contracts:check, build và replay 9 fixture. Safari iPhone và Chrome Android trên máy thật chưa kiểm. Chưa triển khai thay đổi V3 bản 3 lên staging hay production.
