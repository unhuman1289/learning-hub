# Sổ học lật từng trang — plan chi tiết giao diện, chữ và lời chào

Viết 11/11/2026, dựa trên `main` @ `9317f67`. Nguồn: audit giao diện cùng ngày (chạy thử hồ sơ người lớn và trẻ em, 375px và 1280px, sáng và tối) và bản kiểm kê toàn bộ chữ của luồng học. Mỗi việc có mã (`U1.3`…), tệp, cách làm, điều kiện đạt và test. Không có migration D1 nào trong plan này.

## 0. Quyết định và nguyên tắc

**Quyết định của chủ dự án (11/11/2026)**
1. Xưng **"bạn"** với mọi hồ sơ, kể cả trẻ em.
2. Máy tính: **trang đôi**; một lần mở thấy nhiều câu (không phải một ghi nhớ và một câu).
3. Giấy luôn **màu kem**, cả chế độ tối; chỉ tường, gỗ, header tối đi.
4. Đồng ý toàn bộ đề xuất audit.
5. Lời chào trên bàn học **đổi mỗi ngày** kèm **một câu khích lệ** từ tiến độ gần đây của **mọi sổ**.

**Nguyên tắc dùng để duyệt mọi PR**
- Một cuốn sổ thật: đi tới đi lui bằng lật trang và thẻ đánh dấu, không bằng mục gập `<details>` hay trang web rời.
- Một việc mỗi trang, **một nút gạch mỗi màn hình**; việc phụ là chữ bút chì hoặc giấy nhớ.
- Mọi thứ bấm được ≥ 44×44px; chữ trên giấy ≥ 16px, chữ phụ ≥ 14px.
- Không nói về máy hay ai chấm; không mã kỹ thuật, không ngày ISO, không tiếng Anh trong luồng học.
- Chỉ nói điều có thật: lời chào và khích lệ lấy từ số liệu đã lưu.
- Giữ bất biến: không thay bài dở, không tự hoàn thành, lưu nháp/nộp như cũ, "Đã lưu" chỉ sau khi server xác nhận; bàn phím và trình đọc màn hình dùng được.

**Định nghĩa "xong" chung cho mỗi PR**
- `npm run test`, `typecheck`, `lint`, `build` đạt.
- Chạy thử cục bộ: hồ sơ người lớn **và** trẻ em; 375px, 768px, 1280px; sáng và tối; chỉ dùng bàn phím một lượt.
- Chụp màn hình trước/sau đính vào PR.
- Cập nhật `DESIGN.md` (và `FEATURES.md` nếu đổi hành vi).
- Deploy production chỉ sau khi chủ dự án duyệt PR.

---

## Giai đoạn 1 — Bộ từ và chữ

**Mục tiêu:** một hành động một tên, một khái niệm một từ, xưng "bạn", không chữ máy hay tiếng Anh. Cỡ: S (1 PR).

### U1.1 Bảng từ `app/hub/words.ts`
- Xuất một đối tượng `words` (chỉ chuỗi, không logic), nhóm theo: `action`, `request`, `lessonKind`, `skillState`, `result`, `status`, `place`, `error`.
- Component đổi sang dùng `words.*` thay chuỗi viết rời. Chuỗi riêng một chỗ (ví dụ placeholder) được phép viết tại chỗ nhưng phải qua kiểm từ cấm (U1.6).

| Khoá | Chữ | Thay cho |
|---|---|---|
| `action.open` | Mở bài | Bắt đầu, Mở bài mới, Xem lời phê, Ôn bài, Mở sổ (giấy nhắc), Học tiếp (khi chưa làm câu nào) |
| `action.continue` | Làm tiếp | Học tiếp (khi đã có câu trả lời) |
| `action.check` / `action.recheck` | Kiểm tra / Kiểm tra lại | giữ |
| `action.finish` | Xong bài | giữ |
| `action.reopen` | Mở lại bài | Mở lại để sửa |
| `action.review` | Xem lại bài | giữ |
| `action.close` | Đóng sổ | Về phòng học, Về bàn học, ← Về phòng học |
| `action.retry` | Thử lại | Tải lại, Gửi lại, Lưu lại, Bấm lại, xin lại |
| `action.save` / `action.cancel` | Lưu / Huỷ | Lưu hồ sơ, Lưu mục tiêu, Lưu góp ý, Hủy |
| `action.later` | Để mai | giữ |
| `request.title` | Xin bài | Xin bài mới, Xin thêm bài, Soạn bài |
| `request.new` / `request.practice` / `request.own` | Bài mới / Luyện thêm / Tự chọn | Học mới / Luyện tập / Cá nhân hoá |
| `request.ownPrompt` | Hôm nay bạn muốn luyện gì? | giữ (placeholder đổi, U1.5) |
| `lessonKind.*` | Bài mới · Luyện thêm · Ôn lại · Tự chọn · Bài đầu tiên | Học mới, Luyện tập, Ôn tập, Bộ ôn, Cá nhân hoá |
| `skillState.*` | Mới học · Đang luyện · Đã vững; nhãn phụ **Cần ôn** | Đã tiếp cận, Đang hình thành, Đã tự làm được, đang luyện, đã vững, cần ôn |
| `result.*` (con dấu) | Đúng · Gần đúng · Sửa lại · Chờ chấm | giữ; "còn cần sửa" ở tổng kết → "cần sửa lại" |
| `status.saving` / `saved` / `unsaved` | Đang lưu… / Đã lưu / Chưa lưu | giữ |
| `status.grading` | Đang chấm… | Đang chờ thầy cô chấm…, Đang chờ chấm |
| `status.gradeLater` | Bài đã lưu, sẽ có lời phê sau. | Máy chấm đang nghỉ…, lượt chấm đã dừng |
| `status.writing` | Đang soạn bài… | đang soạn bài…, đã nhận đang chờ soạn, Đang chờ xếp lượt, máy soạn nhận |
| `status.ready` | Bài đã sẵn sàng. | giữ |
| `status.notWritten` | Chưa soạn được bài. | giữ |
| `place.desk` / `place.shelf` | Bàn học / Tủ sách | Phòng học, Kệ |
| `place.settings` / `place.aboutYou` | Cài đặt / Về bạn | Hồ sơ, Cài đặt cá nhân, Hồ sơ của tôi |
| `place.notes` | Lời dặn | Prompt cá nhân, Prompt của sổ, Dặn planner |
| `place.next` | Các bài sắp tới | lộ trình, Các bước tiếp theo |
| `place.days` | Ngày đã học | Nhịp học 14 ngày |
| `place.mistakes` | Hay nhầm | Lỗi lặp |
| `place.remember` | Ghi nhớ | Tờ kiến thức, Kiến thức và ví dụ |
| `place.product` | Sản phẩm | Đầu ra |
| `place.contents` | Mục lục | Bài đã học (trong sổ) |
| `feedback` | lời phê (của cô) · góp ý (của bạn) | nhận xét, phản hồi |
| `error.offline` | Mất kết nối. Bài vẫn còn trên trang; thử lại khi có mạng. | 3 biến thể hiện có |
| `error.unknown` | Chưa làm được. Thử lại sau một chút. | Chưa xác nhận thao tác, Chưa xác nhận được với máy chủ |

### U1.2 Đổi chữ theo màn hình
| Màn hình | Tệp | Việc |
|---|---|---|
| Cổng mật khẩu | `lib/household.ts:146` | "Learning Hub" → "Phòng học cả nhà"; lỗi "chưa được cấu hình" → "Cửa chưa sẵn sàng. Nhờ người quản lý xem giúp." |
| Chọn người | `components/profile-controls.tsx` | bỏ nhãn "Trẻ em/Người lớn" trên thẻ (chỉ hiện khi quản lý); "Emoji" → "Biểu tượng"; "PIN quản lý" → "Mã quản lý"; "Thoát quản lý" và "Thoát chế độ quản lý" → "Thoát quản lý" |
| Header | `app/home-client.tsx`, `profile-controls.tsx`, `study-meter.tsx` | bỏ "Learning Hub" hiển thị (giữ `<title>`); một tên **Cài đặt** cho dialog; câu giải thích đồng hồ (U1.4) |
| Bàn học | `desk.tsx`, `today-board.tsx`, `lib/today.ts`, `desk-progress.tsx` | nút giấy nhắc theo `action.open/continue`; lý do: "Có câu cần sửa lại", "Bài mới hôm nay", "Làm tiếp bài hôm trước", "Ôn lại {n} kỹ năng" thay "{n} kỹ năng đến hạn ôn"; "Kệ của {tên}" → "Bàn của {tên}" |
| Trang sổ | `subject-view.tsx`, `lesson-v2/list.tsx`, `adaptive-requests.tsx`, `new-lesson-request.tsx`, `requests-panel.tsx`, `skill-progress.tsx`, `history-panel.tsx` | theo bảng; trạng thái sổ "Đang lập lộ trình" → "Đang chuẩn bị bài đầu tiên"; "Tự chuẩn bị bài lúc 00:00 giờ Đức khi đã xong bài chính" → "Mỗi sáng có bài mới khi bạn đã xong bài hôm trước"; bỏ chữ G/P/N trước kỹ năng, nhóm thành "Ngữ pháp · Chính tả, dấu câu · Diễn đạt tự nhiên" |
| Trang bài | `lesson-v2/*`, `runner-status.tsx` | theo bảng; "Đầu ra:" → "Sản phẩm:"; "Đang xem bài của người học — chỉ đọc." → "Bạn đang xem bài của {tên}."; dòng nguồn chuyển vào cuối Ghi nhớ, chữ "Đã đọc · ngày" |
| Phản đối điểm | `dispute-dialog.tsx` | "Câu trả lời của mình đúng" → "Câu trả lời của bạn đúng"; "Đã gửi phản hồi…" → "Đã gửi. Câu này tạm chưa tính điểm." |
| Tổng kết, góp ý | `summary.tsx`, `reflection.tsx` | "Góp ý sau khi đọc lời phê và sửa bài" → "Góp ý cho bài sau"; bỏ câu "Thời gian lấy từ đồng hồ học của sổ" |
| Ảnh bài làm | `item-card.tsx:104` | "không chụp thông tin định danh" → "đừng chụp tên, địa chỉ hay giấy tờ" |

### U1.3 Ẩn khỏi người học
- Tải Markdown/CSV → chuyển vào Cài đặt sổ (giai đoạn 5; trong giai đoạn 1 chỉ ẩn với hồ sơ trẻ em).
- Mã câu trong lịch sử (`history-panel.tsx:61`) → "Câu {số thứ tự}".
- Lỗi thô từ server (`Sign in required`, mã trạng thái chưa dịch ở `requests-panel.tsx:88`) → `error.unknown`.
- CEFR, "Google Docs", "paper", "link" ở sổ kiểu cũ → chỉ hiện với người lớn.

### U1.4 Cắt câu dài (≤ 20 âm tiết, một ý mỗi câu)
| Chỗ | Mới |
|---|---|
| `study-meter.tsx:72` | "Đồng hồ chạy khi bạn mở sổ. Bấm để đổi mục tiêu." |
| `subject-view.tsx:99`, `profile-settings.tsx:75` | "Điều bạn muốn cô soạn và sửa bài lưu ý." |
| `reader.tsx:92` | "Bài trên máy này khác bản đã lưu. Chép bài làm ra trước, rồi tải lại trang." |
| `notebook-view.tsx:253` | "Bản đầy đủ nằm trên Google Drive. Ở đây chỉ giữ đường dẫn." |

### U1.5 Ví dụ trong ô nhập hợp mọi tuổi
"Ví dụ: ôn cách hẹn lịch", "Ví dụ: phân số", "Ví dụ: viết thư cho bạn" (bỏ "email dời lịch họp", "sách Kết nối tri thức" chuyển sang ví dụ thứ hai).

### U1.6 Chặn từ cấm (test)
- `tests/learner-words.test.mjs`: quét `app/hub/**/*.tsx`, `components/**/*.tsx`, `lib/today.ts`, `lib/household.ts` (bỏ qua `pages.tsx` quản trị, `ai-jobs-panel.tsx`, `run-status.tsx`, `import-panel.tsx`) tìm chuỗi hiển thị chứa: `máy chấm|máy soạn|máy chủ|Hub|planner|Prompt|lộ trình|lượt soạn|lượt chấm|phiên bản|định danh|Hủy|tùy|của tôi|\bmình\b`.
- Test `words.ts`: mọi khoá có chuỗi không rỗng; không chuỗi nào quá 80 ký tự trừ khoá `*.long`.

**Đạt khi:** grep từ cấm sạch; chạy hết luồng (chọn người → bàn → sổ → bài → tổng kết → xin bài) không thấy hai tên cho cùng hành động.

---

## Giai đoạn 2 — Dễ bấm, dễ đọc, giấy kem

**Mục tiêu:** trẻ em bấm trúng, đọc rõ, giấy luôn là giấy. Cỡ: S–M (1 PR).

### U2.1 Kích thước bấm
- `paper-bits.tsx` `pencilLink`: thêm `inline-flex min-h-11 items-center`; giữ `leading-7` cho chữ.
- `ui.tsx` `buttonClass`: bỏ các nơi truyền `min-h-9` (`home-client.tsx:169`, `item-card.tsx:144`, `adaptive-requests.tsx:103`).
- Header: "Đổi người", "Thoát quản lý", đồng hồ phút `min-h-11`; logo `size-11`.
- `study-meter.tsx:136` chip mục tiêu `min-h-11 min-w-11`.
- `item-card.tsx` hàng lựa chọn: `min-h-11` (vẫn khớp dòng kẻ bằng `py-2` + `leading-7`).
- `desk-progress.tsx` cột ngày: rộng tối thiểu 28px; dưới 640px đổi thành dải 7 ngày gần nhất.
- `<summary>` còn lại và link "← tên sổ": `min-h-11`.

### U2.2 Hỏi lại trên giấy thay `confirm()`
- Mới: `app/hub/paper-confirm.tsx` `PaperConfirm({ open, message, confirmLabel, onConfirm, onCancel })`, một mẩu giấy nhớ hiện ngay dưới nút gây ra nó; focus vào nút "Huỷ"; Escape = huỷ; `role="alertdialog"`.
- Dùng ở `reader.tsx:263` ("Còn {n} câu chưa làm. Vẫn xong bài?") và `hints.tsx:6` ("Mở lời giải thì câu này tính là có trợ giúp. Vẫn mở?").

### U2.3 Giấy nhắc hiện ngay
- `components/notebook/post-it.tsx`: nhận `animate` (mặc định false). `today-board.tsx` bật `animate` chỉ khi `sessionStorage['lh-postits-day'] !== hôm nay`, rồi ghi lại.
- Bỏ `animationDelay` khi không animate.

### U2.4 Giấy kem trong chế độ tối
- `app/globals.css`: trong khối `@media (prefers-color-scheme: dark)` **bỏ** ghi đè `--color-paper`, `--color-paper-2`, `--color-rule`, `--color-margin`, `--color-label`, `--color-postit-*`.
- Thêm token mới dùng cho chữ trên giấy: `--color-ink-paper`, `--color-muted-paper`, `--color-accent-paper` (giữ giá trị sáng ở cả hai chế độ). `RuledPage`, `PaperDialog`, `bg-graph`, `PostIt`, `CalendarLeaf`, `NotebookCover` label dùng token `*-paper`.
- Chữ ngoài giấy (tường, gỗ, header) vẫn theo token tối hiện có.
- Chế độ tối thêm bóng ấm quanh giấy: `shadow-page` tối = `0 0 0 1px rgb(0 0 0/.3), 0 18px 40px -16px rgb(0 0 0/.8), 0 0 60px rgb(255 200 120/.08)`.

### U2.5 Điện thoại
- `paper.tsx` `NotebookCover`: chữ tối thiểu `max(12px, 7.5cqw)` / `max(15px, 11cqw)`; `Bookcase` 2 cột dưới 400px.
- `reader.tsx` tiêu đề: `text-[1.75rem] leading-[2.625rem]` dưới 640px (vẫn chia hết lưới 28px khi cộng lề).
- `home-client.tsx` thanh dưới: chỉ hiện khi có ≥ 2 mục (người quản lý).

### U2.6 Đồ trang trí chỉ động khi có việc
- `components/notebook/house.tsx`: cửa tủ không xoay khi hover; ngăn kéo không nhãn không trượt; ngăn có nhãn trượt cả khi `focus-visible`.
- Bìa sổ trên tủ: nhấc lên cả khi `focus-visible` (không chỉ `group-hover`).

### U2.7 Focus
- Ô viết tay (`item-card.tsx`, `adaptive-requests.tsx`): khi focus có gạch chân 2px `--color-accent-paper` **và** `outline` chung.
- Cột ngày tờ ô li: dùng outline chung (bỏ `outline-offset-0`).

### U2.8 Lỗi nhỏ
- `history-panel.tsx:65` đổi `text-red-800 dark:text-red-300` → `text-brick`.
- `notebook-view.tsx:104` bọc tab "Mục tiêu" (hub2) trong `RuledPage`.

**Test:** `scripts/check-targets.mjs` (chạy bằng Playwright đã có trong devDependencies? nếu chưa có thì dùng trình duyệt của phiên làm việc) đo mọi `a,button,summary,input,select,textarea,[role=button]` hiển thị ≥ 44×44 trên 4 trang chính ở 375px; in danh sách vi phạm. Không đưa vào CI nếu không có trình duyệt trong CI.

**Đạt khi:** 0 vi phạm 44px trên bàn, sổ, bài, tổng kết; không còn `window.confirm` trong `app/`; chế độ tối giấy màu kem, chữ trên giấy tương phản ≥ 4.5:1.

---

## Giai đoạn 3 — Lời chào và lời khích lệ hằng ngày

**Mục tiêu:** mỗi ngày một câu chào và một câu khích lệ có thật. Cỡ: M (1 PR).

### U3.1 Số liệu (`lib/greeting.ts`, hàm `readGreetingFacts(db, learner, now)`)
Đọc một lần, 3–4 câu truy vấn, mọi sổ `status='active'` của học viên, ngày theo Berlin:

| Trường | Cách tính |
|---|---|
| `daysStudied14` | số ngày có `study_time.seconds ≥ 120` trong 14 ngày |
| `streak` | số ngày liên tiếp có học, tính từ hôm qua hoặc hôm nay |
| `daysSinceLast` | số ngày từ lần học gần nhất |
| `firstTryThisWeek` / `firstTryLastWeek` | `{ correct, total }` câu `attempt_no=1 AND support='none'` đã chấm, 7 ngày này và 7 ngày trước |
| `lessonsDoneThisWeek` | bài `completed_at` trong 7 ngày, kèm tên sổ nhiều nhất |
| `newlySolid` | kỹ năng `mastery='demonstrated'` có `last_independent_at` trong 7 ngày (tối đa 2 tên, qua `skillLabel`) |
| `dueReviews` | số kỹ năng `needs_review` hoặc `next_review_day ≤ hôm nay` |
| `openLessons` | số bài v2 chưa xong |
| `minutesToday`, `targetMinutes` | như `/api/today` |

### U3.2 Chọn câu (`greetingFor(facts, { name, day, hour, role })` → `{ hello, cheer, kind }`)
- **`hello`** theo buổi (giờ Berlin): 5–10h "Chào buổi sáng", 10–13h "Chào bạn", 13–18h "Chào buổi chiều", 18–22h "Chào buổi tối", còn lại "Khuya rồi"; ghép tên. Có 3 biến thể mỗi buổi, chọn theo `hash(day + name) % 3` → cùng ngày cùng câu.
- **`cheer`**: duyệt theo thứ tự ưu tiên, lấy nhánh đầu tiên đủ điều kiện:

| # | `kind` | Điều kiện | Mẫu (chọn 1/3 theo ngày) |
|---|---|---|---|
| 1 | `goal-today` | `minutesToday ≥ targetMinutes` | "Hôm nay bạn đã đủ {target} phút rồi. Học thêm là phần thưởng." |
| 2 | `streak` | `streak ≥ 3` | "Bạn đã học {streak} ngày liền. Giữ nhịp nhé!" |
| 3 | `better` | tuần này ≥ 5 câu, tỉ lệ cao hơn tuần trước ≥ 10 điểm % | "Tuần này bạn đúng ngay {c}/{t} câu, khá hơn tuần trước." |
| 4 | `solid` | `newlySolid` không rỗng | "Bạn vừa nắm vững: {kỹ năng}." |
| 5 | `done-week` | `lessonsDoneThisWeek ≥ 2` | "Tuần này bạn đã xong {n} bài {sổ}." |
| 6 | `welcome-back` | `daysSinceLast ≥ 3` | "Mừng bạn quay lại! Hôm nay một bài ngắn là đủ." |
| 7 | `review` | `dueReviews ≥ 1` | "Có {n} kỹ năng cần ôn lại. Một bài luyện thêm là vừa." |
| 8 | `open` | `openLessons ≥ 1` | "Bài hôm trước đang chờ bạn làm tiếp." |
| 9 | `start` | không có số liệu | "Chọn một cuốn sổ để bắt đầu nhé." |

- Quy tắc viết mẫu: xưng "bạn"; ≤ 16 từ; nêu số có thật; không so với người khác; không hứa kết quả; không dấu chấm than quá một lần.
- Hồ sơ trẻ em dùng cùng mẫu (theo quyết định 1), có thêm biểu tượng nhỏ (⭐ cho `streak/better/solid`).

### U3.3 API
- `lib/today.ts` `todayFor` trả thêm `greeting: { hello, cheer, kind }`; `app/api/today/route.ts` không đổi quyền (`read_progress`). Khi xem bàn người khác: trả `greeting` với `hello` chứa tên người đó và `cheer = null`.
- Không route mới, không bảng mới, không gọi model.

### U3.4 Bàn học
- `desk.tsx`: tiêu đề `h1` = `greeting.hello` (chữ in, như hiện tại); dòng dưới `greeting.cheer` (chữ tay, màu nhấn, 1 dòng, `aria-live="off"`). Trong lúc tải: "Chào {tên}." như cũ, không nhảy bố cục (giữ chỗ 1 dòng).
- `today-board.tsx` đã đọc `/api/today`: nâng việc tải lên `desk.tsx` một lần, truyền xuống, tránh gọi hai lần.

**Test** `tests/greeting.test.mjs`:
- Mỗi nhánh 1–9 với dữ liệu tối thiểu; ưu tiên đúng khi nhiều nhánh cùng đủ.
- Cùng `day` → cùng câu; khác ngày → có thể khác.
- Buổi theo giờ Berlin quanh đổi giờ mùa hè/đông (29/03, 25/10).
- Không số liệu → nhánh 9; số liệu một sổ bị lưu trữ không tính.
- `readGreetingFacts` trên D1 bộ nhớ (`tests/d1-adapter.mjs`): streak qua nửa đêm Berlin, kỹ năng đã nghỉ không tính.
- API: `greeting` đúng hồ sơ; khách xem bàn người khác không có `cheer`.

**Đạt khi:** 3 ngày liền thấy câu khác nhau trên production; câu khích lệ khớp số liệu tra tay trong D1.

---

## Giai đoạn 4 — Bài học là trang đôi, lật từng trang

**Mục tiêu:** bài học đọc và làm như cuốn vở: trang đôi trên máy tính, một trang trên điện thoại, lật bằng mép trang, phím, vuốt. Cỡ: L (2 PR: 4a khung lật trang, 4b chuyển trang bài vào khung).

### U4.1 Bố cục
| Khổ | Hiển thị | Kích thước trang |
|---|---|---|
| ≥ 1024px | trang đôi, gáy giữa | mỗi trang rộng `min(31rem, (100vw − 6rem)/2)`, cao `100dvh − header − 5rem`, làm tròn xuống bội số 28px |
| 640–1023px | một trang rộng | rộng `min(40rem, 100vw − 2rem)` |
| < 640px | một trang | rộng `100vw − 1rem`, lề hồng 2.25rem |

- **Nội dung chảy liên tục:** Đầu bài (tên, mục tiêu, lý do) → **Ghi nhớ** (sheet, sections, sơ đồ, nguồn) → **Câu 1…n** → **Sản phẩm** (nếu có) → **Tổng kết**.
- Một trang chứa bao nhiêu khối vừa; thường 2–4 câu ngắn hoặc 1 câu viết dài → một lần mở trang đôi thấy 4–8 câu.
- Câu không bị cắt qua hai trang (`break-inside: avoid`). Khối cao hơn một trang (bài viết dài): ô viết cuộn bên trong, chiều cao tối đa = trang − 4 dòng.
- Lề trên trang (chữ tay, nhạt): "Câu 4–6 / 10" hoặc "Ghi nhớ". Lề dưới: số trang "3 / 7".

### U4.2 Khung lật trang `app/hub/notebook/spread.tsx` (PR 4a)
```ts
type SpreadProps = {
  blocks: { id: string; kind: "head" | "remember" | "item" | "product" | "summary"; node: ReactNode; label?: string }[];
  startAt?: string;            // id khối cần hiện khi mở
  onPage?: (page: number, total: number, visible: string[]) => void;
  storageKey?: string;          // nhớ trang trong sessionStorage
};
```
- **Chia trang:** container `columns` với `column-width = pageWidth`, `column-gap = gutter`, `column-fill: auto`, `height = pageHeight`, `overflow: hidden`. Số trang = `ceil(scrollWidth / (pageWidth + gap))`. Lật = `translateX(-(page × (pageWidth+gap)))`, bước 2 trang (trang đôi) hoặc 1.
- **Đo lại** bằng `ResizeObserver` trên container và từng khối (ô viết giãn, ảnh tải xong, lời phê đến). Khi đo lại, giữ khối đang được focus trong khung (tính lại trang chứa nó).
- **Dự phòng:** nếu `CSS.supports("column-fill","auto")` sai hoặc đo lỗi → chia theo khối: mỗi trang 1 khối `remember`, 3 câu ngắn hoặc 1 câu dài (`input === "long"`), không animate.
- **Điều hướng:**
  - Mép trang trái/phải: vùng bấm cao cả trang, rộng 44px, chữ ẩn "Trang trước/Trang sau".
  - Phím `←/→`, `PageUp/PageDown`, `Home/End` khi focus không ở trong ô viết.
  - Vuốt ngang (pointer events, ≥ 40px, theo trục ngang rõ hơn dọc, bỏ qua khi bắt đầu trong ô viết).
  - `startAt` và hash `#cau-4` mở đúng trang.
- **Hiệu ứng:** `view-transition-name: lesson-page` trên khung; khi lật đặt `document.documentElement.dataset.vt = "turn"` rồi `startViewTransition` (tái dùng `globals.css:367–372`); không có view transition → trượt ngang 220ms; `prefers-reduced-motion` → đổi tức thì.
- **Khả năng tiếp cận:**
  - Cột ngoài khung nhận `inert` → Tab và trình đọc màn hình chỉ đi trong trang đang mở.
  - Sau khi lật: focus tới tiêu đề khối đầu của trang mới; `aria-live="polite"` đọc "Trang 3 trên 7, câu 4 đến 6".
  - Mỗi trang là `<section aria-roledescription="trang" aria-label="Trang 3">`.
- **Nhớ trang:** `sessionStorage[storageKey] = page`.

### U4.3 Trang bài trong khung (PR 4b) — `app/hub/lesson-v2/reader.tsx`
- Dựng `blocks` từ bài: `head`, `remember` (bỏ `<details>` "Kiến thức và ví dụ"), mỗi item một `item`, `product`, `summary`.
- **Bỏ** state `view` ("work" | "summary"); `LessonSummary` thành khối cuối. Bài đã xong mở ở `startAt="summary"`; bài dở mở ở câu đầu chưa trả lời; đến từ giấy nhắc "Có câu cần sửa lại" mở ở câu cần sửa.
- Nút **Xong bài** (gạch, duy nhất của màn hình) ở khối tổng kết. Trước khi xong: tổng kết hiện "Còn {n} câu chưa làm" và nút "Lật tới câu {k}".
- Thanh trên khung (ngoài giấy, trên gỗ): "← Đóng sổ" (giai đoạn 5 mới thật sự là đóng sổ; giai đoạn 4 dẫn về trang sổ), tên bài, trạng thái lưu.
- `stage.tsx` bỏ (thay bởi khung); điều hướng "Câu trước/Câu tiếp" của điện thoại bỏ.

### U4.4 Từng câu — `item-card.tsx`, `hints.tsx`, `feedback.tsx`, `dispute-dialog.tsx`
- Thứ tự trong khối câu: số + đề → hướng dẫn → chỗ viết/chọn → **Kiểm tra** (đá) → con dấu + lời phê bút đỏ → bút chì "Lần trước" (1 dòng, bấm mở).
- **Gợi ý**: mẩu giấy nhớ gấp góc ở lề phải của câu (40×40, nhãn ẩn "Gợi ý"); bấm mở ra gợi ý 1, rồi nút "Gợi ý tiếp", rồi "Lời giải" (qua `PaperConfirm`).
- **Chấm sai?** (người lớn) / **Hỏi bố mẹ** (trẻ em: `role === 'child'`, gọi `POST /api/disputes/{id}/escalate` sau khi tạo phản đối với lý do "Nhờ bố mẹ xem" — dùng API có sẵn, không thêm route).
- "Đang chấm…" thay chữ chờ; khi Mac tắt: `status.gradeLater`.

### U4.5 Tổng kết là trang cuối — `summary.tsx`
- Trên cùng: con dấu lớn theo kết quả (Đúng hết → "Giỏi lắm!", còn câu sửa → "Cố lên!"), dùng `Stamp` + `animate-stamp` lần đầu.
- Đếm: "{n} câu đúng ngay · {m} câu đúng sau khi sửa · {k} câu cần sửa lại" (chỉ hiện số > 0).
- Lời phê tổng (bút đỏ), "Nên luyện thêm: …".
- **Góp ý cho bài sau**: hai hàng lựa chọn khoanh tròn (Dễ/Vừa/Khó, Có ích/Bình thường/Chưa có ích) + một dòng viết; lưu như hiện tại.
- Cuối trang: ba thẻ **Bài mới · Luyện thêm · Tự chọn** (dùng `AdaptiveRequests` hiện có).

**Test:**
- `tests/spread-pages.test.mjs`: hàm chia trang dự phòng (`pageBlocks(blocks, perPage)`) — bài 1, 3, 6, 10, 25 câu; câu dài đứng một mình; tổng kết luôn ở trang cuối.
- Thủ công (ghi vào PR): bài 6 câu và 10 câu, có câu viết dài, ảnh, câu chờ chấm; 375/768/1280; chỉ bàn phím; VoiceOver đọc "Trang x trên y"; vuốt trên điện thoại thật; giảm chuyển động.
- Không đổi API → các test nộp bài, lời phê, D21 hiện có phải giữ nguyên.

**Đạt khi:** không còn `<details>` trong trang bài; trang đôi hiện ≥ 4 câu ngắn; lật bằng 3 cách; Tab không lọt sang trang khuất; lưu nháp/nộp/lời phê như trước.

---

## Giai đoạn 5 — Cuốn sổ mở trên bàn

**Mục tiêu:** sổ là vật thể trên bàn gỗ, các phần là các trang của nó. Cỡ: L (2 PR: 5a khung sổ và route, 5b các trang).

### U5.1 Route
- `app/hub/use-route.ts`: thêm `{ view: "book"; id: string; page: "muc-luc" | "hom-nay" | "tien-do" | "cai-dat" }` và giữ `{ view: "lesson"; id }`.
- URL: `?sach=<id>` → `book` trang `hom-nay` (giữ link cũ); `?sach=<id>&trang=muc-luc|tien-do|cai-dat`; `?bai2=<id>` vẫn là bài.
- `transitionKind`: desk → book = `open`; book/lesson → desk = `close`; book ↔ lesson cùng sổ và giữa các trang sổ = `turn`.
- Nút lùi trình duyệt = lật lùi (mỗi lần lật trang sổ đẩy history; lật câu trong bài **không** đẩy history).

### U5.2 Khung sổ `app/hub/notebook/book.tsx`
- Đặt trên `OakDesk` thu gọn (mép bàn và ngăn kéo giữ; tủ sách và cửa sổ ẩn khi sổ mở trên màn < 1280px; ≥ 1280px cửa sổ thu thành dải nhỏ phía trên).
- Bìa: `NotebookCover` có `view-transition-name: cover-<id>` (khớp bìa trên tủ ở `desk.tsx:186`) → bìa bay từ tủ xuống bàn rồi mở (`book-rise`).
- Ba thẻ đánh dấu cố định ở mép phải: **Mục lục · Hôm nay · Tiến độ** (vàng/xanh/hồng, giống thẻ xin bài, cao ≥ 44px). Bìa sau (Cài đặt) mở bằng biểu tượng bánh răng nhỏ ở góc dưới.
- "Đóng sổ" ở thanh trên.

### U5.3 Các trang (PR 5b)
| Trang | Tệp mới | Nội dung | Thay cho |
|---|---|---|---|
| Trang đầu / **Mục lục** | `notebook/contents.tsx` | Tên sổ, mục tiêu (chữ tay), "Các bài sắp tới" (3 bước), danh sách bài đã học: ngày ở lề, loại bài, tên; bấm để mở bài | `list.tsx` "Bài đã học", `learned-lessons.tsx` (một sổ), phần lộ trình của `skill-progress.tsx` |
| **Hôm nay** | `notebook/today.tsx` | Bài đang mở: tên, lý do, nút gạch **Mở bài/Làm tiếp**; bài phụ đang mở (bút chì); nếu không có bài: trang trắng, ba thẻ xin bài và dòng trạng thái; bài đêm chưa soạn xong | `list.tsx` phần trên, `adaptive-requests.tsx` (đặt vào), `new-lesson-request.tsx`, `requests-panel.tsx` (gộp: "Hỏi thêm" thành thẻ "Tự chọn") |
| **Tiến độ** (giấy ô li) | `notebook/progress.tsx` | Ngày đã học 14 ngày (ô tô màu), đúng ngay, kỹ năng (ba chấm, nhóm Ngữ pháp/Chính tả/Diễn đạt), hay nhầm (bút đỏ lề) | `skill-progress.tsx` |
| **Bìa sau: Cài đặt** | `notebook/settings.tsx` | Mục tiêu, trình độ, lời dặn, mỗi sáng có bài mới, nội dung lúc mở sổ, tải lịch sử (CSV/Markdown) — người lớn; trẻ em chỉ xem | `subject-view.tsx` `SubjectForm`, `history-panel.tsx` (phần tải) |

- Một lần đọc mỗi sổ: hook `useBook(id, learner)` gọi `/api/subjects/:id/lessons` và `/api/subjects/:id?view=overview` song song, dùng chung cho mọi trang; làm mới khi quay lại tab hoặc khi có bài mới (`onSaved` của thẻ xin bài).
- Trên bàn học: giấy nhắc mở thẳng bài trong sổ (`?bai2`, mở với hiệu ứng `open` + `turn`); ngăn kéo "Bài đã học" giữ là Mục lục chung mọi sổ.
- Sổ kiểu cũ (`notebook-view.tsx`): dùng cùng `book.tsx`; các trang cũ (Bài học, Mục lục, Mục tiêu, Tài liệu) thành trang của khung; chỉ đọc nếu sổ đã lưu trữ.
- Xoá sau khi chuyển: `subject-view.tsx` (trừ `SubjectForm` đã chuyển), `lesson-v2/list.tsx`, `new-lesson-request.tsx`, `requests-panel.tsx` phần người học, `history-panel.tsx` phần danh sách.

**Test:**
- `tests/route.test.mjs` (mới): `parseRoute`/`routeHref` cho mọi dạng `?sach`, `?sach&trang`, `?bai2`, link cũ `?so`, `?lesson`.
- Thủ công: vòng tủ → bìa → hôm nay → bài → tổng kết → Mục lục → Tiến độ → Cài đặt → đóng sổ bằng chuột, phím, chạm; nút lùi trình duyệt; link cũ mở đúng; xem bàn người khác (chỉ đọc) đi được mọi trang.

**Đạt khi:** không còn trang web rời cho sổ; mọi phần của sổ tới được trong ≤ 2 thao tác từ trang Hôm nay; bìa bay từ tủ khi mở.

---

## Giai đoạn 6 — Trẻ em, cửa vào, móc treo hồ sơ

**Mục tiêu:** trẻ 12 tuổi tự dùng được, và lối vào cũng thuộc ngôi nhà. Cỡ: M (1 PR).

### U6.1 Chế độ trẻ em (theo `learner_settings.role = 'child'` của hồ sơ đang học)
- `home-client.tsx` đặt `data-age="child"` trên `<main>`. CSS: chữ trên giấy 17→19px, dòng 28→32px (biến `--line` thay hằng `1.75rem` trong `bg-ruled`, `RuledPage`, khung trang).
- Tờ Tiến độ: mỗi ngày đủ 10 phút là một sticker (ngôi sao/hoa/lá xoay vòng), thay ô tô màu; tổng tuần "⭐ 5 ngày".
- Tổng kết: con dấu "Giỏi lắm!"/"Cố lên!" lớn hơn.
- Ẩn: Cài đặt sổ (chỉ xem), tải lịch sử, "Chấm sai?" (thay "Hỏi bố mẹ"), "+ Sổ mới" (đã ẩn).
- Thẻ "Tự chọn": ví dụ "Ví dụ: phân số, viết thư cho bạn".

### U6.2 Cửa vào — `lib/household.ts` `passphrasePage`
- Trang HTML tự chứa (không có bundle app): tường vôi, **cánh cửa gỗ** có ô kính nhìn ra trời (màu theo giờ đơn giản bằng CSS), tấm biển gỗ ghi "Phòng học cả nhà", ô mật khẩu là tấm biển nhỏ, nút gạch **"Vào nhà"**.
- CSS nội tuyến ≤ 3 KB, font hệ thống + Patrick Hand qua Google Fonts (đã dùng trong app); không script.
- Lỗi sai mật khẩu: chữ bút đỏ dưới ô, giữ nguyên trang.

### U6.3 Chọn người — `components/profile-controls.tsx` `ProfilePicker`
- Bức tường có thanh gỗ treo **móc áo**; mỗi hồ sơ là một thẻ tên treo bằng dây: emoji lớn, tên chữ tay. Bấm → thẻ đung đưa 300ms → vào bàn học (`window.location.reload()` như hiện tại).
- "Chế độ quản lý" là chiếc **chìa khoá** treo cuối thanh; bấm mở mẩu giấy nhập mã (PaperDialog), thay ô nhập trần.
- Thêm hồ sơ (khi quản lý): móc trống có dấu "+".
- Đổi emoji: giữ popover hiện có nhưng dựng trên giấy.

### U6.4 Header
- Bỏ chữ "Learning Hub" hiển thị; logo + "Phòng học cả nhà".
- Tên người + emoji là thẻ tên nhỏ; "Đổi người" mở lại móc treo.

**Test:**
- Thủ công: hồ sơ trẻ em đi trọn luồng ở 375px và máy tính bảng; nhờ một trẻ thật làm 1 bài không hướng dẫn, ghi lại chỗ vướng.
- `tests/household.test.mjs`: trang cửa vào vẫn trả form POST đúng, không script, ≤ 6 KB.
- Bộ lọc từ cấm (U1.6) áp cho chuỗi trẻ em thấy.

**Đạt khi:** trẻ tự chọn hồ sơ, mở sổ, làm bài, xin bài mới mà không cần hỏi.

---

## Thứ tự, PR và ước lượng

| PR | Nội dung | Cỡ | Phụ thuộc | Có thể song song với |
|---|---|---|---|---|
| 1 | Giai đoạn 1: bảng từ, đổi chữ, test từ cấm | S | — | 2, 3 |
| 2 | Giai đoạn 2: 44px, PaperConfirm, giấy kem, điện thoại | S–M | — | 1, 3 |
| 3 | Giai đoạn 3: lời chào, khích lệ | M | — | 1, 2 |
| 4a | Khung lật trang `spread.tsx` + test chia trang | M | 2 | 6 |
| 4b | Trang bài trong khung, tổng kết là trang cuối | M–L | 1, 4a | 6 |
| 5a | Route `book`, khung sổ trên bàn, bìa bay | M | 4a | — |
| 5b | Các trang Mục lục/Hôm nay/Tiến độ/Cài đặt, gộp sổ cũ, xoá code thừa | L | 5a, 4b | — |
| 6 | Trẻ em, cửa vào, móc treo, header | M | 1, 2 | 4a, 4b |

Thứ tự đề xuất: **1 → 2 → 3** (có thể cùng tuần) → **4a → 4b** → **5a → 5b**, PR 6 chen sau 2.

**Triển khai:** mỗi PR merge xong thì deploy production riêng (không gom), kiểm `/api/health`, mở bàn học bằng hồ sơ người lớn và trẻ em. Lùi lại: deploy lại phiên bản Worker trước (`wrangler rollback`); không có thay đổi dữ liệu nên không cần khôi phục D1.

## Rủi ro và cách giảm

| Rủi ro | Giảm bằng |
|---|---|
| Chia trang bằng multi-column sai khi ô viết, ảnh, lời phê đổi cao | `ResizeObserver` trên từng khối; giữ khối đang focus trong khung; phương án chia theo khối |
| Tab/VoiceOver đi vào trang khuất | `inert` cho mọi cột ngoài khung; test chỉ bàn phím mỗi PR |
| Lật bằng vuốt xung đột với cuộn trong ô viết | không bắt vuốt bắt đầu trong ô viết; ngưỡng ngang > dọc |
| Hiệu suất trên điện thoại cũ | tắt view transition và bóng lớn dưới 640px hoặc khi giảm chuyển động |
| Lời khích lệ sai do phút học thiếu (tab ẩn không tính) | chỉ dùng phút ở nhánh 1; các nhánh khác dựa trên câu đã chấm và bài đã xong |
| Đổi chữ làm vỡ test hiện có so chuỗi | cập nhật test trong cùng PR 1; test mới chặn từ cấm |
| Bàn học trên điện thoại quá dài khi sổ mở trên bàn | dưới 1024px sổ chiếm cả màn hình, gỗ chỉ là viền |
