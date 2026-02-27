import { NextRequest, NextResponse } from "next/server";
import { signToken, getSessionCookieName } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await signToken({ role: "admin" });
  const cookieName = getSessionCookieName();

  const res = NextResponse.json({ success: true });
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });

  return res;
}

export async function DELETE() {
  const cookieName = getSessionCookieName();
  const res = NextResponse.json({ success: true });
  res.cookies.set(cookieName, "", { maxAge: 0, path: "/" });
  return res;
}
