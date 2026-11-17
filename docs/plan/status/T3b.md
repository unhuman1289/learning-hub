# T3b — sprite gia sư (17/11/2026)

Bản triển khai trong PR: script cắt 17 hàng sheet v2 vào `private-data/tutor-sprite/rows/`, mỗi ô đầu ra 96 × 104 px, hàng lớn nhất 22.198 byte. Cần ImageMagick và `cwebp`; chạy `node scripts/tutor-sprite.mjs <thư-mục-sheet-v2>`. Sheet và các hàng không nằm trong Git.

Worker đọc đúng các tên được phép từ `UPLOADS/assets/tutor/v1/` sau household guard; private cache một năm, ETag và trả 304. Không có bucket hoặc không có hàng thì không giả báo thành công. TutorPet dùng sprite theo state, giữ chỗ tĩnh khi lỗi, giảm chuyển động, preload sit/idle, blocked một lượt rồi talk, offline mở ô rồi lặp, và limit dùng sleep.

Kiểm tra local: 516 test đạt (gồm R2 giả); typecheck, build và lint các tệp liên quan đạt (lint có cảnh báo dùng img); Playwright T3: 6/6 đạt trên WebKit iPhone 13 và Chromium Pixel 7, gồm wave → point, nod/jump, reduced motion, blocked và offline. Đo U5 Pixel 7 cùng môi trường: JS bàn học 178.383 byte gzip ở bản gốc và 178.384 byte ở bản sửa. Chênh 1 byte gzip do tên chunk bài học được nhúng trong JS bàn học thay đổi; nội dung chunk bàn học ngoài tên chunk dài bằng nhau. Phần lesson tăng do sprite được tải lười.

Khi mở tấm, nhân vật vẫy tay một lượt, chỉ lên đề một lượt, rồi lắng nghe. Khi kiểm tra đúng, nhân vật gật đầu nếu lịch sử GET của câu đó có lượt hỏi gia sư, hoặc nhảy nếu chưa có. Kết quả câu khác không được tính.

Các tệp đầu ra riêng tư trên máy này, cho Claude tải sau khi gộp vào `assets/tutor/v1/`:

- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/manifest.json`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/idle.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/run_right.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/run_left.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/wave.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/jump.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/rest.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/explain.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/think.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/tilt.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/look.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/talk.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/cover_mouth.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/point_up.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/nod.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/sleep.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/umbrella.webp`
- `/private/tmp/learning-hub-t3b/private-data/tutor-sprite/rows/sit.webp`

Chưa tải R2 thật, chưa deploy, chưa gộp, chưa gọi OpenAI, không sửa D1. Claude tải các hàng riêng tư lên R2 staging sau khi gộp và xác minh sau cổng gia đình.
