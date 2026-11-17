/** Offline Responses API fixture, available only in local demo. */
export const fakeTutorOpenAi: typeof fetch = async () => {
  const encoder=new TextEncoder();
  const events=[
    {type:'response.output_text.delta',delta:'Em thử tìm từ khóa. '},
    {type:'response.output_text.delta',delta:'Em nghĩ gì?'},
    {type:'response.completed',response:{status:'completed',usage:{input_tokens:12,output_tokens:8}}},
  ];
  return new Response(new ReadableStream({start(controller) { for(const entry of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`)); controller.close(); }}), {headers:{'Content-Type':'text/event-stream'}});
};
