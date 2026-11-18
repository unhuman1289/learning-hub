import { deskItem, shelfItem } from "../../app/hub/lubeck/items.ts";
import { mountScene } from "../../app/hub/lubeck/scene.ts";

const tabs = [
  { name:"Bàn học", states:["Sáng sớm · 1 sổ","Buổi chiều · 2 sổ","Buổi tối · 4 sổ","Bàn trống","Đang soạn bài","Máy chấm tắt","Mất mạng"] },
  { name:"Bài học", states:["Chọn đáp án","Điền tiếng Đức","Viết","Nghe · chưa nghe","Nghe · đang phát","Nghe · hết lượt","Nghe · lời thoại","Đúng ngay","Sai lần một","Đang chấm","Gia sư mở","Bàn phím đang mở","Tổng kết"] },
  { name:"Sổ", states:["Lộ trình","Đã làm được","Bài tới khó hơn","Lịch sử","Cài đặt"] },
  { name:"Quản trị", states:["Cần xem","Knowledge","Hệ thống"] },
];
const sample = document.querySelector("#sample");
const screens = document.querySelector("#screens");
const state = document.querySelector("#state");
let active = 0;
let month = 11;

const button = (label, style = "") => `<button type="button" class="${style}">${label}</button>`;
const heading = (name, content, paper = "") => `<div class="sheet ${paper}"><h1>${name}</h1>${content}</div>`;
const note = (message, tone = "") => `<p class="note ${tone}">${message}</p>`;
const keys = '<div class="lineup" aria-label="Ký tự tiếng Đức">'+["ä","ö","ü","ß"].map(letter=>button(letter)).join("")+'</div>';

function desk(index) {
  const hours=[7.8,15,21,15,15,21,15];
  const counts=[1,2,4,0,1,2,1];
  const messages=["","", "", "Chưa có sổ nào. Mở sổ đầu tiên để bắt đầu.", "Qwen đang soạn bài Deutsch.", "Máy chấm đang tắt. Bài đã nộp sẽ chờ chấm.", "Mất mạng. Kết nối lại để đồng bộ bài làm."];
  const seasonalWeather = { cloud: .28, rain: false, snow: month === 12 || month === 1, fog: 0 };
  const deskDecoration = `<svg class="season-desk" aria-hidden="true" viewBox="-28 -62 56 68">${deskItem(month)}</svg>`;
  const shelfDecoration = `<svg class="season-shelf" aria-hidden="true" viewBox="-16 -46 32 48">${shelfItem(month)}</svg>`;
  const when = hours[index] >= 18 ? "Buổi tối" : index === 0 ? "Sáng sớm" : "Buổi chiều";
  const memo = index < 3
    ? '<p>Deutsch</p><p>Viết email đổi lịch</p>' + button("Học tiếp", "primary")
    : '<p>' + messages[index] + '</p>';
  const books = ["Deutsch", "Toán 7", "Tiếng Anh", "Python"].slice(0, counts[index]);
  sample.innerHTML = `<div class="room" data-night="${hours[index] >= 18}">
    <div class="window"><svg aria-label="Cửa sổ nhìn ra Lübeck" role="img" viewBox="26 12 628 336"></svg>
      <div class="scene-label">Lübeck · ${when}</div>
    </div>
    <section class="desk" aria-label="Bàn học">
      <div class="desktop"><div class="postit">${memo}</div>${deskDecoration}</div>
      <div class="desk-front" aria-hidden="true"></div>
    </section>
    <section class="bookcase" aria-label="Kệ sách">
      <h2>Kệ sách</h2>
      <div class="shelf">${books.map(name => button(name,"spine")).join("")}${shelfDecoration}</div>
      <div class="shelf lower-shelf">${books.length ? "" : button("Mở sổ", "primary")}</div>
    </section>
  </div>`;
  mountScene(sample.querySelector("svg"))({hour:hours[index],month,day:13,offsetHours:month>=4&&month<=10?2:1,weather:seasonalWeather,moon:null});
}

function lesson(index) {
  const listen=index>=3&&index<=6;
  const choice=[0,7,8].includes(index);
  const titles=["Chọn câu đúng sau weil","Điền từ còn thiếu","Viết email xin đổi lịch","Nghe lịch hẹn","Nghe lịch hẹn","Nghe lịch hẹn","Nghe lịch hẹn","Chọn câu đúng sau weil","Chọn câu đúng sau weil","Viết email xin đổi lịch","Điền từ còn thiếu","Điền từ còn thiếu"];
  if(index===12) return heading("Tổng kết",'<p><strong>8/10 câu đúng ngay</strong></p><p class="muted">42 phút học · 1 câu cần luyện thêm</p>'+note("Bạn đã đặt động từ đúng sau weil. Lần sau thử vận dụng khi đổi lịch.")+button("Đóng sổ"), "ruled book-ending");
  let input=choice?'<div class="choices"><label><input type="radio" name="answer"> weil ich heute arbeiten muss</label><label><input type="radio" name="answer"> weil ich muss heute arbeiten</label></div>':listen?'<label>Người nói hẹn lúc mấy giờ?<input placeholder="Nhập giờ hẹn"></label>':[2,9].includes(index)?'<label>Viết 50–70 từ, nêu lý do và đề xuất giờ khác.<textarea rows="5" placeholder="Guten Tag …"></textarea></label>':'<label>Der Termin ist ___ Montag.<input lang="de" spellcheck="false" autocorrect="off" autocapitalize="none" placeholder="Nhập câu trả lời"></label>'+keys+note("Nếu Telex đổi chữ bạn vừa gõ, hãy chuyển sang bàn phím tiếng Đức.");
  if(listen) input=`<div class="lineup">${index<5?button(index===4?"Tạm dừng":"Phát âm thanh","primary"):""}${index!==4?button("Xem lời thoại"):""}</div><p class="muted">${["Còn 2 lượt nghe","Đang phát · 0:08 / 0:19","Đã hết lượt nghe","Lời thoại"] [index-3]}</p>${index===6?note("Können wir uns am Montag um zehn Uhr treffen?"):""}`+input;
  const feedback={7:note("Đúng ngay. Sau weil, động từ đã chia đứng cuối câu.","good"),8:note("Thử lại. Xem vị trí của muss.","caution"),9:note("Đã nộp · đang chờ lời phê."),10:note("Gia sư · am dùng với ngày trong tuần. Ví dụ: am Dienstag.")}[index]??"";
  return `<div class="split book-spread"><section class="sheet ruled"><p class="muted">Deutsch · Câu 3/10</p><h1>${titles[index]}</h1>${input}${feedback}<div class="sticky">${button("Kiểm tra","primary")}</div>${index===11?'<div class="keyboard" aria-label="Mô phỏng bàn phím đang mở">Q W E R T Z U I O P<br>A S D F G H J K L<br>Y X C V B N M</div>':""}</section><aside class="sheet ruled book-companion"><h2>Ghi nhớ</h2><p class="muted">am Montag · um zehn Uhr</p></aside></div>`;
}

function notebook(index) {
  const parts=[
    '<ol class="road"><li>Đọc lịch hẹn<small>Đã qua</small></li><li>Đổi lịch hẹn<small>Đang luyện</small></li><li>Viết email xác nhận<small>Sắp tới</small></li><li>Trao đổi qua điện thoại<small>Chưa có nguồn nghe</small></li></ol>',
    '<p class="good">Đã dùng đúng am và um trong hai buổi.</p><p>Đã đặt động từ cuối câu sau weil.</p>',
    note("Bạn đã đổi lịch trong một hội thoại ngắn. Bài tới thêm yêu cầu trả lời bằng email."),
    '<details><summary>Bài đã học · 3 bài</summary><ul><li>Đọc lịch hẹn</li><li>Chọn giới từ chỉ thời gian</li><li>Xác nhận giờ họp</li></ul></details>',
    '<form><label>Mục tiêu<input value="Trao đổi ở nơi làm việc"></label><label>Thời lượng<select><option>45 phút</option><option>20 phút</option></select></label>'+button("Lưu","primary")+'</form>',
  ];
  const chapters = `<div class="lineup">${button("Bài mới","primary")}${button("Tự chọn")}</div>`;
  return `<div class="split book-spread">
    <section class="sheet ruled"><h1>Deutsch</h1><h2>${tabs[2].states[index]}</h2>${parts[index]}${index===0?chapters:""}</section>
    <aside class="sheet ruled book-companion"><h2>Hôm nay</h2><p>Viết email đổi lịch</p>
      <p class="muted">Đề xuất giờ mới và xác nhận lịch với đồng nghiệp.</p>
      ${button("Học tiếp","primary")}
    </aside>
  </div>`;
}

function admin(index) {
  const panels=[
    '<h2>Cần xem</h2>'+note("Deutsch · 1 câu chờ chấm. Máy chấm chưa kết nối.")+note("Toán 7 · 1 bài cần xem lại."),
    '<h2>Knowledge</h2><p>Deutsch · Lịch hẹn và email công việc</p><details><summary>Nguồn đang dùng</summary><p>Ví dụ email công việc · Bản 2</p></details>'+note("Thiếu nguồn nghe cho bước Trao đổi qua điện thoại."),
    '<h2>Thời gian mở câu đầu tiên · p75</h2>'+[["Việt Nam",4.3],["Đức",1.6]].map(([country,sec])=>`<div class="metric">${country} · ${String(sec).replace(".",",")} giây<div class="bar" style="width:${sec*20}%"></div></div>`).join("")+'<p class="muted">Số liệu minh họa · mốc 5 giây</p>',
  ];
  return heading("Quản trị",panels[index]);
}

function render() {
  const index=Number(state.value);
  if(active===0) desk(index);
  if(active===1) sample.innerHTML=lesson(index);
  if(active===2) sample.innerHTML=notebook(index);
  if(active===3) sample.innerHTML=admin(index);
  const book = sample.querySelector(".book-spread, .book-ending");
  if (book) {
    for (const direction of [-1, 1]) {
      if (!state.options[index + direction]) continue;
      const corner = document.createElement("button");
      corner.type = "button";
      corner.className = "mock-corner";
      corner.dataset.turn = direction;
      corner.setAttribute("aria-label", direction < 0 ? "Trang trước" : "Trang sau");
      book.append(corner);
    }
  }
}
function turnPage(direction) {
  if (sample.querySelector(".mock-turning")) return;
  const next = Number(state.value) + direction;
  if (!state.options[next]) return;
  const oldBook = sample.querySelector(".book-spread, .book-ending");
  const oldPage = oldBook.querySelector(direction > 0 && innerWidth >= 1024 ? ".book-companion" : "section") ?? oldBook;
  const bounds = oldPage.getBoundingClientRect();
  const frame = sample.getBoundingClientRect();
  const front = oldPage.cloneNode(true);
  state.value = String(next);
  render();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const leaf = document.createElement("div");
  leaf.className = "mock-turning";
  leaf.dataset.direction = direction;
  leaf.inert = true;
  leaf.setAttribute("aria-hidden", "true");
  Object.assign(leaf.style, {
    left: (bounds.left - frame.left) + "px",
    top: (bounds.top - frame.top) + "px",
    width: bounds.width + "px",
    height: bounds.height + "px",
  });
  leaf.append(front);
  sample.append(leaf);
  leaf.addEventListener("animationend", () => leaf.remove(), { once: true });
}

function selectTab(index) {
  active=index;
  document.querySelector("#season-control").hidden=index!==0;
  [...screens.children].forEach((element,i)=>element.setAttribute("aria-current",i===index?"true":"false"));
  state.replaceChildren(...tabs[index].states.map((name,i)=>new Option(name,i)));
  render();
}
for (const [index,tab] of tabs.entries()) {
  const element=document.createElement("button");
  element.textContent=tab.name;
  element.onclick=()=>selectTab(index);
  screens.append(element);
}
state.onchange=render;
document.querySelector("#season").onchange=event=>{month=Number(event.target.value);render();};
document.querySelector("#theme").onchange=event=>{document.documentElement.dataset.theme=event.target.value;};
sample.addEventListener("click",event=>{
  const target=event.target.closest("button");
  if(!target) return;
  if(target.dataset.turn) { turnPage(Number(target.dataset.turn)); return; }
  const key=target.textContent;
  if(["ä","ö","ü","ß"].includes(key)){
    const field=sample.querySelector("input[lang=de]");
    const position=field.selectionStart;
    field.setRangeText(key,position,field.selectionEnd,"end");
    field.focus();
  }
  const listening={"Phát âm thanh":4,"Tạm dừng":3,"Xem lời thoại":6};
  if(active===1 && Object.hasOwn(listening,key)){
    state.value=String(listening[key]);
    render();
  }
  if(target.classList.contains("spine")) selectTab(2);
  if(key==="Học tiếp") selectTab(1);
});
selectTab(0);
