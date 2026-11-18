# HUB-NEXT · Trạng thái

Bảng tổng hợp trên `codex/hub-next-wip`, cập nhật khi gộp PR. Chi tiết tiến độ và kết quả kiểm tra nằm trong `docs/plan/status/<bước>.md` trên nhánh của bước đó.

**Cập nhật ngày 17/11/2026.** Nhánh `codex/hub-next-wip`, [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144).

## Môi trường

Mục tiêu là các luồng AI trên staging dùng OpenAI API và bỏ phụ thuộc Qwen local theo [quyết định 16/11](HUB-NEXT.md#quyết-định-16112026--openai-api-và-chấm-cuối-bài). Queue OpenAI và chế độ nộp cả bài hiện mới bật cho sổ demo người lớn **QA H5 Deutsch**. Bài nghe đã chạy qua Terra và OpenAI Speech (L4).

**Kế hoạch đang chạy:** [`LGTK.md`](LGTK.md) bản 2 ngày 17/11/2026. Claude lập plan, điều phối và cập nhật bảng này. Chat Codex chỉ ghi `status/<bước>.md` trên nhánh của mình.

Khung staging đợt 1 bản 2 (L7, F0, G4, T2, migration `0034`) đã đóng lúc 11:03 Europe/Berlin ngày 17/11.

Khung nghiệm thu đợt 1 đã đóng ngày 17/11 mà chưa nghiệm thu được G4, L7, T2: không đọc lại được secret allowlist và Queue không có trần số lần gọi. Cần bước A1 (LGTK mục 6). F0 đã đo được thời gian server.

GitHub Actions chạy lại sau khi chủ dự án lên GitHub Pro (17/11). Repo chuyển sang public ngày 17/11 sau khi H1 lên staging.

Khung staging H1 đã đóng lúc 12:32 Europe/Berlin ngày 17/11.

Khung staging A1 đã đóng lúc 13:48 Europe/Berlin ngày 17/11.

Khung staging F2/F6/AI mặc định đã đóng lúc 16:56 Europe/Berlin ngày 17/11.

Khung staging T2 đo thời gian đã đóng lúc 17:29 Europe/Berlin ngày 17/11.

Khung staging #196–#198 đã đóng lúc 18:09 Europe/Berlin ngày 17/11.

Khung staging L7 job kẹt đã đóng lúc 18:58 Europe/Berlin ngày 17/11.

Khung staging T2.1 phần 1 đã đóng lúc 19:46 Europe/Berlin ngày 17/11.

Khung staging T3 đã đóng lúc 22:42 Europe/Berlin ngày 17/11.

Khung staging T3b đã đóng lúc 23:32 Europe/Berlin ngày 17/11.

Khung staging G3/F3/sprite v2 đã đóng lúc 00:17 Europe/Berlin ngày 18/11.

Khung staging G5/D/G3 sửa đã đóng lúc 07:38 Europe/Berlin ngày 18/11.

Khung staging F6.1/G3/G5b/G5c đã đóng lúc 09:31 Europe/Berlin ngày 18/11.

Khung staging G3/T5/F5/G6 đã đóng lúc 11:00 Europe/Berlin ngày 18/11.

Khung staging F5 đo đã đóng lúc 11:10 Europe/Berlin ngày 18/11.

Khung staging G3 #222 đã đóng lúc 11:10 Europe/Berlin ngày 18/11.

Khung staging G3/T5 sửa/C1 đã đóng lúc 12:08 Europe/Berlin ngày 18/11.

Khung staging F4b/F4+F7 đã đóng lúc 12:40 Europe/Berlin ngày 18/11.

Chỉ deploy staging từ `codex/hub-next-wip`. Trước khi deploy, ghi một dòng theo mẫu `staging: <luồng>, đến <giờ> Europe/Berlin`. Trong khung đã ghi, luồng khác hỏi chủ dự án trước khi deploy.

| | Đang chạy | Ghi chú |
|---|---|---|
| Production | tag `prod-20261118-3` (`7e30463`), Worker version `3adba81c-e3bf-4b5d-a71f-c0951121c1fb`, health 200 | 22:31 Berlin theo yêu cầu chủ dự án: W1 [#237](https://github.com/unhuman1289/learning-hub/pull/237) (bài mới chấm cả bài kể cả sổ nghe; ảnh cho mọi câu tính; bài chính 30 phút 10–14 câu, bài thêm 15 phút 6–8 câu; trần output soạn bài 16.000), W2 [#238](https://github.com/unhuman1289/learning-hub/pull/238) (bỏ Kiểm tra từng câu, nộp ở Tổng kết cho mọi bài, "Nộp ảnh bài làm"). Không migration. Chưa soạn thử bài thật bằng W1 trước khi lên; lượt 00:00 đêm nay là lượt thật đầu tiên. Quay lại: Worker `eabb3417-7ea8-4f88-aaa7-7675ee2d8774`. |
| Production (bản sửa 21:25) | tag `prod-20261118-2` (`548f566`), Worker version `eabb3417-7ea8-4f88-aaa7-7675ee2d8774`, health 200 | 21:25 Berlin: bản sửa [#235](https://github.com/unhuman1289/learning-hub/pull/235) cho hồ sơ trẻ em và sổ MTB/Bột dùng OpenAI (chốt thử nghiệm 16/11 còn sót trả job về trước khi gọi OpenAI); không migration. Sau R còn: ảnh Bột chép từ R2 staging sang production (34 ảnh); khoá OpenAI production đặt lại đúng. |
| Production (R) | tag `prod-20261118-1` (`924cc1b`), Worker version `f35ab3a8-c2d1-4d7d-9b33-41157aba477b`, health 200 | Phát hành R 18/11 lúc 20:40 Berlin theo `status/R.md`: gộp #144 vào `main` (CI + e2e đạt), sao lưu D1 `private-data/backups/production/before-R-20261118-2032.sql`, bookmark `0000227c-0000000c-00005127-c1d1d0a986affc75c77f28cc5a108403`, áp `0026`–`0040` (4 bài v1 của Vu đã xoá theo kế hoạch; 21 bài gói 3, 7 bài đang làm còn nguyên), Queue `learning-hub-ai-production`, cron `0 1-5,22,23 * * *` + `*/5`, OpenAI cho mọi luồng AI. Quay lại: Worker `3e760280-6bcc-40ba-bf21-71a7777b72d7` + D1 Time Travel về bookmark trên. |
| Runner production | Đã tắt 18/11 lúc 20:31 (`launchctl bootout`), plist còn giữ để quay lại; gỡ sau 7 ngày ổn (R bước 9) | `~/Code/learning-hub-prod` dùng làm checkout phát hành, tại `prod-20261118-1` |
| Staging | `8021a259f06b1d28809b48ada89afd35a134feed` | Deploy 18/11 lúc 20:07 Berlin sau khi gộp G3 bỏ masteryProposals sai và quy tắc chấm tiêu chí phong cách [#231](https://github.com/unhuman1289/learning-hub/pull/231), cấu hình production cho R (Queue, cron 00:00, limiter, `OPENAI_ENABLED`, chưa deploy production) [#232](https://github.com/unhuman1289/learning-hub/pull/232), tiêu chí mail1 rõ hơn và ngân sách U5 tách lượt tải của Bột [#233](https://github.com/unhuman1289/learning-hub/pull/233) (e2e đầy đủ đạt), cắt evidence quá 80 ký tự [#234](https://github.com/unhuman1289/learning-hub/pull/234). Không migration. **Hiệu chuẩn** lần 9 87,5% (28/32), lần 10 75% (s4 invalid do evidence quá dài, đã sửa ở #234), lần 11 `cal_57432f03-52a4-45dd-be08-b845e996442b` 84% (27/32), hợp lệ 8/8, injection lệch 1. Câu lệch còn lại chủ yếu là mail1 (Luna cho 4/5 thay vì 5/5, tiêu chí bị trừ thay đổi mỗi lượt) và s2/s3 denn1, inj/fix1 partial thay vì incorrect: dao động của mô hình, không còn lỗi hệ thống. T4 ca bận đạt: lượt `queued` được cron trả lời sau, 1 lời gọi. e2e chạy tay: U5 iPhone 13 lỗi thật do lượt tải trạng thái Bột (T5), sửa ở #233. Lúc 19:12 Berlin sau khi gộp fixture hiệu chuẩn theo quy tắc "có điểm = partial" (quyết định chủ dự án 18/11) [#230](https://github.com/unhuman1289/learning-hub/pull/230). **Hiệu chuẩn lần 8** `cal_4a108792-0963-4fb3-a8d0-459ba668ee99`: 78% (25/32); s3 invalid cả bài vì `unknown_reference:/masteryProposals` (4 câu), 3 câu mail1 correct→partial do Luna chấm khắt tiêu chí lịch sự. Không tính bài invalid: 89% (25/28). Đã giao G3 dọn masteryProposals và thêm quy tắc chấm tiêu chí phong cách. Lúc 18:42 Berlin sau khi gộp Q0 xoá runner Mac, Qwen, Drive mirror và trạng thái "máy ở nhà tắt" [#229](https://github.com/unhuman1289/learning-hub/pull/229); phần dùng chung chuyển sang `lib/ai/`, prompt chấm đổi thành `assess-openai.md`. Không migration. Smoke đạt; `/api/today` app 103 ms. Lưu ý R: cấu hình production đã bỏ `AI_LOCAL_ONLY`, phải có binding Queue production trước khi deploy. Lúc 18:20 Berlin sau khi gộp G3 lưu chi tiết từng câu hiệu chuẩn [#228](https://github.com/unhuman1289/learning-hub/pull/228) (đã sao lưu D1, áp `0040_calibration_details.sql`). Smoke đạt; `/api/today` app 147 ms. **Hiệu chuẩn lần 7** `cal_2d5f9eaf-d023-4113-8e35-252138178199`: hợp lệ 8/8, đồng thuận 84% (27/32), không bịa bằng chứng, injection không lệch, 35.535/10.242 token, 10,8 s mỗi bài. 3/5 câu lệch do fixture dùng ngưỡng "dưới nửa điểm = incorrect" còn prompt và Hub dùng "có điểm = partial" (s2/fix1 1/3, s4/denn1 1/3, s5/mail1 2/5). Lúc 15:08 Berlin sau khi gộp F4+F7 sửa Tổng kết [#227](https://github.com/unhuman1289/learning-hub/pull/227): điểm không tính câu trống, lời phê hiện đậm/nghiêng thay cho `**`, bỏ mục gia sư trùng ở màn người học, tách trang sổ khỏi tấm Bột trên màn rộng, hộp xác nhận nói số câu còn trống. Không migration. Smoke đạt; `/api/today` app 104 ms. Lúc 12:38 Berlin sau khi gộp F4b soạn sẵn bài chính ngày mai [#226](https://github.com/unhuman1289/learning-hub/pull/226) (đã sao lưu D1, áp `0039_prepared_daily.sql`), F4+F7 trang Tổng kết, chờ chấm, mất mạng, ô ảnh theo M6 [#221](https://github.com/unhuman1289/learning-hub/pull/221) (hỏi lại có nhịp, không SSE/Durable Object). Smoke đạt; `/api/today` app 122 ms. Bột nghiệm thu lại 4 câu T4 đạt. Lúc 12:00 Berlin sau khi gộp G3 dọn trường phụ [#223](https://github.com/unhuman1289/learning-hub/pull/223), sửa phạm vi và lọc đáp án của Bột [#224](https://github.com/unhuman1289/learning-hub/pull/224), C1 giảm context và ghi cached tokens [#225](https://github.com/unhuman1289/learning-hub/pull/225) (đã sao lưu D1, áp `0038_tutor_cached_tokens.sql`). Smoke đạt; `/api/today` app 97 ms. **Hiệu chuẩn lần 6 hợp lệ 8/8**: đồng thuận 75% (24/32), không bịa bằng chứng, injection không lệch, 35.393/9.483 token, 9,7 s mỗi bài; dưới ngưỡng 90% nên có cảnh báo. Lúc 11:00 Berlin sau khi gộp G3 Hub tự tính điểm từ rubric [#222](https://github.com/unhuman1289/learning-hub/pull/222). Smoke đạt. Hiệu chuẩn lần 5 vẫn invalid 8/8 nhưng hết `rubric_score`; còn `auto_grade_locked:/diagnosis` (5), `too_small` ở `rubricScores/max` (2), `invalid_format` ở `checkItem/id` (1). Lúc 10:50 Berlin: T5 Bột một-cho-cả-bài [#216](https://github.com/unhuman1289/learning-hub/pull/216) (đã sao lưu D1, áp `0037_tutor_off_topic.sql`, e2e bỏ qua theo quyết định chủ dự án), G3 ghép rubric chuẩn hoá [#215](https://github.com/unhuman1289/learning-hub/pull/215), G6 lỗi ngoài rubric [#220](https://github.com/unhuman1289/learning-hub/pull/220), F5 đo Server-Timing [#217](https://github.com/unhuman1289/learning-hub/pull/217) và placement `azure:westeurope` [#218](https://github.com/unhuman1289/learning-hub/pull/218), F5b e2e chỉ chạy tay [#219](https://github.com/unhuman1289/learning-hub/pull/219). Smoke đạt; đo lại lúc 11:08 sau khi đặt lại secret: `/api/today` app p50 85 ms (F0 17/11: 308 ms), D1 502 ms (731 ms). Hiệu chuẩn lần 4: invalid 8/8 (rubric_score, invalid_format, response_status), đang sửa. Lúc 09:31 Berlin sau khi gộp F6.1 lật trang không còn long task [#203](https://github.com/unhuman1289/learning-hub/pull/203), hiệu chuẩn tính lượt invalid [#211](https://github.com/unhuman1289/learning-hub/pull/211), G5b Terra tạo câu ảnh tuỳ chọn [#212](https://github.com/unhuman1289/learning-hub/pull/212), mã lỗi chấm có cấu trúc [#213](https://github.com/unhuman1289/learning-hub/pull/213), G5c bóc EXIF ảnh Safari/iPhone [#214](https://github.com/unhuman1289/learning-hub/pull/214). Không migration. Smoke đạt. Lúc 07:37 Berlin sau khi gộp G5 chấm ảnh qua Queue cho mọi sổ kể cả trẻ em, sổ sensitive vẫn chặn [#208](https://github.com/unhuman1289/learning-hub/pull/208), sửa giao bài 00:00 bị Terra từ chối do quy tắc mâu thuẫn whole-lesson [#209](https://github.com/unhuman1289/learning-hub/pull/209), hiệu chuẩn một lần gọi mỗi bài và lỗi có mã [#210](https://github.com/unhuman1289/learning-hub/pull/210). Không migration. CI lần 1 vướng long task Pixel‑7 (F6.1), chạy lại đạt; smoke đạt. Lượt hiệu chuẩn thật đầu tiên (07:02) thất bại sau 8 lời gọi, không rõ lý do; đang chạy lại. Lúc 00:16 Berlin sau khi gộp G3 hiệu chuẩn [#204](https://github.com/unhuman1289/learning-hub/pull/204) (đã sao lưu D1, áp `0036_calibration.sql`), F3 tải trước bài [#206](https://github.com/unhuman1289/learning-hub/pull/206), nhân vật cỡ M5 [#207](https://github.com/unhuman1289/learning-hub/pull/207) (R2 `assets/tutor/v2/`). Smoke đạt. Chưa chạy lượt hiệu chuẩn thật. Lúc 23:32 ngày 17/11 sau khi gộp T3b [#205](https://github.com/unhuman1289/learning-hub/pull/205): nhân vật gia sư sprite (R2 `assets/tutor/v1/`, 17 hàng); smoke đạt. G3 [#204](https://github.com/unhuman1289/learning-hub/pull/204) đã gộp nhưng chưa deploy (chờ sao lưu D1 trước `0036`). Lúc 22:42 sau khi gộp T3 [#202](https://github.com/unhuman1289/learning-hub/pull/202): chặn lộ đáp án theo câu (cả nhãn phương án), tấm trò chuyện với nhân vật giữ chỗ; smoke đạt. Lúc 19:46 sau khi gộp T2.1 phần 1 [#199](https://github.com/unhuman1289/learning-hub/pull/199) (mốc con, 14 → 10 lượt D1); lần đầu lỗi API Cloudflare 10013, chạy lại đạt; smoke đạt. L7 nghiệm thu AAC đạt [#193](https://github.com/unhuman1289/learning-hub/pull/193), chờ iPhone thật. Lúc 18:58 sau khi gộp job OpenAI không còn kẹt leased [#200](https://github.com/unhuman1289/learning-hub/pull/200); smoke đạt. Lúc 18:09 sau khi gộp trần Speech theo job [#196](https://github.com/unhuman1289/learning-hub/pull/196) (đã sao lưu D1, áp `0035_speech_job_limit.sql`), phương án trong ngữ cảnh chấm lại [#197](https://github.com/unhuman1289/learning-hub/pull/197), gia sư bớt truy vấn D1 [#198](https://github.com/unhuman1289/learning-hub/pull/198). Smoke household đạt. Lúc 17:29 thêm log tutor-timing [#195](https://github.com/unhuman1289/learning-hub/pull/195). Trước đó 16:56 thêm log tutor-timing [#195](https://github.com/unhuman1289/learning-hub/pull/195). Trước đó 16:56 sau khi gộp F2 [#189](https://github.com/unhuman1289/learning-hub/pull/189), F6 [#190](https://github.com/unhuman1289/learning-hub/pull/190), AI mặc định bật [#191](https://github.com/unhuman1289/learning-hub/pull/191). Không migration. Smoke household đạt, Hub và MCP cùng SHA. OpenAI và TTS bật cho mọi sổ (kể cả trẻ em) trừ khi Quản trị tắt. |
| Dev | `work/learning-hub-hub-next` | Worktree nhánh tích hợp `codex/hub-next-wip`. Mỗi bước dùng nhánh và worktree riêng. |

## Các bước

| Bước | Trạng thái | Còn lại |
|---|---|---|
| E1 local | WIP tại `42badfc` | Có `dev-setup`, `fake-runner`, `DEVELOPMENT.md`; còn kiểm trên clone mới |
| E2 phát hành | Staging đã xác nhận SHA | [Kiểm tra E2](status/E2.md). Production hiện SHA sau lần phát hành có E2 |
| E3 tách production | **Xong** | Gỡ `work/simpler-notebook-form` sau 24 giờ runner chạy ổn |
| S chuẩn bị | **Xong** | Lưu trữ v1 ở bộ nhớ riêng; `AGENTS.md` đã duyệt và lưu tại `42badfc`; chủ dự án đã cho phép xoá v1 |
| C bỏ ChatGPT soạn/chấm | Trên staging theo audit 13/11; WIP tại `6eeb62d` | Phần kết nối ChatGPT phục vụ lịch Knowledge theo quyết định K2/K3. Production chờ đồng ý. |
| V1–V2 gỡ v1 | Trên staging theo audit 13/11 (API v1 trả 410, `0027` đã áp); WIP tại `ffe4ec4` | Production chờ đồng ý |
| V3 một gói bài | Đã gộp [#147](https://github.com/unhuman1289/learning-hub/pull/147), đạt cổng Q local | [Kết quả V3](status/V3.md). Staging đã deploy. Chờ kiểm điện thoại |
| P điện thoại | Có manifest, hỗ trợ bàn phím, nháp offline, `/api/today` gom và Playwright | [#165](https://github.com/unhuman1289/learning-hub/pull/165) đã sửa PHONE-CHECK ở local và đã lên staging. Còn chạy lại trên staging theo [PHONE-CHECK](status/PHONE.md). |
| P3 đo tốc độ | Đạt trên Safari iPhone thật. Quản trị → Hệ thống khớp D1 ngày 16/11 Berlin cho `DE / phone / first_question`, 4 lượt, p75 824 ms. [#171](https://github.com/unhuman1289/learning-hub/pull/171) đã gộp [biên bản](status/P3-rum.md). | Gắn `tutor_first_token` khi nghiệm thu T5. |
| M mockup | **M1–M4 đã được chủ dự án duyệt ngày 14/11/2026** | [Bản mockup đã duyệt](../mockups/index.html) tại `35e8635` |
| U1 bàn học | Đã gộp [#145](https://github.com/unhuman1289/learning-hub/pull/145) | [Kết quả U1](status/U1.md). Kiểm điện thoại |
| U2–U4 | Đã gộp [#146](https://github.com/unhuman1289/learning-hub/pull/146), [#148](https://github.com/unhuman1289/learning-hub/pull/148), [#149](https://github.com/unhuman1289/learning-hub/pull/149) và deploy staging | [Bàn giao U](status/U.md). Chờ kiểm điện thoại, e2e và ngân sách mục 4.2. |
| Q2 mở sổ | Đã gộp [#154](https://github.com/unhuman1289/learning-hub/pull/154), deploy staging | [Kết quả Q2](status/Q2.md). Bước 9 PHONE-CHECK đạt trên staging |
| U5 tốc độ | Đã gộp [#153](https://github.com/unhuman1289/learning-hub/pull/153), deploy staging | E2E CI đạt sau khi test chờ trang lật xong (`0536c21`). PHONE-CHECK bước 8–9 đạt trên staging. Chủ dự án bỏ qua thử thiết bị thật |
| U6 mép sổ | [#160](https://github.com/unhuman1289/learning-hub/pull/160), [#161](https://github.com/unhuman1289/learning-hub/pull/161) và #169 đã lên staging. Bản ghép local `808fb91` đạt 6/6 e2e. CI sau khi gộp cũng không ghi nhận tác vụ dài trong hai lần lật ở CPU chậm 4×. | Biên bản U6 ở commit local `639186a`. Năm tệp sửa thử được giữ riêng. Chủ dự án còn duyệt trên iPhone thật. |
| Ngân sách bàn học | [#166](https://github.com/unhuman1289/learning-hub/pull/166) và [#169](https://github.com/unhuman1289/learning-hub/pull/169) đã gộp và deploy. CI sau khi gộp đo 176.993 B gzip trên iPhone 13 và Pixel 7 giả lập, ngưỡng 180.000 B. | [Kết quả CI](https://github.com/unhuman1289/learning-hub/actions/runs/43797525717). |
| L1–L4 | L1 [#158](https://github.com/unhuman1289/learning-hub/pull/158), L2 [#164](https://github.com/unhuman1289/learning-hub/pull/164) và L3 [#167](https://github.com/unhuman1289/learning-hub/pull/167) đã gộp. L4 [#173](https://github.com/unhuman1289/learning-hub/pull/173) và chẩn đoán [#174](https://github.com/unhuman1289/learning-hub/pull/174) đã lên staging. **Cổng Q đạt** với job Terra `job_b1d45c18202611170001`, bài `les_69f0a9037cc3007f1f45`, 2 câu nghe và 4 tệp WAV trả HTTP 206. | Log ghi 1.694 ms và 1.886 ms theo bản giọng cho cả bài. [Biên bản L4](status/L4.md) |
| L5–L6 | L5 [#172](https://github.com/unhuman1289/learning-hub/pull/172) đã gộp. [Biên bản local](status/L5.md) ghi 8/8 ca qua Worker/D1/R2 với API nghe thật. Bàn học đạt 176.805 B gzip trên hai cấu hình giả lập. **L6 đã nghiệm thu** sau PHONE-CHECK bước 10 trên hai máy thật. | Chủ dự án chốt L6 ngày 17/11 và bỏ phần `audio_play`, đo theo tuần và kiểm thử thêm. [Biên bản L6](status/L.md) |
| G | G1, G2 trên staging cho bài văn bản. G4 [#176](https://github.com/unhuman1289/learning-hub/pull/176) trên staging: lần chấm lại có hiệu lực, hai lần chấm hiện trong Cần xem và sổ giám hộ, có tỉ lệ đổi điểm 7 ngày. | G4 còn nghiệm thu một ca đổi điểm trên QA H5 Deutsch. Còn G3 (`0033`), G5. |
| T | T1 (`0032`) và T2 [#179](https://github.com/unhuman1289/learning-hub/pull/179) (`0034`) trên staging: Worker gọi Luna stream SSE, lượt lỗi hoặc quá 10 s vào Queue, trần 60 lượt/ngày, ghi token và `first_token_ms`. Chỉ bật cho hồ sơ người lớn trên sổ đã bật OpenAI. #175 đã đóng. | T2 còn một lượt thật đo chữ đầu < 2 s. Tiếp T3 chặn lộ đáp án và giao diện Hỏi, T4 nghiệm thu. |
| K | K1 [#156](https://github.com/unhuman1289/learning-hub/pull/156) đã lên staging cùng SHA với Hub. | K2/K3 bỏ trên staging (17/11). [Hướng dẫn K2](status/K2.md) dùng lại ở bước R. |
| A1 điều khiển AI | [#188](https://github.com/unhuman1289/learning-hub/pull/188) trên staging: cờ OpenAI/TTS theo sổ chỉ quản trị sửa, nhật ký, trần 2 lời gọi mỗi job, lượt gia sư và tệp Speech | Chủ dự án bật AI và TTS cho sổ QA L4 trong Quản trị. Sau đó chạy lại nghiệm thu G4, L7, T2 Từ 17/11 [#191](https://github.com/unhuman1289/learning-hub/pull/191) trên staging: mặc định bật cho mọi sổ, kể cả trẻ em; không còn chép danh sách từ secret. |
| L7 | [#178](https://github.com/unhuman1289/learning-hub/pull/178) trên staging: Speech API trả AAC (ADTS), lưu nguyên tệp nén. Fixture: AAC 9.551 B so với WAV 60.266 B | Nghiệm thu bằng một bài Terra mới trên QA L4: 4 tệp AAC trả 206, kích thước thật, nghe trên iPhone |
| H1 cổng gia đình | Lên staging 17/11. Hồ sơ cũ giữ lại: quản trị unhuman, QA H5 (và other), QA Cổng Q, PHONE-CHECK | Chủ dự án đặt PIN quản lý và tạo hồ sơ giống production |
| D giao bài 00:00 | Chưa có biên bản đọc lại id bài với OpenAI | Claude đọc D1 staging sau một lượt 00:00 Berlin |
| N máy thật ở Đức | #165 sửa PHONE-CHECK, chưa chạy lại trên staging | Chủ dự án chạy bước 1–9 và duyệt lật trang U6 |
| F nhanh và mượt | F0 [#177](https://github.com/unhuman1289/learning-hub/pull/177) trên staging: Server-Timing cho route bài, RUM nhận `inp`, `submit_feedback`, `lesson_ready`. JS bàn học 177.288 B | Thu số đo staging cho F0. CPU p95 chờ quyền Workers Observability. Tiếp F1 giảm JS. Còn lỗi chập chờn: tác vụ dài khi lật trang trên Pixel 7 CI, Worker local trả 503 trong e2e F2 [#189](https://github.com/unhuman1289/learning-hub/pull/189) trên staging: bàn học offline theo hồ sơ, JS bàn học 178.568 byte gzip; còn thử iPhone thật ở chế độ màn hình chính. F6 [#190](https://github.com/unhuman1289/learning-hub/pull/190) trên staging: hết 503 do body chưa đọc, 5 lượt CI liên tiếp đạt; long task Pixel‑7 khi lật trang vẫn thỉnh thoảng >50 ms, chưa rõ nguyên nhân. |
| R phát hành production | Production ở `prod-20261113-1`, còn dùng Qwen, chưa áp `0026`–`0033` | Lập kế hoạch chi tiết sau đợt 4. Quyết định ở LGTK mục 11 |

**Migration tiếp theo.** Staging đã áp đến `0034_tutor_openai.sql`. G3 dùng `0033` (áp sau `0034` trên staging; bảng mới, không phụ thuộc). Production chưa áp `0026`–`0033`; làm ở bước R.

## Chờ chủ dự án

- Chạy PHONE-CHECK bước 1–9 trên staging bằng iPhone ở Đức và duyệt lật trang U6 (bước N). Không thử ở Việt Nam (quyết định 17/11).
- Các quyết định ở [LGTK mục 11](LGTK.md#11-chủ-dự-án-cần-quyết): dữ liệu trẻ em với OpenAI, quyền đọc Workers Observability. Claude đã được giao gộp PR và deploy staging khi CI đạt (17/11).
- Review [draft PR #144](https://github.com/unhuman1289/learning-hub/pull/144) khi các bước sẵn sàng.


## OpenAI staging · nghiệm thu 16/11/2026

- Hub và MCP staging đã được đọc lại ở commit `ffd86264015d1431f73360d74973100145a375c0`. D1 kết nối. Đã sao lưu staging trước migration `0031_listening.sql`. Smoke trong workflow gặp `ECONNRESET` sau khi hai Worker đã deploy. Chạy lại smoke từ máy đạt.
- Luna đã chấm và đọc lại lượt nộp demo `subm_95f513a5a67e7daf42d1` gồm 8 câu. Đã ghi gợi ý và tính 0 điểm cho câu ngắn đã xem đáp án. Gửi lại cùng mã nộp chỉ trả một lượt. Terra đã soạn và đọc lại bài `les_3d6e2b7eec96b6e65c9b` ở chế độ nộp cả bài. D1 ghi cả hai job thành công với đúng model và đã lưu số token. Kiểm thử local đạt 444/444.
- Terra đã chấm lại một câu trong **QA H5 Deutsch** qua giao diện staging, giữ nguyên điểm và lưu lời giải thích. Còn xác nhận lượt giao lúc 00:00 Berlin và thao tác trên điện thoại thật. Số tiền trừ credit cần đối chiếu với OpenAI Usage. Xem [biên bản](../ops/QA-H5-OPENAI-ACCEPTANCE.md).

Khung staging F4+F7 sửa #227 đã đóng lúc 15:09 Europe/Berlin ngày 18/11.

Khung staging G3 chi tiết hiệu chuẩn #228 đã đóng lúc 18:40 Europe/Berlin ngày 18/11.

Khung staging Q0 đã đóng lúc 18:44 Europe/Berlin ngày 18/11.

Khung staging G3 fixture #230 đã đóng lúc 19:20 Europe/Berlin ngày 18/11.


Khung staging G3 #231–#234 đã đóng lúc 20:16 Europe/Berlin ngày 18/11.

Khung staging #235 đã đóng lúc 21:20 Europe/Berlin ngày 18/11.

Khung staging W1/W2 đã đóng lúc 22:25 Europe/Berlin ngày 18/11.
