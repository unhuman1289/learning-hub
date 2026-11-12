export const reasons={
 next_step:'Bạn đã sẵn sàng học bước tiếp theo.',
 step_practice:'Luyện thêm kỹ năng đang học.',
 challenge_ready:'Bạn đã làm tốt bài luyện. Hãy thử ở tình huống khó hơn.',
 confirmed_error:'Ôn lại một lỗi xuất hiện gần đây.',
 reviews_due:'Có kỹ năng đến lúc ôn lại.',
 scaffold:'Bài mới có ví dụ để ôn kiến thức nền.',
 roadmap_empty:'Đang chuẩn bị các bước tiếp theo.',
 personal:'Luyện theo nội dung bạn chọn.',
} as const;
export type ReasonCode=keyof typeof reasons;
