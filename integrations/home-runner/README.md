# home-runner — máy chấm và soạn bài trên Mac

Chương trình nền trên MacBook của nhà ([plan L1.3](../../docs/plan/LOCAL-GRADER.md#l13-integrationshome-runner)). Nó tự hỏi Hub có việc chưa: mỗi 15 giây trong khoảng 06:00–23:30 Berlin, mỗi 5 phút ban đêm. Hub không cần gọi vào Mac, nên không phải mở cổng nào.

| Việc | Engine |
| --- | --- |
| Chấm câu mở (`assess submission`) | Qwen qua LM Studio khi cắm sạc; Codex khi chạy pin hoặc Qwen lỗi |
| Chấm lại khi phản đối (`assess recheck`) | Codex (thuê bao ChatGPT) |
| Soạn theo yêu cầu, bài đầu của sổ mới (`plan request`, `initial`) | Codex |
| Soạn bài hằng ngày (`plan daily`) | Không làm ở đây; tác vụ ChatGPT 03:30 làm |

Mac tắt hoặc ngủ thì việc nằm chờ. Trang bài hiện "Máy chấm đang tắt"; trang Quản trị báo khi máy vắng quá 30 phút.

## Cài đặt

1. **LM Studio:** tải `qwen/qwen3.6-35b-a3b`, rồi vào Developer → Start server (cổng 1234, chỉ localhost). Bật tự nạp model khi có yêu cầu và tự giải phóng sau 30 phút rảnh.
2. **Codex:** chạy `codex login` một lần bằng tài khoản ChatGPT.
3. **Credential:** chép `config.example.env` vào `~/.config/learning-hub/home-runner.env`, điền bearer và service token của client `home-runner`, rồi chạy `chmod 600` cho tệp đó. Không đưa giá trị thật vào repo hay chat.
4. **Chạy thử một vòng:** `node --experimental-strip-types integrations/home-runner/runner.mjs --once`.
5. **Tự chạy khi đăng nhập:** sửa `launchd/cc.unhuman.learning-hub-runner.plist.example` (REPO, NODE, USER), chép vào `~/Library/LaunchAgents/`, rồi chạy `launchctl bootstrap gui/$(id -u) <plist>`. Log nằm ở `~/Library/Logs/learning-hub-runner.log`, chỉ có job id, engine, trạng thái và thời gian; không có bài làm.

## An toàn

- **Engine là hàm thuần.** Engine nhận prompt cùng context và trả JSON. Credential của Hub không đi vào prompt hay vào tiến trình Codex hoặc Claude: biến `HUB_*` và mọi tên có `SECRET` bị lọc khỏi môi trường.
- **Codex chạy trong sandbox chỉ đọc**, ở thư mục tạm riêng, xoá sau mỗi job.
- **Hub kiểm mọi kết quả.** Runner gửi thử (`dryRun`) trước, sửa lỗi 422 tối đa một lần cho mỗi engine. Gặp lỗi mạng sau khi gửi thật thì đọc lại trạng thái job; chỉ gửi lại đúng nội dung cũ.
- **Tắt khẩn cấp:** `launchctl bootout gui/$(id -u)/cc.unhuman.learning-hub-runner`, hoặc xoá client `home-runner` khỏi `AUTOMATION_CLIENTS` (có hiệu lực ngay).
