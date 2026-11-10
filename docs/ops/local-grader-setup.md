# Đưa máy chấm local và hồ sơ gia đình lên `learn.unhuman.cc`

Hướng dẫn cho Codex, viết 10/11/2026. Plan: [LOCAL-GRADER.md](../plan/LOCAL-GRADER.md). Đây là production và có dữ liệu thật, nên:
- làm đúng thứ tự;
- dừng lại báo chủ dự án nếu một bước báo lỗi;
- không dán secret, bearer, mã AUD hay nội dung `private-data/` vào chat.

**Thư mục làm việc:** `~/Code/Learning Hub/.claude/worktrees/notebook-ui` (gọi tắt là `WT`). Khi không nói gì khác, lệnh chạy trong `WT`. Thư mục `private-data/` nằm ở `~/Code/Learning Hub/private-data/`; từ `WT` đi tới đó bằng `../../../private-data/`.

**Hiện trạng:**
- Kiểm tra 10/11/2026: production đang chạy `hub2-production-2026-10-14`. D1 đã có `0015_direct_mcp_oauth.sql`, `0016_mcp_events.sql` và `0017_learning_feedback.sql`.
- Staging đã có migration 0015–0016 và code mới (version `525400e7`).
- `*.workers.dev` bị Cisco Umbrella chặn trên mạng trường, nên mọi thứ dưới đây dùng `learn.unhuman.cc`.

**Kết quả sau khi xong:**
- Mở `learn.unhuman.cc` thì nhập một mật khẩu chung cho thiết bị, rồi đến màn hình "Ai đang học?".
- Chủ nhà vào **Chế độ quản lý → Thêm hồ sơ**, nhập tên và chọn người lớn/trẻ em. Hồ sơ hiện trong danh sách để người học tự chọn; không cần email hay tài khoản riêng.
- Runner trên Mac chấm bài.
- ChatGPT soạn bài lúc 03:30.

---

## Đợt bật hồ sơ gia đình (L5.1–L5.4)

Bản tích hợp dựa trên Worker production tháng 10 và giữ các route OAuth/MCP trực tiếp, lịch, lời phê và Notes trên bàn. Bản này chỉ đưa luồng hồ sơ vào; các bước máy chấm, Sheet và Sites bên dưới thuộc đợt sau. Không lấy cấu hình hoặc merge PR #95 nguyên trạng.

- Production đã áp 0000–0017. Migration mới duy nhất cho đợt này là `0018_household_profiles.sql`; giữ nguyên tên 0000–0017. Staging đã chạy `0016_profiles.sql` có cùng SQL: **không chạy workflow deploy staging** trước khi đối chiếu và xử lý lịch sử migration ở staging.
- Khi đã có CI xanh, lấy bản sao D1 mới và thử 0018. So sánh số bài, câu trả lời, điểm, kết nối OAuth, sự kiện MCP và lời phê trước/sau; kiểm khóa ngoại và toàn vẹn.
- Chủ nhà lưu mật khẩu chung dài, ngẫu nhiên. Chỉ đưa `HOUSEHOLD_PASSPHRASE_SHA256` và `PROFILE_COOKIE_SECRET` vào secrets. `HOUSEHOLD_LEGACY_PROFILE_IDS` là các ID tài khoản cũ thuộc gia đình, đã được xác nhận, cách nhau bằng dấu phẩy. Danh sách này không cần thêm hồ sơ tạo từ giao diện và không đổi tài khoản OAuth.
- Production chưa bật `HOUSEHOLD_GATE` trong cấu hình này. Chỉ bật `passphrase` và cập nhật phiên bản sau khi có các cấu hình trên; giữ flags MCP, binding và cron hiện hành. Không ghi `AUTOMATION_CLIENTS` trong đợt này.
- Sau deploy: thiếu mật khẩu thì API hồ sơ trả 401; cổng mở đúng thì tạo/chọn được hồ sơ bằng tên; người đã có sổ vẫn thấy bài và lời phê; MCP khám phá được metadata và token cũ vẫn hoạt động. OAuth mới tiếp tục xác minh tài khoản cũ riêng của chủ nhà. Nếu lỗi, tắt riêng `HOUSEHOLD_GATE` hoặc quay lại bản Worker trước đó, giữ D1 đã mở rộng.

## Bước 1 — Cloudflare Zero Trust (cần điều khiển máy)

Vào https://one.dash.cloudflare.com, team `unhuman-lab`.

**1a. Service token cho automation**
1. **Access** → **Service credentials** → **Service Tokens** → **Create Service Token**.
2. Name: `learning-hub-automation-prod`. Duration: **Non-expiring** (hoặc 1 năm, rồi ghi lịch xoay khoá).
3. **Generate token.** Màn hình hiện **Client ID** và **Client Secret** một lần duy nhất.
   - Chép Client ID ra giấy nháp.
   - Lưu Client Secret vào tệp `~/Code/Learning Hub/private-data/prod-access-secret.txt`, chỉ một dòng. Sau đó chạy `chmod 600` cho tệp này.

**1b. Ứng dụng Access cho automation**
1. **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application name: `Learning Hub automation (prod)`. Session duration: `24 hours`.
3. Domain: `learn.unhuman.cc`, Path: `api/automation`.
4. Policy: name `Service token`, Action **Service Auth**, Include → **Service Token** → `learning-hub-automation-prod`.
5. Bỏ qua phần identity providers, rồi **Save**.
6. Mở ứng dụng → **Overview** → chép **Application Audience (AUD) Tag**. Gọi đây là `AUD_AUTOMATION`.

**1c. Cổng gia đình không cần email**
- Dùng `HOUSEHOLD_GATE=passphrase`: một mật khẩu ngẫu nhiên dài cho cả nhà, lưu trong trình quản lý mật khẩu và chia sẻ riêng.
- Không tạo Access application cho toàn domain; giữ Service Auth chỉ ở đường dẫn automation. Không cần `APP_ACCESS_AUD`.
- Sau khi qua cổng, mọi người trong nhà có thể chọn hồ sơ. Chủ nhà có thể đặt PIN quản lý để tránh sửa nhầm.

## Bước 2 — Merge và sao lưu (terminal)

```bash
# Chỉ merge PR tích hợp sau khi giữ đủ các chức năng production và CI đạt.
```

```bash
umask 077
backup_dir="$(mktemp -d ../../../private-data/local-grader-cutover.XXXXXX)"
npx wrangler d1 export learning-hub-prod --env production --remote --output "$backup_dir/production.sql"
```

```bash
npx wrangler d1 migrations list learning-hub-prod --env production --remote
```

Đối chiếu theo **tên migration** trong `d1_migrations` của từng môi trường và danh sách chưa áp của nhánh tích hợp.

## Bước 3 — Chạy thử migration trên bản sao (terminal)

Thay `NNNN …` bằng đúng các migration của bước 2, theo thứ tự:

```bash
sqlite3 -bail "$backup_dir/rehearsal.sqlite" < "$backup_dir/production.sql"
```

```bash
for t in user subjects learning_lessons learner_settings study_time; do echo "$t $(sqlite3 "$backup_dir/rehearsal.sqlite" "SELECT count(*) FROM $t")"; done
```

```bash
for f in drizzle/NNNN_*.sql; do sqlite3 "$backup_dir/rehearsal.sqlite" < "$f" || break; done
```

```bash
sqlite3 "$backup_dir/rehearsal.sqlite" "PRAGMA foreign_key_check; PRAGMA integrity_check;"
```

**Đạt khi:**
- không lệnh nào báo lỗi;
- `integrity_check` in `ok` và `foreign_key_check` không in gì;
- chạy lại lệnh đếm sau migration thì `user`, `subjects`, `learner_settings`, `study_time` giữ nguyên số dòng. `learning_lessons` có thể được dựng lại ở 0009, nhưng không được ít dòng hơn.

Không đạt thì dừng và báo chủ dự án. Xong thì xoá bản sao: `rm "$backup_dir/rehearsal.sqlite"`.

## Bước 4 — Lấy id hồ sơ (terminal)

```bash
npx wrangler d1 execute learning-hub-prod --env production --remote --command "SELECT u.id,u.name,u.status,s.role,s.display_name FROM user u LEFT JOIN learner_settings s ON s.user_id=u.id ORDER BY u.created_at"
```

```bash
npx wrangler d1 execute learning-hub-prod --env production --remote --command "SELECT id,learner_id,title,status FROM subjects ORDER BY learner_id,title"
```

Chủ nhà tự tạo hồ sơ mới từ giao diện, không cần gửi tên hay email cho Codex. Xác nhận hai tài khoản đang hoạt động đều thuộc gia đình trước khi bật bộ chọn; giữ nguyên ID cho hồ sơ đã có. Chỉ thu ID cho runner khi cần cấp quyền automation:
- `PROFILES`: các id đó, cách nhau bởi dấu phẩy;
- `OWNER`: id của chủ dự án;
- `DEUTSCH`: id sổ Deutsch của chủ dự án.

## Bước 5 — Tạo cấu hình client (terminal)

```bash
node scripts/prepare-automation-clients.mjs --origin https://learn.unhuman.cc --access-id <CLIENT_ID_1a> --access-secret-file ../../../private-data/prod-access-secret.txt --profiles <PROFILES>
```

Script tạo các tệp sau, đều quyền 600:
- `private-data/automation-clients-production.json`;
- `private-data/sites-bridge-production-secrets.json`;
- `~/.config/learning-hub/home-runner.env` (ghi đè bản staging).

## Bước 6 — Cấu hình production (sửa file, terminal)

Trong `wrangler.jsonc`, khối `env.production.vars`:
- đổi `"HUB2_ENABLED": "false"` thành `"true"`;
- đổi `APP_VERSION` thành `"hub2-local-runner-2026-11-10"`;
- thêm `"HOUSEHOLD_GATE": "passphrase"`; cấu hình `AUTOMATION_ACCESS_AUD` riêng nếu đưa runner lên.

Giữ cron production hiện hành khi bật hồ sơ. Kiểm thử lịch runner trước khi đổi.

Commit lên một nhánh mới (`hub2/prod-local-runner`), mở PR và chờ CI xanh. Không commit tệp nào trong `private-data/`.

Đặt secret cho production sau khi nhánh tích hợp đã được kiểm thử. Khi thêm runner, hợp nhất client mới với các client hiện hành trước khi ghi `AUTOMATION_CLIENTS`:

```bash
npx wrangler secret put AUTOMATION_CLIENTS --env production < ../../../private-data/automation-clients-production.json
```

```bash
openssl rand -base64 48 | npx wrangler secret put PROFILE_COOKIE_SECRET --env production
```

## Bước 7 — Áp migration và deploy (terminal)

Chỉ làm khi nhánh tích hợp đã qua kiểm thử và có cả `PROFILE_COOKIE_SECRET` lẫn `HOUSEHOLD_PASSPHRASE_SHA256`. Lưu mật khẩu chung trước, rồi đưa SHA-256 lên Worker mà không hiển thị mật khẩu hoặc hash:

```bash
python3 -c 'import getpass, hashlib, sys; p = getpass.getpass("Mật khẩu gia đình: "); len(p) >= 24 or sys.exit("Dùng mật khẩu ngẫu nhiên ít nhất 24 ký tự."); print(hashlib.sha256(p.encode()).hexdigest())' > "$backup_dir/household.sha256" &&
  npx wrangler secret put HOUSEHOLD_PASSPHRASE_SHA256 --env production < "$backup_dir/household.sha256" &&
  rm "$backup_dir/household.sha256"
```

```bash
npx wrangler d1 migrations apply learning-hub-prod --env production --remote
```

```bash
npm run deploy:production
```

**Kiểm tra trong trình duyệt** (cần điều khiển máy):
1. Mở `https://learn.unhuman.cc` → nhập mật khẩu gia đình → chọn hồ sơ theo tên.
2. Phải thấy "Ai đang học?". Tạo một hồ sơ mẫu, kiểm tra tên mới xuất hiện để chọn; sau đó ẩn hồ sơ mẫu.
3. Chọn hồ sơ chủ dự án: sổ, ghi chú và nhật ký cũ vẫn còn.
4. Mở `https://learn.unhuman.cc/api/automation/v2/schema` trong trình duyệt: phải là 401 (không có token), không được ra dữ liệu.

Hỏng thì lùi lại:
- xoá `HOUSEHOLD_GATE` khỏi `wrangler.jsonc` rồi chạy `npm run deploy:production`;
- dữ liệu lỗi thì restore từ `$backup_dir/production.sql` theo `docs/ops/BACKUP.md`.

## Bước 8 — Runner trên Mac (terminal)

1. Bật LM Studio (bước 10b).
2. Chạy thử một vòng:
   ```bash
   node --experimental-strip-types integrations/home-runner/runner.mjs --once
   ```
   **Đạt khi:** log có `"event":"start"`, không có `"event":"error"`.
3. Cho chạy nền khi đăng nhập:
   - chép `integrations/home-runner/launchd/cc.unhuman.learning-hub-runner.plist.example` thành `~/Library/LaunchAgents/cc.unhuman.learning-hub-runner.plist`;
   - thay `REPO` bằng đường dẫn tuyệt đối của `WT`, `NODE` bằng kết quả `which node`, `USER` bằng `anhvutran`;
   - rồi chạy:
   ```bash
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/cc.unhuman.learning-hub-runner.plist
   ```
4. Thử thật:
   - trong hồ sơ chủ dự án, bật AI cho sổ Deutsch, rồi nộp một câu viết;
   - trong vòng 2 phút phải có lời phê;
   - xem `~/Library/Logs/learning-hub-runner.log`.

## Bước 9 — Cầu nối ChatGPT (cần điều khiển máy, ChatGPT)

**Đường Sites chỉ là phương án dự phòng. Giữ kết nối MCP trực tiếp đang chạy; không publish hoặc chuyển tác vụ sang Sites trong đợt bật hồ sơ.**

1. Nếu đã quyết định dùng phương án dự phòng, dùng plugin Sites để publish lại `learning.unhuman12.chatgpt.site`:
   - lấy file `integrations/sites-bridge/site/` từ `main`;
   - đặt secrets của Site theo `private-data/sites-bridge-production-secrets.json`: `HUB_BRIDGE_ORIGIN`, `HUB_BRIDGE_BEARER`, `HUB_BRIDGE_ACCESS_CLIENT_ID`, `HUB_BRIDGE_ACCESS_CLIENT_SECRET`;
   - giữ nguyên domain.
2. Trong ChatGPT: làm mới plugin Learning Hub, rồi kiểm tra đã thấy `hub2_status` và `hub2_lease_plan`.
3. **Project "Deutsch":**
   - thay toàn bộ hướng dẫn bằng phần dưới dòng `---` của `integrations/runner-prompts/deutsch-project-v7.md`;
   - thêm vào memory: `profileId của tôi trên Learning Hub là <OWNER>`;
   - gõ `Status` → phải gọi `hub2_status` và trả lời tối đa 5 dòng.
4. **Tác vụ định kỳ:** hằng ngày 03:30 giờ Europe/Berlin, với prompt D trong `integrations/runner-prompts/deutsch-unhuman.md`. Bấm chạy thử một lần, rồi mở Hub xem bài mới.

## Bước 10 — Dữ liệu và máy (cần điều khiển máy)

**10a. Google Sheet**
1. Mở Sheet log Deutsch. Với từng tab `TAGS`, `ITEMS`, `ATTEMPTS`: **File** → **Download** → **Comma-separated values (.csv)**.
2. Lưu thành `~/Code/Learning Hub/private-data/legacy-sheets/2026-11-10/TAGS.csv` (tương tự `ITEMS.csv`, `ATTEMPTS.csv`).
3. Nhập vào Hub:
   ```bash
   node scripts/import-legacy-sheet.mjs --dir ../../../private-data/legacy-sheets/2026-11-10 --learner <OWNER> --subject <DEUTSCH> --out ../../../private-data/legacy-import.sql
   ```
   Đọc báo cáo và đoạn tóm tắt in ra, rồi áp:
   ```bash
   npx wrangler d1 execute learning-hub-prod --env production --remote --file ../../../private-data/legacy-import.sql
   ```
4. Trong Sheet: **Share** → General access → **Viewer**, và ghi "Đã chuyển sang Learning Hub ngày 10/11/2026" ở DASHBOARD.

**10b. LM Studio**
- **Developer** → bật server (cổng 1234), **Just-in-time model loading**, **Auto unload unused JIT models** sau 30 phút.
- **Settings** → **Start LM Studio on login** và **Run server on login**.

## Việc của chủ dự án

- Lưu mật khẩu chung ở trình quản lý mật khẩu. Tự tạo tên từng người trong Hub khi luồng hồ sơ đã lên production.
- Trong Hub: điền mục tiêu, trình độ và "Prompt của sổ" cho sổ Deutsch (dán phần ROLE và CONTEXT của v6.1); điền "Prompt cá nhân".
- Chấm tay 32 câu trong `fixtures/eval/assess/deutsch.json` (sửa `expected`, `facets`), rồi chạy `node --experimental-strip-types scripts/eval-assess.mjs`. Lần đo đầu Qwen khớp khoảng 75–80%; ngưỡng tin dùng là 90%.
