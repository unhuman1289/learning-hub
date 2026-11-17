# Learning Hub · Tóm tắt kiểm toán và hướng phát triển

**15/11/2026 · Quyết định đề xuất:** giữ Sổ Học, Qwen trên Mac và lịch ôn hiện tại. Ưu tiên việc người học mở bài, làm, lưu và nhận lời phê đáng tin trên điện thoại. Kiểm chứng khả năng vận dụng và nhớ sau một thời gian bằng hai sổ thử nghiệm trước khi mở rộng.

## Ta đã xây được gì?

Learning Hub là **sổ học cá nhân có khả năng điều chỉnh bài tiếp theo ở mức ban đầu**. Mỗi người có sổ và lịch sử riêng trong phạm vi gia đình. Hub lưu bản nháp, lần nộp, lần sửa và mức trợ giúp đã dùng. Câu có đáp án rõ được chấm ngay. Câu mở có thể chuyển đến Qwen trên Mac. Bài sau có thể dựa trên lỗi lặp lại, kỹ năng còn yếu hoặc lịch đến hạn. Kho nguồn công khai có phiên bản, có bước kiểm tra trước khi dùng và tách khỏi lịch sử học. [Hiện trạng](01_CURRENT_STATE.md), [Vòng học](03_LEARNING_ENGINE.md).

Thiết kế lưu qua lỗi và mất kết nối ở phía máy chủ đáng giữ. Bài chính chưa xong được giữ lại. Bài xin thêm có đường xử lý riêng. Khi gửi kết quả bị gián đoạn, runner kiểm lại đúng lượt đã gửi. Bản mã tương ứng với bản production ghi trong nhật ký vượt **414 kiểm thử** trong môi trường local sạch. Nhánh tích hợp mới hơn vượt **437 kiểm thử**. Lần kiểm toán này chưa xác nhận được Worker đang phục vụ thực tế, tình trạng runner production hoặc kết quả học trên thiết bị thật. [Phạm vi và kiểm chứng](01_CURRENT_STATE.md#audit-baseline-and-verification).

## Những việc cần quyết

| Câu hỏi | Kết luận |
|---|---|
| **Vấn đề lớn nhất là gì?** | Độ tin cậy của toàn bộ lượt học. Yêu cầu xin bài có thể chờ Mac, lỗi khi lưu cần đọc lại, chấm câu mở còn có thể sai, và các sửa lỗi điện thoại cần thử lại trên đúng phiên bản staging. Trong bộ mẫu Deutsch mở rộng đã ghi nhận, Qwen trả JSON hợp lệ ở 8/8 lượt nộp nhưng chỉ đồng ý với đáp án nháp ở 24–26/32 câu. |
| **Có đang xây đúng sản phẩm?** | Có, nếu trọng tâm là giúp từng người ôn đúng chỗ còn yếu và chứng minh đã biết dùng vào tình huống mới. Thử trước với Deutsch B1–B2 của người lớn và Toán 7 có bài được duyệt, chấm theo quy tắc rõ. Các hướng Rust, y khoa mô phỏng và kiến thức phổ thông có thể dùng lại khung bài, nguồn, lượt làm và lịch ôn. Kết quả học bền chưa được đo đủ. |
| **Có nên đổi nhà cung cấp AI?** | Giữ Qwen cho giai đoạn gia đình, dùng quy tắc cho câu đóng và nhờ người xem khi lời phê còn tranh cãi. Thử một lựa chọn cloud trên dữ liệu công khai hoặc mô phỏng nếu Mac không đáp ứng thời gian chờ hoặc chất lượng. Giá token thấp vẫn cần đối chiếu tỷ lệ bài lưu được, độ đúng của lời phê và quyền xử lý dữ liệu. Quyết định hiện hành về API trả phí vẫn áp dụng. |
| **Có nên tích hợp Sign in with ChatGPT?** | Hoãn. OpenAI có chương trình chính thức cho ứng dụng được hỗ trợ, với quyền dùng hạn mức riêng sau khi người dùng đồng ý. Chưa có bằng chứng Learning Hub được duyệt cho cách chạy trên Worker dùng chung. Luồng tự triển khai công khai yêu cầu môi trường do chính người dùng kiểm soát và hạn mức của từng người. Gói Plus không cấp quyền gọi API thông thường. Giữ kết nối ChatGPT hiện có cho việc cập nhật nguồn công khai. [Điều kiện và quy trình chính thức](02_AI_STRATEGY.md#sign-in-with-chatgpt-decision-for-this-hosted-hub). |
| **Có nên tái cấu trúc bộ bài tập?** | Hoàn tất phần đã làm trên nhánh tích hợp: một định dạng lưu mới, mỗi sổ chọn các dạng câu phù hợp, bài cũ vẫn đọc được. Hiện đã có chọn đáp án, điền chỗ trống, nối cặp, xếp thứ tự, điền bảng, gắn nhãn hình, nhập lời giải và viết mã theo rubric. Mở thêm từng dạng khi bài học cần, bắt đầu bằng nghe Deutsch. |
| **Có nên thiết kế lại vòng học?** | Giữ vòng học hiện nay và bổ sung cách đo. Ví dụ, học viên sửa được lỗi trật tự từ trong một câu, rồi áp dụng đúng trong một tình huống đặt lịch mới mà không dùng gợi ý, sau đó làm đúng ở lượt kiểm tra sau 7 hoặc 14 ngày. Kết quả ở từng bước mới giúp phân biệt sửa được một câu với nắm được kỹ năng. |
| **Dùng ChatGPT Sites vào đâu?** | Dùng để thử mẫu giao diện hay bài tương tác riêng với dữ liệu mô phỏng khi có nhu cầu. Việc học có chấm điểm và lưu tiến độ tiếp tục ở Hub trên Cloudflare. [So sánh sản phẩm](04_PRODUCT_STRATEGY.md#comparison-with-chatgpt-sites). |

## Ma trận ưu tiên

| Mức | Việc nên làm | Điều kiện để đi tiếp |
|---|---|---|
| **P0 · Thiết yếu** | Chốt đúng phiên bản Worker, cơ sở dữ liệu và runner. Diễn tập phục hồi, kiểm tra ảnh hết hạn. Thử trên iPhone và Android thật từ mở bài đến xem lại lời phê. Đọc lại bài đầu, bài xin thêm và các lượt giao lúc 00:00 Berlin. | Không mất bản nháp, điểm hoặc tiến độ; một lần nộp được lưu đúng một lần. Lượt giao bài thành công có mã bài đọc lại được, các sổ không đủ điều kiện giữ nguyên. |
| **P1 · Giá trị cao** | Hoàn tất chuyển định dạng và luyện nghe đang làm. Hiệu chuẩn chấm câu mở và đường chuyển người xem. Cho hai sổ Deutsch/Toán chạy thử, đo vận dụng tình huống mới và nhớ sau 7/14 ngày. | Có đáp án do người duyệt, số bài và số lượt đo rõ ràng. Điện thoại và dữ liệu cũ qua kiểm tra. Đánh giá kết quả học trước khi mở thêm môn. |
| **P2 · Mở rộng có điều kiện** | Thử một gói bài dùng chung có phiên bản, giữ lịch sử riêng. Đo một lựa chọn AI khác nếu có điểm nghẽn rõ. Làm quyền theo từng gia đình trước khi mời người ngoài. | Hai học viên dùng cùng bản nội dung mà không xem được dữ liệu riêng của nhau. Mọi đường đọc, ghi, tệp và xuất dữ liệu đều qua kiểm tra quyền tương ứng. |
| **P3 · Hoãn** | Hạn mức ChatGPT trong web Hub, hệ thống bài tập vạn năng, gia sư mở, chấm nói, chạy mã tùy ý, kho nội dung đại trà và hỗ trợ quyết định lâm sàng. | Xem xét từng mục khi có nhu cầu đã đo, quyền triển khai rõ và bài thử có tiêu chí đạt. |

**Việc tiếp theo:** chọn một phiên bản staging duy nhất để hoàn tất P0. Tạm hoãn việc viết lại hệ thống, chuyển AI hàng loạt hoặc mở cho người ngoài. Việc gỡ luồng cũ cần kiểm kê nơi còn gọi và diễn tập phục hồi trước. [Lộ trình, công sức và điều kiện nghiệm thu](05_ROADMAP.md).
