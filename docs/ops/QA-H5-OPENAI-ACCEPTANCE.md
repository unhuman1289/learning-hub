# Nghiệm thu OpenAI staging · QA H5 Deutsch

Ngày 16/11/2026, giờ Europe/Berlin. Ca 12:07 chạy trên Worker phiên bản 94 (`54c68ea6-5dee-40fb-afb9-aac6dc58216c`) với `APP_COMMIT=58daf7554c1606205067e92ffaa23715cc1dfa4b`. Lịch sử Cloudflare ghi bản này nhận 100% lưu lượng từ 05:02:26 CET. Phạm vi chấm lại là sổ demo người lớn **QA H5 Deutsch**.

## 1. Chấm lại bằng Terra

**Ca 12:07 thất bại.** Ca demo dùng câu trả lời đã có `att_7d915c454434a6734940`, điểm gốc `gr_ad71707726ecc6935816`. Tôi tạo yêu cầu `dsp_6c870301561a89e2e1a0` và job `job_6c870301561a89e2e1a0` trực tiếp trên D1 staging để thử đường xử lý phía sau giao diện. Worker `openai-staging` nhận job. D1 ghi job `failed` sau 3 lượt lease lúc 12:07:31 CET, yêu cầu `needs_human`, câu trả lời `disputed` và điểm gốc còn nguyên. Các trường `outcome`, `usage`, `resolved_by`, `resolution_grade_id` đều rỗng. Lỗi lưu là `Runner báo thất bại`. Context ghi người lớn, dữ liệu thường và một câu văn bản không có tệp đính kèm.

- [Cấu hình adapter](../../integrations/home-runner/openai.mjs) chọn `gpt-6.1-terra` cho `recheck`. Dữ liệu lưu của ca này chưa xác nhận được model trả kết quả hoặc lưu quyết định. Nút **Chấm sai?** trên điện thoại được kiểm riêng ở mục 2.
- Có lệch giữa [prompt chấm lại](../../integrations/runner-prompts/assess-recheck.md), yêu cầu đúng một điểm, và [bộ kiểm tra](../../lib/ai-jobs/apply/recheck.ts), chỉ chấp nhận điểm mới khi đổi điểm (`overturned`). Đây là lỗi đối chiếu được trong mã, còn nguyên nhân cụ thể của ca staging chưa xác định. Năm kiểm thử recheck cục bộ chạy đạt, gồm đổi điểm và chuyển người duyệt khi thất bại.
- Bản sửa quy định `grades: []` cho giữ điểm/hủy câu, một điểm mới khi đổi điểm, và bỏ mâu thuẫn về `recheckDecision` trong prompt chấm thường. Hai fixture qua adapter Terra giả lập và D1 cục bộ đã lưu đúng quyết định, điểm hiện hành và số bản ghi điểm. Worker ghi mốc lỗi theo loại sự kiện cho lượt chấm lại tiếp theo, không ghi bài làm hay phản hồi model.
- Log tail đã quan sát invocation Queue hoàn tất, còn D1 xác nhận job lỗi. Phiên Cloudflare CLI hiện không có quyền Workers Observability để truy vấn log lịch sử của ca 12:07. Mã Worker lúc đó chỉ ghi loại lỗi API nhận diện được ở lần cuối. Không có chi tiết lưu đủ để quy nguyên nhân ca 12:07 cho prompt.
- Bản `80e6330` đã deploy staging và smoke đạt. Yêu cầu tạo bài phụ `req_2cde94a54a3137a6dcb3` kết thúc `failed`, không lưu bài, nên ca trình duyệt dùng bài mẫu phụ `les_c7db9add9ae611160001`. Nút **Chấm sai?** ở câu `att_9148e7e321f404ba6e04` trả 404 sau khi lưu `dsp_20f8157c17d879525666` ở `open`, chưa có job Terra. Mã của bài cũ chứa `key:modalverb-infinitiv` nhưng không có hàng `skills` tương ứng. Đã chỉnh bước tính lại tiến độ chỉ đọc kỹ năng có bản ghi thuộc người học, theo cùng quy tắc của lượt nộp bài. Có kiểm thử hồi quy cho trường hợp này.
- **Ca thử lại trên staging đạt.** Hub Worker phiên bản `eaf750e3-7433-4d62-925b-4f7f265510e5`, SHA `e5ec27cd0202ed33495eddd218fa1169c16b5443`. Trên bài mẫu phụ, Chromium gửi **Chấm sai?** ở câu `att_019bbe175228d0ae8103` của lượt nộp `subm_6855ff9bf46e65156c80`, HTTP 201. D1 lưu dispute `dsp_8db52da37edb0efd5339` ở `upheld`, `resolved_by=ai`, có lời giải thích, job `job_0c0e0d8f162b4a4caa28` thành công sau một lần lease lúc 14:57:52 CET. Model `gpt-6.1-terra`, 3.931 token vào, 209 ra, 4.746 ms gọi API. Điểm hiện hành vẫn `gr_eaae7b2ced8d13c72441`, `correct`, 1/1. `gradeIds=[]` và `resolution_grade_id=NULL` đúng với quyết định giữ điểm. Kết quả và lời giải thích hiện lại sau khi tải trang. Nhánh đổi điểm đạt bằng fixture cục bộ. Tổng bộ test 453/453, typecheck, lint, contracts và staging build đạt.
- Bản cuối đưa lên từ checkout staging riêng. [Workflow GitHub](https://github.com/unhuman1289/learning-hub/actions/runs/43879503402) vẫn báo `queued`, còn yêu cầu hủy trả rằng lượt chạy đã kết thúc. Health của Hub và MCP đều đã đọc lại cùng SHA `e5ec27c`. Smoke Hub đạt. D1 không có migration chờ.

## 2. Điện thoại thật · đã chuẩn bị, chờ thao tác

1. Dùng Safari trên iPhone hoặc Chrome trên Android vào [Learning Hub staging](https://learning-hub-staging.tranvu-812.workers.dev/) rồi chọn hồ sơ demo và sổ **QA H5 Deutsch**. Làm một bài phụ ở chế độ nộp cả bài để giữ nguyên bài chính cho phép thử 00:00.
2. Kiểm tra các câu đều mở sẵn. Mở **Gợi ý** ở một câu, mở **Đáp án** ở câu khác và nhập ít nhất một câu sai. Đổi câu và quay lại để xác nhận nháp còn nguyên. Trước khi nộp bài, chỉ thấy các hỗ trợ đã chủ động mở và chưa có kết quả chấm.
3. Nhấn **Nộp bài**. Ghi thời gian từ lúc nhấn tới khi có kết quả. Kiểm tra câu dùng gợi ý được chấm bình thường, câu đã xem đáp án tính lỗi, câu sai có giải thích. Tải lại trang và mở lại kết quả để kiểm tra vẫn là cùng lượt nộp.
4. Ở một câu có điểm, chọn **Chấm sai?** nếu nút hiện, rồi ghi thời gian và trạng thái. Tải lại sau khi hoàn tất để kiểm quyết định và điểm đang tính vẫn còn. Đối chiếu mã lượt nộp và yêu cầu với D1. Ghi thiết bị, hệ điều hành, trình duyệt, Wi-Fi/4G và các bước lỗi. Nếu cần lưu ảnh, lưu riêng trong `private-data/`.

## 3. Giao tự nhiên lúc 00:00 · đã đọc lại lượt 17/11

- Đọc lại vào 00:15 ngày 18/11 Berlin. Scheduler gửi lượt kiểm muộn một ngày so với mốc 00:15 ngày 17/11 dự kiến. Kết quả dưới đây là trạng thái đã lưu khi đọc lại.
- Cron tự nhiên ngày 17/11 đã tạo đúng một job `daily`/`scheduled` lúc 00:00:03 CET, `job_26b4856352254952bdd7`. Job kết thúc lúc 16:56:05 CET với status `succeeded` nhưng outcome ghi `rejected`, `lessonIds=[]`, không có bài mới. Lý do lưu cho biết schema chỉ cho câu mở trong khi yêu cầu nội dung vẫn đòi ít nhất một nửa câu chấm tự động và tối đa bốn câu mở. **Chưa đạt nghiệm thu giao bài mới** dù job báo thành công.
- QA H5 Deutsch vẫn giữ bài chính `les_9cb4019bcc11aec5da83`, chưa hoàn thành và không có bài chính mới ngày 17/11, đúng điều kiện chặn bài dang dở.
- Đối chiếu từng sổ theo truy vấn rồi tổng hợp tại thời điểm đọc lại: 15 sổ không hoạt động, 5 sổ tắt lịch, 5 sổ vướng bài chưa hoàn thành/cutoff và 1 sổ đủ điều kiện. Tất cả nhóm có 0 bài chính mới ngày 17/11. Trạng thái hiện tại không thay thế snapshot tại cutoff; chưa có đủ lịch sử để khẳng định mọi cờ sổ giữ nguyên suốt ngày.

- Cutoff tiếp theo là **00:00 CET ngày 17/11/2026** (`2026-11-16T23:00:00.000Z`). Đã đặt lượt đọc lại một lần lúc 00:15 theo giờ máy Berlin.
- Snapshot lúc khoảng 12:04 ngày 16/11 cho thấy 1 sổ đủ điều kiện sơ bộ, 15 sổ không hoạt động, 4 sổ tắt lịch và 5 sổ vướng điều kiện hoàn thành/cutoff. Cần xác định lại theo trạng thái thực tế tại cutoff. Sổ demo đang thuộc nhóm cuối với bài chính `les_9cb4019bcc11aec5da83`, chưa hoàn thành.
- Nếu người học hoàn thành bài chính demo trước cutoff, kiểm đúng một job theo lịch ngày 17/11, kết quả đã lưu có ID bài chính mới khớp D1 và ID khác bài chính cũ. Nếu bài cũ vẫn chưa hoàn thành tại cutoff, kiểm sổ giữ ID cũ và không có bài chính mới. Với mỗi sổ không đủ điều kiện, kiểm không phát sinh bài chính mới vào ngày 17/11 và chỉ ghi kết quả tổng hợp.
- D1 có 1 job `daily` ngày 16/11 còn `queued` tại lần đọc, chưa có `outcome`. Lượt đó diễn ra trước bản staging OpenAI đang nghiệm thu.

## 4. Chi phí OpenAI · đã mở dashboard

- [OpenAI Analytics](https://platform.openai.com/analytics/overview), project `learning-hub-staging`, 10–16/11/2026, hiển thị 3 request, 22.638 token, 1 lỗi API và $0,00. [Trang Spend](https://platform.openai.com/analytics/spend) cũng hiển thị $0,00 cho kỳ đang xem và tháng. Snapshot này lấy trước khi ca chấm lại kết thúc. Chưa xác nhận số credit đã trừ.
- Hai job thành công đã lưu ở D1 trước ca chấm lại gồm lượt nộp Luna `subm_95f513a5a67e7daf42d1` (4.367 token vào, 905 ra) và bài Terra `les_3d6e2b7eec96b6e65c9b` (9.790 vào, 2.373 ra). Hai dòng này có tổng 17.435 token, phạm vi hẹp hơn thống kê project.
