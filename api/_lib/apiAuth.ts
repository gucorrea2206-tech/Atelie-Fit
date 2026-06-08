import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminAuth } from "./firebaseAdmin.js";

const ADMIN_EMAIL = "ateliefitlondrina@gmail.com";

export async function requireAdminApiUser(req: VercelRequest, res: VercelResponse) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

  if (!token) {
    res.status(401).json({ ok: false, error: "Missing auth token" });
    return null;
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (decoded.email !== ADMIN_EMAIL) {
      res.status(403).json({ ok: false, error: "Forbidden" });
      return null;
    }
    return decoded;
  } catch (error) {
    res.status(401).json({ ok: false, error: "Invalid auth token" });
    return null;
  }
}
