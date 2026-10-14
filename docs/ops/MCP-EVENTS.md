# MCP Events — staging Deutsch unhuman

Thử nghiệm cho Work Cloud của chủ dự án; email ChatGPT không được dùng để thay đổi email Hub hay chuyển learner. Kết nối OAuth vẫn đăng nhập Hub unhuman hiện tại. Không dùng model API/key, không đổi production.

## Thiết kế

MCP riêng khai báo `learning.job.queued` và handlers `events/list`, `events/subscribe`, `events/unsubscribe`, phục vụ MCP 2.0 2026-07-28 cùng legacy tools. Subscription chỉ adult unhuman và kind plan/assess nằm trong quyền OAuth/consent. Callback phải thuộc đúng origin https://chatgpt.com hoặc https://api.openai.com; nếu ChatGPT cung cấp origin khác, từ chối trước khi gửi dữ liệu và cần kiểm chứng origin đó trước thay allowlist. Không mở wildcard hay arbitrary callback để thử.

Migration 0016 thêm subscriptions và delivery receipts, không sửa learning/auth data. Signing secret do ChatGPT cấp khi subscribe, mã hóa AES-GCM với khóa dẫn xuất từ BETTER_AUTH_SECRET, không đưa vào Git/logs. Backup SQL/auth cần giữ matching secret; backup learning format4 không được coi là backup subscription. Xoay BETTER_AUTH_SECRET cần thu hồi/reconnect subscription hoặc re-encrypt có kiểm soát; không tự decode bằng khóa mới.

Mỗi phút MCP Worker staging tìm lượt queued Deutsch mới sau lúc subscription bắt đầu và chưa có receipt delivered. Đây là quét D1 nội bộ; không phải cơ chế polling của MCP Events. Tối đa 10 subscription/3 job mỗi subscription mỗi lần quét; mỗi owner tối đa 4 subscription còn hạn. TTL mặc định 24h, tối đa 7 ngày; ChatGPT refresh. Callback xác minh challenge có chữ ký Standard Webhooks, cache tối đa 5 phút cho cùng owner/client/callback/secret. Kiểm DNS A/AAAA công khai; hostname chỉ nằm trong hai origin cố định do provider sở hữu. Worker fetch dùng TLS hostname gốc và redirects manual. Không cho caller tự cấu hình DNS/host; DNS pinning socket riêng chưa có, do đó không mở arbitrary destination.

Payload chỉ jobId, kind, subject=Deutsch. Không gửi email, lời giải, câu trả lời hoặc model instruction trong event. Event ID cố định theo subscription/job; claim nguyên tử, retry tối đa 4 lần với backoff; 410 ngừng subscription, 413 dừng delivery. Job/history giữ nguyên khi lỗi. HTTP 2xx chỉ nhận thông báo, không chứng minh ChatGPT đã chạy hoặc job succeeded. Từng lần run vẫn lease/context/check/submit một lần/read same job; không thay bài chưa xong hay tự complete.

Live account/client/consent, trạng thái notebook và expiry được kiểm trước mỗi lượt quét; thu hồi OAuth chặn delivery. Hai kind có thể dùng hai subscription. Event chưa replay lịch sử; đăng ký mới không tự gửi các job cũ. Chưa hỗ trợ chấm ảnh/trẻ/y khoa.

## Nghiệm thu bằng tài khoản thật

1. Work Cloud bằng tài khoản ChatGPT của bạn; chọn plugin Hub direct staging đã đăng nhập unhuman. Refresh catalog nếu chưa thấy mục Events.
2. Đăng ký sự kiện `learning.job.queued` với arguments `kind: plan` và `kind: assess`. Cho phép ChatGPT đăng ký; không tự nhập callback/secret hoặc gửi chúng vào chat.
3. Nhờ ChatGPT: “Theo dõi các lượt Deutsch mới của unhuman. Khi có sự kiện soạn, nhận lượt bằng hub2_lease_plan, đọc context/schema, soạn theo giáo trình, kiểm và lưu một lần, đọc lại lessonIds. Khi có sự kiện chấm, dùng hub2_lease_assess, chấm rubric, kiểm và lưu một lần, đọc lại gradeIds. Giữ bài chưa xong và completion. Báo rõ lỗi, không gửi lại sau lỗi ghi chưa chắc chắn.”
4. Xác minh events/subscribe được gọi, callback challenge thành công, subscription active được lưu. Tạo một lượt mới bằng UI Hub (không tạo bài làm thay bạn); trong khoảng một phút kiểm receipt webhook và phản hồi Work Cloud.
5. Read back same job: succeeded và lessonIds/gradeIds. Kiểm subscribe khác kind không nhận event, revoke/unsubscribe dừng delivery, job/answers giữ nguyên.
6. Sau thử thủ công, 03:00 Berlin Hub xếp daily job đủ điều kiện → event → Work Cloud xử lý. Không cần scheduled task riêng cho luồng event khi đã subscribe thành công. Kiểm 3 đêm; laptop không cần hoạt động.

Không gọi “tự động đã hoạt động” chỉ vì events/list hoặc webhook 2xx. Còn cần ChatGPT đăng ký callback thật, nhận event và lưu kết quả. Nếu Work Cloud không hiện event subscription hoặc policy cấm thì giữ luồng thủ công, không giả lập receipt.

Nguồn: https://developers.openai.com/plugins/build/mcp-events (mở ngày 14/10/2026). Đây là draft integration, cần kiểm callback/UI thật. Tắt MCP_EVENTS_ENABLED trên staging và deploy riêng MCP để rollback, giữ hai bảng và history; production không khai báo cron hay bật flag này.

## Khi Work báo thiếu công cụ đăng ký

Không đồng nhất hub2_lease_plan thủ công với subscription. Kiểm tra plugin page đã có Events learning.job.queued sau rescan MCP, rồi dùng Work+Cloud đúng app. events/list/subscribe là protocol lifecycle, không cần thêm tool giả để người dùng tự điền callback/secret. Nếu Events không hiện sau rescan, giữ trạng thái blocked tại discovery; nếu hiện nhưng không subscribe được, kiểm lỗi Work/policy hoặc callback thật. Không lặp lại cùng prompt để thay việc rescan.

Ngày14/10: ảnh phiên Work báo thiếu công cụ đăng ký; readback staging0subscription/0delivery. Chưa xác định client không rescan hay policy/transport; không coi nguyên nhân là đã chứng minh. Sửa độc lập events/unsubscribe theo name/arguments/delivery đúng tài liệu; không có subscription cũ cần chuyển.

## Phân biệt phiên chạy — chẩn đoán 14/10

Ảnh plugin mới xác nhận catalog đã hiển thị Events learning.job.queued; không tiếp tục yêu cầu rescan. Đọc metadata và lịch sử chat “Theo dõi lượt Deutsch mới” xác nhận kind codex, hostId local, cwd Learning Hub và đúng thông báo thiếu công cụ đăng ký. Đây là local coding chat, không phải Work Cloud; thủ công lease/submit được nhưng không có native event subscription controller. Dùng Work trên chatgpt.com bằng tài khoản ChatGPT đã xác nhận, chọn plugin hiện có Events, đăng ký tại đó. Nếu actual WorkCloud cũng thiếu controller thì cần kiểm availability/policy riêng; không kết luận Plus luôn hỗ trợ từ việc plugin gọi được. Không chuyển chat local bằng công cụ handoff vì công cụ đó không hỗ trợ cloud. Không tạo polling thay thế; giữ yêu cầu events-only.

## WorkCloud tạo automation lỗi

Chat “Theo dõi Learning Hub” ngày14/10 là chat ChatGPT (không có cwd local), phản hồi cuối báo dùng Learning Hub/Automations và hai lần tạo lỗi. Công cụ đọc lịch sử chỉ trả user/final message, không có raw lỗi Automations; cần lấy mã lỗi trong UI. Readback vẫn0subscription/0delivery; chưa chứng minh yêu cầu chưa tới server hay callback thất bại. MCP staging bổ sung log component=mcp-events, operation, phase và category cố định, không callback URL/token/bài làm. authenticated_request thấy phương thức MCP2; handler_started/stored/failed phân biệt validation và storage. Dùng đúng một lần thử kind plan sau khi xác nhận automation chưa lưu; không tự đổi sang polling.
