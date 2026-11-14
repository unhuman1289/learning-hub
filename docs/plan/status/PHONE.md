# PHONE-CHECK · 14/11/2026

Nhánh `codex/phone-check` ([PR #151](https://github.com/unhuman1289/learning-hub/pull/151)). Sửa lỗi trên `codex/phone-fixes` ([PR #150](https://github.com/unhuman1289/learning-hub/pull/150)).

Thử khoảng 13:52–14:15 Europe/Berlin. Health xác nhận staging ban đầu chạy `74167349b583`, rồi chạy bản sửa đăng nhập `7bc074ca5cef` và bản sửa tự điền `57ec13f13a33`. Health cuối xác nhận `fd11477847b2` với D1 kết nối. Dùng một tài khoản học viên thử, hai sổ Deutsch độc lập giữa hai lượt để giữ trạng thái của từng thiết bị, và sổ Toán 7. Bản chạy này dùng luồng đăng nhập email của staging. Ảnh 390 px và dữ liệu chạy nằm trong `private-data/phone-check/2026-11-14/`.

## Thử lại sau khi nâng Vinext

Đo trên staging bằng cùng hồ sơ và cùng kịch bản, gồm 24 request nối tiếp rồi 3 nhóm 12 request đồng thời.

| Staging | HTTP 500 | HTTP 200 |
|---|---:|---:|
| Vinext 1.0.0-beta.5 · `f075c9642c5c` | 0/60 | 60/60 |
| Vinext 1.4.5 · `412b6cbad1b6` | 0/60 | 60/60 |

Lượt chẩn đoán trước đó gặp 21/24 lỗi trên `16650abc10c8`. Hai lần đo đối chứng ngay sau deploy đều đạt. Chưa định lượng được mức giảm của lỗi chập chờn. [Bản sửa upstream](https://github.com/cloudflare/vinext/pull/4567).

| Bước | iPhone 13 · WebKit | Pixel 7 · Chromium |
|---|---|---|
| 2. Mở từ gáy sổ | Đạt, không cuộn ngang | Đạt, không cuộn ngang |
| 3. Học tiếp → câu đầu, < 5 s | Đạt · **1,348 s** (1,365 / 1,348 / 1,346) | Đạt · **0,793 s** (0,791 / 0,793 / 0,795) |
| 7. Tổng kết và mở lại | Đạt, kiểm hoàn thành trên server và xem lại đáp án/lời phê | Đạt, kiểm hoàn thành trên server và xem lại đáp án/lời phê |
| 8. Xin bài và mở bài đã lưu | Đạt ở lượt đối chiếu qua sổ. Lượt mở lại sau đó gặp timeout. | Đạt sau khi job hoàn tất ngoài thời hạn 270 s của lượt chờ ban đầu. |
| 9. Tạo sổ và mở bài đầu | Tạo sổ và thấy trên kệ. Sổ vẫn chờ bài đầu khi kết thúc lượt thử. | Tạo sổ và thấy trên kệ. Sổ mới nhất vẫn chờ bài đầu. Một sổ thử Android trước đó đã có bài, xác nhận qua API job. |

Ảnh và kết quả giả lập ở `private-data/phone-check/2026-11-14/integrated-237/` và `integrated-89/`. Bước 8 đối chiếu ID bài qua outcome của API job v2. Runner staging dùng một client giới hạn hồ sơ QA và chỉ chạy watch trong lúc thử bước 8–9. Hub từ chối một số kết quả Qwen với `roadmap` hoặc `over_budget`. Đã dừng runner khi hết lượt kiểm. Dừng thử lại bước 9 ở giới hạn lượt sửa kết quả Qwen.

Tail production chỉ đọc khoảng 7 phút, ghi nhận 33 request, trong đó không có `/api/today`. Không thấy lỗi Promise theo dấu hiệu từ staging ở những route quan sát được. Chưa đủ dữ liệu để đề xuất deploy production vì lỗi này.
[#152](https://github.com/unhuman1289/learning-hub/pull/152), [#150](https://github.com/unhuman1289/learning-hub/pull/150) và [#151](https://github.com/unhuman1289/learning-hub/pull/151) đã gộp theo thứ tự này. Workflow deploy sau khi gộp chạy từ `codex/hub-next-wip`, qua smoke test và health xác nhận `1dcbafe77a61`. CI Playwright của #151 chạy các bước 1–5 trên local và đã đạt.

## Kết quả giả lập trên staging trước khi nâng

Chromium dùng CDP với độ trễ 300 ms, tải xuống 1,6 Mbps và tải lên 0,75 Mbps. WebKit thêm 300 ms mỗi request bằng `page.route`, với tốc độ truyền dữ liệu của máy chạy thử. Bước 5 dùng ba câu có đáp án, đo bằng `performance` từ lúc bấm đến khi kết quả hiện. Giá trị trong ngoặc là ba lần đo. Hai ngưỡng trong bảng theo yêu cầu PHONE-CHECK.

| Bước | iPhone 13 · WebKit | Pixel 7 · Chromium |
|---|---|---|
| 1. Đăng nhập và mở lại | **Đạt** sau deploy. Trước sửa, đăng nhập 500. | **Đạt** sau deploy. Trước sửa, đăng nhập 500. |
| 2. Cuộn bàn, mở từ gáy sổ | **Đạt** ở lượt tải được bàn học. Không cuộn ngang ở 390 px. | **Chập chờn**. Mở được ở một lượt, lượt khác không tải được gáy sổ. Không cuộn ngang khi mở được. |
| 3. Học tiếp → thấy câu đầu, < 5 s | **Lỗi**. Bàn học báo lỗi tải. Không có đủ ba mốc. | **Lỗi**. Bàn học báo lỗi tải. Không có đủ ba mốc. |
| 4. Chèn ä, ß và gõ Hấu | **Đạt** thao tác và lời nhắc qua bài mẫu. Đã thử lại `autocomplete="off"` trên staging. | **Đạt** thao tác và lời nhắc qua bài mẫu. Đã thử lại `autocomplete="off"` trên staging. |
| 5. Kiểm tra, < 1,2 s | **Vượt ngưỡng**. Trung vị **1,287 s** (1,287 / 1,286 / 1,290 s) qua liên kết câu hỏi. | **Đạt thời gian**. Trung vị **0,784 s** (0,785 / 0,784 / 0,784 s) qua liên kết câu hỏi. |
| 6. Mất mạng rồi gửi lại | **Đạt sau sửa** qua đường dẫn câu hỏi. Ngắt mạng, giữ câu trả lời, gửi lại và đối chiếu đúng một lượt sau tải lại. | **Lỗi ở lượt thử lại**. `navigator.onLine` chuyển thành `false` nhưng không thấy báo mất kết nối trong 12 s sau khi bấm. Chưa xác nhận gửi lại. |
| 7. Tổng kết, mở lại bài | **Lỗi**. Thấy tổng kết. Chưa xác nhận hoàn thành, mở lại và đối chiếu lời phê. | **Lỗi**. Lệnh chạm góc lật trang gặp phần tử đổi trong lúc tương tác. Chưa xác nhận hoàn thành và lời phê. |
| 8. Xin bài và mở bài được lưu | **Chặn**. Yêu cầu được nhận, còn `queued` sau 65 s. | **Chặn**. Yêu cầu được nhận, còn `queued` sau 65 s. |
| 9. Tạo sổ và mở bài đầu | **Chặn** ở bàn học. Chưa tới nút Sổ mới trong lượt staging này. | **Chặn** ở bàn học. Chưa tới nút Sổ mới trong lượt staging này. |

UA Zalo giả lập trên cả hai máy không hiện dải “Mở bằng Safari/Chrome”. Không thử bước 10 vì staging chưa có bài nghe.

## Lỗi và điểm chặn còn lại

| Bước | Thiết bị | Mong đợi | Thực tế | Mức độ |
|---|---|---|---|---|
| 1 | Cả hai | Đăng nhập, đọc phiên | HTTP 500 khi Better Auth dùng Promise từ request đã kết thúc. Đã sửa và thử lại đạt trên `7bc074ca5cef`. | Chặn · đã sửa |
| 2, 3, 9 | Cả hai | Bàn học tải ổn, mở được sổ và câu đầu | `/api/today` trả 500. Worker tail báo cùng lỗi Promise liên request tại `ensureRouteLoaded` của bộ nạp route Vinext. Lỗi vẫn tái hiện sau khi sửa Better Auth. | Chặn |
| 2 | Cả hai | Mục tiêu chạm rộng tối thiểu 44 px | Gáy sổ đo được 36 × 152 px khi mở được. | Cần sửa |
| 4 | Cả hai | Ô viết tắt tự điền | Thiếu `autocomplete="off"` ở ô ngắn và dài. Đã sửa và thử lại bước 4 đạt trên `57ec13f13a33`. | Nhỏ · đã sửa |
| 5 | WebKit | Kết quả trong 1,2 s | Trung vị 1,287 s dưới giả lập trễ theo request. | Cần sửa |
| 6 | WebKit | Gửi lại lượt đang chờ sau khi bật mạng | Nút bị khóa cùng ô nhập. `fd11477847b2` cho phép bấm lại, đã thử lại và xác nhận đúng một lượt trên server. | Cần sửa · đã sửa |
| 6 | Chromium | Báo mất mạng và gửi lại sau khi kết nối | Trình duyệt báo offline, nhưng lượt thử chưa quan sát được thông báo của trang hoặc lần gửi lại. | Cần xác minh |
| 7 | Cả hai | Lật tới tổng kết và xem lại kết quả | Kịch bản lật trang mất đích tương tác trong một số lần. Cần phân biệt lỗi giao diện với đồng bộ của Playwright. | Cần sửa |
| 8, 9 | Cả hai | Runner lưu bài cho tài khoản thử | Credential staging đọc schema được (200), nhưng đọc trạng thái tài khoản thử trả 404 và cấu hình chỉ cho phép một tài khoản khác. Không khởi động watch với phạm vi đó. | Chặn |
| Zalo | Cả hai | Dải hướng dẫn và nút sao chép link | Không thấy dải ở lượt UA giả lập. Chưa xác nhận bằng WebView thật. | Cần sửa |

Cần chọn hướng cho lỗi bộ nạp Vinext trước khi hoàn tất luồng điện thoại. Có thể sửa cơ chế tải route và xác minh các API trong nhiều request liên tiếp, hoặc dùng bản Vinext đã xác minh tương thích với Cloudflare Workers. Để chạy bài thật, cần runner staging được cấp quyền riêng cho hồ sơ thử. Production không được sử dụng để kiểm thử.

## Trên thiết bị thật

Cần thử bàn phím ảo iPhone và khả năng che ô/nút, Telex thật, Zalo thật và mạng Wi-Fi/4G tại Việt Nam. Số đo giả lập chưa cho biết p75 tại Việt Nam.

## Bộ Playwright

`npm run test:e2e` chạy local với server `npm run dev:profiles` và runner giả. Job `e2e` được thêm vào CI. Lượt local đầu đã qua đăng nhập, gáy sổ, nhập ký tự và kiểm tra câu trên cả hai trình duyệt; còn lỗi ở các bước tiếp. 408 unit test, typecheck, lint và build local đã chạy đạt. Bộ E2E đầy đủ còn đỏ.
