# Learning Hub — tính năng

Cập nhật H2/H3 ngày 13/10/2026. Phần dưới giữ mô tả lịch sử 10/10; trạng thái mới của đợt này ở bảng sau và VALIDATION.md.

| Chức năng mới | Trạng thái đợt H2/H3 |
| --- | --- |
| Bài v2 theo từng câu, tờ kiến thức, gợi ý và lời giải | Có code; bật ở local/staging qua HUB2_ENABLED. |
| Reading: đọc nguồn, phân tích, đầu ra | Có code và fixture mẫu. |
| Lưu nháp tự động, lỗi mạng giữ nháp trong phiên trang | Có; tải lại khi còn nháp chưa lưu vẫn có nguy cơ mất nháp. |
| Bài v2 hiện trên bàn; thời gian học gắn với sổ | Có; H4–H5 staging thêm hàng đợi hôm nay và trạng thái kỹ năng dựa trên bằng chứng. |
| Nộp, chấm ngay câu đóng, giữ lần 1/lần 2 | Có; câu mở đã lưu và chờ chấm, chưa gọi model. |
| Admin nhập bài đã duyệt | Có; giữ nguyên bài chưa xong, cần đúng learnerId/subjectId. |
| Kỹ năng, lịch ôn, job soạn/chấm | H4–H5 chạy local/staging; E2E bằng runner giả đạt. Cron tạo job; chưa có runner AI thật. |
| AI thật, phản đối điểm và khám phá | H6–H7 chưa triển khai. |
| Production | Không thay đổi trong đợt H2/H3. |

Mô tả ngày 10/10/2026: Mô tả những gì người dùng thấy và làm được. Kiến trúc kỹ thuật ở [ARCHITECTURE.md](ARCHITECTURE.md); hướng tiếp theo ở [hub2/](hub2/README.md).

Cột **Trạng thái**:

- **Live**: đang chạy trên `learn.unhuman.cc` và có trong `main`.
- **Live, chưa commit**: đang chạy nhưng code chỉ nằm trong working tree Phase 1 (xem ARCHITECTURE §10).
- **Một phần**: có giao diện hoặc dữ liệu, nhưng thiếu phần phía sau.
- **Chưa có**: mới là thiết kế hoặc kế hoạch.

## 1. Người học

| Khu vực | Làm được gì | Trạng thái |
| --- | --- | --- |
| Tài khoản | Đăng ký bằng email và mật khẩu (12–128 ký tự), xác minh email, chờ admin duyệt rồi mới đăng nhập; quên và đặt lại mật khẩu. Admin đầu tiên là email trong `BOOTSTRAP_ADMIN_EMAIL`. Trang tài khoản là bìa sổ vân đá đặt trên bàn gỗ. | Live |
| Phòng học (trang chủ) | Lời chào theo ngày Berlin; mặt bàn gỗ chỉ chứa việc cần làm: post-it cho mỗi bài chưa xong (dấu **Mới** nếu nhận hôm nay và chưa trả lời) và post-it có băng dính cho mục ghi chú đến hạn ôn, kèm nút **Đã ôn**. Bài đã xong gom thành một dòng; bàn trống thì ghi "Bàn đang gọn". | Live |
| Tủ sách | Mỗi mảng là một cuốn sổ trên kệ, nhãn ghi số bài đã học và trạng thái (đang học / chờ bài mới / chưa có bài). Ô **+ Sổ mới** hiện "sắp có". | Live; "Sổ mới" chưa có |
| Cuốn sổ | Mở sổ: mục lục bên trái (bài được giao theo ngày và bài nền), trang bài bên phải. Tab **Mục tiêu** (mốc dự án, ngày bắt đầu), **Ghi chú** (nhật ký của sổ), **Tài liệu** (Google Docs và ghi chú nguồn). Trên điện thoại mục lục là một tab. | Live |
| Trang bài | Mục tiêu, kiến thức cần trước, các phần giải thích, sơ đồ (giấy note), bài tập và đầu ra cần có, câu tự kiểm tra với **đáp án gợi ý mở riêng từng câu**, ô bài làm trên giấy kẻ dòng, kẹp tài liệu (URL, phạm vi đã đọc, ngày đọc, ngày xuất bản), bài sau. | Live |
| Lưu bài làm | Bài được giao: **Lưu bài làm** và **Đã học xong / Bỏ dấu đã học**, chỉ hiện "Đã lưu …" sau khi server xác nhận. Bài nền: mỗi lần lưu thêm một mục vào Ghi chú. Bản nháp giữ khi chuyển giữa các sổ; rời trang khi còn nháp thì trình duyệt hỏi lại. | Live |
| Bài riêng theo tài khoản | Mỗi tài khoản chỉ thấy và sửa bài được giao của mình; tài khoản mới chưa có bài được giao (chỉ thấy bài nền). | Live, chưa commit |
| Con dấu "ĐÃ HỌC" | Đóng xuống ngay sau khi người học đánh dấu xong và server xác nhận; không tự động hoàn thành. | Live |
| Thời gian học | Tự tính khi một cuốn sổ đang mở, tab đang hiện và có thao tác trong 10 phút gần nhất. Lưu theo **tài khoản và ngày Berlin** trên server. Thước nhỏ trên thanh trên cùng (x/mục tiêu phút); tooltip chia theo sổ; bấm để đổi mục tiêu (mặc định 60 phút, 5–720). | Live |
| Ghi chú | Review tuần, quan sát Bột, lỗi tiếng Đức, quyết định dự án, ghi chú tài liệu; ngày ôn lại tuỳ chọn; lọc theo sổ. Lưu ngay; lỗi lưu hiện thanh báo có **Lưu lại / Tải bản trên máy chủ**. | Live; **dữ liệu dùng chung cả nhà** |
| Phản hồi cho bài làm | Thiết kế có "lời phê" của AI ở lề trang. Hiện chưa có dữ liệu chấm, nên giao diện không hiển thị. | Chưa có |
| Chọn chủ đề riêng | Thiết kế: mỗi người có kệ sổ riêng, tự mở chủ đề mới, cả nhà xem được nhưng không sửa của nhau. | Chưa có |

## 2. Quản trị (role `admin`)

| Khu vực | Làm được gì | Trạng thái |
| --- | --- | --- |
| Duyệt tài khoản | Danh sách tài khoản đã xác minh email đang chờ; duyệt từng tài khoản. Phòng học hiện số tài khoản chờ. | Live |
| Nhật ký cập nhật bài | Lần kiểm tra gần nhất, cảnh báo khi lượt soạn bài lỗi hoặc quá hạn, kết quả từng mảng (thay / giữ / lỗi) kèm lý do và nguồn. Hiện chỉ đọc nhật ký lượt cũ thời Sites; lượt automation v1 chưa hiện (P1.9). | Một phần |
| Sao lưu | Tạo bản sao lên R2, tải bản mới nhất, tải bản sao lưu đầy đủ (format 2), nhắc khi quá 7 ngày chưa sao lưu. | Live |
| Bản sao ghi chú | Tải JSON ghi chú / nhật ký / mốc đang hiển thị. | Live |

## 3. Tác vụ cloud soạn bài (không phải người)

| Khả năng | Trạng thái |
| --- | --- |
| Automation API v1: mở lượt, đọc context, gửi bài mới, xác thực bằng Cloudflare Access và khoá riêng (ARCHITECTURE §6–7) | Staging: bật; production: tắt; chưa commit |
| Ràng buộc server: không thay bài chưa xong, không tự hoàn thành, mỗi người mỗi mảng tối đa một bài mới mỗi ngày Berlin, hoàn thành sau 03:00 chờ sang ngày | Chưa commit, đã test |
| Sites bridge: ChatGPT Site gọi API qua MCP; đã thử một vòng thủ công trên staging (không gán bài) | Chưa commit |
| Lịch tự soạn bài mỗi đêm | Chưa có |

## 4. Trải nghiệm và giao diện

- **Phong cách Landhaus**: trần ván sồi có xà, tường vôi, bàn sồi cũ có ngăn kéo, tủ sơn trắng viền sồi, sổ vân đá, giấy kẻ dòng lề hồng, post-it, nút hình viên gạch (gạch nung cho thao tác chính, sa thạch cho thao tác phụ). Logo và favicon: ngôi nhà có ống khói là bút chì.
- **Chuyển động mô phỏng thao tác thật**: lấy sổ từ tủ thì bìa bay lên và lật mở; chuyển bài thì lật trang; post-it dán xuống và bong góc; ngăn kéo, cánh tủ hé mở; đóng dấu; ghi chú mới hiện như đang viết; đồng hồ cát lật khi đang tính giờ. Tắt hết khi bật "giảm chuyển động". Trình duyệt không có View Transitions vẫn chuyển trang bình thường.
- **Con trỏ bút chì** (đầu chì là điểm click); dựng lên với đầu hồng trên thứ bấm được.
- **Chế độ tối**: căn phòng buổi tối, theo cài đặt hệ thống.
- **Tiếp cận**: điều hướng bàn phím, focus hiển thị, vùng chạm tối thiểu 44 px cho nút chính, thông báo lưu qua `role=status`/`alert`; màu post-it luôn có tên mảng đi kèm.
- **Ngôn ngữ**: giao diện tiếng Việt; thuật ngữ EN/DE trong bài. Nút đổi ngôn ngữ giao diện VI/EN/DE cũ đã bỏ.

## 5. Nội dung hiện có

| Loại | Số lượng | Nguồn |
| --- | --- | --- |
| Năm mảng | Deutsch, AI & Engineering, Medical Systems Biology, Cardio & nghiên cứu, Bột & gia đình | `lib/daily-policy.ts`, `app/content.ts` |
| Bài nền (tĩnh, trong Git) | 13 bài, 10 bài có nội dung chi tiết | `app/content.ts`, `app/lesson-content.ts` |
| Bài được giao hằng ngày | 5 bài nhập từ bản export Sites, gán cho admin đầu tiên; chưa có bài nào do tác vụ tự động gửi | bảng `learning_lessons` |
| Dự án/mục tiêu | SWARM (AI), Mitral concept study (Cardio), mỗi dự án 3 mốc | `app/content.ts` |
| Google Docs | 6 sổ tài liệu (tổng quan + 5 mảng), chỉ là liên kết | `app/google-docs.ts` |

## 6. Giới hạn đã biết

- **Ghi chú, nhật ký, mốc dự án và dấu "đã học" của bài nền dùng chung một bản cho cả nhà** (`learning_workspace`, khoá `__shared_family_workspace__`). Chỉ bài được giao (learner scope, chưa commit) và thời gian học là riêng theo tài khoản.
- Một ô trả lời cho cả bài; chưa lưu câu trả lời theo từng câu hỏi, chưa chấm điểm.
- Google Docs chỉ là liên kết; chưa đồng bộ.
- `npm run dev` lỗi do hai bản `zod`; xem bản build bằng `wrangler dev` (ARCHITECTURE §9).

## MCP trực tiếp — trạng thái

Theo yêu cầu trực tiếp của chủ dự án: bổ sung Worker `learning-hub-mcp-staging`, OAuth/PKCE và migration 0015 trên D1 staging. Đường mới: ChatGPT → MCP Worker → các hàm job v2 → D1 staging; không thông qua Sites, không dùng quyền service token chung. Quyền chỉ soạn bài của chính tài khoản đã duyệt và cấp consent; không chấm/admin. API khóa khi MCP/HUB2 tắt. Có trang thu hồi kết nối.

OAuth, MCP, lưu bài giả/đọc lại, refresh và thu hồi đã đạt trên HTTPS staging. Chưa nghiệm thu kết nối/ghi của tài khoản ChatGPT thật, chưa đặt lịch cloud, chưa bật production MCP hoặc H4/H5 production. Cầu nối Sites và DNS giữ nguyên. Các cổng nghiệm thu còn lại không được coi là hoàn tất bởi phép thử QA. Hướng dẫn và giới hạn: [DIRECT-MCP](ops/DIRECT-MCP.md).
