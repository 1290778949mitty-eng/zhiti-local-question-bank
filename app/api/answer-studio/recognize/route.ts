import { requireSameOrigin, requireUser } from "../../../../lib/server/auth";
import { callRecognitionModel, parseRecognitionModelText } from "../../../../lib/server/recognition-model";
import { normalizeStudioRecords, studioRecognitionPrompt, studioRecognitionSchema } from "../../../../lib/answer-studio-contract";
export async function POST(request:Request) {
  try {
    requireSameOrigin(request); await requireUser(request);
    const body=await request.json() as {image:string;role:"question"|"answer";lesson:string;pageId:string;context?:string;answerOnly?:boolean};
    if (!body || !["question","answer"].includes(body.role) || typeof body.lesson!=="string" || body.lesson.length>200 || typeof body.pageId!=="string" || !/^data:image\/(png|jpeg);base64,/.test(body.image) || body.image.length>25_000_000) return Response.json({error:"页面或讲次无效"},{status:400});
    const apiKey=process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({error:"尚未配置智能识别"},{status:503});
    const extra=body.answerOnly&&body.role==='answer'?"\n本次只有答案材料，没有干净原题。按材料原顺序识别全部答案条目；没有题干时stem留空，禁止猜测题目或自行解题。只有结果时照录结果并在warnings中说明缺少步骤。利用上页条目判断跨页续解，continuation只在明确续题时为true。解答图和模糊字必须标记待人工确认。":"";
    const result=await callRecognitionModel({apiKey,image:body.image,prompt:studioRecognitionPrompt(body.role,body.lesson,body.context||"")+extra,schema:studioRecognitionSchema,schemaName:"teacher_answer_transcription"});
    if (!result.text) return Response.json({error:"识别服务未返回结果，请重试当前页"},{status:502});
    return Response.json({records:normalizeStudioRecords(parseRecognitionModelText(result.text),body.pageId,body.lesson)});
  } catch(e) { if (e instanceof Response) return e; return Response.json({error:e instanceof Error?e.message:"识别失败"},{status:500}); }
}
