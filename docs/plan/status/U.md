# U · Bàn giao giao diện

**14/11/2026** · Ảnh U1–U4 đã được chủ dự án duyệt. Các thay đổi đang ở draft PR, đã kiểm local bằng Chrome ở 390 px và 1280 px với dữ liệu demo và `runner:fake`. Staging và production chưa nhận các thay đổi U.

| Bước | Trạng thái | PR và nhánh | Worktree |
|---|---|---|---|
| U1 · Bàn học | Đã duyệt ảnh bàn học với một việc ưu tiên mỗi sổ. | [#145](https://github.com/unhuman1289/learning-hub/pull/145) · `codex/u-desk-lesson-notebook` | `/private/tmp/learning-hub-status-u1` |
| U2 · Bài học | Đã duyệt bản gộp câu ngắn, dành trang riêng cho câu cần nhiều chỗ. | [#146](https://github.com/unhuman1289/learning-hub/pull/146) · `codex/u2-lesson` | `/Users/anhvutran/Code/Learning Hub` |
| U3 · Sổ | Đã duyệt đường học, bài hôm nay, lịch sử gập theo ngày và tấm Cài đặt. | [#148](https://github.com/unhuman1289/learning-hub/pull/148) · `codex/u3-notebook` | `/private/tmp/learning-hub-u3` · worktree dùng để ghi bàn giao |
| U4 · Quản trị | Đã duyệt Cần xem, Gia đình, Knowledge và Hệ thống. | [#149](https://github.com/unhuman1289/learning-hub/pull/149) · `codex/u4-admin` | `/private/tmp/learning-hub-u4` |

Chuỗi PR: U1 từ `codex/hub-next-wip`, U2 từ U1, U3 từ U2 và U4 từ U3.

## Việc còn lại

- **Ngân sách JS bàn học U1:** 187 KB gzip đo local, vượt mục tiêu 180 KB.
- **Bàn phím thật U2:** kiểm nút **Kiểm tra** khi bàn phím mở, thao tác vuốt và nhập ký tự Đức trên Safari iPhone và Chrome Android. Kiểm luồng điều hướng trong Zalo hoặc Messenger.
- **Đo API và tốc độ:** U1 đo local hai API lúc mở bàn, gồm `/api/today` và `/api/ambient`. Đo số lượt gọi khi mở U2–U4 và đối chiếu ngân sách mục 4.2. Đo thời gian đầu cuối trên mạng 4G tại Việt Nam. p75 theo quốc gia trên U4 chờ dữ liệu thật từ P3.
