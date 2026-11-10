# Cài đặt máy chấm local và hồ sơ gia đình — việc còn lại (staging)

Viết 10/11/2026 cho chủ dự án và Codex. Plan: [LOCAL-GRADER.md](../plan/LOCAL-GRADER.md).

## Đã xong

- **Migration:** 0015 và 0016 đã chạy thử trên bản sao staging (số dòng giữ nguyên, kiểm khoá ngoại và integrity sạch), rồi áp lên D1 staging.
- **Deploy:** code nhánh `hub2/l-local-runner` đã deploy lên staging, version `525400e7-325c-4b84-b44e-ce1542ea6417`. Chưa đặt `HOUSEHOLD_GATE`, nên staging vẫn đăng nhập bằng tài khoản như cũ.
- **`private-data/automation-clients-staging.json`** (quyền 600, không vào git) gồm:
  - client cầu nối cũ, thêm scope `jobs:plan` và `history:read`;
  - client `home-runner` mới, dùng chung service token Access của cầu nối nhưng có bearer riêng.
- **`~/.config/learning-hub/home-runner.env`** (quyền 600): cấu hình cho runner trên Mac, trỏ tới staging.

## Lưu ý về mạng

Trên mạng hiện tại, Cisco Umbrella thay chứng chỉ của `*.workers.dev`, nên trình duyệt, curl và runner đều báo lỗi chứng chỉ khi gọi staging. Domain `learn.unhuman.cc` không bị ảnh hưởng.

Có hai cách:
- chạy runner ở mạng nhà;
- hoặc gắn domain riêng cho staging (mục B1, nên làm).

## A. Lệnh terminal (Codex chạy được, không cần điều khiển máy)

Chạy trong worktree `~/Code/Learning Hub/.claude/worktrees/notebook-ui`.

1. Merge PR:
   ```bash
   gh pr merge 95 --merge
   ```
2. Lưu danh sách client automation lên staging. Lệnh này thay toàn bộ danh sách, nên client QA cũ (nếu còn) sẽ bị gỡ.
   ```bash
   npx wrangler secret put AUTOMATION_CLIENTS --env staging < "../../../private-data/automation-clients-staging.json"
   ```
3. Sau khi làm xong B1: đổi `HUB_BASE_URL` trong `~/.config/learning-hub/home-runner.env` thành `https://learn-staging.unhuman.cc`.
4. Chạy thử runner một vòng:
   ```bash
   node --experimental-strip-types integrations/home-runner/runner.mjs --once
   ```
   Log phải có dòng `"event":"start"` và không có `"event":"error"`. Nếu báo `Automation credentials are invalid`, kiểm lại mục A2 và B1.
5. Cho runner tự chạy khi đăng nhập Mac:
   - chép `integrations/home-runner/launchd/cc.unhuman.learning-hub-runner.plist.example` vào `~/Library/LaunchAgents/cc.unhuman.learning-hub-runner.plist`;
   - thay `REPO` bằng đường dẫn tuyệt đối của worktree (hoặc của checkout chính, sau khi nó đã về `main`);
   - thay `NODE` bằng kết quả `which node`, và `USER` bằng `anhvutran`;
   - rồi chạy:
   ```bash
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/cc.unhuman.learning-hub-runner.plist
   ```
   Xem log ở `~/Library/Logs/learning-hub-runner.log`.
6. Sau khi làm xong B2 (cổng nhà), đặt cấu hình cho cổng. `AUD` là mã lấy ở B2; secret phải là chuỗi ngẫu nhiên, không dán vào chat.
   - Thêm vào phần `env.staging.vars` của `wrangler.jsonc`: `"HOUSEHOLD_GATE": "access"` và `"APP_ACCESS_AUD": "<AUD>"`.
   - Tạo secret:
   ```bash
   openssl rand -base64 48 | npx wrangler secret put PROFILE_COOKIE_SECRET --env staging
   ```
   - Rồi deploy:
   ```bash
   npm run deploy:staging
   ```
7. Nhập dữ liệu từ Google Sheet (sau B6):
   ```bash
   node scripts/import-legacy-sheet.mjs --dir ../../../private-data/legacy-sheets/2026-11-10 --learner XE0FebXpCvllXfrSIhbo4uaeLPSluGfS --subject sub_ecdc2fc90377f3010410 --out ../../../private-data/legacy-import.sql
   ```
   Đọc báo cáo in ra, rồi áp SQL:
   ```bash
   npx wrangler d1 execute learning-hub-staging --env staging --remote --file ../../../private-data/legacy-import.sql
   ```

## B. Việc cần điều khiển máy (Cloudflare dashboard, ChatGPT, Google Sheets)

Giao cho Codex dùng computer, theo đúng thứ tự.

**B1. Domain riêng cho staging**
1. Vào dash.cloudflare.com → tài khoản `Tranvu.812@gmail.com's Account` → **Workers & Pages** → `learning-hub-staging` → **Settings** → **Domains & Routes** → **Add** → **Custom domain** → nhập `learn-staging.unhuman.cc` → **Add domain**.
2. Vào **Zero Trust** (team `unhuman-lab`) → **Access** → **Applications**.
   - Mở ứng dụng đang có AUD `7c55439963964a7cb0a0597600f7fad2f932b80bbd650703aca1f321e0e751ef` (ứng dụng automation của staging).
   - Ở **Application domain**, thêm hostname `learn-staging.unhuman.cc` với path `api/automation`. Giữ nguyên policy service token.
   - **Save**. AUD không đổi, nên không phải sửa `AUTOMATION_ACCESS_AUD`.

**B2. Cổng nhà (thay đăng nhập bằng chọn hồ sơ)**
1. **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**.
   - Name: `Learning Hub staging – nhà`.
   - Domain: `learn-staging.unhuman.cc`, path để trống (cả host).
   - Session duration: `1 month`.
2. **Policy:** tên `Gia đình`, Action **Allow**, Include → **Emails** → điền email của từng người trong nhà. Login method: **One-time PIN**.
3. **Save**, rồi mở **Overview** của ứng dụng vừa tạo và chép **Application Audience (AUD) Tag**.
   - AUD không phải mật khẩu, nhưng chỉ đưa vào bước A6, không đăng công khai.
   - Ứng dụng automation ở B1 có path cụ thể hơn, nên `/api/automation/*` vẫn dùng service token như cũ.

**B3. Publish lại cầu nối Sites** (để ChatGPT có công cụ `hub2_status`)
- Dùng plugin Sites để publish lại `learning.unhuman12.chatgpt.site` với file `integrations/sites-bridge/site/lib/hub-bridge.mjs` của `main`.
- Giữ nguyên domain và secrets.
- Trong ChatGPT, làm mới plugin Learning Hub và kiểm tra đã thấy `hub2_status`.

**B4. ChatGPT Project "Deutsch"**
- Thay toàn bộ hướng dẫn bằng phần dưới dòng `---` của `integrations/runner-prompts/deutsch-project-v7.md`.
- Thêm vào memory của Project: `profileId của tôi trên Learning Hub là XE0FebXpCvllXfrSIhbo4uaeLPSluGfS`.
- Thử lệnh `Status`: phải gọi `hub2_status` và trả về tối đa 5 dòng.

**B5. Tác vụ ChatGPT 03:30** (nếu chưa có)
- Tạo tác vụ hằng ngày lúc 03:30 Europe/Berlin với prompt D trong `integrations/runner-prompts/deutsch-unhuman.md`.
- Chạy tay một lần trước, rồi kiểm tra bài mới xuất hiện trên Hub.

**B6. Xuất Google Sheet**
- Mở Sheet log Deutsch → với từng tab `TAGS`, `ITEMS`, `ATTEMPTS`: **File → Download → Comma-separated values (.csv)**.
- Lưu thành `~/Code/Learning Hub/private-data/legacy-sheets/2026-11-10/TAGS.csv` (tương tự `ITEMS.csv`, `ATTEMPTS.csv`).
- Không commit. Sau khi nhập xong (A7): **Share → General access → Viewer**, và thêm dòng "Đã chuyển sang Learning Hub ngày …" vào DASHBOARD.

**B7. LM Studio**
- Trong **Developer**: bật server (cổng 1234), bật **Just-in-time model loading** và **Auto unload unused JIT models** sau 30 phút.
- Trong **App Settings**: bật **Start LM Studio on login** và **Run server on login**.

## C. Việc của chủ dự án

- **Chấm tay 32 câu** trong `fixtures/eval/assess/deutsch.json`: sửa `expected` (`correct`, `partial`, `incorrect`, `ungradable`) và `facets` (G/P/N) theo đánh giá của bạn. Luật: đủ điểm là `correct`, đạt từ một nửa là `partial`, dưới một nửa là `incorrect`. Sau đó chạy:
  ```bash
  node --experimental-strip-types scripts/eval-assess.mjs
  ```
- **Điền mục tiêu và trình độ** cho sổ Deutsch trên staging; dán phần ROLE và CONTEXT của v6.1 vào ô "Prompt của sổ".
- **Production:** chỉ làm sau khi staging chạy ổn một tuần (L7), và từng bước cần bạn đồng ý.
