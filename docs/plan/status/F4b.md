# F4b — soạn sẵn bài chính

## Thay đổi

Khi hoàn thành bài chính của sổ tùy chỉnh đang bật lịch, Hub xếp job plan daily cho ngày Berlin tiếp theo. Kết quả hợp lệ được lưu trong `prepared_daily_plans` (migration 0039), chưa ghi bài hay sửa lộ trình; API đọc job báo `prepared`, không báo `succeeded`. Runner xác nhận bằng cách đọc lại job, kể cả khi phản hồi ghi bị mất.

Cron 00:00 áp bản soạn của ngày học qua writer hiện có. Writer kiểm revision, bài chính đang mở, completion và cutoff ngay trong batch. Bản soạn không còn hợp lệ hoặc quá hạn bị bỏ với lý do; không xóa bài hay câu trả lời. Job hoặc bài đã có ngăn cron tạo job thứ hai cho cùng sổ và ngày. Sổ legacy giữ chính sách lập lịch của mình. Hoàn thành lúc 00:01 không giao bài cho ngày vừa bắt đầu, nhưng có thể soạn cho ngày kế tiếp.

Bản soạn lưu cùng dữ liệu sao lưu; lease maintenance và redispatch không nhận lại nó. Khi job hoàn tất, outcome chỉ ghi ID thực sự được lưu. Migration cần được áp trước code khi triển khai sau này.

## Kiểm tra local

SQLite kiểm tra giao một lần lúc 00:00, không ghi trước giờ, bỏ completion, đổi revision, quá hạn, DST, 23:59/00:01, hai sổ độc lập và cron chạy lại. Dùng fixture và runner giả, không gọi model thật. Chưa triển khai, sửa D1 hay merge; cần nghiệm thu môi trường thật riêng.

Kết quả: `npm run test` 565/565; `npm run typecheck` đạt; `npm run lint` đạt với hai cảnh báo sẵn có trong `tutor-pet.tsx` và `ai-controls.ts`; `npm run build` đạt. Chạy với Node 22.23.2.
