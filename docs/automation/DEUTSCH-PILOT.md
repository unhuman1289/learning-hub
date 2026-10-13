# Deutsch thật cho unhuman

## Đã có và chưa có (13/10/2026)

- Bài người lớn đầu tiên: `fixtures/lessons/deutsch-adult-01-termin.json`, 40 phút, 8 câu, email đổi lịch và luyện đối thoại. Nội dung tự soạn, tham khảo HTML Goethe đã mở; không phải bài thi chính thức.
- Bài đã giao cho unhuman trên staging: [mở Deutsch 01](https://learning-hub-staging.tranvu-812.workers.dev/?bai2=les_8b52eae6ba6b4eee8fb4). Đã đọc lại D1: 8 câu, chưa hoàn thành; bài cũ vẫn giữ.
- H2/H3 staging đọc bài v2, lưu câu trả lời vào D1, chấm câu kín; câu mở chưa có AI chấm.
- Goal/level D1 đang trống dù UI có mục tiêu tĩnh; prompt và bài đã duyệt chứa profile A2 → B2. Context v2 phải dùng profile thực khi triển khai H5.
- Plugin Learning Hub hiện hỗ trợ Automation API v1, nối staging. `hub_start_run` là lượt manual; không chứng minh tác vụ hàng đêm chạy. Không gửi JSON v2 vào `hub_result`.
- Production chưa có thay đổi của công việc này. Chưa bật lịch v2, chưa hoàn tất H5/H7 hoặc Cổng A.

## Lệnh dùng ngay trong ChatGPT

Mở cuộc trò chuyện web, thêm plugin Learning Hub nếu có. Đính kèm **prompt**, **LESSON-DESIGN.md**, schema `contracts/lesson-package-v2.schema.json`, và bài gần nhất nếu muốn nhận xét đúng. Không gửi bản export database, thông tin bệnh nhân hoặc credentials.

Dán **prompt A** trong [deutsch-unhuman.md](../../integrations/runner-prompts/deutsch-unhuman.md), rồi gửi:

> Soạn bài Deutsch tiếp theo cho unhuman theo prompt đã gửi. Mục tiêu A2 → B2 cho công việc trong một năm; ưu tiên viết và nói. Nếu chưa đọc được tiến độ Hub thì chỉ tạo bản nháp, ghi rõ điều đó. Trả bài hoàn chỉnh và JSON lesson-package/2 để quản trị duyệt. Không dùng bài trẻ em của Ếch, không gọi hub_result v1 với JSON v2.

Muốn học: mở bài trên staging, dùng **prompt B**, đưa đề từng câu vào ChatGPT. Làm và nộp câu trả lời trong Hub; ChatGPT chat không tự lưu phần bạn trao đổi vào D1. Không gửi file bài có đáp án nếu muốn gia sư hỏi bạn trước.

## Giao bài qua Hub

Đăng nhập admin ở **staging**, mở Quản trị → Giao bài đã duyệt. Dán envelope `{learnerId,subjectId,lesson,reviewed:true}` với ID lấy từ đúng staging. File envelope đã chuẩn bị nằm trong `private-data/deutsch-unhuman-staging-import.json`, chỉ trên máy và ngoài Git. Đọc/duyệt nội dung trước khi chọn checkbox và giao.

Server giữ bài chưa xong và kiểm tra mốc 03:00; nếu báo xung đột, đọc lại bài hiện tại, không dùng SQL để vượt rào. Sau khi giao: mở sổ Deutsch, kiểm tra tiêu đề, 8 câu và lịch sử bài cũ còn nguyên. Không nộp đáp án mẫu thay người học.

## Lộ trình đầu tiên — điều chỉnh theo bài làm

1. Xin đổi lịch công việc (bài đã soạn).
2. Xác nhận lịch, hỏi địa điểm/thông tin còn thiếu.
3. Mô tả ngày làm việc và ưu tiên; ôn V2/modal nếu cần.
4. Kể việc đã làm bằng Perfekt.
5. Viết yêu cầu hỗ trợ và giải thích vấn đề.
6. Trình bày dự án bằng ngôn ngữ đơn giản, không có dữ liệu riêng.
7. So sánh lựa chọn và nêu lý do.
8. Tóm tắt một văn bản ngắn có nguồn.
9. Đối thoại: hỏi lại, xác nhận hiểu và đề nghị.
10. Viết + nói tổng hợp trong tình huống mới, xem lại các lỗi đã có bằng chứng.

Đây là chuỗi năng lực, không phải lịch ép 10 ngày hay bảo đảm B2. Chỉ tiến khi bài trước đủ điều kiện; sau vài bài xem lại đầu vào và thời lượng thực tế.

## Bật lịch cloud thế nào

OpenAI hướng dẫn tác vụ web có thể dùng công cụ/plugin được cung cấp cho cuộc trò chuyện; tác vụ Codex local cần máy/app hoạt động. Khả năng cụ thể còn phụ thuộc tài khoản và tác vụ: [Automations chính thức](https://learn.chatgpt.com/docs/automations).

Thử prompt A trong chat web trước. Nếu tài khoản có tác vụ cloud, yêu cầu "Tạo tác vụ chuẩn bị bản nháp Deutsch mỗi ngày lúc 03:00, múi giờ Europe/Berlin, theo prompt C". Mở quản lý tác vụ, kiểm tra giờ/múi giờ và xem kết quả lượt đầu. Hiện chỉ **chuẩn bị bản nháp**. Chưa hứa cập nhật trực tiếp Hub khi v2 writer/context chưa triển khai. Để ghi hàng đêm thật: hoàn tất các gate và H5 (context, quyền, writer) → H7 (runner thực, kiểm tra lưu và đọc lại, thử giữ bài chưa xong). Không cần thêm model API chỉ để soạn nội dung bằng subscription.

Nguồn nội dung: [Goethe A2 Schreiben](https://bfu.goethe.de/a2_mod_2MX5/schreiben.php), [Goethe A2 Sprechen](https://bfu.goethe.de/a2_mod_2MX5/sprechen.php); phạm vi đọc và timestamp nằm trong gói bài.
