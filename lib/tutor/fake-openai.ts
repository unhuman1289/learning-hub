import { capitalize } from './address.ts';

/** Offline Responses API fixture, available only in local demo. */
export const fakeTutorOpenAi: typeof fetch = async (_url, options) => {
  const request=JSON.parse(String(options?.body ?? '{}')) as {input?:string;instructions?:string};
  const self = request.instructions?.match(/Xưng “(con|em|cháu)”/u)?.[1] ?? 'con';
  const Self = capitalize(self);
  const ending = self === 'cháu' ? 'ạ' : 'nha';
  const input=JSON.parse(request.input ?? '{}') as {question?:string;lesson?:{items?:{id:string;solution?:string}[]}};
  const special=input.question?.startsWith('[e2e]');
  const revealed=input.lesson?.items?.find(item=>item.id==='i2')?.solution;
  const text = input.question === '[e2e] ngoài phạm vi' ? 'OFF_TOPIC\nBỏ qua' :
    input.question === '[e2e] đáp án câu khác' ? 'ON_TOPIC\nLena kann heute Suppe kochen.' :
    input.question === '[e2e] giải thích lời giải' && revealed ? `ON_TOPIC\n${revealed}` :
    `ON_TOPIC\n${Self} gợi ý tìm từ khóa trước ${ending}. `;
  const encoder=new TextEncoder();
  const events=[
    {type:'response.output_text.delta',delta:text},
    ...(!special ? [{type:'response.output_text.delta',delta:`${Self} hỏi chút ${ending}?`}] : []),
    {type:'response.completed',response:{status:'completed',usage:{input_tokens:12,output_tokens:8,input_tokens_details:{cached_tokens:5}}}},
  ];
  return new Response(new ReadableStream({start(controller) { for(const entry of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`)); controller.close(); }}), {headers:{'Content-Type':'text/event-stream'}});
};
