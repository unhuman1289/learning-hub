export type Track='AI'|'MTB'|'Cardio'|'Deutsch'|'Bột';
export const tracks: {id:Track,title:string,sub:string,color:string}[]=[
{id:'AI',title:'AI & Engineering',sub:'Từ hệ thống chạy được đến nghiên cứu đáng tin',color:'#875b75'},
{id:'MTB',title:'Medical Systems Biology',sub:'Oncology · sequencing · pharmacogenomics',color:'#626779'},
{id:'Cardio',title:'Cardio & nghiên cứu',sub:'Van hai lá · cấu trúc tim · ICU',color:'#9b4268'},
{id:'Deutsch',title:'Deutsch',sub:'A2 → B2 cho công việc → C2 dài hạn',color:'#73566c'},
{id:'Bột',title:'Bột & gia đình',sub:'Ăn, ngủ, vận động và lớn lên tự tin',color:'#916678'}];
export const tasks=[
{id:'a1',track:'AI',title:'Vẽ luồng SWARM và điểm dừng để chuyên gia duyệt',minutes:30,deliver:'Một sơ đồ: dữ liệu → giả thuyết → phản biện → duyệt → ranking.'},
{id:'m1',track:'MTB',title:'Giải thích VCF và vùng không gọi được biến thể',minutes:10,deliver:'Viết 3 câu phân biệt “không có biến thể” với “không đủ dữ liệu”.'},
{id:'c1',track:'Cardio',title:'Viết câu hỏi nghiên cứu cho concept van hai lá',minutes:30,deliver:'Một PICO nháp và 3 điểm cần trao đổi với người bảo trợ.'},
{id:'d1',track:'Deutsch',title:'Viết một email công việc bằng tiếng Đức',minutes:30,deliver:'80–120 từ: đề nghị lịch họp, mục đích, hai khung giờ.'},
{id:'b1',track:'Bột',title:'10 phút chơi luân phiên cùng Bột',minutes:10,deliver:'Quan sát một tín hiệu, đáp lại và chờ con phản hồi.'},
{id:'a2',track:'AI',title:'Thiết kế phép đánh giá hồi cứu cho SWARM',minutes:90,deliver:'Tiêu chí chọn ca, baseline, đánh giá bằng chứng và bất đồng chuyên gia.'},
{id:'c2',track:'Cardio',title:'Lập khung protocol và bảng tính khả thi',minutes:90,deliver:'Thiết kế, dữ liệu cần có, endpoint, rủi ro và bước xin hỗ trợ.'},
{id:'d2',track:'Deutsch',title:'Nói lại một tình huống công việc',minutes:10,deliver:'Nói 2 phút, ghi lỗi mình nhận ra, thử lại một lần.'}];
