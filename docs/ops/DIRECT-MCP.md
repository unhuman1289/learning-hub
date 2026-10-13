# ChatGPT → Cloudflare trực tiếp (staging)

Ngày 13/10/2026. Đây là đầu nối MCP riêng, không đi qua ChatGPT Sites. Hub production, DNS và cầu nối Sites hiện có được giữ nguyên. Đã thử bằng client QA tự động; việc kết nối và ghi từ tài khoản ChatGPT thật vẫn cần nghiệm thu.

## Nối trong ChatGPT

1. Trong Settings → Apps (hoặc Plugins), mở mục tạo app/MCP tùy chỉnh mà tài khoản đang có. Đặt tên **Learning Hub Direct — staging** để phân biệt plugin Learning Hub cũ.
2. MCP server URL: **https://learning-hub-mcp-staging.tranvu-812.workers.dev/mcp**. Chọn **OAuth**, cho phép tự khám phá/đăng ký client nếu UI có lựa chọn. Không chọn API key. Không nhập Resend key, Cloudflare token, `AUTOMATION_CLIENTS` hoặc mật khẩu Hub vào trường cấu hình ChatGPT.
3. Cửa sổ OAuth mở trang Cloudflare riêng. Đăng nhập bằng **tài khoản của Hub staging** đã xác minh/được duyệt. Đây là mật khẩu Hub, không phải mật khẩu Google hoặc ChatGPT. Tài khoản chỉ tồn tại trên production có thể chưa tồn tại trên staging.
4. Đọc phạm vi và bấm **Cho phép kết nối**. Quyền chỉ đọc ngữ cảnh và soạn/lưu bài của chính tài khoản đó. Không cấp quyền chấm điểm, duyệt người, xem bài người khác hoặc tự hoàn thành bài.
5. Mở chat mới, chọn đúng app vừa tạo. Nhờ gọi `hub2_schema`; sau đó kiểm tra thấy 7 công cụ: `hub2_schema`, `hub2_lease_plan`, `hub2_context`, `hub2_check_result`, `hub2_submit_result`, `hub2_job`, `hub2_fail`.

Nếu UI bắt buộc Client ID/secret thay vì đăng ký tự động, hoặc kết nối chỉ cho phép đọc: dừng ở bước này và ghi lại lỗi/trường UI, không dán khóa vào chat. UI tạo app không tự chứng minh gói tài khoản cho phép công cụ ghi. Tham khảo [OAuth chính thức](https://developers.openai.com/plugins/build/auth) và [Developer mode/MCP](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).

## Thử một bài Deutsch thật trước khi đặt lịch

- Mở [Hub staging](https://learning-hub-staging.tranvu-812.workers.dev/), vào sổ Deutsch của cùng tài khoản. Điền mục tiêu **A2 → B2 trong một năm, ưu tiên viết và nói phục vụ công việc** và trình độ hiện tại. Chưa đưa Cardio vào lượt soạn này.
- Bật chuẩn bị bài mới lúc 03:00 nếu muốn dùng hàng đợi hằng ngày. Nếu cần thử ngay, admin tạo lượt soạn trong Quản trị → Lượt soạn và chấm. Không có job thì MCP không tự tạo bài.
- Trong ChatGPT, chọn app **Learning Hub Direct — staging** rồi dùng prompt D trong [deutsch-unhuman.md](../../integrations/runner-prompts/deutsch-unhuman.md). Yêu cầu bài Deutsch 20–30 phút với 4–8 câu: giải thích dễ hiểu, mẫu email ngắn, thực hành đổi lịch hẹn, tiêu chí sửa lỗi. Mở nguồn chính thức và ghi phạm vi/thời điểm thực sự đã đọc; không bịa việc truy cập.
- ChatGPT phải kiểm tra kết quả trước khi lưu và đọc lại **cùng jobId** sau lưu. Thành công phải có trạng thái `succeeded` và ID bài đã lưu; lời nhắn “đã soạn” không đủ.
- Đăng nhập lại Hub staging để đọc bài và kiểm tra lịch sử. Bài chưa hoàn thành phải giữ nguyên. Nếu lỗi mạng khi ghi, chỉ đọc lại `hub2_job`, không gửi lại mù.

**Chưa có tác vụ hằng ngày được tạo trong đợt này.** Chỉ đặt lịch sau khi lượt thủ công thật đạt và xác nhận scheduled task của tài khoản thực sự gọi được app này. Hub xếp job lúc 03:00 Europe/Berlin; runner có thể chạy 03:30 Europe/Berlin, bao gồm DST. Task không có quyền/công cụ thì báo chưa thực hiện, không tự nhận đã cập nhật. Máy laptop không cần chạy để Worker phục vụ; khả năng ChatGPT chạy định kỳ là nghiệm thu riêng.

## Thu hồi và bảo mật

Trong phiên đã đăng nhập đầu nối, mở [Kết nối của bạn](https://learning-hub-mcp-staging.tranvu-812.workers.dev/connections) và bấm Thu hồi quyền. Các grant/token của client đó bị thu hồi, lease đang giữ bị hủy; lịch sử/bài đã lưu được giữ. Worker kiểm tra tài khoản, client và consent trực tiếp mỗi request nên JWT đã cấp cũng bị từ chối khi consent bị gỡ. Có thể đồng thời Disconnect app trong ChatGPT; thao tác đó không được giả định thay thế thu hồi server.

Access token hết hạn sau 15 phút, refresh token tối đa 30 ngày. Chỉ callback HTTPS chính xác thuộc `chatgpt.com` được đăng ký. PKCE S256, issuer và audience resource `/mcp` được kiểm tra. Headers danh tính Sites/cookie không thay thế OAuth bearer ở MCP. Secret không nằm trong Git, giao diện ChatGPT hoặc tài liệu.

## Vận hành và rollback

- Worker: `learning-hub-mcp-staging`; cấu hình `wrangler.mcp.jsonc`. Không có environment production, cron, route DNS hoặc model API key. D1 dùng staging hiện có.
- Migration additive `0015_direct_mcp_oauth.sql`: các bảng OAuth/JWKS; 35 bảng cũ được đối chiếu nguyên vẹn trên bản sao trước áp. Không sửa dữ liệu Sites.
- Secret `BETTER_AUTH_SECRET` riêng cho Worker này mã hóa JWKS. Khi restore cần giữ secret tương ứng; không đổi secret tùy tiện. Bản export D1 chứa auth/token là dữ liệu nhạy cảm: lưu riêng tư, không commit hoặc gửi vào ChatGPT. Backup JSON học tập không bao gồm các bảng token/JWKS này; dùng quy trình export D1 riêng tư/Time Travel cho auth.
- Deploy đúng Worker riêng: `npm run deploy:mcp:staging`. Không dùng `deploy:staging` của Hub để triển khai MCP.
- Rollback bằng tắt `MCP_ENABLED` trên Worker riêng và deploy lại, hoặc rollback version Worker. Giữ bảng additive/dữ liệu để tránh mất grant/history; không drop bảng. Hub/Sites không phụ thuộc endpoint mới để chạy.
- Tool scope chỉ `hub:plan` cho người trưởng thành. Chấm AI, ảnh đính kèm, production MCP và scheduled-task acceptance chưa thuộc phần đạt.
- Gói lớn từng vượt ngân sách CPU Workers Free trong H5; phép thử MCP này không chứng minh mọi tải chạy trong định mức. Không đổi billing trong đợt này.

## Kiểm tra lại

`npm run test`, `npm run typecheck`, `npm run lint`, `npm run contracts:check`, `npm run build`.

`node scripts/direct-mcp-migration-drill.mjs <private-before.sql>` chỉ bản sao SQLite. `scripts/e2e-direct-mcp.mjs` chỉ nhận manifest QA giả/local hoặc đúng Worker MCP staging, kiểm tra OAuth → lưu bài → đọc lại → refresh → thu hồi. `scripts/reset-direct-mcp-qa.mjs` chỉ thu hồi/dọn đúng ID QA staging trong manifest; không hỗ trợ production. Không đưa manifest/mật khẩu QA vào Git.
