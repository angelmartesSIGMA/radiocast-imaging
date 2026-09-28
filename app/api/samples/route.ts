import { json, route } from "@/lib/api";
import { publishedSamples } from "@/lib/db/media";

export const dynamic = "force-dynamic";

/** Published samples with 1-hour signed URLs, for the studio library. */
export const GET = route(async () => json({ samples: await publishedSamples() }));
