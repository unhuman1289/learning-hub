# P3-rum · 14/11/2026

[PR #159](https://github.com/unhuman1289/learning-hub/pull/159) từ `codex/p3-rum` vào `codex/hub-next-wip`.

## Đã làm

- `/api/rum` nhận tối đa 2 KiB và 16 mẫu mỗi beacon từ người dùng đã đăng nhập, cùng nguồn. Từ chối trường ngoài hợp đồng và bỏ qua màn hình lạ. Quốc gia và colo lấy từ `request.cf`. Chỉ quốc gia được dùng trong bảng tổng hợp, với `XX` khi thiếu mã.
- Trình duyệt gửi lô bằng `sendBeacon` khi mở bàn học, hiện câu đầu và hiện kết quả chấm ngay. Với bài mới có trang bìa, đồng hồ câu đầu bắt đầu khi lật từ bìa sang câu hỏi, để thời gian đọc bìa không vào phép đo. Khi mở lại thẳng vào câu hỏi, đồng hồ bắt đầu lúc mở bài.
- `0030_perf.sql` gộp theo ngày Berlin, màn hình, quốc gia và lớp thiết bị. Bảng đếm theo ms giữ phân bố của các lô để tính percentile theo thứ hạng. Bản sao lưu chứa cả hai bảng. Quản trị → Hệ thống hiện p75 và cỡ mẫu của ngày mới nhất có số đo.

## Đã chạy trên local

- `npm run test` đạt 413/413. `npm run typecheck`, `npm run lint`, `npm run contracts:check` và `npm run build` đều đạt.
- Áp dụng `0030` vào D1 demo cô lập. Playwright mô phỏng iPhone 13 (WebKit) và Pixel 7 (Chromium) xác nhận beacon bàn học, câu đầu, giới hạn payload, quyền đọc và bảng p75. Lượt WebKit cũng xác nhận beacon chấm ngay. Beacon từ trang bài giữ Referer ở origin.

## Nghiệm thu staging · 16/11/2026

Nhánh tích hợp local và GitHub cùng ở `bde5e3e72f2002b6c3e46dbfb9416c76ee88c463`. Health staging trước và sau lượt kiểm báo `ffd86264015d1431f73360d74973100145a375c0`, D1 kết nối. SHA này là tổ tiên của bản tích hợp. D1 staging xác nhận `0030_perf.sql` trong bảng migration.

- **Giả lập trên staging:** WebKit iPhone 13 và Chromium Pixel 7 đăng nhập hồ sơ QA thành công. Khoảng 04:10 giờ Berlin, API sổ trả về một bài chính đã hoàn thành trong mỗi sổ `Deutsch` và `Deutsch · Android`, không còn bài chính dang dở. Bàn học không có nút **Học tiếp** ở hai sổ QA đã chỉ định cho PHONE-CHECK bước 3. Dừng trước thao tác tạo hoặc sửa bài.
- **Đối chiếu D1:** Không có dòng `first_question` trước và sau lượt kiểm. Có dòng `desk` ngày Berlin `2026-11-16`, quốc gia `DE`, thiết bị `phone`, `n=3`, `p75=936 ms`. Đây là số tổng hợp của bàn học. Hồ sơ QA nhận HTTP 404 ở API chỉ dành cho quản trị. Chưa đối chiếu bảng Quản trị → Hệ thống bằng phiên admin.
- **Thiết bị thật:** Chưa chạy. Hai lượt giả lập dùng kết nối của máy kiểm thử và chưa xác nhận tuyến mạng từ điện thoại thật.

## Còn lại

- Chuẩn bị một bài QA dang dở có bài làm đã lưu để bàn học hiện **Học tiếp**. Chạy lại bước 3 và đối chiếu mức tăng `n` cùng `p75` của `first_question` theo ngày Berlin, quốc gia, thiết bị giữa D1 và giao diện bằng tài khoản quản trị.
- Gắn `audio_play` và `tutor_first_token` ở L6/T5.
