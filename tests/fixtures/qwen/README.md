# Bản nháp Qwen

Các tệp ghi phần bài học của phản hồi Qwen ngay trước yêu cầu sửa trong log LM Studio ngày 13/11/2026. Văn bản bài, nguồn và tham chiếu kỹ năng đã được thay. Dạng câu, cấu trúc đáp án, mã câu, quan hệ giữa các mã và vị trí lỗi được giữ lại.

`npm run qwen:replay` chạy bước sửa xác định của runner và validator bài học ở chế độ offline. `expectedIssues` lưu những đường dẫn lỗi cần giữ. Mảng rỗng yêu cầu qua validator sau sửa. Việc lưu bài và ràng buộc theo hồ sơ được kiểm qua API job trong cổng Q.
