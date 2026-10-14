# AI runners — ChatGPT thuê bao, không dùng model API

Quyết định 14/10/2026: cả soạn và chấm dùng ChatGPT qua direct MCP. Hub chỉ lưu hàng đợi/context/kết quả trong D1. Không yêu cầu Anthropic/OpenAI key, không có SDK model API trong build. Gói thuê bao không được coi là endpoint có thể gọi từ Worker.

## Cấp quyền chấm

MCP staging: https://learning-hub-mcp-staging.tranvu-812.workers.dev/mcp (OAuth). Làm mới app; nếu grant cũ chỉ có hub:plan, kết nối lại để yêu cầu thêm hub:assess và đọc trang consent. Không sửa consent bằng SQL. Token cũ dù grant mới rộng hơn vẫn không được quyền chấm.

Pilot chấm chỉ unhuman, sổ Deutsch active/normal và bật AI, câu chữ. Chưa hỗ trợ ảnh qua MCP, chưa bật trẻ/y khoa. Các job ảnh vẫn giữ trong D1, không tự đoán điểm. Thu hồi tại /connections chặn access token cũ và giữ lịch sử.

## Chạy thủ công

Nộp câu mở trên Hub staging, rồi trong ChatGPT chọn app và dùng prompt `integrations/runner-prompts/assess.md`: schema → lease_assess → context → check → submit một lần → job. Không có job thì báo không có lượt; không tự tạo câu trả lời. Nếu lỗi ghi không rõ, đọc lại cùng jobId, không lease lượt mới hay gửi lại mù. Báo grade IDs thực sự đã lưu. Không auto-complete bài.

Usage `subscription-unmetered` dùng số 0 làm placeholder schema: không phải đo token/thời gian/chi phí. Không báo “API miễn phí”.

## Lịch

Hub tạo lượt hằng ngày 03:00 Europe/Berlin. ChatGPT chạy soạn/chấm khi người dùng yêu cầu; lịch cloud 03:30 chỉ được công bố hoạt động sau khi chính tác vụ đó thực sự gọi được app. Chưa tạo/kiểm chứng tác vụ cloud. Queue không tự đánh thức ChatGPT; không cam kết chấm ngay hoặc trong 3 phút. Laptop tắt không ảnh hưởng Worker, nhưng automation local không thay task cloud.

## Eval/gates

`node --experimental-strip-types scripts/eval-assess.mjs` kiểm 25 mẫu offline, không gọi model. `goldStatus=needs-human-review`: chưa phải chuẩn phụ huynh duyệt. Chấm mẫu trong ChatGPT, lưu riêng kết quả, đối chiếu ≥90%, kiểm injection và bằng chứng. Không chấm giả vào bài thật. Còn cần bài nộp thật, 3 đêm và pilot 3 tuần. Production chưa bật Hub2/MCP; migration production 0009–0015 còn chờ nghiệm thu.

## Thu hồi và backup

Tắt đúng sổ bằng ai_enabled hoặc thu hồi OAuth; không xóa bài/history. Worker API assessor cũ luôn tắt và được loại khỏi source/workflow theo quyết định mới; việc gỡ resource staging được ghi trong VALIDATION. Không xóa Queue Hub hoặc data jobs. Sites/v1 chỉ gỡ sau kiểm kê/pilot. Backup learning format4 và SQL auth riêng tư, restore trên DB mới; không copy tokens/JWKS giữa staging/production.
