export type LessonSource = {
  title: string;
  url: string;
  readScope: string;
  retrievedAt: string;
  publishedAt: string | null;
};

export type LessonDetail = {
  objective: string;
  prerequisites: string[];
  sections: { heading: string; text: string }[];
  diagram?: string;
  exercise: string;
  deliverable: string;
  questions: { question: string; rubric: string }[];
  nextTopic: string;
  sources: LessonSource[];
  note?: string;
};

const retrievedAt = "2026-10-09T10:53:05.000Z";

export const lessonDetails: Record<string, LessonDetail> = {
  swarm: {
    objective: "Vẽ được một luồng hỗ trợ quyết định cho MTB, trong đó mỗi đề xuất có thể lần ngược về dữ liệu, bằng chứng và người duyệt.",
    prerequisites: ["Phân biệt dữ liệu bệnh án với kết quả phân tích phân tử", "Biết SWARM là dự án nghiên cứu riêng, chưa phải công cụ lâm sàng"],
    sections: [
      { heading: "1. Bắt đầu bằng câu hỏi của MTB", text: "Một ca ung thư hiếm có thể có chẩn đoán mô bệnh học, tiền sử điều trị, diễn biến, biến thể, biểu hiện gene và các giới hạn của từng xét nghiệm. Trước khi sinh giả thuyết, hệ thống phải cho biết dữ liệu nào có mặt, dữ liệu nào thiếu, ngày lấy mẫu và nguồn của mỗi kết quả. Nếu mô bệnh học hoặc thời điểm lấy mẫu không khớp với câu hỏi, các bước phía sau không thể tự sửa lỗi đó." },
      { heading: "2. Giả thuyết không phải là sự thật", text: "Một giả thuyết có thể nói: ‘nếu biến đổi X đang hoạt động trong bối cảnh loại u Y, thuốc Z có thể đáng để MTB xem xét’. Tách câu này thành các mệnh đề nhỏ: biến thể có thật không, cơ chế có phù hợp không, bằng chứng có áp dụng cho loại u này không, có phản chứng hay điều kiện loại trừ nào không. Ghi mức độ chắc chắn ở từng mệnh đề; đừng gộp tất cả thành một câu nghe chắc chắn." },
      { heading: "3. Nhiều agent cần tạo góc nhìn khác nhau", text: "Chia việc theo vai trò có ích hơn việc cho nhiều agent lặp lại cùng một tìm kiếm: một agent trích dữ kiện ca, một agent tìm bằng chứng ủng hộ, một agent chủ động tìm phản chứng và giới hạn, một agent kiểm tra nguồn/phiên bản. Nếu hai agent dẫn cùng một bài báo, đó vẫn là một nguồn bằng chứng. Lưu DOI/URL, ngày truy cập, đoạn hoặc bảng đã đọc và loại nguồn." },
      { heading: "4. Chuyên gia là một bước của luồng", text: "Ly có thể rà tính hợp lý lâm sàng và bổ sung ngữ cảnh; sau đó oncologist trong nhóm đánh giá các giả thuyết và bằng chứng. Ghi riêng: đề xuất của hệ thống, sửa đổi của người duyệt, lý do đồng ý/không đồng ý và điều còn thiếu. Bảng xếp hạng chỉ giúp sắp thứ tự thảo luận; nó không phải xác suất thành công hay chỉ định điều trị." },
      { heading: "5. Đánh giá hồi cứu có thể kiểm tra điều gì?", text: "Trước khi chạy, chốt tập ca được phép dùng, thời điểm đóng băng dữ liệu, câu hỏi đánh giá, nhóm chuyên gia và cách xử lý bất đồng. Có thể đo độ đầy đủ của bằng chứng, khả năng truy nguyên, các giả thuyết hữu ích bị bỏ sót, đề xuất không được hỗ trợ và mức độ nhất trí với đánh giá đã thống nhất. Đừng chọn metric sau khi đã nhìn thấy kết quả." },
    ],
    diagram: "Dữ liệu đã kiểm tra\n        ↓\nCâu hỏi MTB → Giả thuyết có điều kiện\n        ↓                       ↓\nBằng chứng ủng hộ      Phản chứng / giới hạn\n        └──────────┬────────────┘\n                   ↓\n        Ly duyệt → Oncologist duyệt\n                   ↓\n     Danh sách thảo luận + lý do + mức bất định",
    exercise: "Dùng một ca hư cấu, không có tên/ngày sinh/mã hồ sơ. Viết một giả thuyết gồm: dữ kiện đầu vào, điều kiện cần đúng, bằng chứng ủng hộ, phản chứng cần tìm, người duyệt và điều kiện khiến giả thuyết bị loại.",
    deliverable: "Một sơ đồ luồng SWARM và một mẫu thẻ giả thuyết có trường nguồn, phản chứng, mức bất định, trạng thái duyệt và lý do xếp hạng.",
    questions: [
      { question: "Hai agent cùng trích một nghiên cứu. Có được tính là hai bằng chứng độc lập không?", rubric: "Không. Đếm nguồn gốc duy nhất; hai lần trích dẫn không làm tăng số nghiên cứu độc lập." },
      { question: "Một biến thể liên quan đến thuốc trong một loại u khác có nghĩa gì cho ca này?", rubric: "Đó là tín hiệu để MTB xem xét, không phải kết luận áp dụng được. Nêu khác biệt loại u, chất lượng dữ liệu và mức độ gián tiếp của bằng chứng." },
      { question: "Người duyệt bất đồng với thứ hạng của hệ thống thì cần lưu gì?", rubric: "Lưu phiên bản đầu ra, thứ hạng trước/sau, vai trò người duyệt và lý do bất đồng; không ghi đè mất lịch sử." },
    ],
    nextTopic: "Thiết kế tập ca hồi cứu và quy trình adjudication cho SWARM.",
    sources: [
      { title: "PM4Onco — Medical Systems Biology, Lübeck", url: "https://medsysbio-luebeck.de/projects/pm4onco/", readScope: "Đã đọc trang dự án: mục tiêu liên minh, tích hợp dữ liệu, phối hợp với MTB và MeDIC ở địa phương; không có dữ liệu bệnh nhân.", retrievedAt, publishedAt: null },
      { title: "DECIDE-AI — hướng dẫn báo cáo đánh giá AI giai đoạn sớm", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9116198/", readScope: "Trang toàn văn bị chặn trong phiên truy cập; chỉ dùng phần tóm tắt tìm kiếm để nhận diện phạm vi. Cần mở và đọc bài/checklist trước khi áp dụng.", retrievedAt, publishedAt: "2022-05-18" },
    ],
    note: "Bài học phương pháp nghiên cứu, không phải khuyến nghị điều trị. Chỉ dùng dữ liệu hư cấu trong hub; không tải dữ liệu bệnh nhân lên đây.",
  },
  deploy: {
    objective: "Có thể giải thích điều kiện cần để một bản deploy kiểm tra được và phục hồi được.",
    prerequisites: ["Biết chạy ứng dụng ở local", "Phân biệt cấu hình với bí mật truy cập"],
    sections: [
      { heading: "Một lần chạy phải tái lập được", text: "Ghi commit hoặc phiên bản, lệnh chạy, môi trường, migration và biến cấu hình cần có. Không ghi giá trị secret vào README hoặc log. Người khác cần dựng lại được môi trường thử nghiệm từ hướng dẫn, không cần đoán các bước ẩn." },
      { heading: "Sức khỏe không chỉ là trang chủ mở được", text: "Health check nên xác nhận ứng dụng khởi động và các binding cần thiết có sẵn, nhưng không in dữ liệu hoặc secret. Sau deploy, thử các luồng thật ở staging: đăng nhập, đọc/ghi trạng thái, lỗi quyền, và thao tác phục hồi." },
      { heading: "Log giúp tìm lỗi, cũng có thể làm lộ dữ liệu", text: "Workers Logs có thể lưu thông tin invocation, log tùy chỉnh và lỗi. Vì vậy log nên ghi mã thao tác và trạng thái tổng quát; tránh email đầy đủ, nội dung bài làm, dữ liệu lâm sàng hoặc token. Với SWARM, tuyệt đối không đưa hồ sơ bệnh nhân vào log của Hub." },
      { heading: "Rollback cần được thử", text: "Nêu điều kiện quay lại bản trước, cách kiểm tra schema tương thích và cách khôi phục dữ liệu. Chỉ nói ‘có backup’ chưa chứng minh rằng backup dùng được; cần diễn tập restore trên bản sao và ghi kết quả." },
    ],
    diagram: "Commit + cấu hình đã kiểm tra\n              ↓\n      Build / migration / deploy\n              ↓\n  Health check + luồng staging\n        ↙             ↘\n     đạt              lỗi\n      ↓                 ↓\nTheo dõi          Rollback + ghi nguyên nhân",
    exercise: "Viết checklist cho một deploy thử nghiệm của SWARM: phiên bản, cấu hình, migration, health check, ca kiểm thử giả lập, giới hạn log, tiêu chí dừng và thao tác rollback.",
    deliverable: "Checklist deploy một trang, không có secret hay dữ liệu bệnh nhân.",
    questions: [
      { question: "Trang health trả HTTP 200. Đã chứng minh dữ liệu được lưu đúng chưa?", rubric: "Chưa. Cần kiểm thử các luồng lưu/đọc trên staging và xác nhận trạng thái sau khi tải lại." },
      { question: "Có thể log nguyên văn câu hỏi của một ca để debug không?", rubric: "Không trong quy trình này. Dùng dữ liệu giả lập; log tránh nội dung bệnh nhân và thông tin định danh." },
    ],
    nextTopic: "Kiểm thử hồi quy và theo dõi chất lượng qua các phiên bản.",
    sources: [
      { title: "Cloudflare Workers Logs", url: "https://developers.cloudflare.com/workers/observability/logs/workers-logs/", readScope: "Đã đọc trang tài liệu chính thức về invocation logs, custom logs, lỗi và cách quan sát Worker.", retrievedAt, publishedAt: null },
    ],
    note: "Thực hành bằng dữ liệu giả. Không dùng log làm nơi lưu hồ sơ hoặc câu trả lời lâm sàng.",
  },
  seq: {
    objective: "Đọc được đường đi từ mẫu giải trình tự tới VCF, và giải thích vì sao ‘không thấy biến thể’ chưa đồng nghĩa ‘không có biến thể’.",
    prerequisites: ["Biết DNA gồm các base và biến thể là khác biệt so với một reference", "Chưa cần thuộc tên công cụ bioinformatics"],
    sections: [
      { heading: "1. Mỗi tệp là một bước, không phải một kết luận", text: "Ở mức khái quát, FASTQ chứa reads và điểm chất lượng; BAM/CRAM chứa reads đã căn chỉnh theo reference; caller dùng các reads và mô hình của nó để tạo VCF. Annotation thêm thông tin gene/hậu quả. Mỗi bước có tham số, phiên bản và giới hạn riêng. VCF không thay thế tệp căn chỉnh khi cần điều tra chất lượng một locus." },
      { heading: "2. Reference phải được gọi tên", text: "Một tọa độ như chr7:140453136 không đủ để xác định biến thể nếu thiếu assembly, contig naming, transcript và cách chuẩn hóa. GRCh37 và GRCh38 có tọa độ khác nhau. Trước khi so sánh hai tệp, đọc header và kiểm tra reference, contigs, sample, caller và bộ lọc." },
      { heading: "3. Phân biệt ‘reference call’ với ‘no-call’", text: "Trong VCF, GT 0/0 biểu thị kiểu gen tham chiếu được gọi tại locus theo quy ước của tệp; ./., ở mẫu lưỡng bội, biểu thị không có kiểu gen được gọi cho cả hai allele. Cả hai vẫn cần bối cảnh coverage, chất lượng, giới hạn vùng xét nghiệm và pipeline. Vị trí vắng khỏi VCF cũng không tự nó chứng minh 0/0: tệp có thể chỉ ghi biến thể, hoặc vùng đó không đủ khả năng gọi." },
      { heading: "4. Callability là thông tin cần giữ lại", text: "Khi xét một gene, đánh dấu exon/vùng nào có coverage và chất lượng đủ theo assay, vùng nào thiếu hoặc khó gọi, và liệu assay có phát hiện loại biến thể đang quan tâm không. Một kết quả âm tính trong vùng không được khảo sát không thể được diễn giải giống một kết quả âm tính có callability đã xác nhận." },
    ],
    diagram: "FASTQ + quality\n       ↓ alignment to named reference\nBAM/CRAM + index\n       ↓ variant calling\nVCF / gVCF + caller/version\n       ↓ annotation + quality/callability review\nEvidence for MTB discussion (not a treatment decision)",
    exercise: "Tạo một bảng kiểm 5 dòng trước khi nhận xét một VCF: assembly/contigs, sample, caller/version, FILTER/quality, coverage/callability của locus. Dùng ví dụ hư cấu và đánh dấu trường nào còn thiếu.",
    deliverable: "Một checklist review VCF có phân biệt 0/0, ./., dòng không xuất hiện và locus không call được.",
    questions: [
      { question: "Locus không xuất hiện trong một VCF dạng chỉ ghi biến thể. Có kết luận 0/0 được không?", rubric: "Không nếu chưa biết quy ước xuất tệp và callability. Cần kiểm tra pipeline hoặc gVCF/coverage." },
      { question: "Hai VCF có cùng CHROM và POS. Có chắc đang nói về cùng biến thể không?", rubric: "Chưa. Kiểm tra assembly, REF/ALT, chuẩn hóa indel, contig/reference và sample." },
      { question: "`./.` nói điều gì?", rubric: "No-call, không có genotype được gọi cho allele(s) hiển thị; không tự dịch thành kiểu gen tham chiếu." },
    ],
    nextTopic: "Coverage, purity, allele fraction và các giới hạn của xét nghiệm u.",
    sources: [
      { title: "VCF v4.5 specification — GA4GH Large Scale Genomics", url: "https://samtools.github.io/hts-specs/VCFv4.5.pdf", readScope: "Đã đọc cấu trúc đặc tả v4.5 và các phần về header, data lines, genotype fields; dùng để dạy cách đọc định dạng, không diễn giải một mẫu xét nghiệm thực.", retrievedAt, publishedAt: "2026-02-25" },
    ],
    note: "Dùng tệp tổng hợp, không tải tệp bệnh nhân lên Learning Hub.",
  },
  pgx: {
    objective: "Theo được chuỗi suy luận PGx và biết đánh dấu chỗ nào là đo lường, suy luận hay khuyến nghị cần guideline hiện hành.",
    prerequisites: ["Đã học khái niệm biến thể và chất lượng dữ liệu", "Biết genotype không đồng nghĩa trực tiếp với đáp ứng thuốc"],
    sections: [
      { heading: "Chuỗi suy luận có nhiều nấc", text: "Bắt đầu từ biến thể được assay quan sát → allele/haplotype được gọi → diplotype suy luận → chức năng/phenotype theo quy tắc gene-specific → hướng dẫn gene–drug phù hợp → xem xét bởi chuyên gia trong bối cảnh ca. Một lỗi hoặc vùng assay không bao phủ ở nấc đầu có thể đổi kết luận cuối." },
      { heading: "Hỏi phần mềm đã làm gì", text: "Ghi panel và phiên bản, alleles có thể phát hiện, cách xử lý copy number/structural variants, phasing, danh sách phiên bản allele definitions và guideline. Khi công cụ không thể phân biệt hai haplotype, kết quả có thể còn mơ hồ; không tự chọn phương án thuận tiện nhất." },
      { heading: "Phenotype dự đoán không phải toa thuốc", text: "Một hệ thống có thể ánh xạ diplotype sang phenotype theo quy tắc cụ thể. Việc đó không tự tạo ra khuyến nghị cho mọi thuốc hoặc mọi người. Cần mở guideline hiện hành, kiểm tra đúng cặp gene–drug, mức chứng cứ, phạm vi bệnh nhân và điều kiện áp dụng." },
    ],
    diagram: "Variants + assay limits\n          ↓\nHaplotype(s) / phasing\n          ↓\nDiplotype + allele definitions\n          ↓\nPhenotype model\n          ↓\nGene–drug guideline + clinical context\n          ↓\nExpert review",
    exercise: "Chọn một báo cáo PGx hư cấu. Tô màu khác nhau cho: điều đã đo, điều phần mềm suy ra, điều guideline khuyến nghị và điều bác sĩ cần quyết định.",
    deliverable: "Một bảng ‘dữ liệu → suy luận → guideline → người duyệt’ có cột phiên bản và giới hạn assay.",
    questions: [
      { question: "Một báo cáo ghi ‘poor metabolizer’. Đã đủ để đưa ra thay đổi thuốc chưa?", rubric: "Chưa. Kiểm tra gene–drug guideline, allele definitions, assay coverage, indication, tương tác và bối cảnh lâm sàng." },
      { question: "Phần nào bắt buộc phải gắn phiên bản?", rubric: "Tối thiểu assay/pipeline, allele definitions/công cụ và guideline được dùng; ghi ngày truy cập khi tài liệu được cập nhật." },
    ],
    nextTopic: "Làm một ví dụ gene–drug từ dữ liệu giả lập bằng guideline được mở và đọc trực tiếp.",
    sources: [
      { title: "PharmCAT — Pharmacogenomics Clinical Annotation Tool", url: "https://pharmcat.clinpgx.org/", readScope: "Đã đọc trang giới thiệu công cụ và phạm vi hỗ trợ; chưa mở một guideline gene–drug cụ thể, nên bài không đưa khuyến nghị thuốc.", retrievedAt, publishedAt: null },
    ],
    note: "Bài học về luồng diễn giải, không phải khuyến nghị điều trị cá nhân.",
  },
  mitral: {
    objective: "Biến ý tưởng phối hợp implant vòng van và MitraClip thành câu hỏi nghiên cứu có thể kiểm tra, đồng thời phân biệt điều đã biết với điều chưa rõ.",
    prerequisites: ["Phân biệt hở van hai lá nguyên phát với thứ phát", "Biết TEER tác động vào mép lá van; annuloplasty hướng vào hình học vòng van"],
    sections: [
      { heading: "1. Khóa câu hỏi trước khi khóa thiết bị", text: "Viết riêng quần thể, cơ chế hở van, giải phẫu, nguy cơ phẫu thuật, loại implant vòng van, thời điểm/thứ tự đặt implant và TEER, comparator và outcome. Nếu chưa rõ thiết bị cụ thể, hãy ghi đó là câu hỏi cần quyết định chứ không điền bằng giả định." },
      { heading: "2. Hai thao tác có thể bổ sung hoặc gây đánh đổi", text: "Annuloplasty thay đổi hình dạng/kích thước vòng; TEER kéo hai vùng lá van lại gần nhau để giảm dòng hở. Một câu hỏi cơ chế có thể là liệu thay đổi hình học vòng trước/sau TEER ảnh hưởng đến mức hở tồn dư, gradient qua van, diện tích lỗ van, độ bền của kết quả hoặc khả năng cần can thiệp lại. Đây là giả thuyết để nghiên cứu, không phải kết luận về lợi ích." },
      { heading: "3. Có tài liệu COMBO — vì vậy chưa thể nói ‘chưa từng có’", text: "Một nghiên cứu hồi cứu công bố năm 2024 so sánh nhóm COMBO với M-TEER đơn độc: 357 người, trong đó 35 người ở nhóm COMBO. Các phối hợp được báo cáo gồm MitraClip với Carillon (26), Cardioband (5) và NeoChord (4). Abstract mô tả nhóm bệnh nhân lớn tuổi và khác nhau về đặc điểm ban đầu; vì vậy con số thô không chứng minh ưu thế của phương pháp. Nghiên cứu này cũng không tự trả lời câu hỏi hẹp về implant Ly dự định, quần thể primary MR, trình tự can thiệp hay endpoint cụ thể." },
      { heading: "4. Lập bản đồ mới lạ mà không phóng đại", text: "Tìm theo từng tên thiết bị và tên generic, kết hợp các cụm ‘combined’, ‘concomitant’, ‘sequential’, ‘annuloplasty’, ‘TEER’ và primary MR. Ghi năm, quần thể, thiết bị, trình tự, thiết kế, cỡ mẫu, endpoint và giới hạn. Tính mới có thể nằm ở thiết bị, nhóm bệnh nhân, trình tự, cách chọn ca hoặc endpoint; cần tìm hỗ trợ chuyên môn và rà soát đăng ký nghiên cứu trước khi phát biểu." },
      { heading: "5. Protocol hồi cứu cần được định nghĩa độc lập", text: "Chốt eligibility, nguồn dữ liệu, ngày chỉ số, thời gian theo dõi, outcome chính, denominator, biến gây nhiễu và cách xử lý missingness. Xác định sớm ai sẽ adjudicate echo/clinical outcomes, cách bất đồng được giải quyết và approvals/data governance. STROBE giúp báo cáo quan sát đầy đủ; checklist báo cáo không thay thế thiết kế tốt, ethics review hay thống kê." },
    ],
    diagram: "Quần thể primary MR xác định\n           ↓\nAnnular implant (thiết bị + thứ tự)\n           ↓\nM-TEER (MitraClip)\n           ↓\nEcho + safety + clinical endpoints\n           ↓\nComparator / bias / missingness / follow-up\n           ↓\nProtocol review + sponsorship discussion",
    exercise: "Viết một protocol card nháp gồm: population, exact intervention, comparator, primary outcome, follow-up, safety outcome, data source, confounders, missing data, approvals and sponsor question. Đánh dấu từng trường là ‘đã biết’, ‘giả định’ hoặc ‘cần hỏi’.",
    deliverable: "Một trang concept brief và danh sách 5 câu hỏi cho người bảo trợ. Không ghi tuyên bố về tính mới trước khi rà soát đầy đủ.",
    questions: [
      { question: "Nghiên cứu COMBO 2024 có chứng minh chính xác đề tài của Ly đã được làm chưa?", rubric: "Không đủ thông tin. Nó cho thấy đã có các phối hợp TEER với một số kỹ thuật transcatheter khác, gồm Cardioband, nhưng cần so sánh đúng thiết bị, quần thể primary MR, thứ tự và câu hỏi nghiên cứu." },
      { question: "Vì sao không nên so sánh outcome thô giữa COMBO và M-TEER như thể bệnh nhân giống nhau?", rubric: "Nhóm có đặc điểm ban đầu khác nhau và nghiên cứu quan sát nhỏ ở nhóm COMBO; chọn ca và confounding có thể ảnh hưởng kết quả." },
      { question: "STROBE có xác nhận protocol hồi cứu hợp lệ không?", rubric: "Không. STROBE là hướng dẫn báo cáo nghiên cứu quan sát, không phải công cụ chấm chất lượng hay thay thế thiết kế/ethics/statistics." },
    ],
    nextTopic: "Tìm kiếm có cấu trúc theo thiết bị và dựng bảng evidence map cho concept.",
    sources: [
      { title: "Yokoyama et al. 2024 — Outcomes of COMBO therapy…", url: "https://pubmed.ncbi.nlm.nih.gov/38468721/", readScope: "Đã đọc abstract PubMed: thiết kế hồi cứu một trung tâm, cỡ mẫu và các loại COMBO; chưa đọc toàn văn. Không suy luận lợi ích nhân quả từ abstract.", retrievedAt, publishedAt: "2024" },
      { title: "ESC/EACTS 2025 Valvular Heart Disease guideline", url: "https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/valvular-heart-disease/", readScope: "Đã xác minh trang chính thức và ngày phát hành. Nội dung guideline được bảo vệ bản quyền; hãy đọc bản gốc trực tiếp, không lưu bản tóm tắt guideline trong app.", retrievedAt, publishedAt: "2025-08-29" },
      { title: "STROBE — reporting guideline for observational studies", url: "https://www.equator-network.org/reporting-guidelines/strobe/", readScope: "Đã đọc phạm vi áp dụng và giới hạn: hướng dẫn báo cáo cohort, case-control, cross-sectional; không phải prescription về thiết kế hoặc thang điểm chất lượng.", retrievedAt, publishedAt: "2007" },
    ],
    note: "Đây là khung học tập và phát triển đề cương. Chưa xác minh tính mới, hiệu quả, an toàn, thiết bị chính xác, sponsor hoặc approvals.",
  },
  email: {
    objective: "Viết một email công việc rõ ý, đúng register và đáp ứng đủ yêu cầu nội dung; tự sửa một lỗi có tác động lớn.",
    prerequisites: ["A2 tự đánh giá; cần kiểm tra bằng bài mẫu để xác định điểm xuất phát", "Biết câu chính có động từ chia ở vị trí thứ hai"],
    sections: [
      { heading: "Đọc đề bằng bút chì trước khi viết", text: "Gạch chân người nhận, mục đích, số ý bắt buộc, quan hệ thân mật/trang trọng, thời hạn và độ dài. Bỏ sót một ý nội dung có thể làm bài yếu dù câu Đức đúng." },
      { heading: "Khung email dễ dùng", text: "Anrede → mục đích trong 1–2 câu → 2–3 đoạn theo thứ tự người nhận cần biết → đề nghị/next step rõ → Grußformel. Dùng Sie/Ihnen nhất quán trong thư trang trọng. Giữ câu ngắn nếu đang luyện độ chính xác; thêm liên từ khi ý đã rõ." },
      { heading: "Cách Goethe mô tả bài B2", text: "Mẫu chính thức có hai nhiệm vụ viết: một bài đăng thảo luận và một tin nhắn. Bài mẫu công khai đặt độ dài tối thiểu khác nhau cho từng phần và tiêu chí gồm hoàn thành yêu cầu, register, mạch lạc/liên kết, từ vựng và độ chính xác. Bài tập dưới đây là bài tự viết mới cho công việc, không phải đề thi chính thức." },
      { heading: "Sửa theo vòng ngắn", text: "Lượt 1: đủ ý chưa? Lượt 2: động từ chia và vị trí động từ trong mệnh đề phụ? Lượt 3: danh từ viết hoa, mạo từ/cách và dấu câu? Cuối cùng đọc thành tiếng. Mỗi lần chọn tối đa hai lỗi để sửa, rồi viết lại đoạn bị ảnh hưởng." },
    ],
    exercise: "Viết email 100–130 từ cho đồng nghiệp để xin một cuộc họp về đề xuất nghiên cứu. Nêu mục đích, lý do cần trao đổi, hai khung giờ, và một lời cảm ơn. Sau đó tự sửa và viết bản thứ hai.",
    deliverable: "Hai bản email: bản đầu và bản sửa; đánh dấu ba lỗi cụ thể và quy tắc bạn sẽ nhớ.",
    questions: [
      { question: "Tại sao câu ‘Ich möchte besprechen morgen das Konzept’ chưa tự nhiên?", rubric: "Trật tự từ. Trong câu chính, động từ chia thường đứng vị trí hai; phần còn lại cần sắp lại, ví dụ ‘Ich möchte morgen das Konzept besprechen.’" },
      { question: "Nếu đề yêu cầu hai thời điểm và lý do họp, chỉ viết lời chào lịch sự có đủ không?", rubric: "Không. Đủ ý của đề là ưu tiên; register tốt không bù cho nội dung thiếu." },
      { question: "Nêu hai việc để kiểm tra register ‘Sie’. ", rubric: "Dùng cách xưng hô nhất quán và dạng như Ihnen/Ihr phù hợp; không trộn du/dein trong cùng thư." },
    ],
    nextTopic: "Viết một thông điệp B2 ngắn dưới giới hạn thời gian, sau đó chuyển cùng nội dung thành lời nói hai phút.",
    sources: [
      { title: "Goethe-Zertifikat B2 — practice materials", url: "https://www.goethe.de/ins/de/en/m/prf/gzb2/ue9.html", readScope: "Đã đọc trang chính thức về tài liệu luyện bốn kỹ năng và bài mẫu B2 Adults.", retrievedAt, publishedAt: null },
      { title: "Goethe B2 Modellsatz — Schreiben", url: "https://bfu.goethe.de/b2_mod_2MX6/schreiben.php", readScope: "Đã đọc hướng dẫn cấu trúc hai nhiệm vụ viết, độ dài tối thiểu và tiêu chí đánh giá; bài trong Hub là bài tự biên soạn.", retrievedAt, publishedAt: "2018" },
    ],
    note: "Chưa có chấm điểm giáo viên/AI. Rubric trong Hub dùng để tự kiểm tra; nếu cần chứng chỉ, hãy làm mẫu thi có bấm giờ và xin phản hồi người dạy.",
  },
  speaking: {
    objective: "Nói có cấu trúc hai phút về một công việc thật, rồi tự chọn một cải thiện về nội dung và một cải thiện về tiếng Đức.",
    prerequisites: ["Đã viết được email có mục đích rõ", "Có thể nói câu ngắn ở hiện tại"],
    sections: [
      { heading: "Ba khối ý", text: "1) Worum geht es? 2) Warum ist es wichtig? 3) Was ist der nächste Schritt? Chuẩn bị 3–5 từ khóa, không viết toàn bộ bài để đọc. Dùng một ví dụ cụ thể giúp người nghe theo dõi." },
      { heading: "Nối câu mà không làm câu quá dài", text: "Luyện các liên từ thường gặp như weil, deshalb, außerdem, zuerst/dann. Sau weil, động từ chia đứng cuối mệnh đề phụ; sau deshalb trong câu chính, động từ chia đứng ở vị trí hai. Nếu mắc lỗi, dừng ngắn và nói lại câu đó." },
      { heading: "Vòng luyện 2 lượt", text: "Lượt 1 ghi âm và nói hết ý. Nghe lại, chỉ ghi nơi mất mạch hoặc câu khiến người nghe khó hiểu. Lượt 2 nói lại ngắn hơn và sửa một điểm. So với bản trước bằng cùng một chủ đề, không đo năng lực bằng cảm giác chung chung." },
      { heading: "Cấu trúc thi không phải là bài tập hằng ngày", text: "Goethe cung cấp mẫu luyện B2 cho Lesen, Hören, Schreiben và Sprechen. Bài này là luyện nói công việc; khi chuẩn bị thi, cần làm bài mẫu chính thức và theo đúng yêu cầu từng module thay vì giả định một format chung." },
    ],
    exercise: "Ghi âm hai phút giải thích SWARM cho một đồng nghiệp mới: mục tiêu, ví dụ về một giả thuyết, ai duyệt và bước tiếp theo. Nghe lại rồi ghi ra một câu cần sửa.",
    deliverable: "Bản ghi âm 1 và 2, cùng ba gạch đầu dòng: nội dung rõ, một lỗi ngôn ngữ, câu đã sửa.",
    questions: [
      { question: "Lượt luyện đầu tiên có mục tiêu sửa mọi lỗi phát âm không?", rubric: "Không. Đầu tiên hoàn thành thông điệp; ở lượt hai chọn một lỗi gây khó hiểu hoặc lặp lại nhiều lần." },
      { question: "Tại sao không nên học thuộc nguyên bài?", rubric: "Bài nói dễ vỡ khi câu hỏi đổi; từ khóa giúp tự tạo lời nói và chuyển kỹ năng sang tình huống công việc." },
    ],
    nextTopic: "Thuyết trình một đề xuất ngắn và trả lời câu hỏi follow-up bằng tiếng Đức.",
    sources: [
      { title: "Goethe-Zertifikat B2 — practice materials", url: "https://www.goethe.de/ins/de/en/m/prf/gzb2/ue9.html", readScope: "Đã đọc trang tài liệu luyện chính thức cho bốn kỹ năng; không suy diễn cấu trúc chi tiết của từng phần nói từ trang tổng quan.", retrievedAt, publishedAt: null },
    ],
  },
  play: {
    objective: "Thử một vòng tương tác qua lại 10 phút và ghi quan sát về tín hiệu của con thay vì đặt mục tiêu thành tích.",
    prerequisites: ["Dành một khoảng ngắn khi người lớn và trẻ đều tương đối thoải mái", "Để trẻ chọn cách tham gia; không ép hoàn thành hoạt động"],
    sections: [
      { heading: "Nhìn một tín hiệu", text: "Tín hiệu có thể là chỉ tay, nhìn, đưa đồ vật, âm thanh, nét mặt hoặc hành động. Không cần đoán chính xác ngay; hãy quan sát bối cảnh và điều trẻ đang chú ý." },
      { heading: "Đáp lại rồi chờ", text: "Gọi tên điều trẻ đang quan tâm, bắt chước âm thanh nếu phù hợp, đưa từ đơn giản hoặc mỉm cười, rồi chờ trẻ phản hồi. Một khoảng dừng tạo cơ hội cho trẻ tiếp tục bằng cách riêng; im lặng không có nghĩa là thất bại." },
      { heading: "Mở rộng nhẹ", text: "Nếu trẻ nhìn quả bóng, người lớn có thể nói ‘bóng lăn’ rồi lăn bóng qua lại. Nếu trẻ mất hứng, đổi hoạt động hoặc dừng. Tương tác qua lại có thể xảy ra khi đọc sách tranh, đi bộ, ăn hoặc chơi đồ vật thường ngày." },
      { heading: "Bằng chứng và điều không thể kết luận", text: "Harvard Center on the Developing Child mô tả các tương tác qua lại nhạy bén là một phần quan trọng của môi trường quan hệ và phát triển sớm. Một hoạt động mười phút không thể đo trí thông minh, dự đoán chiều cao hay chứng minh một thay đổi phát triển riêng lẻ. Ghi điều quan sát được, không gán tính cách từ một lần." },
    ],
    diagram: "Trẻ chú ý / phát tín hiệu\n          ↓\nNgười lớn nhận ra và đáp lại\n          ↓\nChờ trẻ tiếp tục (hoặc dừng)\n          ↓\nTheo tín hiệu tiếp theo, không ép theo kịch bản",
    exercise: "Chọn sách tranh, khối xếp hoặc trò đưa–nhận. Chơi khoảng 10 phút theo vòng ‘nhận ra → gọi tên/đáp lại → chờ → tiếp tục theo tín hiệu của con’. Dừng nếu con mệt hoặc không muốn tham gia.",
    deliverable: "Một ghi chú ngắn: bối cảnh, tín hiệu quan sát được, phản ứng của người lớn, phản hồi của trẻ và điều muốn thử lần sau.",
    questions: [
      { question: "Nếu trẻ không đáp lại sau khi người lớn nói, có cần lặp liên tục để ‘dạy’ không?", rubric: "Không. Cho thời gian, quan sát dấu hiệu hứng thú/mệt mỏi và chuyển hoạt động nếu cần." },
      { question: "Từ một lần chơi có thể kết luận trẻ tự tin hay thông minh không?", rubric: "Không. Chỉ ghi hành vi quan sát được trong bối cảnh cụ thể; không suy rộng thành đặc điểm ổn định hoặc chỉ số IQ." },
      { question: "Âm thanh, chỉ tay và nhìn có thể là lượt giao tiếp của trẻ không?", rubric: "Có thể là tín hiệu trong tương tác; phản hồi phù hợp và quan sát tiếp, không yêu cầu trẻ phải dùng lời nói." },
    ],
    nextTopic: "Tạo cơ hội lựa chọn và tự làm trong hoạt động thường ngày, theo khả năng và an toàn của trẻ.",
    sources: [
      { title: "Harvard Center on the Developing Child — Serve and Return", url: "https://developingchild.harvard.edu/key-concept/serve-and-return/", readScope: "Đã đọc trang khái niệm và fast facts về trao đổi qua lại, tín hiệu, phản hồi và bối cảnh quan hệ; không suy rộng thành kết quả IQ/chiều cao.", retrievedAt, publishedAt: null },
    ],
    note: "Đây là hoạt động tương tác chung, không phải đánh giá phát triển hay tư vấn y tế. Đưa lo ngại cụ thể về phát triển cho chuyên gia chăm sóc trẻ.",
  },
};

export function getLessonDetail(lessonId: string): LessonDetail | null {
  return lessonDetails[lessonId] ?? null;
}
