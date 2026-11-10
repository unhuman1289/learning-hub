# H8 — các sổ sau pilot Deutsch unhuman

Chỉ Deutsch unhuman bật runner trong pilot. Tài liệu này chuẩn bị phạm vi triển khai, không tự tạo tài khoản/sổ, không bật AI cho trẻ hoặc các sổ y khoa. Cardio của người khác được giữ; Cardio không xuất hiện trong catalog/lượt soạn của unhuman.

| H8 | Nội dung và đầu ra cần chuẩn bị | Điều kiện còn thiếu |
|---|---|---|
| H8.1 Toán 7 | Lộ trình GDPT 2018 theo bộ sách; câu tự soạn về số hữu tỉ, tỉ lệ, hình học; bài có ảnh và rubric từng bước | Tiến độ trường, phụ huynh xác nhận, grading ảnh đạt ≥90% và pilot ổn |
| H8.2 Hóa 7 | Phần Hóa trong KHTN 7: nguyên tử, nguyên tố, phân tử, công thức; bài tự soạn và giữ đúng hoa/thường Co/CO | Tiến độ lớp; không nhận danh sách đề sao chép làm giáo trình |
| H8.3 Deutsch người lớn | Theo deutsch-unhuman.md, email/nói công việc; rubric B1–B2 khi đủ bằng chứng | Một tuần dùng thật; soát 20 lời phê trước mở rộng |
| H8.4 AI/coding/deploy | Đọc tài liệu chính thức, giải thích luồng request, triển khai nhỏ, Git rollback, kiểm quyền; tạo sản phẩm chạy được | Runner mở nguồn thật, người học đọc 5 bài đầu và phản hồi; không bịa đã deploy |
| H8.4 MTB/sequencing | Ung thư/pathology/variant/PGx; từ dữ liệu đầu vào tới bằng chứng cho PM4Onco/AG Busch, case giả lập | Nguồn primary được mở mỗi lần soạn; không có dữ liệu bệnh nhân định danh; người học duyệt 5 bài |
| H8.5 Bột | Cha mẹ đọc và ghi quan sát về ăn/ngủ, vận động, tương tác; tách bằng chứng và giai thoại văn hóa | Tuổi/thông tin hiện tại được xác nhận khi soạn, không suy ra ngày sinh; không hứa IQ/chiều cao |

H8.1/H8.2 đứng sau Deutsch pilot theo quyết định 13/10. Chưa có dữ liệu cho phép gán năng lực của Ếch; không dùng kết quả unhuman thay bằng chứng của trẻ.

Đối với Toán/Hóa, hệ thống hiện đã có fixture nhập thử; chúng chưa phải giáo trình hoàn chỉnh. Khi soạn bài ngoài Deutsch, mở nguồn primary thực tế và ghi retrievedAt/readScope, chỉ đọc abstract phải nói rõ. Nếu nguồn lỗi thì giữ bài cũ và báo thiếu nguồn. Không bật clinical/child_dev bằng script setup chung.

## Dọn hệ thống (H8.6)

Chuẩn bị runbook: direct MCP thay Sites cho pilot; chỉ gỡ quyền v1 sau kiểm kê client còn dùng và rollback; không xóa bảng learning_slots khi production còn chạy UI v1. Backup học tập format 4 có grade/job/request; auth/JWKS có backup SQL riêng tư và secret tương ứng. Restore phải thử trên database mới, không ghi đè production. Việc gỡ bridge và drop bảng là bước hậu pilot, chưa tự chạy khi còn gate.

H8.2 đã có code hiển thị H2O → H₂O chỉ trong sổ Hóa và giữ câu trả lời gõ thường; server từ chối key công thức không phân biệt hoa/thường. Chưa bật sổ hoặc nghiệm thu giáo trình của trẻ.

## Bộ sách chính thức

Toán 7 và KHTN 7 dùng **Kết nối tri thức với cuộc sống**, Nhà xuất bản Giáo dục Việt Nam, từ năm học 2026–2027. Nguồn đã mở toàn văn: [Báo Chính phủ, 26/12/2025](https://baochinhphu.vn/ket-noi-tri-thuc-voi-cuoc-song-la-sach-giao-khoa-thong-nhat-toan-quoc-tu-nam-hoc-20262027-10225122622052997.htm), nêu Quyết định 3588/QĐ-BGDĐT ngày 26/12/2025. Ngày kiểm tra 14/10/2026; chưa đọc toàn bộ sách hay xác minh trang/bài của lớp. Không đồng nhất lựa chọn bộ sách với việc đã xây xong giáo trình. Hóa là phần trong KHTN 7. Cần đối chiếu mục lục bản sách hợp pháp trước gán số bài/trang; bài tập Hub tự soạn, không chép sách.
