# Learning Hub

Source riêng tư: https://github.com/unhuman1289/learning-hub

Phòng học của cả nhà tại **[learn.unhuman.cc](https://learn.unhuman.cc)**: mỗi chủ đề là một cuốn sổ trên tủ sách; mở sổ để đọc bài, làm bài tập, lưu bài làm và theo dõi thời gian học. Bài được giao theo từng tài khoản; ghi chú và mốc dự án hiện còn dùng chung.

## Đợt H2/H3 (13/10/2026)

Bài theo từng câu, reader skill/reading, nhập bài đã duyệt, nộp/chấm câu đóng và lịch sử sửa được triển khai trong nhánh `codex/hub2-h2-h3`, chỉ local/staging. Production chưa nhận đợt này. Câu mở chờ chấm; soạn bài đêm/AI không thuộc phần đã hoàn tất.

Thử local: `npm run seed:hub2` (chỉ database local), build/start rồi `node scripts/hub2-local-smoke.mjs http://localhost:8871`. Tài khoản demo và mật khẩu chỉ dành cho local được in bởi seed; không dùng chúng trên cloud. Xem [cách dùng thử](docs/ops/hub2-pilot.md) và [bằng chứng](docs/VALIDATION.md).

## Tài liệu

| Đọc khi | Tài liệu |
| --- | --- |
| Muốn biết Hub đang làm được gì | [docs/FEATURES.md](docs/FEATURES.md) |
| Cần hiểu hệ thống đang chạy (môi trường, dữ liệu, API, sao lưu, rủi ro) | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Sửa giao diện | [DESIGN.md](DESIGN.md) |
| Bàn hướng tiếp theo (Learning Hub 2.0) | [docs/hub2/README.md](docs/hub2/README.md): quyết định, vai trò, giao diện |
| Soạn bài, viết prompt soạn hoặc chấm | [docs/hub2/LESSON-DESIGN.md](docs/hub2/LESSON-DESIGN.md) |
| Làm bảng, luật, API cho 2.0 | [docs/hub2/DATA-MODEL.md](docs/hub2/DATA-MODEL.md), [docs/hub2/AI-API.md](docs/hub2/AI-API.md) |
| Lên việc, mở PR | [docs/plan/PLAN.md](docs/plan/PLAN.md), plan duy nhất (H0–H9), và GitHub issue nhãn `hub2` |
| Vận hành, kiểm thử | [docs/ops/](docs/ops/), [docs/VALIDATION.md](docs/VALIDATION.md), [docs/AUTOMATION.md](docs/AUTOMATION.md) (automation v1) |
| Là agent viết code hoặc nội dung | [AGENTS.md](AGENTS.md) |

Tài liệu thời ChatGPT Sites (`PRODUCT.md`, `LEARNING-UPDATES.md`, `docs/DEPLOYMENT.md`, `docs/PHASE-0-OPERATIONS.md`) được giữ để tham khảo lịch sử.

## Trạng thái (10/10/2026)

- **Production**:
  - `learn.unhuman.cc` chạy Cloudflare Worker `learning-hub-prod` với D1 `learning-hub-prod`, đã cutover khỏi Sites ngày 10/10/2026.
  - Dữ liệu export từ Sites đã được nhập.
  - `/api/health` báo `production-admin-bootstrap`, D1 connected.
- **Staging**: [learning-hub-staging.tranvu-812.workers.dev](https://learning-hub-staging.tranvu-812.workers.dev), có automation API bật sau Cloudflare Access.
- **Chưa có lịch nào tự soạn bài.** Cron chỉ tạo bản sao lưu lúc 03:00 Berlin. Hướng tiếp theo: [Learning Hub 2.0](docs/hub2/README.md).
- **Git chưa khớp production**: phần Phase 1 (learner scope, automation v1, Access, Sites bridge) đang chạy nhưng chưa commit vào `main`. Xem [ARCHITECTURE.md §10](docs/ARCHITECTURE.md#10-git-và-production-đang-lệch-nhau).
- **Đăng ký**: ai cũng đăng ký được bằng email; sau khi xác minh, admin duyệt rồi mới đăng nhập được.

## Chạy trên máy

Cần Node.js **22.13+**; dùng **Node 24+** để chạy test SQLite (CI dùng Node 24).

```sh
npm ci
npm run db:migrate:local
# Chỉ với database local mới, nếu có bản sao dữ liệu riêng:
npm run db:restore:local
npm run build
node --import ./scripts/wrangler-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --local --persist-to .wrangler/state --port 8791
```

Mở `http://localhost:8791`. Trong cấu hình local, tài khoản mới tự active và không cần xác minh email (local không gửi email); tài khoản admin là email trong `BOOTSTRAP_ADMIN_EMAIL`.

`npm run dev` hiện lỗi `sessionSchema.loose is not a function` (hai bản `zod` khi chạy dev); chạy bản build như trên. Không cần API key model để chạy Hub.

Bạn clone Git lần đầu sẽ không có `private-data/`. Có thể chạy với DB trống. Để có nội dung thật, chuyển bản sao lưu riêng qua kênh tin cậy rồi restore vào DB local **mới**; restore dùng INSERT và không ghi đè dữ liệu có sẵn.

```sh
npm run test
npm run typecheck
npm run lint
npm run build
```

## Học hằng ngày

1. Vào **Phòng học**. Trên bàn là post-it cho bài chưa xong và mục cần ôn. Bấm **Học tiếp**, **Bắt đầu**, hoặc lấy một cuốn sổ từ **Tủ sách**.
2. Đọc giải thích và sơ đồ; làm bài tập; trả lời câu tự kiểm tra rồi mới mở **đáp án gợi ý**.
3. Bấm **Lưu bài làm**; bấm **Đã học xong** khi thực sự hoàn thành. Chỉ hiện "Đã lưu" sau khi máy chủ xác nhận.
4. Bài mới cho một mảng chỉ đến khi bài trước đã xong trước 03:00 Berlin; bài chưa xong giữ nguyên; bài cũ và câu trả lời giữ trong mục lục để ôn.
5. Thời gian học tự tính khi một cuốn sổ đang mở. Rê chuột lên thước trên thanh trên cùng để xem chi tiết; bấm để đổi mục tiêu (mặc định 60 phút).

Đánh dấu hoàn thành là việc của người học; AI không tự đánh dấu.

## Năm mảng nội dung

| Mảng | Mục tiêu và bối cảnh |
|---|---|
| Deutsch | A2 tự đánh giá → B2 trong một năm cho công việc/chứng chỉ → C2 dài hạn; ưu tiên viết và nói |
| AI & Engineering | Coding, deploy và vận hành SWARM; dữ liệu ung thư hiếm → giả thuyết → phản biện bằng chứng → expert review → therapy ranking; đánh giá hồi cứu |
| Medical Systems Biology | MTB, oncology, pathology, sequencing, pharmacogenomics; kiến thức nền cho AG Busch/PM4Onco. Người học đã biết thống kê, Python, Linux, Git |
| Cardio | Kiến thức tim và phương pháp nghiên cứu. Mục tiêu 3 tháng của Ly: concept, protocol và bước đầu bảo trợ cho ý tưởng can thiệp hở hai lá nguyên phát bằng implant vòng van kết hợp clip; cần kiểm tra tính mới và khả thi |
| Bột | Ăn/ngủ, vận động, tương tác, giao tiếp, tự tin và ứng xử; cá thể hoá theo giai đoạn. Không hứa tăng IQ/chiều cao; phân biệt nghiên cứu với quan niệm văn hoá |

Giải thích chính bằng tiếng Việt, giữ thuật ngữ Anh/Đức; bài tiếng Đức theo trình độ.

## Source, dữ liệu, tài liệu ở đâu

- **Git**: source, schema và migration, tài liệu, thiết kế. Repo riêng tư; không chứa token, câu trả lời hay bản sao lưu.
- **D1**: tài khoản, bài và câu trả lời theo người, thời gian học, workspace dùng chung, nhật ký lượt soạn bài.
- **R2**: bản sao lưu D1 tự động (30 bản mới nhất).
- **Google Docs/Drive**: tài liệu dài có thể chỉnh sửa; chỉ liên kết, không đồng bộ, không làm database tiến độ.
- **`private-data/` trên máy**: snapshot phục hồi; không vào Git.

QUEST/SWARM là dự án riêng; repo Hub không chứa source hay dữ liệu bệnh nhân của hai dự án.
