# Giai đoạn 0 — kiểm tra lượt chạy và phục hồi

> **Lịch sử (Phase 0 trên Sites).** Các bước publish lên project Sites và kiểm tra tác vụ 03:00 cũ không còn áp dụng. Phần sao lưu và restore vẫn đúng ý tưởng; lệnh hiện hành ở [ops/BACKUP.md](ops/BACKUP.md) và [ARCHITECTURE.md §8](ARCHITECTURE.md#8-sao-lưu-và-phục-hồi).

## Đã triển khai trong source

- Migration `0002`: `runs`, `run_items`, `backup_events`; giữ nguyên bốn bảng và dữ liệu cũ.
- GET ban đầu ghi `started`; POST ghi kết quả cả năm mảng và kết thúc trong một giao dịch D1. Hai lượt khác nhau có hai UUID dù cùng ngày. Gửi lại cùng lượt/cùng payload không thay dữ liệu; payload khác nhận 409.
- Lượt dở hơn hai giờ hiển thị lỗi. Quá 26 giờ không có lượt thành công thì cảnh báo; xem lý do thay/giữ ở nhật ký trên Hôm nay.
- GET `/api/export` yêu cầu đăng nhập, trả snapshot format 2 gồm toàn bộ bảy bảng. Nút xuất bản nháp cũ chỉ xuất ghi chú, không thay backup đầy đủ.
- Hub nhắc đến hạn sau bảy ngày chưa tạo backup. Prompt chuẩn nhắc trong thông báo thứ Hai; phần cloud còn chờ áp dụng prompt.

Đây là giai đoạn 0: tiến độ vẫn dùng chung. Chưa có phân quyền admin/người học riêng, chấm bài thích nghi hoặc chuyển khỏi Sites.

## Publish đúng project

Kết nối lại tài khoản có quyền với project `appgprj_6ac5fd4aa4a8819188c4fabae021727f`, rồi:

1. Đọc metadata/source hiện tại qua Sites, đối chiếu commit và thay đổi phát sinh; giữ identity `.openai/hosting.json`.
2. Xác minh Site vẫn hạn chế truy cập, quyền dịch vụ updater và D1 binding thực tế. Không tạo project thay thế hoặc deploy public Worker.
3. Tải backup private mới từ live **trước migration**, giữ ngoài Git. Áp dụng migration 0002 bằng luồng publish/migration được Sites hỗ trợ; kiểm tra ID/row count trước–sau.
4. Publish vào project hiện có. Cập nhật **tác vụ 03:00 hiện có**, giữ lịch Europe/Berlin và các trường cấu hình đang dùng; dùng prompt LEARNING-UPDATES.md. Không tạo thêm tác vụ nightly.
5. Bật Email trong Settings và thử nhận tóm tắt. Tác vụ cũ GET lần hai không có runId sẽ tạo lượt dở thừa: áp dụng prompt mới cùng lần publish.

Phiên triển khai 07/10 gặp `NOT_FOUND` cho project và danh sách Sites rỗng. Không suy ra project đã bị xoá; code live và lịch cũ chưa bị sửa.

## Mỗi sáng kiểm tra lượt thật

1. Trên Hôm nay, mở nhật ký và đối chiếu lượt `scheduled`, giờ Berlin, trạng thái kết thúc, năm kết quả và lý do. Lượt lỗi hoặc `started` dở không tính là đêm đạt cổng.
2. Nếu bài đủ điều kiện trước cutoff được thay, đối chiếu ID mới và bài cũ/câu trả lời trong lịch sử. Mảng chưa xong phải giữ nguyên ID, nội dung và câu trả lời.
3. Kiểm tra email đúng kết quả. Khi nguồn/quyền truy cập lỗi, không tạo kết quả giả để vượt cổng.
4. Ghi bằng chứng vào nhật ký kế hoạch: ngày, runId, mảng được thay/giữ và việc cần xử lý. Không đưa toàn văn câu trả lời hoặc backup vào Git.

Sau phase 0, `runs`/`run_items` thay vai trò kiểm chứng của `learning_runs` ở mục 0.1; bảng cũ giữ tương thích dữ liệu export. Không ghi đè lịch sử từng lượt theo ngày. Ba đêm phải liên tiếp sau khi bản mới được publish; kiểm thử local/manual không tính.

## Backup và restore vào database riêng

Bấm **Tải bản sao lưu**; lưu file ở nơi riêng tư. Thời điểm hiển thị là lúc server **tạo** bản sao, không chứng minh file đã nằm an toàn ở cloud. Xác nhận trình duyệt tải file và lưu bản riêng hằng tuần. Git không sao lưu D1.

Với Node 24, từ thư mục repo:

```sh
# State phải chưa chứa database học trước đó.
LEARNING_HUB_LOCAL_STATE=work/restore-check npm run db:migrate:local
LEARNING_HUB_LOCAL_STATE=work/restore-check npm run db:restore:local -- private-data/learning-hub-backup.json
```

`LEARNING_HUB_LOCAL_STATE` chỉ nhận thư mục con của checkout. Không có chế độ remote. Script dùng INSERT, không ghi đè khóa đã có; chỉ restore vào DB trống, không merge backup vào dữ liệu đang học. Nếu restore lỗi, giữ file gốc và dùng một thư mục state mới.

Kiểm tra cả bảy bảng, **mọi giá trị** thay vì chỉ số dòng: ID bài, slot, câu trả lời, thời điểm hoàn thành, payload workspace và nhật ký phải khớp snapshot. Snapshot format 1 cũ vẫn hỗ trợ restore bốn bảng gốc.

Không commit backup, SQL restore, SQLite hoặc ảnh có câu trả lời. Receipt private của kiểm thử local ở `work/phase0/`.

## Giới hạn xác nhận

Test SQLite và restore local kiểm chứng code/database local. Chúng không chứng minh lịch cloud đã chạy, Email đã bật, credential Sites hoạt động hoặc website live đã cập nhật. Cổng tiếp theo vẫn chờ ba đêm thật.
