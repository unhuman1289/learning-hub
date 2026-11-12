# Sổ học lật từng trang — plan chi tiết giao diện, chữ, làm bài

Bản 1 viết 11/11/2026 trên `main` @ `9317f67`. **Bản 2 (12/11/2026)** mở rộng phạm vi đến giai đoạn 9. Đối chiếu production tại `27b19d1` (PR #114) và bản làm việc 7a.

**Cách đọc trạng thái**
- **[XONG]**: đúng plan, đạt điều kiện.
- **[MỘT PHẦN]**: còn việc, liệt kê ở "Còn lại".
- **[SAI]**: làm khác plan; ghi cách khác và việc sửa.
- **[CHƯA]**: chưa làm.
- Mỗi việc còn lại có mã `R…` để giao và đánh dấu khi xong.

## Tiến độ triển khai

| Phần | Đã kiểm tra | Còn lại |
|---|---|---|
| Production · PR #114 | Mở thẳng câu cần sửa, giấy nhớ mở gợi ý tuần tự, đo lại trang sau khi rời ô nhập. 363 test, CI, Chrome và smoke D1 đạt. | VoiceOver, vuốt trên thiết bị thật và ba ngày lời chào trên production chưa được nghiệm thu. |
| 7a · Local | Chia trang từ dữ liệu bài, mở Ghi nhớ và quay lại câu đang làm. | Trang quá dài vẫn cuộn. Còn chia đoạn dài và kiểm thử thiết bị thật. |
| 7b–7c · Local | Dấu Kiểm tra, giấy gợi ý nổi, ô lời phê hai dòng với chi tiết mở riêng, phân biệt lời giải tự mở với lời giải hiện sau chấm, nhảy từ tổng kết tới câu. | Bộ biểu tượng đầy đủ, hiệu ứng gáy và góc lật, chỉ dựng trang lân cận, giao diện góp ý. |
| 8 · Local | Mục lục theo tháng giao, số liệu từ D1, báo cáo 7 ngày, bài nằm cùng khung sổ và lịch sử nằm ở Cài đặt. | Báo cáo đầy đủ theo U8.2, cache và cập nhật theo sự kiện, mỗi chương một trang vật lý, biểu tượng xin bài, dọn luồng sổ cũ. |
| 9 · Local | Có Zod và JSON Schema v3, kiểm tra dữ liệu hình và chấm điểm từng phần cho năm dạng câu đóng. | Chưa có UI v3, lưu/đọc, tích hợp runner hay pilot. Hai ràng buộc D1 ở migration 0009 hiện chỉ nhận `package_version` 1/2 và `input_kind` choice/short/long. Cần chốt và kiểm thử đường lưu tương thích trước khi bật v3. |

Các trạng thái bên dưới ghi theo mục tiêu từng phần. Mốc phát hành mới cần CI và nghiệm thu riêng. Các thay đổi local này chưa áp migration. Điều kiện lưu v3 phải được kiểm tra bằng bản sao D1 trước khi phát hành.

## 0. Quyết định và nguyên tắc

**Quyết định của chủ dự án**
1. (11/11) Xưng **"bạn"** với mọi hồ sơ, kể cả trẻ em.
2. (11/11) Máy tính dùng **trang đôi**, một lần mở thấy nhiều câu.
3. (11/11) Giấy luôn **màu kem**, cả chế độ tối.
4. (11/11) Đồng ý toàn bộ đề xuất audit 11/11.
5. (11/11) Lời chào **đổi mỗi ngày** kèm **một câu khích lệ** từ tiến độ của mọi sổ.
6. (12/11) **Giữ nguyên vị trí như vở**: gợi ý, lời giải, lời phê không làm xô các câu khác.
7. (12/11) **Lời giải** bấm là hiện, không hỏi lại. Câu đó ghi là **có trợ giúp, chưa làm được**. Vẫn **cho làm lại nhưng không tính điểm**.
8. (12/11) **Mở bài luôn bắt đầu ở trang Ghi nhớ** của bài, rồi mới sang các trang câu hỏi.
9. (12/11) **Sổ chia chương: mỗi tháng là một chương**, trong chương chia theo ngày, trong ngày là các bài.
10. (12/11) **Trang mở sổ** gồm báo cáo gần đây, bài đang có và nút xin bài dạng **biểu tượng mộc ở cuối trang**. Không dùng nút kiểu web hay thư viện giao diện (MUI, lucide).
11. (12/11) Sau này có thể học Bio, code Rust. **Bài code vẫn để AI đọc và chấm**, không chạy code.

**Nguyên tắc duyệt mọi PR**
- Một cuốn sổ thật: đi tới đi lui bằng lật trang và thẻ đánh dấu, không bằng `<details>` hay trang web rời.
- **Vị trí cố định:** nội dung đến sau (gợi ý, lời giải, lời phê, trạng thái) chỉ được hiện vào chỗ đã chừa sẵn hoặc trên giấy nhớ dán đè, không đẩy dòng.
- Một nút chính mỗi màn hình; nút và biểu tượng là đồ vật vẽ tay (gạch, con dấu, giấy, bút chì), không phải nút web.
- Mọi thứ bấm được ≥ 44×44px; chữ trên giấy ≥ 16px; chữ phụ ≥ 14px.
- Không chữ máy, mã kỹ thuật, ngày ISO, tiếng Anh, lỗi thô từ server trong luồng học.
- Chỉ nói điều có thật; giữ bất biến lưu nháp, nộp, lời phê, không thay bài dở, không tự hoàn thành.

**"Xong" cho mỗi PR**
- `npm run test`, `typecheck`, `lint`, `build`.
- Chạy thử hồ sơ người lớn và trẻ em ở 375/768/1280px, sáng và tối, một lượt chỉ dùng bàn phím; ảnh trước/sau trong PR.
- Cập nhật `DESIGN.md`, `FEATURES.md`; deploy production sau khi chủ dự án duyệt.

## Tổng hợp trạng thái giai đoạn 1–6

| Việc | Trạng thái | Việc | Trạng thái |
|---|---|---|---|
| U1.1 Bảng từ | MỘT PHẦN | U3.1 Số liệu lời chào | MỘT PHẦN |
| U1.2 Đổi chữ theo màn hình | MỘT PHẦN | U3.2 Chọn câu | XONG |
| U1.3 Ẩn khỏi người học | MỘT PHẦN | U3.3 API | XONG |
| U1.4 Cắt câu dài | XONG | U3.4 Bàn học | XONG |
| U1.5 Ví dụ ô nhập | MỘT PHẦN | U4.1 Bố cục trang | MỘT PHẦN |
| U1.6 Test từ cấm | XONG (phạm vi hẹp) | U4.2 Khung lật trang | MỘT PHẦN, cách chia trang khác plan |
| U2.1 Kích thước bấm | MỘT PHẦN | U4.3 Trang bài trong khung | MỘT PHẦN |
| U2.2 Bỏ `confirm()` | XONG, nhưng phải bỏ tiếp (QĐ 7) | U4.4 Từng câu | MỘT PHẦN |
| U2.3 Giấy nhắc hiện ngay | XONG | U4.5 Tổng kết | MỘT PHẦN |
| U2.4 Giấy kem khi tối | XONG | U5.1 Route | XONG |
| U2.5 Điện thoại | MỘT PHẦN | U5.2 Khung sổ | MỘT PHẦN |
| U2.6 Đồ trang trí | MỘT PHẦN | U5.3 Các trang sổ | MỘT PHẦN (hành vi có một phần) |
| U2.7 Focus | XONG | U6.1 Chế độ trẻ em | MỘT PHẦN |
| U2.8 Lỗi nhỏ | XONG | U6.2 Cửa vào | MỘT PHẦN |
| | | U6.3 Móc treo hồ sơ | MỘT PHẦN |
| | | U6.4 Header | MỘT PHẦN |

Phần còn lại của U4, U5 được làm lại theo giai đoạn 7–8: thiết kế mới thay cho phần chưa đạt, không vá lên cách hiện tại.

---

## Giai đoạn 1 — Bộ từ và chữ

### U1.1 Bảng từ `app/hub/words.ts` — [MỘT PHẦN]
**Đã có:** đủ nhóm khoá (`app/hub/words.ts:1-26`). Được dùng ở desk, today-board, paper-bits, paper-confirm, subject-view, adaptive-requests, list, reader, summary, book, progress.

**Còn lại:**
- **R1.1a** Chuyển sang `words.*`: `item-card.tsx`, `feedback.tsx`, `hints.tsx`, `dispute-dialog.tsx`, `desk-progress.tsx`, `skill-progress.tsx`, `requests-panel.tsx`, `new-lesson-request.tsx`, `learned-lessons.tsx`, `study-meter.tsx`, `reflection.tsx`, `components/profile-controls.tsx`.
- **R1.1b** Tên cũ còn hiện:
  - `learned-lessons.tsx:12` "Học mới / Cá nhân hóa / Ôn tập / Luyện tập" → `words.lessonKind.*`.
  - `desk-progress.tsx:13` trạng thái kỹ năng viết thường → `words.skillState.*`.
  - `study-meter.tsx:145` "Lưu mục tiêu" → "Lưu".
  - `profile-controls.tsx:88` "Lưu emoji" → "Lưu".
  - `today-board.tsx:33` gửi chữ "Luyện tập" → `words.request.practice`.

### U1.2 Đổi chữ theo màn hình — [MỘT PHẦN]
| Màn hình | Trạng thái | Còn lại |
|---|---|---|
| Cổng mật khẩu | XONG | — |
| Chọn người | MỘT PHẦN | **R1.2a** `profile-controls.tsx:85` "Nhập hoặc dán một emoji" → "Chọn một biểu tượng"; `:88` "Lưu emoji" → "Lưu" |
| Header | MỘT PHẦN | **R1.2b** Một tên **Cài đặt** cho mọi lối vào: nút "Hồ sơ" và dialog "Hồ sơ" / "Cài đặt cá nhân" (`profile-controls.tsx:333-337`) → "Cài đặt", phần trong "Về bạn" (như ngăn kéo `desk.tsx:187-188`) |
| Bàn học | XONG, còn sót | **R1.2c** `desk.tsx:155` hiện lỗi thô `daily.error` ("Sign in required") và "Tải lại" → `words.error.*`, "Thử lại"; `desk.tsx:181` "Kệ còn trống." → "Tủ sách còn trống." |
| Trang sổ | MỘT PHẦN | **R1.2d** Còn "Xin bài mới", "Mở bài mới" (`new-lesson-request.tsx:49,54`), "chờ xếp lượt", "khi máy đang bật", "xin lại" (`:52,55`), "Xin thêm bài", "Đang chờ soạn" (`requests-panel.tsx:17,23-24`), "Tải lại", "lỗi lặp" (`skill-progress.tsx:89,136`). Các tệp này sẽ bị thay ở giai đoạn 8; trước đó sửa chữ theo bảng. |
| Trang bài | MỘT PHẦN | **R1.2e** `reader.tsx:320` "Bạn đang xem bài của người học." → "Bạn đang xem bài của {tên}."; `sheet.tsx:6-7` bỏ tiêu đề trùng "Tờ kiến thức" (đã có "Ghi nhớ"); `lesson-page.tsx:219` "Đầu ra cần có" → "Sản phẩm" |
| Phản đối điểm | XONG | — |
| Tổng kết, góp ý | XONG | — |
| Ảnh bài làm | XONG | — |

### U1.3 Ẩn khỏi người học — [MỘT PHẦN]
**Đã có:** "Câu {n}" thay mã câu. Ẩn tải lịch sử với trẻ em trong Cài đặt của sổ.

**Còn lại:**
- **R1.3a** Sổ kiểu cũ vẫn cho trẻ em tải lịch sử (`notebook-view.tsx:72` → `list.tsx:78`, `downloads={!bookPage}`) → ẩn với trẻ em.
- **R1.3b** Lỗi thô từ server lọt qua `e.message` ở nhiều chỗ; câu dự phòng "Chưa xác nhận được với máy chủ." (`api.ts:17`), "Chưa xác nhận thao tác." (`reader.tsx:39`). Sửa:
  - `api.ts` ánh xạ lỗi: 401 → "Phiên đã hết, chọn lại người học."; 403 → "Bạn chưa mở được phần này."; 409 → "Bài vừa thay đổi ở nơi khác. Thử lại."; 429 → "Chậm một chút rồi thử lại."; ≥500 hoặc mất mạng → `words.error.*`.
  - Chỉ giữ thông điệp server khi nó là câu tiếng Việt do Hub viết (`ApiError`).
- **R1.3c** CEFR (A2→B2→C2) ở trang Mục tiêu sổ cũ chỉ hiện với người lớn.

### U1.4 Cắt câu dài — [XONG]

### U1.5 Ví dụ ô nhập — [MỘT PHẦN]
- **R1.5a** `new-notebook.tsx:72` → "Ví dụ: ôn phân số bằng bài tập ngắn"; thêm dòng hai "hoặc: theo sách Kết nối tri thức lớp 7".
- **R1.5b** `new-lesson-request.tsx:47` → "Ví dụ: ôn cách hẹn lịch".

### U1.6 Test từ cấm — [XONG, phạm vi hẹp]
- **R1.6a** Mở rộng quét sang `app/hub/**/*.ts` và `lib/greeting.ts`, `lib/today.ts`, `lib/lesson-v2/summary.ts`.
  - Hiện còn lọt: "máy chủ" (`api.ts:17`); "Bắt đầu" trong câu khích lệ (`greeting.ts:96`) → "Chọn một cuốn sổ để học nhé.".
- **R1.6b** Thêm từ cấm: "Xin bài mới", "Cá nhân hóa", "Tờ kiến thức", "lỗi lặp", "Đầu ra", "Học tiếp", "Bắt đầu", "Sign in".
- **R1.6c** Thêm quét các biểu tượng `lucide-react` trong tệp luồng học (xem U7.7).

---

## Giai đoạn 2 — Dễ bấm, dễ đọc, giấy kem

### U2.1 Kích thước bấm — [MỘT PHẦN]
**Đã có:** `pencilLink`, `buttonClass` có `min-h-11`, nút header, logo, hàng lựa chọn, `<summary>`, cột ngày tờ ô li 28px, 7 ngày trên điện thoại.

**Còn lại:**
- **R2.1a** Chip mục tiêu `study-meter.tsx:136` `min-h-8` → `min-h-11 min-w-11`.
- **R2.1b** Nút "Lưu" / "Bật" và ô nhập ở màn chọn người (`profile-controls.tsx:236,283`) cao ~40px → 44px.
- **R2.1c** Sổ kiểu cũ: dòng mục lục `min-h-7` (`notebook-view.tsx:119`) và nút "Sửa" trang Tài liệu → 44px.
- **R2.1d** `scripts/check-targets.js` chạy trên bàn, trang mở sổ, trang bài, tổng kết ở 375px; ghi kết quả vào PR.

### U2.2 Bỏ `confirm()` — [XONG], nhưng bị thay bởi quyết định 7
`PaperConfirm` khi mở lời giải phải bỏ: xem **U7.4**. `PaperConfirm` giữ cho "Xong bài" khi còn câu chưa làm.

### U2.3 Giấy nhắc hiện ngay — [XONG]
- **R2.3a** (nhỏ) Ghi `sessionStorage` sau khi hiệu ứng chạy (trong `onAnimationEnd`), để StrictMode không làm mất hiệu ứng lần đầu.

### U2.4 Giấy kem khi tối — [XONG]

### U2.5 Điện thoại — [MỘT PHẦN]
**Đã có:** chữ bìa sổ tối thiểu, tủ 2 cột dưới 400px, bỏ thanh dưới khi chỉ có một mục.

**Còn lại:**
- **R2.5a** Tiêu đề bài `leading-tight` → `leading-[2.625rem]` dưới 640px để chữ nằm đúng lưới 28px. Làm cùng U7.1.
- **R2.5b** Thanh trên trang bài: tên bài tràn → cắt một dòng với dấu "…", tên đầy đủ đã có ở trang Ghi nhớ.

### U2.6 Đồ trang trí — [MỘT PHẦN]
- **R2.6a** Bìa sổ trên tủ nhấc lên cả khi `focus-visible` (`desk.tsx:204,224`), không chỉ `group-hover`.

### U2.7 Focus — [XONG]
### U2.8 Lỗi nhỏ — [XONG]
- **R2.8a** `history-panel.tsx:65` "Đang chờ chấm" → `words.status.grading`.

---

## Giai đoạn 3 — Lời chào và lời khích lệ

### U3.1 Số liệu — [MỘT PHẦN]
**Đã có:** đủ trường, 4 truy vấn song song, chỉ tính sổ đang học (`lib/greeting.ts:7-62`).

**Còn lại:**
- **R3.1a** `newlySolid` trả tên thô (`greeting.ts:58`) → qua `skillLabel`.
- **R3.1b** Tên sổ trong câu "Tuần này bạn đã xong {n} bài {sổ}" chỉ có khi đúng một sổ → chọn sổ có nhiều bài xong nhất như plan.

### U3.2 Chọn câu — [XONG]
Câu mẫu cho các nhánh goal-today, review, open khác plan nhưng đúng nguyên tắc; giữ.

### U3.3 API — [XONG]

### U3.4 Bàn học — [XONG]
- **R3.4a** Test còn thiếu:
  - kỹ năng đã nghỉ không tính;
  - khác ngày có thể khác câu;
  - API trả `greeting` đúng hồ sơ;
  - khi xem bàn người khác thì `cheer` là `null`.

---

## Giai đoạn 4 — Bài học là trang đôi (đã làm một phần; phần còn lại chuyển sang giai đoạn 7)

| Việc | Trạng thái | Ghi chú |
|---|---|---|
| U4.1 Bố cục, kích thước trang | **[MỘT PHẦN]** | 7a đặt kích thước theo số dòng và dùng bộ đếm ở chân trang. Nội dung dài vẫn cuộn để giữ đầy đủ câu hỏi, nguồn và lời phê. → **U7.1–U7.2** |
| U4.2 Khung lật trang | **[MỘT PHẦN]** | 7a chia trang từ dữ liệu bài. Phím, vuốt, mốc `#cau-N`, giảm chuyển động và `inert` đã có. Còn nghiệm thu thiết bị thật. |
| U4.3 Trang bài trong khung | **[MỘT PHẦN]** | 7a mở bài mới ở Ghi nhớ, bài đang làm ở câu chưa nộp, bài xong ở Tổng kết. Giấy nhắc lỗi mở thẳng câu cần sửa. Có nút quay lại câu đang làm. Còn bài trong cùng khung sổ. → **U7.5, U8.4** |
| U4.4 Từng câu | **[MỘT PHẦN]** | Giấy gợi ý nổi ở lề và mở theo thứ tự. Còn con dấu Kiểm tra và ô lời phê cố định. → **U7.3, U7.6** |
| U4.5 Tổng kết | **[MỘT PHẦN]** | Con dấu chỉ có khi đã xong, luôn màu xanh, hiệu ứng chạy khi trang còn khuất và chạy lại mỗi lần tải. Lựa chọn góp ý là radio có nền bo góc. Ba thẻ xin bài chỉ hiện sau khi xong. Số "chưa làm" lặp ba lần (`reader.tsx:346`, `summary.tsx:31`, `PaperConfirm`). → **U7.9** |

---

## Giai đoạn 5 — Cuốn sổ mở trên bàn (phần còn lại chuyển sang giai đoạn 8)

| Việc | Trạng thái | Ghi chú |
|---|---|---|
| U5.1 Route | **[XONG]** | Hiệu ứng "turn" chưa giới hạn trong cùng sổ (nhỏ, sửa ở U8.4). |
| U5.2 Khung sổ | **[MỘT PHẦN]** | Bàn gỗ, dải cửa sổ, thẻ mép, "Đóng sổ" đã có. **Sai:** hiệu ứng bìa gắn vào `<h1>` nên bìa biến thành tiêu đề thay vì bay xuống và mở ra; bánh răng ở thanh trên; bài không mở trong khung sổ; dùng biểu tượng `lucide-react`. → **U8.1, U7.7** |
| U5.3 Các trang sổ | **[MỘT PHẦN]** | Không có `notebook/contents.tsx`, `today.tsx`, `settings.tsx`, `useBook`; trang vẽ trong `subject-view.tsx` và `list.tsx`. Mỗi trang tải lại tổng quan. Không xoá tệp cũ nào. Mục lục còn `<details>` "Lịch sử làm bài"; Hôm nay còn `<details>` "Yêu cầu khác" với "Hỏi thêm"; nút chính là link gạch chân. → **U8.2–U8.7** |

---

## Giai đoạn 6 — Trẻ em, cửa vào, móc treo hồ sơ

### U6.1 Chế độ trẻ em — [MỘT PHẦN]
**Đã có:** `data-age`, dòng kẻ rộng hơn, sticker, chỉ xem Cài đặt, "Hỏi bố mẹ", ví dụ Tự chọn.

**Còn lại:**
- **R6.1a** `data-age` đang lấy từ hồ sơ **đang xem** (`home-client.tsx:107`) → lấy từ hồ sơ đang học. Khi người lớn xem bàn của trẻ thì giữ cỡ người lớn.
- **R6.1b** 78 chỗ hardcode `leading-7` nên chữ không nằm trên dòng 32px của trẻ em → thay bằng `leading-[var(--paper-line)]` hoặc tiện ích `leading-line`. Làm cùng U7.1.
- **R6.1c** Tổng tuần "⭐ {n} ngày" trên tờ Tiến độ (hiện "{n} ngày học từ 10 phút" trong 14 ngày).
- **R6.1d** Con dấu tổng kết to hơn với trẻ em (`size-28`).
- **R6.1e** Ẩn tải lịch sử ở sổ kiểu cũ (R1.3a).

### U6.2 Cửa vào — [MỘT PHẦN]
- **R6.2a** Màu trời ô kính theo giờ Berlin: 4 dải màu bằng CSS, trang tự tính bằng giờ server khi trả HTML; không cần script.
- **R6.2b** Lỗi sai mật khẩu viết bút đỏ ngay dưới ô, không phải đoạn in đậm sau form.

### U6.3 Móc treo hồ sơ — [MỘT PHẦN]
- **R6.3a** Chìa khoá quản lý treo ở cuối thanh móc (hiện là nút gạch chân bên dưới).
- **R6.3b** "+ Thêm hồ sơ" là một móc trống có dấu "+", không phải nút chữ.

### U6.4 Header — [MỘT PHẦN]
- **R6.4a** Tên và emoji thành thẻ tên nhỏ treo cạnh "Đổi người"; trên điện thoại vẫn hiện emoji.
- **R6.4b** "Phòng học cả nhà" hiện từ 640px; dưới 640px chỉ logo.

---

## Giai đoạn 7 — Trang cố định, làm bài trơn tru (MỚI)

**Mục tiêu:** trang bài giữ nguyên vị trí như vở. Mở bài vào Ghi nhớ. Mỗi câu một hành động chính bằng đồ vật vẽ tay. Lời giải hiện ngay. **Cỡ:** L, 3 PR (7a bố cục dòng, 7b từng câu, 7c tổng kết và vẻ ngoài sổ).

### U7.1 Mô hình trang theo dòng (PR 7a)
**Đơn vị:** một **dòng** = `--paper-line` (28px; trẻ em 32px). Mọi khoảng cách trên giấy là bội số dòng.

**Kích thước trang** (thay `globals.css:478-500`):

| Khổ | Hiển thị | Số dòng mỗi trang | Rộng trang |
|---|---|---|---|
| ≥ 1024px | trang đôi | `floor((100dvh − header − 6rem) / line)`, tối thiểu 18, tối đa 26 | `min(32rem, (100vw − 8rem)/2)` |
| 640–1023px | một trang | như trên, tối thiểu 16 | `min(40rem, 100vw − 3rem)` |
| < 640px | một trang | như trên, tối thiểu 14 | `100vw − 1rem` |

- Lề hồng 2.25rem (≥ 640px: 3.25rem) như `RuledPage`; chữ bắt đầu sau lề.
- Không cuộn trong trang (`overflow: hidden`).

**Chia trang theo số dòng, không đo DOM** (`app/hub/notebook/page-blocks.ts` viết lại):
- Mỗi khối có `lines` tính từ dữ liệu bài bằng hàm thuần `blockLines(block, width)`:
  - Ước số dòng của một đoạn chữ: `ceil(số ký tự × bề rộng ký tự trung bình / bề rộng dòng)`. Hằng số theo font: 0.52em cho chữ thường, 0.6em cho chữ tay; sai số được bù bằng 1 dòng dự trữ mỗi khối.
  - Bảng số dòng của từng thành phần câu: xem U7.2.
- Thuật toán: xếp tuần tự; khối không vừa phần còn lại của trang thì sang trang mới; khối lớn hơn một trang thì tách theo đoạn (Ghi nhớ) hoặc dùng "trang câu dài" (U7.2).
- **Trang chỉ đổi khi** đổi khổ màn hình hoặc bài đổi cấu trúc (thêm câu kiểm tra). Mở gợi ý, lời giải, có lời phê **không** chia lại trang.

**Thứ tự nội dung:**
1. **Trang Ghi nhớ** (một hoặc nhiều trang): tên bài (2 dòng), mục tiêu, "Vì sao hôm nay" (bút chì), rồi sheet, các đoạn, sơ đồ, nguồn. Nếu còn chỗ ở trang cuối của Ghi nhớ thì câu đầu tiên bắt đầu ngay đó.
2. Các câu.
3. Sản phẩm (nếu có) liền sau câu cuối, không chiếm cả trang.
4. **Trang Tổng kết**, luôn là trang cuối.

**Bộ đếm duy nhất:**
- Chân trang: hàng chấm tròn ●●○○○ theo số trang (≤ 12 chấm; nhiều hơn thì "3 / 15"), chấm hiện tại đậm.
- Bỏ nhãn "Câu k / n" ở lề trên. Lề trên ghi tên phần ("Ghi nhớ", "Câu 4–6", "Tổng kết") bằng chữ tay nhạt.

**Test:** `tests/spread-pages.test.mjs`:
- bài 1, 6, 10, 25 câu;
- Ghi nhớ dài 3 trang;
- câu viết dài;
- đổi khổ trang đôi sang một trang;
- mở gợi ý hoặc lời giải (thay `revealed`) không đổi số trang và vị trí từng câu;
- chữ trẻ em 32px.

### U7.2 Chừa sẵn chỗ cho mỗi câu (PR 7a)
**Số dòng cố định của một câu**, không đổi dù có lời phê hay không:

| Phần | Số dòng |
|---|---|
| Đề | ước theo chữ (tối thiểu 1) |
| Hướng dẫn | ước theo chữ (0 nếu không có) |
| Chỗ làm | chọn: số lựa chọn × 1 (lựa chọn dài: 2); viết ngắn: 1; viết dài: theo độ dài gợi ý của bài (mặc định 5, tối đa 10) |
| Hàng hành động (Kiểm tra, gợi ý) | 1 |
| **Ô lời phê** (con dấu + bút đỏ) | 2, luôn chừa sẵn, để trống khi chưa có |
| Khoảng cách tới câu sau | 1 |

- Lời phê dài hơn 2 dòng: hiện 2 dòng đầu kèm "…"; chạm vào thì mở giấy nhớ dán đè hiện đủ.
- "Lần trước": một dấu nhỏ ở lề trái (số lần), chạm thì mở giấy nhớ; không chiếm dòng.
- Câu viết dài vượt cả trang: chỗ viết co còn `trang − (đề + 4)` dòng và cuộn bên trong; câu đó đứng một mình một trang.
- **Bỏ** các dòng chữ xám dưới câu ("Thử sửa lại trước…", "Đang chấm lại. Điểm này tạm…", "Đã chấm lại…"). Thay bằng biểu tượng nhỏ ở lề phải của ô lời phê (đồng hồ cát = đang chấm, mũi tên vòng = đã chấm lại); chạm để đọc một câu giải thích.

### U7.3 Gợi ý là giấy nhớ gấp ở lề (PR 7b)
- Mỗi câu có một **mẩu giấy nhớ gấp góc** ở lề phải, ngang dòng đề, 44×44px, nhãn ẩn "Gợi ý".
- Chạm thì giấy mở ra **đè lên lề và phần trên của câu**, không chen dòng. Bên trong lần lượt có:
  - "Gợi ý 1";
  - nút "Gợi ý tiếp" mở "Gợi ý 2";
  - nút "Xem lời giải".
- Chạm ra ngoài hoặc Escape thì gập lại. Gợi ý đã mở thì mẩu giấy giữ màu đậm hơn; chạm lại để đọc.
- Lời giải đã mở hiện cố định ở **ô lời phê** của câu (chữ bút chì xanh, khác bút đỏ), không đẩy dòng.
- Tệp: `hints.tsx` viết lại thành `HintNote`; bỏ `HintLinks`/`Revealed`.

### U7.4 Lời giải: hiện ngay, ghi nhận, làm lại không tính điểm (PR 7b)
- Bỏ `PaperConfirm` khi mở lời giải (`hints.tsx:20`). Bấm "Xem lời giải" thì gọi `reveal(item, "solution")` và hiện ngay.
- Câu nhận dấu bút chì **"Đã xem lời giải"** ở ô lời phê.
- Lưu lần xem bằng `support='solution'` trên bài. Tổng kết xếp câu chưa nộp vào nhóm đã xem lời giải. Chỉ tạo bản ghi lần làm khi người học nộp câu trả lời.
- **Vẫn cho làm lại.** Lần làm sau vẫn được chấm và có lời phê, nhưng mang `support='solution'` (`submit.ts:197` đã làm), nên:
  - bằng chứng kỹ năng = 0 (`learner-model/rules.ts`, đã đúng);
  - "đúng ngay" trên bàn và tiến độ không tính (đã lọc `support='none'`);
  - **sửa** `lib/lesson-v2/summary.ts:44`: `correctAfterRetry` loại câu có `support='solution'`. Thêm mục đếm **"xem lời giải"** riêng ở tổng kết.
- Chữ trên ô lời phê khi làm lại đúng: con dấu "Đúng" nhạt kèm bút chì "(đã xem lời giải, không tính điểm)".
- **Test:**
  - mở lời giải trước khi làm → tổng kết đếm 1 "xem lời giải", 0 "đúng sau khi sửa";
  - làm lại đúng sau lời giải → vẫn không tính;
  - kỹ năng không tăng;
  - API `reveal` không còn bước xác nhận.

### U7.5 Mở bài ở trang Ghi nhớ (PR 7a)
`reader.tsx` quy tắc mở:
1. **Bài chưa có câu trả lời nào: luôn mở trang Ghi nhớ đầu tiên** (bỏ `sessionStorage` cho trường hợp này).
2. Bài đang làm dở: mở trang có câu chưa làm đầu tiên. Nếu đến từ giấy nhắc "Có câu cần sửa lại" thì mở trang câu cần sửa.
3. Bài đã xong: mở trang Tổng kết.
- Thẻ **"Ghi nhớ"** cố định ở mép trái của trang bài (cạnh thẻ sổ) để lật về Ghi nhớ bất kỳ lúc nào; lật về rồi có nút nhỏ "← quay lại câu đang làm".
- Ghi nhớ dài tách theo đoạn qua nhiều trang (U7.1), không cuộn, không bị che.
- Bỏ tiêu đề trùng "Tờ kiến thức" (`sheet.tsx:6-7`).

### U7.6 Nút "Kiểm tra" là đồ vật trên giấy, không phải nút web (PR 7b)
Hiện là khối đá có viền vữa và bóng (`buttonClass("secondary")`, `item-card.tsx:144`), nên trông như nút web.
- Thay bằng **con dấu tay**: một vòng mực vẽ tay (SVG, nét bút chì) bao chữ tay "Kiểm tra", đặt ở **lề phải hàng hành động**.
  - Rê chuột hoặc focus: vòng đậm lên.
  - Bấm: dấu "ấn" xuống (scale 0.96, 120ms), rồi con dấu kết quả đóng vào ô lời phê (`animate-stamp`).
- **Luôn bấm được.** Chưa viết gì thì một mẩu giấy nhỏ hiện "Viết câu trả lời trước nhé" trong 3 giây, không gửi gì. Đang gửi thì vòng mực xoay chậm.
- Sau khi có kết quả: chữ đổi thành "Kiểm tra lại" khi câu trả lời khác lần trước; giống hệt thì vòng mờ đi và có chú thích "Sửa câu trả lời để kiểm tra lại".
- Component mới `app/hub/notebook/check-stamp.tsx`; `buttonClass("secondary")` không còn dùng trong trang bài.
- Hàng hành động cao đúng 1 dòng, **không** `flex-wrap` (sửa lỗi tràn ở `item-card.tsx:143`, `adaptive-requests.tsx:104`, `summary.tsx:53`).

### U7.7 Bộ biểu tượng vẽ tay thay `lucide-react` (PR 7c)
- Mới `app/hub/sketch-icons.tsx`: SVG nét 1.6px, đầu nét tròn, màu `currentColor`, cùng phong cách logo ngôi nhà, kích thước 24/32/40.
- Bộ biểu tượng: mũi tên lật trang (góc giấy cong), đóng sổ (bìa sổ gập), bánh răng (vẽ tay), sổ có dấu trang (Bài mới), bút chì (Luyện thêm), tờ giấy và bút (Tự chọn), đồng hồ cát (đang chấm), mũi tên vòng (đã chấm lại), ngôi sao, móc treo, chìa khoá, tải xuống (phong bì).
- Thay ở luồng học: `notebook/book.tsx`, `notebook/spread.tsx`, `desk.tsx`, `study-meter.tsx`, `paper-bits.tsx`, `paper-dialog.tsx` (nút đóng), `profile-controls.tsx`, `home-client.tsx`, `notebook-view.tsx`, `lesson-page.tsx`.
- Trang quản trị (`pages.tsx` AdminView, `run-status.tsx`, `family-admin.tsx`, `document-form.tsx`) được giữ `lucide-react`.
- Test R1.6c chặn `lucide-react` trong tệp luồng học.
- Thư mục `components/ui/*` (khoảng 60 tệp shadcn, không ai dùng) đưa vào danh sách xoá ở PR 7c, sau khi grep xác nhận không còn import.

### U7.8 Trông như một cuốn sổ (PR 7c)
- **Gáy sổ** giữa hai trang: dải bóng đổ hai bên (gradient tối 12px), có lò xo hoặc đường khâu tuỳ loại sổ (sổ chủ đề: đường khâu chỉ).
- Mép trang dưới có 2–3 lớp giấy xếp chồng (bóng mỏng) để thấy độ dày.
- **Lật trang:**
  - Góc dưới trái và phải là **góc giấy cong**, vùng bấm 56×56px; thay mũi tên mờ.
  - Lật bằng hiệu ứng góc cong theo `clip-path` (máy tính) hoặc trượt (điện thoại).
  - Sửa lỗi trang cũ trượt lệch ra ngoài khung khi lật: trang cũ nằm trong khung có `overflow: clip`.
- **Chỉ dựng trang đang hiện và hai trang kề bên.** Trang khác là chỗ trống có chiều cao đúng, để khỏi tải tổng kết và hiệu ứng dấu khi trang còn khuất (sửa phát hiện "mọi trang đều dựng"). Focus khi lật đến tiêu đề phần, không đến `<p>` rỗng.

### U7.9 Tổng kết là trang cuối có ý nghĩa (PR 7c)
- Trang tổng kết hiện **ngay cả khi chưa xong bài**, gồm:
  - kiểm điểm: đúng ngay, đúng sau khi sửa, xem lời giải, cần sửa lại, chưa làm, chờ chấm;
  - mỗi số có nút nhỏ "lật tới" câu đầu thuộc nhóm đó.
- **Một chỗ duy nhất** báo "Còn {n} câu chưa làm" (bỏ trùng ở `reader.tsx:346` và trong `PaperConfirm`).
- "Xong bài" là nút gạch duy nhất của trang. Bấm khi còn câu chưa làm thì hỏi lại bằng `PaperConfirm`.
- Con dấu:
  - Chỉ đóng **khi người học vừa bấm Xong bài** và trang tổng kết đang hiện; ghi vào bài rồi thì những lần mở sau chỉ hiện dấu tĩnh.
  - Màu theo kết quả: xanh khi "Giỏi lắm!", cam khi "Cố lên!".
  - Trẻ em: dấu to hơn (R6.1d).
- Góp ý cho bài sau: hai hàng lựa chọn **khoanh tròn bằng bút** (Dễ / Vừa / Khó; Có ích / Bình thường / Chưa có ích), dùng cùng kiểu với câu chọn đáp án, và một dòng viết tay.
- Ba biểu tượng xin bài (U8.5) ở cuối trang, **hiện cả khi chưa xong bài**.
- "Đóng sổ" ở mọi nơi đều về **trang Hôm nay của sổ**. Về bàn học thì qua nút "Đóng sổ" ở trang sổ.

### U7.10 Trạng thái lưu và chờ chấm nằm trên giấy (PR 7b)
- Bỏ dòng "Bài đã lưu, sẽ có lời phê sau." trên nền tường. Trạng thái lưu: chữ bút chì nhỏ ở góc dưới phải của trang đang mở ("Đã lưu").
- Máy chấm vắng: biểu tượng đồng hồ cát ở ô lời phê của câu đang chờ; chạm thì hiện `words.status.gradeLater`.

---

## Giai đoạn 8 — Sổ có chương theo tháng, trang mở sổ có báo cáo (MỚI, thay U5.2–U5.3)

**Mục tiêu:** mở sổ thấy ngay đang học tới đâu, có bài gì, xin bài ở đâu. Mỗi tháng một chương. **Cỡ:** L, 3 PR (8a dữ liệu và khung, 8b trang Hôm nay và Mục lục, 8c bài trong khung sổ, dọn code cũ).

### U8.1 Khung sổ (PR 8a) — `app/hub/notebook/book.tsx`
- **Bìa bay thật:** gắn `view-transition-name: cover-<id>` cho một `NotebookCover` thu nhỏ ở góc trên trái của khung sổ (không gắn vào `<h1>`). Hiệu ứng: bìa từ tủ bay xuống, lật mở (`book-rise`), rồi hiện trang Hôm nay.
- Khung trang đôi dùng chung với trang bài (`Spread` sau U7.1), nên **sổ và bài là cùng một cuốn**.
- Thẻ mép phải: **Hôm nay · Mục lục · Tiến độ**, giấy màu, chữ tay; thẻ của trang đang mở nhô ra hơn.
- Bìa sau: biểu tượng bánh răng vẽ tay ở **góc dưới trái** trang phải, mở trang Cài đặt.
- "Đóng sổ" (biểu tượng bìa gập) ở góc trên trái, về bàn với hiệu ứng `book-sink`.

### U8.2 Dữ liệu một lần mỗi sổ (PR 8a) — `app/hub/notebook/use-book.ts`
- `useBook(subjectId, learner)` gọi song song `/api/subjects/:id/lessons?all=1` và `/api/subjects/:id?view=overview`, giữ trong bộ nhớ theo `subjectId` khi lật giữa các trang.
- Làm mới khi:
  - quay lại tab;
  - có yêu cầu xin bài vừa xong (`onSaved`);
  - nộp hoặc xong bài (event `lh:lesson-changed` phát từ trang bài).
- **API bài trong sổ** (`app/api/subjects/[id]/lessons/route.ts`):
  - thêm `all=1` trả toàn bộ bài v2 của sổ (tối đa 400; nhiều hơn thì phân trang theo tháng);
  - mỗi bài có `id, title, kind, slot, assignedDate, completedAt, minutes, skill, firstTry (đúng/tổng), solutionsSeen`;
  - một truy vấn có `GROUP BY` lesson, không N+1.
- **Báo cáo gần đây** (`lib/notebook-report.ts`, trả kèm `?view=overview` dưới khoá `report`):
  - Dùng lại truy vấn của `lib/greeting.ts`, lọc theo sổ: ngày học tuần này, phút tuần này, đúng ngay tuần này so với tuần trước, bài xong tuần này, kỹ năng vừa vững, hay nhầm (tối đa 2, nhãn qua `skillLabel`), kỹ năng cần ôn, ba bước sắp tới của lộ trình.
  - Câu khích lệ của sổ chọn bằng `greetingFor` với dữ liệu đã lọc.

### U8.3 Trang Hôm nay = trang đôi đầu tiên khi mở sổ (PR 8b) — `app/hub/notebook/today.tsx`
**Trang trái — báo cáo gần đây** (theo bản phác 12/11):
- Đầu trang (chữ tay nhạt): "Chương {tháng} · {tên chương}". Tên chương lấy từ bước lộ trình đang học hoặc tháng.
- Tên sổ (2 dòng, chữ in).
- "Tuần này": ngày học, phút; "Đúng ngay {a}/{b} câu (tuần trước {c}/{d})".
- Bút chì xanh: "✓ Đã vững: …"; bút đỏ: "✎ Hay nhầm: …".
- "Sắp tới": ba bước lộ trình đánh số.
- Câu khích lệ của sổ (một dòng chữ tay).
- Chưa có số liệu: "Sổ còn mới. Làm bài đầu tiên để thấy tiến độ ở đây."

**Trang phải — bài đang có:**
- "Bài đang làm": tên, "{x}/{n} câu · {phút} phút", nút gạch **Mở bài** (nút chính duy nhất).
- "Bài luyện thêm đang chờ" (nếu có): danh sách tên + phút, chạm tên để mở.
- Bài hôm nay chưa soạn xong: biểu tượng đồng hồ cát và "Bài hôm nay đang được soạn."
- **Cuối trang: ba biểu tượng mộc vẽ tay**, mỗi biểu tượng 56×56px có chữ tay bên dưới:
  - **Bài mới** (sổ có dấu trang);
  - **Luyện thêm** (bút chì);
  - **Tự chọn** (tờ giấy và bút).
  - Chạm "Tự chọn": một tờ giấy nhớ mở ra ngay trên trang với dòng viết "Hôm nay bạn muốn luyện gì?" và con dấu "Gửi".
  - Trạng thái yêu cầu: một dòng chữ tay dưới biểu tượng tương ứng, có giờ và "Thử lại"; bài đã sẵn sàng thì biểu tượng có chấm đỏ và chạm là mở bài.
- Bỏ: `<details>` "Yêu cầu khác"; "Hỏi thêm" gộp vào "Tự chọn"; thẻ xin bài dán đè trên chữ.

**Điện thoại:** trang phải (bài đang có và ba biểu tượng) hiện trước; vuốt sang để xem báo cáo.

### U8.4 Mở bài trong khung sổ (PR 8c)
- `?bai2=<id>` hiển thị trong cùng khung sổ (U8.1) của sổ chứa bài; thẻ mép vẫn còn.
- Bấm **Mở bài** từ trang Hôm nay hoặc Mục lục thì **lật tới trang Ghi nhớ của bài** (U7.5), hiệu ứng `turn`.
- Từ bài, thẻ "Hôm nay" hoặc "Đóng sổ" lật về trang Hôm nay.
- Giấy nhắc trên bàn mở thẳng bài trong sổ (bìa bay + lật tới Ghi nhớ).
- Nút lùi trình duyệt lật lùi một trang sổ; lật câu trong bài không đẩy lịch sử.
- `transitionKind` chỉ dùng `turn` trong cùng một sổ; khác sổ thì `close` rồi `open`.

### U8.5 Mục lục theo chương tháng (PR 8b) — `app/hub/notebook/contents.tsx`
- **Chương = tháng** (giờ Berlin) theo ngày giao bài (`assigned_date`); chương mới nhất ở đầu.
- Mỗi chương bắt đầu trang mới, tiêu đề chữ in: "Chương 11 · Tháng 11/2026". Số chương đếm từ tháng của bài đầu tiên trong sổ.
- Dòng phụ chữ tay: tên bước lộ trình chiếm nhiều bài nhất trong tháng.
- **Trong chương, chia theo ngày:**
  - Ngày viết ở lề hồng ("T4 12/11"), chỉ ở bài đầu của ngày.
  - Mỗi bài một dòng: loại bài (bút chì, `words.lessonKind`), tên, dấu ✓ khi xong, chấm cam khi đang làm, dấu "có câu cần sửa".
- Chạm tên bài thì lật tới bài (Ghi nhớ nếu chưa làm; Tổng kết nếu đã xong).
- Cuối chương: một dòng tổng "{n} bài · {m} phút · đúng ngay {a}/{b}".
- Bỏ: `<details>` "Lịch sử làm bài" (`history-panel.tsx:48`); lịch sử từng câu và tải CSV/Markdown chuyển vào Cài đặt (người lớn).
- Ngăn kéo "Bài đã học" trên bàn dùng cùng component, gộp mọi sổ (mỗi dòng có tên sổ).

### U8.6 Trang Tiến độ và Cài đặt (PR 8b)
- `notebook/progress.tsx` (đã có) giữ.
  - Thêm "⭐ {n} ngày tuần này" cho trẻ em (R6.1c).
  - Thanh "Đúng ngay" vẽ thành hàng ô vuông tô màu trên giấy ô li thay thanh xám (thanh xám trông như lỗi trên điện thoại).
  - Ngày chưa học có viền chấm mờ để vẫn thấy ô.
- `notebook/settings.tsx` (mới, tách khỏi `subject-view.tsx` `SubjectForm`):
  - mục tiêu, trình độ, lời dặn, "Mỗi sáng có bài mới khi bạn đã xong bài hôm trước", nội dung lúc mở sổ;
  - lịch sử từng câu và tải CSV/Markdown (người lớn);
  - trẻ em chỉ xem.

### U8.7 Dọn code cũ (PR 8c)
- **Xoá** sau khi chuyển xong: `subject-view.tsx` (trừ phần form đã chuyển), `lesson-v2/list.tsx`, `new-lesson-request.tsx`, phần người học của `requests-panel.tsx`, phần danh sách của `history-panel.tsx`, `learned-lessons.tsx` (thay bằng `contents.tsx` dạng nhiều sổ).
- `adaptive-requests.tsx` chuyển thành `notebook/request-icons.tsx`.
- Sổ kiểu cũ (`notebook-view.tsx`): dùng cùng khung, Mục lục theo tháng của các bài đã giao, giữ trang Tài liệu; chỉ đọc khi đã lưu trữ.

**Test giai đoạn 8:**
- `tests/notebook-report.test.mjs`: lọc theo sổ, tuần này so với tuần trước, không số liệu.
- `tests/contents-chapters.test.mjs`: nhóm theo tháng và ngày Berlin quanh nửa đêm và đổi giờ; số chương đếm đúng khi có tháng trống.
- `tests/route.test.mjs`: bài mở trong khung sổ, nút lùi.
- Thủ công: tủ → bìa bay → Hôm nay → Mở bài → Ghi nhớ → câu → Tổng kết → Mục lục → chương trước → bài cũ → Đóng sổ. Chạy bằng chuột, phím, chạm, cả hồ sơ trẻ em.

---

## Giai đoạn 9 — Nhiều dạng bài và trang kiến thức cho Bio, code (MỚI)

**Mục tiêu:** sổ dùng được cho môn khác ngoài Deutsch: Bio (sơ đồ, quy trình, bảng), lập trình Rust (đọc và viết code). **AI vẫn đọc và chấm** mọi bài mở, kể cả code; Hub không chạy code. **Cỡ:** L, 4 PR (9a hợp đồng, 9b trang kiến thức, 9c dạng câu mới, 9d prompt và chấm).

### U9.1 Hợp đồng `lesson-package/3` (PR 9a)
- Giữ tương thích: bài v2 cũ vẫn đọc được; `lib/contracts/lesson-package-v3.ts` mở rộng v2.
- **Dạng câu mới** (`input`):

| `input` | Người học làm | Đáp án để Hub tự chấm | Chỗ làm (số dòng) |
|---|---|---|---|
| `cloze` | điền vào ô trống ngay trong câu (≤ 6 ô) | danh sách đáp án chấp nhận cho từng ô | số dòng của câu |
| `match` | nối cặp: chạm vế trái rồi vế phải (≤ 8 cặp) | các cặp đúng | số cặp |
| `order` | sắp thứ tự: kéo hoặc chạm mũi tên lên/xuống (≤ 8 bước) | thứ tự đúng | số bước |
| `label` | gắn nhãn vào điểm đánh số trên hình hoặc sơ đồ (≤ 8 nhãn) | nhãn đúng cho từng điểm | chiều cao hình + 1 |
| `table` | điền ô trong bảng (≤ 6×6) | giá trị từng ô (chữ hoặc số có sai số) | số hàng + 1 |
| `code` | viết hoặc sửa code trong ô có tô màu cú pháp, đánh số dòng | không có: AI chấm theo rubric | 6–16 dòng |

- **Khối kiến thức mới** trong Ghi nhớ:
  - `table` (bảng);
  - `figure` (sơ đồ dựng từ dữ liệu, xem U9.2);
  - `code` (khối code có chú thích từng dòng, ngôn ngữ trong danh sách cho phép: `rust`, `python`, `text`);
  - `steps` (các bước đánh số).
- `lib/lesson-v2/validate.ts`: giới hạn kích thước, kiểm đáp án khớp dạng câu, rubric bắt buộc cho `code`.
- Sinh lại JSON Schema, `npm run contracts:check`.

### U9.2 Sơ đồ an toàn, không nhúng SVG của AI (PR 9b)
- `figure` là **dữ liệu**, app tự vẽ, không nhận SVG hay HTML từ AI:
  - `flow` (hộp và mũi tên, ≤ 12 nút): chu trình, quy trình;
  - `cycle` (vòng tròn các bước);
  - `labelled-image`: ảnh có sẵn trong thư viện hình của Hub (ví dụ tế bào động vật, tế bào thực vật, chuỗi DNA, tim) cùng toạ độ điểm đánh số;
  - `bar` (biểu đồ cột ≤ 12 cột).
- Thư viện hình là tệp SVG do người làm Hub vẽ, nằm trong `public/figures/`; AI chỉ chọn theo tên.
- Vẽ bằng nét bút chì trên giấy, cùng phong cách sổ; có mô tả chữ cho trình đọc màn hình (bắt buộc trong hợp đồng).

### U9.3 Component dạng câu (PR 9c) — `app/hub/lesson-v2/inputs/*`
- Mỗi dạng một component, cùng giao diện: `value` (chuỗi JSON lưu như hiện tại trong nháp), `onChange`, `disabled`, `lines` (số dòng chừa sẵn theo U7.2).
- **Bàn phím:**
  - `match`: Tab đến vế trái, Enter chọn, mũi tên chọn vế phải, Enter nối;
  - `order`: Alt + ↑/↓ để di chuyển bước;
  - `label`: Tab qua từng điểm, ô nhập ngay cạnh.
- Chạm trên điện thoại: không dùng kéo-thả bắt buộc; luôn có cách chạm từng bước.
- `code`:
  - textarea dùng font mono, đánh số dòng ở lề hồng, Tab chèn 4 dấu cách;
  - tô màu cú pháp bằng bộ tô màu nhẹ tự viết cho từ khoá Rust (không thêm thư viện lớn);
  - không chạy code.
- Lời phê cho `code`: bút đỏ ghi số dòng ("dòng 4: …"); chạm số dòng thì tô vàng dòng đó trong ô.

### U9.4 Chấm tự động và AI chấm (PR 9d)
- `lib/evidence/autograde.ts`:
  - `cloze`, `match`, `order`, `label`, `table` chấm theo đáp án;
  - đúng một phần thì `partial` với điểm theo tỉ lệ ô đúng;
  - `code` luôn gửi AI.
- Prompt chấm (`integrations/runner-prompts/assess-local.md`, `assess.md`):
  - phần riêng cho `code`: đọc code như người chấm, kiểm tra theo rubric (đúng yêu cầu, biên dịch được về lý thuyết, xử lý lỗi, đặt tên); không bịa kết quả chạy; ghi rõ "chưa chạy thử";
  - lời phê trỏ số dòng.
- Prompt soạn (`plan-request.md`, `LESSON-DESIGN.md`):
  - hướng dẫn chọn dạng câu theo môn: Bio ưu tiên `label`, `order`, `match`, `table`; Rust ưu tiên `code` (sửa lỗi, viết hàm nhỏ), `cloze` cho cú pháp, `order` cho các bước borrow/ownership;
  - mỗi bài trộn ít nhất 2 dạng câu.
- Eval: thêm 10 câu `code` Rust và 10 câu Bio vào `fixtures/eval/assess/`; ghi tỉ lệ khớp của Qwen và Codex trước khi bật cho người học.

### U9.5 Bật dần (PR 9d)
- Cờ theo sổ `subjects.limits.package` = `2` hoặc `3`; mặc định `2`. Runner chỉ được giao viết bài v3 cho sổ đã bật.
- Bật thử ở một sổ mới (ví dụ "Rust cơ bản" hoặc "Bio 10") trước khi đổi sổ Deutsch.

**Test giai đoạn 9:**
- Schema v3 với ví dụ từng dạng câu và khối.
- `autograde` cho từng dạng (đúng, sai, một phần, chữ hoa thường, khoảng trắng).
- Component nhập liệu: bàn phím và chạm.
- Lưu nháp và khôi phục từng dạng.
- Chia trang với hình và code (U7.1).
- Bài v2 cũ không đổi.

---

## Thứ tự, PR và ước lượng

| PR | Nội dung | Cỡ | Phụ thuộc |
|---|---|---|---|
| 1c | Phần còn lại giai đoạn 1–3, 6: R1.*, R2.*, R3.*, R6.* | M | — |
| 7a | Trang theo dòng, chừa chỗ, mở ở Ghi nhớ (U7.1, U7.2, U7.5, R2.5a, R6.1b) | L | — |
| 7b | Từng câu: giấy nhớ gợi ý, lời giải hiện ngay, con dấu Kiểm tra, trạng thái trên giấy (U7.3, U7.4, U7.6, U7.10) | M | 7a |
| 7c | Biểu tượng vẽ tay, gáy sổ, góc lật, chỉ dựng trang gần, trang tổng kết (U7.7, U7.8, U7.9) | M | 7b |
| 8a | Khung sổ, bìa bay, `useBook`, API bài trong sổ, báo cáo sổ (U8.1, U8.2) | M | 7a |
| 8b | Trang Hôm nay, Mục lục theo chương tháng, Tiến độ, Cài đặt (U8.3, U8.5, U8.6) | L | 8a |
| 8c | Bài trong khung sổ, dọn code cũ (U8.4, U8.7) | M | 8b, 7c |
| 9a–9d | Nhiều dạng bài (U9.1–U9.5) | L ×4 | 7a, 7b |

Thứ tự đề xuất: **1c và 7a song song → 7b → 7c → 8a → 8b → 8c → 9a…9d.** Mỗi PR deploy production riêng sau khi chủ dự án duyệt; lùi bằng `wrangler rollback` (không có thay đổi dữ liệu trừ trường `limits.package` ở 9d, mặc định giữ hành vi cũ).

## Rủi ro và cách giảm

| Rủi ro | Giảm bằng |
|---|---|
| Ước số dòng theo ký tự lệch với chữ thật (font, emoji, tiếng Đức có từ dài) | 1 dòng dự trữ mỗi khối; test với câu tiếng Đức dài nhất trong fixture; ô viết dài cuộn trong ô, không tràn trang |
| Giấy nhớ gợi ý đè lên chữ khó đọc trên điện thoại | trên < 640px giấy nhớ mở thành tờ dán phủ cả câu, có nút gập rõ |
| Câu `match`/`order` khó với bàn phím, trình đọc màn hình | luôn có cách chạm từng bước và phím tắt; test VoiceOver mỗi dạng |
| AI chấm code sai vì không chạy | rubric bắt buộc, lời phê ghi "chưa chạy thử", eval trước khi bật, phản đối điểm vẫn dùng được |
| Sổ dài nhiều tháng làm Mục lục chậm | API phân trang theo tháng; chỉ dựng chương đang xem và chương kề |
| Đổi `Spread` ảnh hưởng cả sổ lẫn bài | 7a có test chia trang và chạy thử đủ ba khổ trước khi làm 8a |
