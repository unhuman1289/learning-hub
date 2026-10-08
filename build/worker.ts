import handler from "vinext/server/fetch-handler";
import { standaloneApiGuard } from "./worker-boundary";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const guarded = standaloneApiGuard(request, env);
    if (guarded) return guarded;
    return handler.fetch(request, env, ctx);
  },
};
