# Bản nháp Qwen

Các tệp ghi phần bài học của phản hồi Qwen ngay trước yêu cầu sửa trong log LM Studio ngày 13/11/2026. Văn bản bài, nguồn và tham chiếu kỹ năng đã được thay. Dạng câu, cấu trúc đáp án, mã câu, quan hệ giữa các mã và vị trí lỗi được giữ lại.

`npm run qwen:replay` chạy bước sửa xác định của runner và validator bài học ở chế độ offline. `expectedIssues` lưu những đường dẫn lỗi cần giữ. Mảng rỗng yêu cầu qua validator sau sửa. Việc lưu bài và ràng buộc theo hồ sơ được kiểm qua API job trong cổng Q.

`initial-math7-phone-1.json` và `initial-math7-phone-2.json` là hai kết quả Qwen của cùng lượt mở sổ Toán 7 bằng hồ sơ giả. Đối chiếu log LM Studio theo thời điểm Hub từ chối `over_budget` (14/11, 17:34:59 và 17:36:53 Europe/Berlin). Đã thay ID sổ, hash ngữ cảnh và nhãn thiết bị thử. Replay nạp kết quả vào job `initial` với sổ khác đang đầy giới hạn phút và kiểm ID bài đã lưu cùng năm bước lộ trình.
