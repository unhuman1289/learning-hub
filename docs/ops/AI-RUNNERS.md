# AI runners — pilot Deutsch unhuman

Worker MCP: `learning-hub-mcp-staging`; Worker chấm: `learning-hub-assessor-staging`. Đây là hai luồng riêng. ChatGPT soạn qua OAuth, không cần key API; assessor dùng Anthropic API riêng và hiện tắt. Cardio của unhuman đã xóa riêng trên hai môi trường (có backup riêng tư). Không dùng số token 0 từ thuê bao làm số đo chi phí.

## Bật chấm sau khi cấu hình key

Code và quyền machine của assessor đã đưa lên staging; Queue `learning-hub-ai-staging` nối consumer assessor, kết nối schema Hub từ Worker đạt. Credential `ASSESSOR_CLIENT` chỉ `jobs:assess`/`attachments:read`, một learner unhuman, submission/recheck. Secret này tách khỏi `AUTOMATION_CLIENTS`, không thay danh sách planner hiện tại. Worker giữ bearer + Access service credential trong secrets, không trong source. Nó gọi API v2 của Hub, không qua Sites.

Từ checkout đang làm, nhập key bằng prompt terminal:

```sh
npx wrangler secret put ANTHROPIC_API_KEY --config wrangler.assessor.jsonc --env staging
```

Không dán key vào chat. Đặt giới hạn chi tiêu trên Anthropic Console trước gọi thật. Sau khi xác nhận key/quyền, đổi **riêng** `env.staging.vars.ASSESSOR_ENABLED` thành `true`, deploy riêng assessor (Queue consumer đã nối). Không bật production bằng bước này. Khi model thiếu key, refusal, max_tokens, validation thất bại: báo lỗi kỹ thuật; không lưu điểm giả. Một lượt xử lý một job, tối đa một lần sửa kết quả 422. API/network retries SDK tắt. Ghi không rõ kết quả chỉ đọc lại cùng job, không gửi lại.

Model theo plan: `claude-opus-5-5`, adaptive thinking, effort high. Chấm ảnh có tối đa 5 ảnh 3 MB theo pilot; ảnh hết hạn không gửi, ảnh không rõ cần ungradable. Pilot chỉ adult/normal, đúng learner ref và đúng ID sổ Deutsch; trẻ/clinical bị chặn trước khi gửi model. Mở rộng các đối tượng sau nghiệm thu riêng.

## Eval và nghiệm thu

`node --experimental-strip-types scripts/eval-assess.mjs` chỉ kiểm bộ mẫu, không gọi API. Có 25 bài tự soạn, 5 thử prompt injection, 5 ảnh toán tổng hợp, không có bài thật của trẻ. `goldStatus=needs-human-review`: nhãn điểm là dự thảo của agent, chưa phải chuẩn phụ huynh duyệt.

Muốn chạy model thật: export key riêng trong terminal rồi dùng `--execute-paid`. Chỉ chạy sau duyệt bộ chuẩn/hạn mức; kết quả cần ≥90% đồng ý và kiểm trích dẫn bằng chứng, không coi khớp nhãn dự thảo là đạt. Không commit key, log, bài làm hoặc dữ liệu eval của người thật.

`pilot-status.mjs staging` đọc receipt của unhuman/Deutsch. `verify-pilot.mjs <private-receipts.json>` đếm các ngày có job daily thành công trong cửa sổ 03–05 Berlin; không chứng minh scheduled task đăng ký hay người học đã học. Cần kiểm riêng actual ChatGPT task và bài làm/feedback thật.

## Lịch soạn bài

Hub xếp job lúc 03:00 Europe/Berlin. ChatGPT runner dự kiến 03:30 cùng timezone, có DST; không dùng Codex local automation để gọi là độc lập laptop. Trước đặt lịch, app MCP phải có quyền trong tác vụ thật. Chưa tạo tác vụ trong đợt này vì chưa có công cụ quản lý lịch ChatGPT cloud của tài khoản.

Prompt D trong `integrations/runner-prompts/deutsch-unhuman.md`: lease → context → schema → soạn → check → submit một lần → đọc lại job. Job không đủ điều kiện trả no_action có lý do chính xác. Receipt phải báo ID bài mới hoặc giữ bài, không gọi mọi succeeded là “đã cập nhật”.

## Tắt, xoay khóa và rollback

- Tắt nhanh grader: `ASSESSOR_ENABLED=false`; deploy riêng assessor. D1 job chưa xử lý được giữ, không fabricate điểm. Queue xử lý ngay khi có thông báo; cron dự phòng hiện mỗi giờ để tìm lại job còn queued.
- Tắt soạn: tắt `ai_enabled` đúng sổ hoặc thu hồi OAuth tại `/connections`; bài/history giữ nguyên.
- Xoay bearer assessor: chuẩn bị SHA mới trong ASSESSOR_CLIENT, lưu Worker secret tương ứng; không thay AUTOMATION_CLIENTS. Xoay Access token cần cả policy và credential; không ghi secret vào log.
- Production MCP/assessor config đã chuẩn bị, flags false, chưa deploy. D1 production còn migration 0009–0015; drill trên bản sao giữ nguyên các ô bài cũ. Không nhập staging wholesale vào production: user IDs khác nhau, không được sao chép token/JWKS giữa hai môi trường.
- Backup học tập format 4 và full auth SQL riêng tư là hai loại khác nhau. OAuth restore phải có BETTER_AUTH_SECRET tương ứng; không tự phục hồi grant từ môi trường khác. Restore thử database mới, không ghi đè production.
- Chỉ gỡ Sites/v1/learning_slots sau kiểm kê và pilot, giữ provenance `.openai/hosting.json`. Không drop bảng đang được UI production v1 dùng.

Nguồn kỹ thuật đã mở: [Cloudflare Queue limits](https://developers.cloudflare.com/queues/platform/limits/), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create), [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). Queue có thời gian chờ riêng, nhưng CPU/model/cost vẫn phải đo với workload thật.

Kiểm tra kết nối không gọi model: `/connection-check` trên assessor yêu cầu bearer của assessor, chỉ đọc schema. Health công khai chỉ cho biết cờ và boolean cấu hình. Global fetch dùng `global_fetch_strictly_public` để qua lớp Access phía trước; redirects manual, không chuyển tiếp credential.
