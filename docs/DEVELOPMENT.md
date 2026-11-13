# Chạy Learning Hub với hồ sơ mẫu

Trong thư mục repo, dùng Node 22.13 trở lên. Trên máy Mac đang dùng Homebrew Node 22, chạy:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm ci
npm run dev:fresh
npm run dev:profiles
```

Mở http://localhost:5174/, chọn **Ếch thử**, mở **Deutsch** và bấm **Bài mới**.
Trong Terminal khác, ở cùng thư mục và dùng cùng phiên bản Node, chạy `npm run runner:fake`.
Khi bài sẵn sàng, bấm **Mở bài**. Runner giả hiện được cấu hình cho hồ sơ Ếch thử và bài mẫu Deutsch.

Bản xem thử chỉ nghe trên loopback. Dữ liệu mẫu nằm tại `.wrangler/state-demo`.
Cấu hình tự sinh nằm tại `.wrangler/demo-runner.json` và được Git bỏ qua.
Dùng `Ctrl+C` để dừng server. Nếu cổng 5174 đang bận, dừng server demo đang chạy rồi mở lại.

Nếu LM Studio đã mở server ở cổng 1234, chạy `npm run runner:local` để Qwen nhận một lượt.
Thêm `-- --watch` để runner tiếp tục chờ lượt mới.

LM Studio được dùng chung với production. Chỉ chạy Qwen cho local hoặc staging khi người nhà không đang cần soạn hoặc chấm bài.

Trong clone staging riêng có tệp đánh dấu `.staging-checkout`, `node scripts/release.mjs staging <tag>` kiểm bản build và liệt kê migration. Thêm `--apply-migrations` để áp migration staging, deploy và kiểm health đúng tag.
