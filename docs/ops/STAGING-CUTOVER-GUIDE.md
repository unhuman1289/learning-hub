# Learning Hub staging: kiểm tra tài khoản và tiến độ

## Trạng thái hiện tại

- Mở staging tại [https://learning-hub-staging.tranvu-812.workers.dev](https://learning-hub-staging.tranvu-812.workers.dev). Production `learn.unhuman.cc` vẫn chạy Sites v5; DNS và production chưa đổi.
- Staging có D1 migration `0000`–`0003`. Snapshot Sites riêng tư đã import và đối chiếu từng ô: 5 bài, 5 slot, 1 workspace, 2 lượt cập nhật.
- Bốn secret staging đã được xác nhận theo tên và loại; giá trị không được đọc. `APP_ORIGIN` và `EMAIL_FROM` đã cấu hình. Resend đã xác minh sender domain theo cấu hình của chủ tài khoản.
- Test anonymous đạt: trang chủ chuyển tới login; API bài học, tiến độ, export, backup từ chối request không có session; header Sites giả không cấp quyền; `/api/learning-run` trả 410.
- Code sao lưu R2 đã deploy. Chưa có object R2 thật; admin có thể tạo bản đầu ngay, hoặc đợi cron 03:00 Europe/Berlin. Restore drill local dùng database mới trong bộ nhớ và không ghi vào staging.
- Staging chưa tự nghiên cứu và sinh bài mới. Lịch nội dung 03:00 của Sites vẫn riêng; cron Worker staging hiện chỉ sao lưu.

## Acceptance test bạn cần làm trong trình duyệt

1. Mở trang và chọn **Tạo tài khoản**. Dùng email nằm trong allowlist; mật khẩu từ 12 đến 128 ký tự. Không đăng nhập bằng Google.
2. Mở hộp thư, bấm link xác minh trong vòng một giờ, rồi đăng nhập. Tài khoản bootstrap đầu tiên được cấp quyền admin nếu email trùng secret bootstrap.
3. Vào bài học, gõ câu trả lời thử không nhạy cảm và bấm **Lưu câu trả lời**. Đăng xuất, đăng nhập lại, tải lại bài và xác nhận câu trả lời vẫn còn.
4. Thử **Quên mật khẩu?**, nhận email reset, đặt mật khẩu mới, rồi đăng nhập lại. Không dán link reset, mã hay mật khẩu vào chat.
5. Nếu tài khoản là admin, tại phần nhật ký dùng **Tạo bản sao trên Cloudflare**, rồi **Tải bản R2 mới nhất**. Lưu file ở nơi riêng tư và chạy restore drill local:

   ```sh
   npm run db:restore:drill -- --file /path/to/private-r2-backup.json
   ```

   Script chỉ in tên bảng và số dòng, không in câu trả lời; nó không chạm database đang chạy.

Nếu email báo không nằm trong danh sách mời, dừng ở đó và báo tôi. Không gửi secret vào chat. Nếu mail xác minh/reset không tới, kiểm tra spam và báo thời gian gửi cùng thông báo lỗi hiển thị; không gửi nội dung thư hoặc link bí mật.

## Những gì staging đang và chưa làm

Worker, D1, đăng nhập, lưu bài/tiến độ và backup chạy độc lập trên Cloudflare. Nội dung/tiến độ đã import từ snapshot ngày 09/10; mọi người dùng chung workspace ở giai đoạn này. Tách tiến độ riêng từng tài khoản và runner tạo bài mới thuộc Phase 1.

Chưa cutover `learn.unhuman.cc`, chưa đổi DNS, không xóa hoặc sửa Sites. Không triển khai production trước khi bạn duyệt riêng. Cổng 48 giờ và CPU p95 ≤ 8 ms không còn chặn staging; số liệu CPU và lỗi sẽ được theo dõi sau deploy.
