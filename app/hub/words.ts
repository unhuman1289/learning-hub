export const words = {
  action: {
    open: "Mở bài", continue: "Làm tiếp", check: "Kiểm tra", recheck: "Kiểm tra lại",
    finish: "Xong bài", reopen: "Mở lại bài", review: "Xem lại bài", close: "Đóng sổ",
    retry: "Thử lại", save: "Lưu", cancel: "Huỷ", later: "Để mai",
  },
  request: { title: "Xin bài", new: "Bài mới", practice: "Luyện thêm", own: "Tự chọn", ownPrompt: "Hôm nay bạn muốn luyện gì?" },
  lessonKind: { new: "Bài mới", practice: "Luyện thêm", review: "Ôn lại", own: "Tự chọn", diagnostic: "Bài đầu tiên" },
  skillState: { introduced: "Mới học", developing: "Đang luyện", demonstrated: "Đã vững", needs_review: "Cần ôn", not_assessed: "Chưa đủ dữ liệu" },
  result: { correct: "Đúng", partial: "Gần đúng", incorrect: "Sửa lại", pending: "Chờ chấm" },
  status: {
    saving: "Đang lưu…", saved: "Đã lưu", unsaved: "Chưa lưu", grading: "Đang chấm…",
    gradeLater: "Bài đã lưu, sẽ có lời phê sau.", writing: "Đang soạn bài…",
    ready: "Bài đã sẵn sàng.", notWritten: "Chưa soạn được bài.",
  },
  place: {
    desk: "Bàn học", shelf: "Tủ sách", settings: "Cài đặt", aboutYou: "Về bạn", notes: "Lời dặn",
    next: "Các bài sắp tới", days: "Ngày đã học", mistakes: "Hay nhầm", remember: "Ghi nhớ",
    product: "Sản phẩm", contents: "Mục lục",
  },
  feedback: { grade: "Lời phê", reflection: "Góp ý" },
  error: {
    offline: "Mất kết nối. Bài vẫn còn trên trang; thử lại khi có mạng.",
    unknown: "Chưa làm được. Thử lại sau một chút.",
  },
} as const;
