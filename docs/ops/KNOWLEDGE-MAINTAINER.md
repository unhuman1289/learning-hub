# Bảo trì tri thức

## Nghiệm thu staging

Sau khi bản thay đổi được duyệt, sao lưu D1 staging và áp migration `0023_knowledge.sql` lên staging. Deploy Hub và MCP staging cùng bản mã. Xác nhận health, migration và kết nối OAuth trước khi thử lịch.

Tạo kết nối MCP mới trong ChatGPT với URL Worker MCP staging đã được kiểm chứng. Đăng nhập tài khoản quản trị Hub và chọn scope `hub:knowledge`. Dùng kết nối riêng cho Knowledge để dễ thu hồi. Kiểm tra danh sách công cụ có 11 thao tác Knowledge và thử từ chối bằng một tài khoản thường.

Tạo tác vụ thử một lần trong ChatGPT Work. Trong cùng lượt chạy, yêu cầu gọi inventory, mở một trang nguồn công khai và mở bản nháp cho sổ kiểm thử. Xác minh bản nháp trong lịch sử D1. Ghi thời gian bắt đầu, số công cụ chạy được, yêu cầu duyệt ghi, và thử lại sau khi access token hết hạn. Xác minh giờ theo Europe/Berlin. Tác vụ định kỳ chỉ bật sau khi chạy thật đến lúc probe đạt và một câu hỏi được đóng trên staging.

Nếu K0 đạt, dùng prompt trong `integrations/runner-prompts/knowledge-maintainer.md` cho lịch hằng tuần vào Chủ nhật lúc 02:00 Europe/Berlin. Kiểm tra R1 trong Scheduled và tắt nếu còn chạy. Nếu K0 trượt, ghi nguyên nhân và dùng hướng runner REST theo plan trước khi cấu hình lịch production.

## Production

Thực hiện riêng từng bước đã được duyệt trong plan. Endpoint production là `https://learn.unhuman.cc/mcp`. Cấu hình OAuth production chỉ công bố scope tác vụ `hub:knowledge`. Dùng một kết nối ChatGPT Work riêng cho production và kiểm tra đủ 11 công cụ Knowledge trước khi tạo lịch.
