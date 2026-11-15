# T0 · Cổng kỹ thuật gia sư

**14/11/2026 · Đạt mục 1, 2, 3 và 5. Mục 4 sẽ kiểm WebSocket 101 qua Access ở T2, sau khi route Tutor đã deploy lên staging.**

Spike nằm trên `codex/t0-spike`, từ `8d9860f` của `codex/hub-next-wip`. Phép đo dùng hồ sơ demo và runner giả. Không deploy, không gộp.

## 1–2 · SQLite và luồng Vinext — đạt

- `build/worker.ts` export `TutorRelay`. `wrangler.jsonc` khai báo `TUTOR_RELAY` và migration `t0` với `new_sqlite_classes: ["TutorRelay"]` cho local và staging. Đối chiếu khối production với bản gốc, nội dung trùng khớp.
- Node **22.23.2**, Vinext **1.4.5**, Wrangler **4.92.0**. Build local và build cấu hình staging thành công. Chạy `wrangler dev --config dist/server/wrangler.json --local --persist-to .wrangler/t0-state --ip 127.0.0.1 --port 18871 --inspector-port 0` trên bản build local. Dùng config do Vinext sinh để Wrangler tìm được thư mục assets. D1 trong thư mục này được seed bằng `LEARNING_HUB_LOCAL_STATE=.wrangler/t0-state npm run seed:hub2`.
- `GET /api/t0-spike` đi qua route handler Vinext và chuyển tiếp `response.body` từ Durable Object. Không có phiên trả `401`. Có phiên demo nhưng runner chưa kết nối trả `503`. Runner mở `/api/t0-spike/connect` nhận `101`. Khi chạy, cả 10 lượt trả `200`, có dấu xác nhận route Vinext và `SELECT 1` qua SQLite, đọc được hai sự kiện SSE riêng qua `getReader()`. Chữ đầu đến **774–801 ms trước khi runner gửi `done`**.

## 3 · Hạn mức Workers Free — đạt theo ước tính

Đọc tài liệu Cloudflare ngày 14/11/2026, các mục giới hạn, tính phí và vòng đời của Durable Object.

- Free hỗ trợ Durable Object dùng SQLite. Tổng dung lượng **5 GB/tài khoản**, **5 triệu dòng đọc/ngày** và **100.000 dòng ghi/ngày**. Phần SQLite đầy của tài liệu ghi **1 GB/object Free**, dù bảng chung ghi 10 GB/object. Dùng mốc 1 GB để lập ngân sách. [Giới hạn Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/) · [Cách tính phí](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- **100.000 request/ngày**, **13.000 GB-s/ngày**, reset 00:00 UTC. Duration tính theo thời gian thực khi object hoạt động hoặc chưa đủ điều kiện ngủ, với 128 MB cấp cho object. CPU mặc định 30 giây mỗi lần gọi. HTTP/RPC đang kết nối không có giới hạn cứng về thời gian thực. Worker đứng trước có hạn mức riêng trên Free, gồm 100.000 request/ngày và 10 ms CPU/lần gọi. [Cách tính phí](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [Giới hạn Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/#wall-time-limits-by-invocation-type) · [Giới hạn Workers](https://developers.cloudflare.com/workers/platform/limits/)
- Một lần mở WebSocket tính một request, **20 tin đến = 1 request** để tính phí. Tin gửi đi và ping ở tầng giao thức không tính request. Hibernation cho tối đa **32.768 socket/object**, giới hạn tin đến **32 MiB**. Spike gọi `ctx.acceptWebSocket()`, tìm lại socket qua `ctx.getWebSockets()` và trả lời nhịp tim bằng `ctx.setWebSocketAutoResponse()`. Sau **12 giây** rảnh trên local, socket cũ nhận `pong`, sau đó lượt 10 nhận SSE với mã instance mới. Đây là bằng chứng object được khởi tạo lại trong khi socket vẫn mở. Thời gian rảnh đủ điều kiện hibernation và nhịp tim tự trả lời không cộng duration. [Cách tính phí](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/api/state/#acceptwebsocket) · [Vòng đời](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)

Giả định 20 lượt/người/ngày, 30 ngày, một runner, một request DO mở SSE mỗi lượt, 20 `delta` + 1 `done` mỗi lượt và một handshake mỗi ngày. Lấy **3 hồ sơ demo** làm ví dụ, tính cả quản trị để dự trù.

| Chỉ số | Mỗi ngày với 3 hồ sơ | 30 ngày |
| --- | ---: | ---: |
| Lượt hỏi (`20 × N` mỗi ngày) | 60 | 1.800 |
| Request DO (`20 × N × (1 + 21/20) + 1`) | 124 | 3.720 |
| Request nếu dự trù cả nhịp tim ứng dụng mỗi 30 giây theo 20:1 | 268 | 8.040 |
| Duration với giả định 30 giây hoạt động/lượt, tính 0,125 GB cho mỗi object | 225 GB-s | 6.750 GB-s |

Hàng cuối là kịch bản dự trù cho lượt trả lời thật. Lấy 1,344 giây/lượt, mức cao nhất của phép đo local, thì cùng tải tương đương khoảng **10,1 GB-s/ngày**. Spike chỉ kiểm tra SQLite bằng `SELECT 1`. Theo T1–T2, D1 giữ lịch sử và hàng đợi, relay không ghi một dòng SQLite cho mỗi đoạn. Đây là ước tính riêng cho Tutor. Mức dùng chung của tài khoản và CPU thật chờ đo ở T5.

## 4 · WebSocket qua Access — kiểm trên staging ở T2

Thử bằng cặp header `CF-Access-Client-Id` / `CF-Access-Client-Secret` và bearer runner của staging hiện có. Probe chỉ đọc. Đối chứng HTTPS `GET /api/automation/v2/schema` trả **403** khi thiếu thông tin xác thực và **200** khi cấp đủ. [Cloudflare Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)

| Client | Upgrade tới `/api/automation/v2/tutor/connect` | Upgrade đối chứng tới `/api/automation/v2/schema` |
| --- | ---: | ---: |
| Node 22.23.2, `new WebSocket(url, { headers })` | 404 | 200 |
| `ws` 8.18.0, `new WS(url, { headers })` | 404 | 200 |

Node 22 gửi được header qua Access. Staging hiện có chưa phục vụ route Tutor, nên chưa có **101** để xác nhận kết nối đầu cuối. `ws` cho cùng kết quả. Ở T2, sau khi route Tutor đã deploy lên staging, kiểm WebSocket qua Access bằng cách xác nhận phản hồi **101** và chuyển một đoạn thử. Thử Node 22 native trước, rồi thử `ws` nếu cần. Chỉ dùng **HTTP long-poll tối đa 25 giây** nếu ở lần kiểm T2 cả hai client đều không mở được kết nối. Long-poll trả ngay khi có lượt hoặc trả `204` khi hết thời gian. Runner gửi đoạn qua POST với `turnId` và số thứ tự để xử lý lần gửi lại, rồi gửi `done`. Giữ Access và bearer có scope theo T2. Ước tính một runner rảnh 24/7 nối poll liền nhau tạo **3.456 poll/ngày**, **103.680 poll/30 ngày**. Nếu mọi poll giữ DO hoạt động liên tục, riêng phần chờ có thể tốn khoảng **10.800 GB-s/ngày**. Vì vậy dự phòng nên giữ chờ ở Worker và gọi relay khi có dữ liệu hoặc cập nhật. Phương án này chưa được triển khai trong spike.

## 5 · Thời gian tới chữ đầu trên local — đạt

Đo từ lúc client gửi GET có cookie demo tới khi đọc được đoạn SSE đầu. Runner đợi 500 ms kể từ khi nhận `ask` rồi gửi “Chữ đầu”, đợi thêm 800 ms trước đoạn sau và `done`. Thời gian đợi đo được tại runner là **500–504 ms**.

| Chỉ số | Kết quả (10 lượt) |
| --- | ---: |
| Chữ đầu từng lượt (ms) | 515, 512, 515, 512, 545, 546, 516, 522, 529, 515 |
| Chữ đầu, trung vị (min–max) | **515,5 ms (512–546 ms)** |
| Từ lúc runner gửi đoạn đầu đến lúc client đọc | 1–27 ms |
| Đọc hết luồng | 1.314–1.344 ms |
| Chữ đầu ở lượt 10 sau hibernation | 515 ms |

`npm run test` **410/410**, `npm run typecheck` và `npm run lint` đều đạt. Số đo qua loopback gồm xác minh phiên demo. T5 sẽ đo riêng trên staging với runner thật.
