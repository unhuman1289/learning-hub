# T3b — sprite gia sư (17/11/2026)

Bản triển khai trong PR nháp: script cắt 17 hàng sheet v2 vào `private-data/tutor-sprite/rows/`, mỗi ô đầu ra 96 × 104 px, hàng lớn nhất 22.198 byte. Cần ImageMagick và `cwebp`; chạy `node scripts/tutor-sprite.mjs <thư-mục-sheet-v2>`. Sheet và các hàng không nằm trong Git.

Worker đọc đúng các tên được phép từ `UPLOADS/assets/tutor/v1/` sau household guard; private cache một năm, ETag và trả 304. Không có bucket hoặc không có hàng thì không giả báo thành công. TutorPet dùng sprite theo state, giữ chỗ tĩnh khi lỗi, giảm chuyển động, preload sit/idle, blocked một lượt rồi talk, offline mở ô rồi lặp, và limit dùng sleep.

Kiểm tra local: 516 test đạt (gồm R2 giả); typecheck, build và lint các tệp liên quan đạt (lint có cảnh báo dùng img); Playwright T3 đạt WebKit iPhone 13 và Chromium Pixel 7, kiểm state, reduced motion, blocked và offline. Đo U5 Pixel 7 cùng môi trường: JS bàn học 178.383 byte gzip ở cả nhánh gốc và bản sửa; phần lesson tăng do sprite được tải lười.

Còn trước khi coi T3b hoàn tất: state `point` và `nod` đã có ánh xạ hàng nhưng chưa nối với sự kiện chỉ vào đề và tự sửa đúng trong luồng bài; chưa kiểm thử hai sự kiện đó. Đây là PR nháp, không phải nghiệm thu.

Chưa tải R2 thật, chưa deploy, chưa gộp, chưa gọi OpenAI, không sửa D1. Claude tải các hàng riêng tư lên R2 staging sau khi gộp và xác minh sau cổng gia đình.
