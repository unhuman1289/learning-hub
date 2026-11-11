# home-runner — máy chấm và soạn bài trên Mac

Chương trình nền trên MacBook của nhà ([plan L1.3](../../docs/plan/LOCAL-GRADER.md#l13-integrationshome-runner)). Nó tự hỏi Hub có việc chưa: mỗi 15 giây trong khoảng 06:00–23:30 Berlin, mỗi 5 phút ban đêm. Hub không cần gọi vào Mac, nên không phải mở cổng nào.

Qwen qua LM Studio soạn bài, mở sổ, chấm và chấm lại. Runner nhận cả lượt soạn lúc 00:00 Berlin theo mặc định. Mac ngủ hoặc LM Studio chưa sẵn sàng thì lượt vẫn nằm trong hàng đợi. Chấm ảnh chỉ nhận khi đã xác minh model đọc ảnh và đặt `QWEN_VISION=1`.

## Cài đặt

1. **LM Studio:** tải `qwen/qwen3.6-35b-a3b`, rồi vào Developer → Start server (cổng 1234, chỉ localhost). Bật tự nạp model khi có yêu cầu và tự giải phóng sau 30 phút rảnh.
2. **Credential:** chép `config.example.env` vào `~/.config/learning-hub/home-runner.env`, điền bearer và service token của client `home-runner`, rồi chạy `chmod 600` cho tệp đó. Không đưa giá trị thật vào repo hay chat.
3. **Chạy thử một vòng:** `node --experimental-strip-types integrations/home-runner/runner.mjs --once`.
4. **Tự chạy khi đăng nhập:** sửa `launchd/cc.unhuman.learning-hub-runner.plist.example` (REPO, NODE, USER), chép vào `~/Library/LaunchAgents/`, rồi chạy `launchctl bootstrap gui/$(id -u) <plist>`. Log nằm ở `~/Library/Logs/learning-hub-runner.log`, chỉ có job id, engine, trạng thái và thời gian; không có bài làm.

## An toàn

- Runner giữ credential của Hub và chỉ gửi nội dung cần thiết sang LM Studio trên loopback.
- Hub kiểm mọi kết quả bằng `dryRun`. Runner có một lượt sửa khi schema hoặc Hub từ chối. Gặp lỗi mạng sau khi gửi thật thì đọc lại trạng thái job trước khi gửi lại cùng nội dung.
- **Tắt khẩn cấp:** `launchctl bootout gui/$(id -u)/cc.unhuman.learning-hub-runner`, hoặc xoá client `home-runner` khỏi `AUTOMATION_CLIENTS` (có hiệu lực ngay).

## Chép lịch sử sang Google Drive (tuỳ chọn)

Đặt `DRIVE_MIRROR_DIR` là một thư mục bên trong Google Drive for desktop, và `DRIVE_MIRROR_PROFILES` là danh sách id hồ sơ, cách nhau bởi dấu phẩy. Client `home-runner` cần thêm scope `history:read` và các id đó trong `learnerIds`.

Mỗi ngày sau 03:00 Berlin, runner ghi `lich-su-<id>.md` cho từng hồ sơ, rồi Drive tự đồng bộ. Chép một chiều: sửa trên Drive không quay về Hub. Dữ liệu chính vẫn nằm trong D1.
