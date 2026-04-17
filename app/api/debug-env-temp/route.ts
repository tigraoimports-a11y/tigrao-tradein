import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    created_by_email_present: !!process.env.ZAPSIGN_CREATED_BY_EMAIL,
    created_by_email_value: process.env.ZAPSIGN_CREATED_BY_EMAIL || "NOT_SET",
    api_token_present: !!process.env.ZAPSIGN_API_TOKEN,
  });
}
