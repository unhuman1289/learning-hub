# Vận hành tác vụ 03:00

Nguồn hướng dẫn triển khai là [kế hoạch v2](plan/learning-hub-plan-v2-cloudflare.md) (hạ tầng Cloudflare độc lập trước, Automation API v1 sau). Luồng Sites mô tả bên dưới chỉ còn giá trị lịch sử cho đến cutover; không mở rộng thêm.

## Hiện tại

- Lịch Sites hiện có: 03:00 Europe/Berlin, lượt đầu dự kiến 08/10/2026.
- Code local phase 0: mỗi lượt có runId, giờ bắt đầu/kết thúc, năm kết quả theo mảng, cảnh báo và backup đầy đủ.
- Chưa publish code phase 0 và chưa thay prompt live vì kết nối Sites không thấy project trong phiên triển khai. Lịch cũ không bị thay đổi.
- Email tác vụ cần bật ở Settings của tài khoản sở hữu; chưa có quyền công cụ thay tùy chọn đó.

## Một kênh dữ liệu

Tác vụ chỉ đọc/ghi API có quyền dịch vụ của Sites. Prompt chuẩn ở [LEARNING-UPDATES.md](../LEARNING-UPDATES.md). GET ban đầu tạo runId; POST gửi cùng ID; đọc lại bằng GET có runId để không sinh lượt thừa. Kết thúc bằng tóm tắt ngắn cho thông báo và nhắc sao lưu vào thứ Hai nếu đến hạn.

Dữ liệu bài, câu trả lời và tiến độ nằm trong D1. Git giữ source/configuration; Docs giữ tài liệu dài. Không gửi kết quả ngược qua email hoặc Drive và không push nội dung riêng tư mỗi ngày.

## Kiểm tra và phục hồi

Xem [PHASE-0-OPERATIONS.md](PHASE-0-OPERATIONS.md) để kiểm tra lượt thật, tải backup và khôi phục vào database local riêng. GitHub CI chạy test và typecheck trên push/PR; không tự deploy từ CI.

## Khi thật sự cần rời Sites

Đó là giai đoạn 3 tùy chọn, sau các cổng trước. Trước khi đổi hosting phải xác minh nơi chạy cloud có thể đọc/ghi Hub bằng quyền dịch vụ độc lập khi laptop tắt; Plus/Pro hoặc export Git không tự cung cấp quyền đó. Sau đó mới cấu hình xác thực người dùng, D1 thật và đổi lịch, tránh hai writer cùng chạy.
