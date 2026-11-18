# R · Phát hành production (bản nháp chờ chủ dự án duyệt)

Soạn 18/11/2026. Chỉ chạy khi chủ dự án duyệt trong chat. Mỗi điểm dừng (⏸) chờ chủ dự án nói "tiếp".

## Hiện trạng production (đọc 18/11, chỉ đọc)

- Worker `learning-hub-prod`, version `3e760280-6bcc-40ba-bf21-71a7777b72d7` (13/11), mã `prod-20261113-1` (`0625f56`), tên miền `learn.unhuman.cc`.
- D1 `learning-hub-prod`: thiếu 15 migration `0026` → `0040`.
- Chấm và giao bài 00:00 do runner Mac (Qwen, launchd `cc.unhuman.learning-hub-runner.production`). Production chỉ có cron `*/5`.
- `codex/hub-next-wip` đi trước `main` 494 commit, `main` không có gì mới hơn.

## Điều cần biết trước khi duyệt

1. **Migration `0027` xoá 4 bài v1 cũ của Vu ngày 07/10** (AI, Bột, MTB chưa xong; Deutsch đã xong) và các bảng run/slot v1. Bản sao lưu ở bước 2 giữ lại chúng.
2. `0026` xoá đăng ký MCP Events và token OAuth cũ: ChatGPT phải kết nối lại MCP nếu còn dùng.
3. `0028` chuyển 19 bài v2 sang gói v3 (đã chạy trên staging).
4. Sau phát hành, mọi AI đi qua OpenAI (quyết định 11.3). Chi phí dự kiến 10–20 €/tháng cho 2 người học, trả trước.

## Các bước

| # | Việc | Ai | Kiểm |
|---|---|---|---|
| 0 | Chọn giờ: sáng 19/11 **sau khi** Claude kiểm lượt 00:00 trên staging (D + F4b) đạt. Không chạy trong 23:00–01:00 Berlin | Chủ dự án | |
| 1 | Đóng băng: gộp `codex/hub-next-wip` vào `main` qua PR, CI xanh, gắn tag `prod-20261119-1`, checkout tag vào `~/Code/learning-hub-prod` | Claude | CI xanh, tag đúng SHA đã nghiệm thu |
| 2 | Tắt runner Mac: `launchctl bootout gui/$(id -u)/cc.unhuman.learning-hub-runner.production` | Claude | `launchctl list` không còn runner; không còn job `leased` bởi `home-runner` |
| 3 | Sao lưu D1 production: `wrangler d1 export` vào `private-data/backups/production/`, ghi bookmark Time Travel | Claude | Tệp có kích thước > 0; có bookmark |
| ⏸ | Chủ dự án xác nhận tiếp | | |
| 4 | Tạo Queue `learning-hub-ai-production`. Chủ dự án tự đặt secret `OPENAI_API_KEY` cho production (`npx wrangler secret put OPENAI_API_KEY --env production`) | Claude + chủ dự án | `wrangler queues list`, `secret list` có tên |
| 5 | Áp migration `0026` → `0040` | Claude | `migrations list` không còn chờ |
| 6 | Deploy Worker từ tag | Claude | Version mới, health 200 |
| 7 | Kiểm sau deploy: health; mở Hub qua cổng gia đình; một lượt nộp bài có câu viết được chấm xong (job `succeeded`, có outcome); một lượt hỏi Bột; Queue không tồn đọng | Claude + chủ dự án | Ghi job id, thời gian, token |
| 8 | Kiểm lượt 00:00 đầu tiên trên production sáng hôm sau: id bài đã lưu, không thay bài chưa xong | Claude | Theo AGENTS.md |
| 9 | Sau 7 ngày ổn: xoá client `home-runner` khỏi `AUTOMATION_CLIENTS`, gỡ plist launchd | Chủ dự án duyệt | |

## Quay lại nếu hỏng

- Worker: `npx wrangler rollback 3e760280-6bcc-40ba-bf21-71a7777b72d7 --env production`.
- D1: `npx wrangler d1 time-travel restore learning-hub-prod --env production --bookmark <bookmark bước 3>` (dữ liệu ghi sau bookmark sẽ mất); hoặc nhập lại tệp export.
- Runner Mac: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/cc.unhuman.learning-hub-runner.production.plist`.
- Bản Worker cũ chưa được thử với schema mới (`0027` xoá bảng v1 mà nó dùng), nên quay Worker thì quay cả D1. Lỗi nhỏ sau deploy thì ưu tiên sửa tiến.

## Đã nghiệm thu trên staging (18/11)

F0–F7, G1–G6, T1–T5, L7, D, Q0, C1; T4 ca bận (lượt `queued` được trả lời sau, 1 lời gọi); N do chủ dự án báo đạt; e2e chạy tay; hiệu chuẩn chấm xem HUB-NEXT-STATUS.md. Lượt Bột hồ sơ trẻ em kiểm lần đầu trên production.
