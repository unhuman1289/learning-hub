# L6 · Kiểm tra nghe trên staging

**Đã nghiệm thu · 17/11/2026.** Chủ dự án chốt L6 theo kết quả máy thật. Bỏ yêu cầu bổ sung `audio_play`, đo theo tuần và kiểm thử thêm trong L6.

## Máy thật · 17/11/2026

Chủ dự án xác nhận cả iPhone tại Đức và điện thoại tại Việt Nam đạt PHONE-CHECK bước 10 với bài `les_69f0a9037cc3007f1f45` trong sổ QA L4 Deutsch · Cổng Q. Dùng lại bài đã lưu dưới tài khoản QA L4. Không tạo job Terra mới.

Theo xác nhận, cả hai câu nghe phát đủ bốn tệp, đổi giọng đúng, và các mục loa, chế độ im lặng, Bluetooth, mở từ Zalo, **Chậm hơn** và **Xem lời thoại** đều đạt. Tất cả lượt thử được báo dưới 1 giây. Không có lỗi được báo. Báo cáo chưa có model cụ thể, phiên bản trình duyệt, loại mạng hoặc số lượt bấm.

## Đối chiếu số liệu trước khi chốt

Ngày 17/11, health staging trả SHA `e8221b073660d60c9dcee4afdf8ceda5d326d203`. Tại SHA này bộ phát chưa gửi `audio_play` và D1 staging có 0 mẫu trong `perf_daily`. Kết quả dưới 1 giây đến từ lượt thử trên máy thật do chủ dự án xác nhận.
