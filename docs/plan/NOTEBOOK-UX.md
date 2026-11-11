# Sổ học lật từng trang — plan giao diện, chữ và lời chào

Viết 11/11/2026 trên `main` @ `9317f67`. Nguồn: audit giao diện cùng ngày (chạy thử với hồ sơ người lớn và trẻ em, máy tính và điện thoại, sáng và tối) và bản kiểm kê chữ của toàn bộ luồng học.

## Quyết định của chủ dự án (11/11/2026)

1. Xưng **"bạn"** với mọi hồ sơ, kể cả trẻ em.
2. Máy tính: **trang đôi**, mỗi lần mở thấy nhiều câu (không phải một ghi nhớ và một câu như bản phác).
3. Giấy luôn **màu kem**, kể cả chế độ tối; chỉ phòng và bàn tối đi.
4. Đồng ý toàn bộ đề xuất audit: bộ từ thống nhất, nút 44px, bỏ `confirm()`, sổ mở trên bàn, lật trang, chế độ trẻ em, cửa vào và móc treo hồ sơ.
5. Lời chào trên bàn học **đổi mỗi ngày** và có **một câu khích lệ** dựa trên tiến độ gần đây của **tất cả sổ**.

## Nguyên tắc chung

- **Một cuốn sổ thật.** Mỗi màn hình là một trang giấy; đi tới đi lui bằng lật trang, không bằng mục gập (`<details>`) hay link rời.
- **Một việc mỗi trang, một nút gạch mỗi màn hình.** Việc phụ là chữ bút chì hoặc giấy nhớ, cao ít nhất 44px khi bấm được.
- **Không nói về máy.** Người học không thấy ai soạn, ai chấm, mã câu, mã kỹ năng, ngày ISO.
- **Chỉ nói điều có thật.** Lời chào và khích lệ chỉ dựa trên số liệu đã lưu; không có số liệu thì chào trung tính.
- Giữ bất biến hiện có: không thay bài dở, không tự hoàn thành, lưu nháp và nộp bài như cũ, trạng thái "đã lưu" chỉ sau khi server xác nhận.

---

## Giai đoạn 1 — Bộ từ và chữ (nhỏ, ít rủi ro)

**Việc:**
1. Tạo `app/hub/words.ts`: một bảng từ duy nhất cho mọi nhãn hành động, trạng thái, loại bài, trạng thái kỹ năng. Component lấy chữ từ đây thay vì viết rời.
2. Thay theo bảng:

| Thay | Bằng |
|---|---|
| Bắt đầu / Học tiếp / Mở bài mới / Xem lời phê / Ôn bài / Mở sổ (trên giấy nhắc) | **Mở bài**; bài đã có câu trả lời: **Làm tiếp** |
| Xin bài mới / Xin thêm bài / Soạn bài / Hỏi thêm / Dặn planner / Tuần này ở trường | **Xin bài**, ba thẻ **Bài mới · Luyện thêm · Tự chọn** |
| nhận xét / phản hồi (về bài làm) | **lời phê**; của người học: **góp ý** |
| thầy cô chấm / máy chấm / máy soạn / Hub / planner / người soạn và chấm bài | **Đang chấm…**, **Đang soạn bài…**, **Bài đã lưu, sẽ có lời phê sau.** |
| Phòng học / Về bàn học | **Bàn học** |
| Kệ | **Tủ sách** |
| Hồ sơ / Cài đặt cá nhân / Hồ sơ của tôi | **Cài đặt** (phần trong: **Về bạn**) |
| Đã tiếp cận / Đang hình thành / Đã tự làm được / đang luyện / đã vững | **Mới học · Đang luyện · Đã vững**, nhãn phụ **Cần ôn** |
| Prompt cá nhân / Prompt của sổ | **Lời dặn** |
| lộ trình / Nhịp học 14 ngày / Lỗi lặp / Tờ kiến thức / Đầu ra / đến hạn ôn | **Các bài sắp tới / Ngày đã học / Hay nhầm / Ghi nhớ / Sản phẩm / cần ôn lại** |
| Trẻ em / Người lớn (trên thẻ hồ sơ) | bỏ nhãn trên thẻ; chỉ hiện trong chế độ quản lý |
| tôi / mình / không đại từ | **bạn** |
| Hủy/Huỷ, tùy/tuỳ, hóa/hoá | **Huỷ, tuỳ, hoá** (một kiểu) |
| Thử lại / Tải lại / Gửi lại / Lưu lại / Bấm lại | **Thử lại** |

3. Ẩn khỏi người học: Tải Markdown/CSV (chuyển vào Cài đặt sổ), mã câu trong lịch sử, chữ G/P/N trước tên kỹ năng (thay bằng nhóm "Ngữ pháp / Chính tả / Tự nhiên"), dòng nguồn `readScope · truy cập · xuất bản` (gập trong Ghi nhớ), lỗi thô `Sign in required` và mã trạng thái chưa dịch.
4. Cắt câu dài trên 20 âm tiết: đồng hồ phút (`study-meter.tsx:72`), Lời dặn (`subject-view.tsx:99`, `profile-settings.tsx:75`), xung đột nháp (`reader.tsx:92`), tài liệu sổ cũ (`notebook-view.tsx:253`).
5. Ví dụ trong ô nhập hợp mọi tuổi ("Ví dụ: ôn cách hẹn lịch", "Ví dụ: phân số").

**Tệp chính:** `app/hub/*.tsx`, `app/hub/lesson-v2/*.tsx`, `components/profile-controls.tsx`, `lib/today.ts` (lý do trên giấy nhắc), `lib/household.ts` (trang mật khẩu), `app/hub/paper-bits.tsx` (con dấu).

**Kiểm:** test `words.ts` (mọi khoá có chữ, không có từ cấm: `máy`, `Hub`, `planner`, `Prompt`, `lộ trình`, `máy chủ`); grep CI không cho các từ cấm xuất hiện trong `app/hub/**` ngoài trang quản trị. Cập nhật test đang so chữ cũ.

---

## Giai đoạn 2 — Dễ bấm, dễ đọc (nhỏ)

1. **44px cho mọi thứ bấm được:** `pencilLink` thêm `min-h-11 inline-flex items-center`; nút header `min-h-11`; chip mục tiêu `min-h-11`; cột ngày trên tờ ô li rộng ít nhất 28px hoặc chọn ngày bằng phím; hàng lựa chọn đáp án cao 44px; bỏ các `min-h-9` truyền thêm vào `buttonClass`.
2. **Bỏ `window.confirm()`** (`reader.tsx:263`, `hints.tsx:6`): thay bằng `PaperConfirm`, một mẩu giấy hiện ngay dưới nút với hai lựa chọn, giữ focus và Escape.
3. **Giấy nhắc hiện ngay:** hiệu ứng dán chỉ chạy lần đầu trong ngày (ghi `sessionStorage`); lần sau hiện tức thì.
4. **Giấy kem trong chế độ tối:** tách token `--color-paper*`, `--color-rule`, `--color-ink-on-paper` khỏi khối `prefers-color-scheme: dark`; giấy, giấy nhắc, lịch xé giữ màu ngày; chỉ tường, gỗ, header tối. Thêm bóng đèn ấm quanh tờ giấy khi tối.
5. **Bìa sổ trên điện thoại:** cỡ chữ tối thiểu 12px cho dòng trạng thái, 15px cho tên sổ; tủ 2 cột thay vì 3 dưới 400px.
6. **Tiêu đề bài trên điện thoại:** cỡ chữ nhỏ hơn và `leading-7` khi xuống dòng.
7. **Thanh dưới trên điện thoại:** bỏ khi chỉ có một mục.
8. **Đồ chỉ động khi rê chuột:** cửa tủ, ngăn kéo trống không còn đổi khi hover (chỉ ngăn có nhãn mới động, cả khi focus).
9. **Focus rõ:** ô viết tay dùng gạch chân 2px màu nhấn khi focus; ngày trên tờ ô li dùng viền chung.
10. Sửa lỗi nhỏ: màu chữ lời phê trong lịch sử (`history-panel.tsx:65`), tab Mục tiêu sổ cũ nằm trên nền gỗ (`notebook-view.tsx:104`).

**Kiểm:** Playwright/trình duyệt ở 375px và 1280px, sáng và tối; đo mọi phần tử tương tác ≥ 44×44 bằng script trong test e2e đơn giản (`scripts/check-targets.mjs` chạy trên bản dev).

---

## Giai đoạn 3 — Lời chào và lời khích lệ hằng ngày (vừa)

**Nguồn số liệu** (server, mọi sổ đang học của hồ sơ, giờ Berlin): `study_time` 14 ngày; `attempts` + `grades` (câu đúng ngay không gợi ý, 7 ngày này so với 7 ngày trước); bài hoàn thành 7 ngày; chuỗi ngày học liên tiếp; kỹ năng mới lên "Đã vững" trong 7 ngày; số bài đang mở; kỹ năng cần ôn.

**Cách làm:**
1. `lib/greeting.ts`: hàm thuần `greetingFor(facts, day, name)` trả `{ hello, cheer }`.
   - `hello` đổi theo ngày và buổi (sáng / chiều / tối theo giờ Lübeck), có tên và vài mẫu xoay vòng theo `day` (cùng ngày luôn cùng câu).
   - `cheer` chọn **một** sự thật nổi bật nhất theo thứ tự ưu tiên: chuỗi ngày học ≥ 3; tỉ lệ đúng ngay tăng rõ; kỹ năng vừa vững; số bài xong tuần này; quay lại sau ≥ 3 ngày nghỉ; có kỹ năng cần ôn; chưa có số liệu.
   - Mỗi loại có 3–5 mẫu, viết bằng "bạn", nêu đúng con số và tên sổ khi có, không hứa kết quả, không so với người khác.
2. Trả kèm `/api/today` (đã có cùng học viên và quyền đọc), thêm trường `greeting`; không thêm route mới.
3. `desk.tsx`: thay "Chào {tên}." bằng `hello` (chữ in) và `cheer` (chữ tay màu nhấn, một dòng). Khi đang xem bàn người khác: không có khích lệ.
4. Không gọi model, không lưu gì thêm.

**Ví dụ mẫu:** "Chào buổi tối, Vũ." · "Bạn đã học 4 ngày liền rồi, giữ nhịp nhé!" · "Tuần này bạn đúng ngay 12/15 câu Deutsch, hơn tuần trước." · "Mừng bạn quay lại! Hôm nay chỉ cần một bài ngắn." · "Có 2 kỹ năng cần ôn lại — một bài luyện thêm là đủ."

**Kiểm:** test `greeting.test.mjs` với dữ liệu mẫu cho từng nhánh, ranh giới DST, không số liệu, nhiều sổ; test API trả `greeting` đúng hồ sơ.

---

## Giai đoạn 4 — Bài học là trang đôi, lật từng trang (lớn)

**Bố cục:**
- Máy tính (≥ 1024px): cuốn sổ mở **hai trang**, gáy giữa, cao bằng màn hình trừ header. Điện thoại và máy tính bảng dọc: **một trang**.
- **Nội dung chảy liên tục qua các trang**: Ghi nhớ (tờ kiến thức, ví dụ, phần đọc) → câu 1, 2, 3… → trang tổng kết. Mỗi trang chứa **bao nhiêu câu vừa** (thường 2–4 câu ngắn, hoặc 1 câu viết dài), nên một lần mở trang đôi thấy 4–8 câu.
- Câu không bị cắt giữa hai trang; câu dài hơn một trang thì ô viết cuộn bên trong.
- Lề trên mỗi trang: "Câu 4–6 / 10" bằng chữ tay; lề dưới: số trang.

**Kỹ thuật:**
1. `app/hub/notebook/spread.tsx`: component phân trang dùng CSS multi-column (`column-width` = bề rộng trang, `column-fill: auto`, chiều cao cố định, `break-inside: avoid` cho từng câu); lật trang = dịch ngang đúng 2 cột (1 cột trên điện thoại). Đo số trang bằng `scrollWidth` sau `ResizeObserver`. Phương án dự phòng nếu trình duyệt lỗi: chia trang theo số câu cố định.
2. Lật trang: nút mép trang trái/phải (cao cả trang, có nhãn ẩn cho trình đọc màn hình), phím ←/→, PageUp/PageDown, vuốt ngang (pointer events, ngưỡng 40px). Hiệu ứng: dùng `view-transition-name: lesson-page` và `data-vt="turn"` đã có trong `globals.css:367`; tắt khi `prefers-reduced-motion`.
3. Focus: khi lật, đưa focus tới câu đầu của trang mới; Tab trong trang không nhảy sang trang khuất (`inert` cho cột ngoài khung).
4. `reader.tsx`: bỏ mục gập "Kiến thức và ví dụ" (Ghi nhớ thành trang đầu), bỏ chế độ "summary" riêng — tổng kết là **trang cuối** trong cùng dòng chảy; "Xong bài" nằm ở trang tổng kết. Mở bài đã xong: mở thẳng trang tổng kết, lật lùi để xem lại.
5. Từng câu: một nút **Kiểm tra**; "Gợi ý" là mẩu giấy nhớ gấp ở góc câu, bấm mở; "Lời giải" ở trong mẩu giấy đó, có `PaperConfirm`. Lời phê và con dấu ngay dưới câu. Hồ sơ trẻ em: "Chấm sai?" thành **"Hỏi bố mẹ"** (gọi thẳng `escalate`); người lớn giữ "Chấm sai?". "Lần trước" là chữ bút chì nhỏ một dòng.
6. Lưu vị trí trang trong `sessionStorage` theo bài; quay lại bài thì mở đúng trang.
7. Nháp, nộp từng câu, hiện lời phê và chờ chấm giữ nguyên logic hiện có (chỉ đổi khung).

**Kiểm:** test đơn vị cho hàm chia trang dự phòng; chạy thử bài 3, 6, 10 câu và bài có câu viết dài ở 375/768/1280px; bàn phím-only; trình đọc màn hình (VoiceOver) đọc đúng thứ tự; giảm chuyển động.

---

## Giai đoạn 5 — Cuốn sổ mở trên bàn (lớn)

**Thứ tự trang của một sổ** (cùng component trang đôi ở giai đoạn 4):
1. **Bìa** (từ tủ bay xuống bàn, mở ra): tên sổ.
2. **Trang đầu**: mục tiêu viết tay, "Các bài sắp tới" (3 bước), và **Mục lục**: các bài đã học, ngày ở lề, loại bài, bấm để lật tới bài đó.
3. **Các bài đã học**, mỗi bài là các trang của giai đoạn 4 (mở khi chọn từ Mục lục).
4. **Trang hôm nay**: bài đang mở (một nút gạch **Mở bài**), hoặc trang trắng với ba thẻ **Bài mới · Luyện thêm · Tự chọn** và dòng trạng thái yêu cầu.
5. **Trang Tiến độ** (giấy ô li, cuối sổ): ngày đã học, đúng ngay, kỹ năng (ba chấm), hay nhầm.
6. **Bìa sau**: Cài đặt sổ (mục tiêu, trình độ, lời dặn, tự chuẩn bị bài, tải lịch sử CSV/Markdown).

**Điều hướng:** ba thẻ đánh dấu ở mép phải **Mục lục · Hôm nay · Tiến độ**; mép trái/phải để lật; nút **Đóng sổ** (về bàn, hiệu ứng `book-sink`). Mở sổ từ tủ luôn mở ở **trang hôm nay**.

**Kỹ thuật:**
1. Route `?sach=<id>&trang=<muc-luc|hom-nay|tien-do|cai-dat>` và `?bai2=<id>` mở trong khung sổ trên bàn (không còn trang web riêng); `use-route.ts` thêm `transitionKind` cho sổ v2 (`open`, `close`, `turn`).
2. Bìa bay: gán `view-transition-name: cover-<id>` cho bìa trên tủ (đã có) **và** cho bìa trong khung sổ mới.
3. Gộp `subject-view.tsx`, `lesson-v2/list.tsx`, `skill-progress.tsx`, `history-panel.tsx`, `learned-lessons.tsx` vào `app/hub/notebook/*` (mỗi trang một component); sổ kiểu cũ (`notebook-view.tsx`) dùng cùng khung, giữ nội dung cũ chỉ đọc.
4. Trên bàn học, ngăn kéo "Bài đã học" mở Mục lục chung mọi sổ (giữ), giấy nhắc mở thẳng trang bài trong sổ.
5. Một lần đọc dữ liệu cho mỗi sổ (`/api/subjects/:id/lessons` + `?view=overview`), dùng chung cho Mục lục, Hôm nay, Tiến độ.

**Kiểm:** điều hướng đủ vòng (tủ → bìa → hôm nay → bài → tổng kết → Mục lục → Tiến độ → đóng sổ) bằng chuột, phím, chạm; link `?sach=` và `?bai2=` cũ vẫn mở đúng; nút lùi của trình duyệt lật lùi.

---

## Giai đoạn 6 — Trẻ em, cửa vào, móc treo hồ sơ (vừa)

1. **Hồ sơ trẻ em** (`learner_settings.role = 'child'`):
   - Chữ trên giấy lớn hơn một bậc (17→19px, dòng 28→32px qua biến CSS trên khung sổ).
   - Tiến độ dạng **sticker theo ngày** trên tờ ô li thay cho phân số; tổng tuần bằng số sao.
   - Hoàn thành bài: con dấu **"Giỏi lắm!"** đóng xuống trang tổng kết (`Stamp` có sẵn, `animate-stamp`).
   - Ẩn: Cài đặt sổ, tải lịch sử, "Chấm sai?" (thay bằng "Hỏi bố mẹ"), thẻ "Tự chọn" giữ nhưng có ví dụ hợp tuổi.
2. **Cửa vào** (`lib/household.ts` trang mật khẩu): cánh cửa gỗ Landhaus có ô kính, ô mật khẩu là tấm biển gỗ, nút "Vào nhà"; dùng chung font và token (trang này không có bundle app nên viết CSS nội tuyến nhỏ).
3. **Chọn người học** (`ProfilePicker`): hàng **móc treo áo** trên tường, mỗi móc một tấm thẻ tên + emoji; bấm vào thì thẻ đung đưa rồi vào bàn học. "Chế độ quản lý" là chiếc chìa khoá nhỏ treo cuối hàng.
4. **Header:** "Đổi người" thành móc treo nhỏ cạnh tên; bỏ chữ "Learning Hub" tiếng Anh ở chỗ hiển thị (giữ trong `<title>`), thay bằng "Phòng học cả nhà".

**Kiểm:** đi trọn luồng với hồ sơ trẻ em ở 375px và máy tính bảng; mọi chữ trẻ em thấy qua bộ lọc từ cấm của giai đoạn 1.

---

## Thứ tự và kích thước

| Giai đoạn | Kích thước | Phụ thuộc | PR |
|---|---|---|---|
| 1. Bộ từ và chữ | S | — | 1 |
| 2. Dễ bấm, dễ đọc, giấy kem | S–M | — | 1 |
| 3. Lời chào và khích lệ | M | — | 1 |
| 4. Bài là trang đôi | L | 1, 2 | 1–2 |
| 5. Sổ mở trên bàn | L | 4 | 2 |
| 6. Trẻ em, cửa vào, móc treo | M | 1, 2 | 1 |

Giai đoạn 1, 2, 3 làm song song được; 4 rồi 5 nối tiếp; 6 sau 2.

**Mỗi PR:** `npm run test`, `typecheck`, `lint`, `build`; chạy thử cục bộ với hồ sơ người lớn và trẻ em ở 375px và 1280px, sáng và tối; cập nhật `DESIGN.md` (phần "Written on the page", thêm "Notebook on the desk" và "Greeting"). Deploy production sau khi chủ dự án duyệt từng PR.

## Rủi ro

- **Chia trang bằng multi-column** có thể sai khi ảnh hoặc ô viết thay đổi chiều cao; cần đo lại sau mỗi lần nhập và có phương án chia theo số câu.
- **Lật trang và trình đọc màn hình:** cột ngoài khung phải `inert`, nếu không Tab và VoiceOver đọc cả trang khuất.
- **Hiệu suất trên điện thoại cũ:** view transition và bóng đổ của trang đôi; tắt bóng và hiệu ứng khi `prefers-reduced-motion` hoặc màn nhỏ.
- **Lời khích lệ sai sự thật** nếu số liệu thiếu (ví dụ phút học không đo khi tab ẩn): chỉ nêu số khi đủ dữ liệu, còn lại câu trung tính.
