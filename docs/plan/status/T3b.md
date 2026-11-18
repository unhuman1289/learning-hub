# T3b — sprite gia sư (17/11/2026)

Sprite v1 đã lên R2 staging sau PR #205 (theo xác nhận của chủ dự án). Sprite v2 được cắt trực tiếp từ sheet v2, mỗi khung 192 × 208 px, không thu nhỏ; mỗi hàng tối đa 60.000 byte. Cần ImageMagick và `cwebp`; chạy `node scripts/tutor-sprite.mjs <thư-mục-sheet-v2>`. Sheet và các hàng không nằm trong Git.

Worker đọc các tên được phép từ `UPLOADS/assets/tutor/v2/` qua URL `/api/tutor/sprite/v2/<tên>.webp` (route cũ vẫn phục vụ v1) sau household guard; private cache một năm, ETag và trả 304. Không có bucket hoặc không có hàng thì không giả báo thành công. TutorPet dùng sprite theo state, giữ chỗ tĩnh khi lỗi, giảm chuyển động, preload sit/idle, blocked một lượt rồi talk, offline mở ô rồi lặp, và limit dùng sleep.

Kiểm tra PR #205: 516 test đạt (gồm R2 giả); typecheck, build và lint các tệp liên quan đạt (lint có cảnh báo dùng img); Playwright T3: 6/6 đạt trên WebKit iPhone 13 và Chromium Pixel 7, gồm wave → point, nod/jump, reduced motion, blocked và offline. Đo U5 Pixel 7 cùng môi trường: JS bàn học 178.383 byte gzip ở bản gốc và 178.384 byte ở bản sửa. Chênh 1 byte gzip do tên chunk bài học được nhúng trong JS bàn học thay đổi; nội dung chunk bàn học ngoài tên chunk dài bằng nhau. Phần lesson tăng do sprite được tải lười.

Khi mở tấm, nhân vật vẫy tay một lượt, chỉ lên đề một lượt, rồi lắng nghe. Khi kiểm tra đúng, nhân vật gật đầu nếu lịch sử GET của câu đó có lượt hỏi gia sư, hoặc nhảy nếu chưa có. Kết quả câu khác không được tính.

## Sprite v2: bàn giao cho Claude

Kích thước hiển thị: đầu tấm 96 × 104 px; góc trang người lớn 72 × 78 px; góc trang trẻ em 88 × 95 px. URL v2 và khóa R2 v2 tách khỏi cache immutable v1. Kiểm tra local: 516 unit test, typecheck, build và 8 e2e WebKit/Chromium đạt; lint không có lỗi (cảnh báo `<img>`).

Đường dẫn manifest riêng tư: `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/manifest.json`. Sau khi gộp, tải từng hàng vào `assets/tutor/v2/<tên>.webp` trong R2 staging.

| Hàng | Kích thước (byte) | Đường dẫn tuyệt đối |
|---|---:|---|
| `idle` | 38,244 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/idle.webp` |
| `run_right` | 51,946 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/run_right.webp` |
| `run_left` | 51,746 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/run_left.webp` |
| `wave` | 25,806 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/wave.webp` |
| `jump` | 31,766 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/jump.webp` |
| `rest` | 45,356 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/rest.webp` |
| `explain` | 36,880 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/explain.webp` |
| `think` | 35,348 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/think.webp` |
| `tilt` | 35,820 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/tilt.webp` |
| `look` | 47,772 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/look.webp` |
| `talk` | 47,272 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/talk.webp` |
| `cover_mouth` | 52,186 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/cover_mouth.webp` |
| `point_up` | 59,402 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/point_up.webp` |
| `nod` | 55,110 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/nod.webp` |
| `sleep` | 57,696 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/sleep.webp` |
| `umbrella` | 57,466 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/umbrella.webp` |
| `sit` | 58,980 | `/private/tmp/learning-hub-t3b-v2/private-data/tutor-sprite/rows-v2/sit.webp` |

Chưa tải R2 v2, chưa deploy, chưa gộp, chưa gọi OpenAI, không sửa D1.
