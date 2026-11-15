# P3-rum · 14/11/2026

[PR #159](https://github.com/unhuman1289/learning-hub/pull/159) từ `codex/p3-rum` vào `codex/hub-next-wip`.

## Đã làm

- `/api/rum` nhận tối đa 2 KiB và 16 mẫu mỗi beacon từ người dùng đã đăng nhập, cùng nguồn. Từ chối trường ngoài hợp đồng và bỏ qua màn hình lạ. Quốc gia và colo lấy từ `request.cf`. Chỉ quốc gia được dùng trong bảng tổng hợp, với `XX` khi thiếu mã.
- Trình duyệt gửi lô bằng `sendBeacon` khi mở bàn học, hiện câu đầu và hiện kết quả chấm ngay. Với bài mới có trang bìa, đồng hồ câu đầu bắt đầu khi lật từ bìa sang câu hỏi, để thời gian đọc bìa không vào phép đo. Khi mở lại thẳng vào câu hỏi, đồng hồ bắt đầu lúc mở bài.
- `0030_perf.sql` gộp theo ngày Berlin, màn hình, quốc gia và lớp thiết bị. Bảng đếm theo ms giữ phân bố của các lô để tính percentile theo thứ hạng. Bản sao lưu chứa cả hai bảng. Quản trị → Hệ thống hiện p75 và cỡ mẫu của ngày mới nhất có số đo.

## Đã chạy trên local

- `npm run test` đạt 413/413. `npm run typecheck`, `npm run lint`, `npm run contracts:check` và `npm run build` đều đạt.
- Áp dụng `0030` vào D1 demo cô lập. Playwright mô phỏng iPhone 13 (WebKit) và Pixel 7 (Chromium) xác nhận beacon bàn học, câu đầu, giới hạn payload, quyền đọc và bảng p75. Lượt WebKit cũng xác nhận beacon chấm ngay. Beacon từ trang bài giữ Referer ở origin.

## Còn lại

- Chờ review và gộp PR. Việc deploy staging, áp dụng `0030` trên staging và chạy PHONE-CHECK bước 3 với điện thoại thật để xác nhận quốc gia từ Cloudflare thuộc lượt sau.
- Gắn `audio_play` vào sự kiện phát âm thanh của L6 và `tutor_first_token` khi T5 hiện chữ đầu. Hợp đồng beacon đã chấp nhận cả hai mốc.
