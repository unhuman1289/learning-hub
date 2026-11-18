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
Để thử từ dữ liệu mẫu mới, đặt cùng một giá trị `LEARNING_HUB_DEMO_STATE` dưới thư mục `.wrangler/` khi chạy `dev:fresh` và `dev:profiles`.
Cấu hình tự sinh nằm tại `.wrangler/demo-runner.json` và được Git bỏ qua.
Dùng `Ctrl+C` để dừng server. Nếu cổng 5174 đang bận, đặt `LEARNING_HUB_DEMO_PORT=5175` khi chạy cả `dev:profiles` và `runner:fake`.

Staging dùng Worker và Cloudflare Queue cho OpenAI. Dùng runner giả để kiểm hợp đồng Job API v2 ở local.

Trong clone staging riêng có tệp đánh dấu `.staging-checkout`, `node scripts/release.mjs staging <tag>` kiểm bản build và liệt kê migration. Thêm `--apply-migrations` để áp migration staging, deploy và kiểm health đúng tag.
