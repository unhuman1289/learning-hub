# H2/H3: dùng thử bài v2

Phạm vi: local/staging. H3.5 và Cổng A chỉ đạt sau dùng thật; không dùng test tự động thay cho một tuần của Ếch.

## Chuẩn bị của phụ huynh/admin

1. Đăng nhập staging, mở **Quản trị → Giao bài đã duyệt**.
2. Chọn một fixture `fixtures/lessons/deutsch-modalverb.json`, `deutsch-w-fragen.json`, `deutsch-nicht-kein.json`; đọc và chỉnh mục tiêu, nội dung, đáp án trước khi giao. Đây là bài gốc tự soạn để thử, không phải giáo trình đầy đủ.
3. Lấy ID thật của người học từ `GET /api/learners` và ID sổ từ `GET /api/subjects?learner=<ID>` trong phiên admin. Kiểm tra sổ thuộc đúng người, đang active, template skill và aiEnabled vẫn false.
4. Dán JSON dạng dưới vào ô, thay placeholders bằng ID và nguyên gói lesson. Đánh dấu đã duyệt rồi **Giao bài**. Chỉ coi thành công khi server trả lessonId.

```json
{
  "learnerId": "ID tài khoản đã chọn",
  "subjectId": "sub_ID_sổ",
  "lesson": { "contract": "lesson-package/2", "...": "nguyên gói fixture đã duyệt" }
}
```

Nếu báo bài hiện tại chưa xong, giữ nguyên. Không sửa database để vượt cổng. Giao bài kế khi người học đánh dấu xong **trước 03:00 Berlin** ngày mới. Bộ ôn có slot riêng, cũng không thay một bộ ôn chưa xong. Hoàn thành sau 03:00 chờ tới ngày sau.

## Người học

- Phòng học → tờ bài trên bàn, hoặc sổ → **Bài đã giao** → **Mở bài**.
- Nhớ lại → tờ kiến thức → luyện có hướng dẫn → tự làm. Trên điện thoại dùng Câu trước/Câu tiếp; nộp phần cần có bài làm cho mọi câu trong phần.
- Nháp tự lưu. Chỉ **Đã lưu** là đã được server xác nhận. Mất mạng: giữ tab, có mạng lại bấm Lưu nháp; không đóng/tải lại tab trước khi lưu thành công.
- **Gợi ý** được ghi lại; Xem lời giải cần xác nhận và ghi mức hỗ trợ. Không đánh đồng kết quả có trợ giúp với tự làm.
- **Nộp phần này**: câu đóng chấm ngay. Câu mở hiện chờ chấm và vẫn giữ bài làm. Chưa có AI tự chấm trong H3.
- **Sửa lại** rồi nộp: tạo lần tiếp theo, lần cũ giữ nguyên. Nếu chưa rõ nộp thành công, **Kiểm tra lượt nộp** dùng cùng UUID.
- **Đã học xong/Bỏ dấu đã học** độc lập với điểm; không tự hoàn thành khi trả lời đúng.
- Thử đăng xuất/đăng nhập lại: đáp án đã lưu và lời phê gần nhất vẫn phải còn.

## Nhật ký tuần dùng thử (phụ huynh lưu riêng)

Ít nhất ba bài Deutsch, có sử dụng cả điện thoại và máy tính. Ghi ngày, bài, thiết bị, khó khăn khi gõ/chuyển câu, gợi ý đã dùng, phản hồi sai/khó hiểu. Không đưa ảnh/bài làm thật vào Git hoặc PR.

Cổng A còn cần: câu đóng chấm ngay, lần 2 giữ retry link, trợ giúp được ghi, người khác không đọc được, tests xanh. Chỉ đóng H3.5 khi có bằng chứng dùng thật; H4 không được tuyên bố đã vượt cổng trước đó.

## Local QA

`npm run seed:hub2` chỉ ghi database local, không có switch remote. Nó tạo 3 tài khoản demo, 3 sổ cho demo Ếch, 4 bài Deutsch, Toán/Hóa mẫu và reading D1 cho demo người lớn. `node scripts/hub2-local-smoke.mjs http://localhost:8871` kiểm API với các tài khoản demo; script từ chối hostname cloud.

`node scripts/evidence-migration-drill.mjs private-data/<export>.sql` thử 0011 trên bản sao staging in-memory, so hash từng bảng cũ. Không ghi remote. Export/SQL/screenshot QA giữ trong private-data/work, không commit.
