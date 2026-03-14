import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getJob } from "@/enrichment/extraction/job-store";
import { requireAdminResponse } from "@/lib/auth";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [];
}

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, context: RouteContext) {
  const cookieStore = await cookies();
  const unauth = requireAdminResponse(cookieStore);
  if (unauth) return unauth;
  const id = context.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing job id." }, { status: 400 });
  }
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found.", jobId: id }, { status: 404 });
  }
  if (job.status === "pending") {
    return NextResponse.json({
      jobId: id,
      status: "pending",
      statusUrl: request.nextUrl.pathname,
    });
  }
  if (job.status === "failed") {
    return NextResponse.json(
      { jobId: id, status: "failed", error: job.error },
      { status: 200 }
    );
  }
  return NextResponse.json({
    jobId: id,
    status: "completed",
    session: job.session,
    researchPacket: job.researchPacket,
    runMetadata: job.runMetadata,
  });
}
