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

## U5 · Tốc độ và e2e

Nhánh `codex/u5-speed` tách từ `4ea2cc0` sau khi #152 gộp. Đo với build local dùng Vinext 1.4.5, hồ sơ demo và Chromium 390 px. JS là tổng gzip của từng chunk được yêu cầu khi màn hình sẵn sàng. Cảnh Lübeck tải sau phần học và vẫn chuyển động.

| Màn hình | GET trước → sau | JS gzip trước → sau |
|---|---:|---:|
| Bàn học | 2 → 2 | 206,3 → 176,1 KB |
| Bài học | 4 → 1 | 227,0 → 196,2 KB |
| Sổ | 6 → 2 | 243,4 → 187,4 KB |
| Quản trị | 5 → 3 | 218,5 → 189,2 KB |

Bàn học dùng `/api/today` và `/api/ambient`. Reader nhận bài, nháp, lượt nộp và lời phê trong một GET. Sổ nhận đường học, tiến độ, Hôm nay, yêu cầu làm bài và trang lịch sử đầu tiên trong một GET, đồng thời tải đồng hồ học. Quản trị dùng chung lần đọc tên người học giữa các mục.

Playwright U5 chạy với hồ sơ demo và runner giả. Chromium giả lập 300 ms, 1,6 Mbps xuống và 0,75 Mbps lên. WebKit thêm 300 ms trễ mỗi yêu cầu. Kiểm trình duyệt thật và p75 trên 4G ở Việt Nam thuộc luồng PHONE-CHECK. Mốc phát âm thanh chờ bước L. U5 chưa deploy staging.

Hai dự án e2e đều đạt local. Bàn học lần đầu 2,47–2,53 s, có cache 1,28–1,67 s. Từ bấm bài tới câu đầu 0,79–0,87 s. Cả hai ca kiểm tra đáp án đều dưới 1,2 s. Luồng kiểm xác nhận gửi lại sau mất kết nối không tạo lượt nộp trùng, đọc được lịch sử, mở đúng bài tiếp theo và mở được bài đầu do runner giả lưu cho sổ mới. Smoke test đăng nhập dùng kiểm tra nội dung script thay cho tên chunk, đã có trên nhánh đích.
