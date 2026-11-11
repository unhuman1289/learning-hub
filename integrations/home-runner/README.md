# home-runner — máy chấm và soạn bài trên Mac

Chương trình nền trên MacBook của nhà ([plan L1.3](../../docs/plan/LOCAL-GRADER.md#l13-integrationshome-runner)). Nó tự hỏi Hub có việc chưa: mỗi 15 giây trong khoảng 06:00–23:30 Berlin, mỗi 5 phút ban đêm. Hub không cần gọi vào Mac, nên không phải mở cổng nào.

| Việc | Engine |
| --- | --- |
| Chấm câu mở (`assess submission`) | Qwen qua LM Studio khi cắm sạc; khi chạy pin thì Codex trước, Qwen sau |
| Chấm lại khi phản đối (`assess recheck`) | Codex (thuê bao ChatGPT); Qwen nếu Codex không làm được |
| Soạn theo yêu cầu, bài đầu của sổ mới (`plan request`, `initial`) | Codex; Qwen nếu Codex không làm được |
| Soạn bài hằng ngày (`plan daily`, Hub xếp lúc 00:00 Berlin), kèm tiến độ và lộ trình của sổ | Codex khi `RUNNER_DAILY=1` (mặc định). Đặt `0` nếu muốn để ChatGPT làm qua MCP |

Mac tắt hoặc ngủ thì việc nằm chờ. Trang bài hiện "Máy chấm đang tắt"; trang Quản trị báo khi máy vắng quá 30 phút.

**Khi ChatGPT không làm được** (hết hạn mức gói, quá 6 phút, kết quả bị Hub từ chối): việc chuyển ngay sang Qwen trên máy, kể cả khi chạy pin. Nếu ChatGPT báo hết hạn mức, Codex nghỉ 1 giờ và Qwen nhận mọi việc trong thời gian đó (quyết định 11/11/2026).

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

## Chép lịch sử sang Google Drive (tuỳ chọn)

Đặt `DRIVE_MIRROR_DIR` là một thư mục bên trong Google Drive for desktop, và `DRIVE_MIRROR_PROFILES` là danh sách id hồ sơ, cách nhau bởi dấu phẩy. Client `home-runner` cần thêm scope `history:read` và các id đó trong `learnerIds`.

Mỗi ngày sau 03:00 Berlin, runner ghi `lich-su-<id>.md` cho từng hồ sơ, rồi Drive tự đồng bộ. Chép một chiều: sửa trên Drive không quay về Hub. Dữ liệu chính vẫn nằm trong D1.
