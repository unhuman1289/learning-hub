# Sao lưu và diễn tập phục hồi

## Phạm vi

- Staging dùng bucket riêng `learning-hub-backups-staging`; bucket không public và chỉ Worker có binding `BUCKET` truy cập.
- Mỗi bản sao chứa bài học, câu trả lời, ghi chú, tiến độ và nhật ký trong D1. Không xuất bảng tài khoản, password hash, session hay token xác minh.
- Worker chạy cron UTC `01:00` và `02:00`; chỉ lần mà thời gian là `03:00 Europe/Berlin` mới tạo bản sao. Cặp giờ UTC giữ lịch đúng qua DST và tạo đúng một bản mỗi ngày.
- R2 giữ 30 object mới nhất trong prefix của đúng môi trường. Việc dọn bản cũ không chạm object ngoài prefix đó.

## Tạo và tải bản sao

Admin đăng nhập Learning Hub, vào mục **Hôm nay**, rồi dùng:

1. **Tạo bản sao trên Cloudflare** để ghi snapshot nhất quán từ D1 vào R2.
2. **Tải bản R2 mới nhất** để tải lại đúng object đã lưu trên R2.
3. **Tải file riêng từ D1** để tạo thêm một file độc lập mà trình duyệt lưu cục bộ.

UI chỉ báo thành công sau phản hồi thành công từ Worker. Endpoint R2 yêu cầu session admin; learner không thể tạo hoặc tải backup.

## Restore drill an toàn

Sau khi tải một file R2 riêng vào thư mục riêng tư, chạy:

```sh
npm run db:restore:drill -- --file /path/to/private-r2-backup.json
```

Lệnh tạo database SQLite mới trong bộ nhớ, áp migrations local, restore bằng SQL chung với D1 và so từng ô. Nó không kết nối hoặc ghi vào D1 staging/production hiện hữu. Kết quả chỉ in tên bảng và số dòng, không in câu trả lời.

Snapshot Sites dùng `scripts/d1-import.mjs` riêng. Import chỉ chạy vào D1 staging rỗng hoặc tiếp tục đúng một import đã được đánh dấu; mọi câu SQL là `INSERT OR IGNORE`, không update/replace. Sau import, script đọc lại từ D1 remote và so từng ô. Không dùng importer để ghi vào production.

## Khôi phục dữ liệu thật

Chưa chạy lệnh restore lên database đã có người dùng. Khi có sự cố, tạo database đích mới, restore và verify ở đó trước; chỉ đổi binding sau khi đối chiếu xong. Không dùng SQL `REPLACE`, `DELETE` hoặc import vào D1 đang hoạt động để sửa lệch dữ liệu.
